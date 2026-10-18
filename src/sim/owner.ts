// Gaz, the owner: picks what he says. Lines are keyed by gameplay event; each event has pools
// per frustration tier. Lines don't repeat until a pool is used up, live reactions have
// cooldowns, and frustration builds with repeated failure.

import type { Rng } from '../core/rng';
import { clamp } from './math';
import type { ShiftGrade } from './rush';

export type Mood =
  'neutral' | 'sceptical' | 'annoyed' | 'furious' | 'shocked' | 'impressed' | 'smug' | 'pleased';

export type Gesture =
  | 'none'
  | 'point'
  | 'facepalm'
  | 'throwHands'
  | 'nod'
  | 'shakeHead'
  | 'thumbsUp'
  | 'tapWatch'
  | 'leanIn'
  | 'shrug';

export interface LineDef {
  text: string;
  mood?: Mood;
  gesture?: Gesture;
}

export interface LinePool {
  /** Calm-sarcastic, annoyed, fed up. Missing tiers fall back to the nearest lower one. */
  tiers: LineDef[][];
  mood?: Mood;
  gesture?: Gesture;
  /** Seconds before this event can trigger another line. */
  cooldown?: number;
}

export type LineBook = Record<string, LinePool>;

export interface SpokenLine {
  key: string;
  text: string;
  mood: Mood;
  gesture: Gesture;
  duration: number;
  live: boolean;
}

export interface OwnerState {
  /** 0 = amused, ~2 = annoyed, ~4+ = fed up. */
  frustration: number;
  /** Used line indices per `key:tier`. */
  used: Record<string, number[]>;
  /** Game time each key last spoke. */
  lastAt: Record<string, number>;
}

export function createOwner(): OwnerState {
  return { frustration: 0, used: {}, lastAt: {} };
}

export function ownerTier(o: OwnerState): number {
  if (o.frustration >= 3.5) return 2;
  if (o.frustration >= 1.5) return 1;
  return 0;
}

export function addFrustration(o: OwnerState, delta: number): void {
  o.frustration = clamp(o.frustration + delta, 0, 6);
}

/** Reading time for a subtitle, seconds. */
export function lineDuration(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return clamp(1.2 + words * 0.3, 1.8, 7);
}

const TIER_MOOD: Mood[] = ['sceptical', 'annoyed', 'furious'];

/**
 * Pick a line for `key`, or null if the event is cooling down or has no lines.
 * Deterministic for a given RNG state.
 */
export function pickLine(
  o: OwnerState,
  book: LineBook,
  key: string,
  rng: Rng,
  now: number,
  live = false,
): SpokenLine | null {
  const pool = book[key];
  if (!pool || pool.tiers.length === 0) return null;
  const last = o.lastAt[key];
  if (pool.cooldown !== undefined && last !== undefined && now - last < pool.cooldown) return null;

  const tier = Math.min(ownerTier(o), pool.tiers.length - 1);
  // Prefer the current tier, then fall back toward calmer tiers.
  let chosenTier = -1;
  let candidates: number[] = [];
  for (let t = tier; t >= 0; t--) {
    const lines = pool.tiers[t] ?? [];
    const used = o.used[`${key}:${t}`] ?? [];
    const free = lines.map((_, i) => i).filter((i) => !used.includes(i));
    if (free.length > 0) {
      chosenTier = t;
      candidates = free;
      break;
    }
  }
  if (chosenTier < 0) {
    // Everything has been said: start the current tier over, but never repeat the last line.
    chosenTier = tier;
    const lines = pool.tiers[tier] ?? [];
    const used = o.used[`${key}:${tier}`] ?? [];
    const lastIdx = used[used.length - 1];
    candidates = lines.map((_, i) => i).filter((i) => i !== lastIdx || lines.length === 1);
    o.used[`${key}:${tier}`] = [];
  }
  const idx = rng.pick(candidates);
  const usedKey = `${key}:${chosenTier}`;
  o.used[usedKey] = [...(o.used[usedKey] ?? []), idx];
  o.lastAt[key] = now;
  const def = (pool.tiers[chosenTier] as LineDef[])[idx] as LineDef;
  return {
    key,
    text: def.text,
    mood: def.mood ?? pool.mood ?? TIER_MOOD[chosenTier] ?? 'neutral',
    gesture: def.gesture ?? pool.gesture ?? 'none',
    duration: lineDuration(def.text),
    live,
  };
}

/** Gaz's lines as a shift ends: the grade's, then "new best" when the shift beat the best already
 *  on its board (a week shift only; the caller decides, see core/rush/machine.ts). */
export function endLines(grade: ShiftGrade, newBest: boolean): string[] {
  return newBest ? [`rush.end.${grade}`, 'rush.end.newBest'] : [`rush.end.${grade}`];
}
