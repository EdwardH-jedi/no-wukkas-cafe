// The owner's demonstration pour: a scripted control track fed through exactly the same
// pitcher and pour simulation the player uses. If this track stops producing a heart, the
// physics changed (tests/sim/latte.test.ts guards it).

import { STEP } from '../../core/clock';
import type { MilkQuality } from '../milk';
import type { PourStep } from './coach';
import { createPour, type PourState } from './field';
import { createPitcher, stepPourFrame, type PitcherControls, type PitcherState } from './pitcher';

export interface TrackKey {
  t: number;
  x: number;
  y: number;
  /** Spout height above the coffee, cm. */
  h: number;
  /** Pour button held from this key until the next. */
  hold: boolean;
}

/** High to fill, drop low to bloom, then lift, keep pouring and sweep through. */
export const OWNER_DEMO: readonly TrackKey[] = [
  { t: 0.0, x: 0, y: -0.3, h: 7, hold: false },
  { t: 0.5, x: 0, y: -0.3, h: 7, hold: true },
  { t: 3.6, x: 0, y: -0.3, h: 6, hold: true },
  // Drop right down onto the surface and let the white bloom.
  { t: 4.0, x: 0, y: -0.35, h: 0.7, hold: true },
  { t: 6.4, x: 0, y: -0.35, h: 0.7, hold: true },
  // Lift a touch (the stream thins) and keep pouring as the sweep starts…
  { t: 6.55, x: 0, y: -0.2, h: 3.0, hold: true },
  // …through the white to the far edge, and let go there.
  { t: 7.0, x: 0, y: 0.85, h: 3.0, hold: false },
  { t: 7.6, x: 0, y: 0.6, h: 8, hold: false },
];

export const DEMO_DURATION = 8.2;
const DEMO_STEPS = Math.round(DEMO_DURATION / STEP);

export interface DemoChapter {
  step: PourStep;
  /** Track time the chapter starts. */
  t: number;
  /** Owner line Gaz narrates it with (existing recorded lines only). */
  cue: string;
}

/** The demo in the four steps of a heart, each narrated as it starts. */
export const DEMO_CHAPTERS: readonly DemoChapter[] = [
  { step: 'fill', t: 0.3, cue: 'demo.fill' },
  { step: 'lay', t: 3.8, cue: 'demo.drop' },
  { step: 'lobes', t: 5.4, cue: 'pour.bloom' },
  { step: 'pull', t: 6.35, cue: 'demo.pull' },
];

/** Slowest teaching slow-motion: below this the pour looks frozen. */
export const MIN_DEMO_RATE = 0.3;

/**
 * Plays OWNER_DEMO through the real pitcher and pour sim at a teaching pace: while Gaz narrates a
 * chapter, playback slows so the chapter lasts as long as his line (never below MIN_DEMO_RATE),
 * and it waits at a chapter boundary until he has finished. The sim always steps in fixed STEPs
 * of track time, so the pattern is identical however long the lines take (or if they're skipped).
 */
export interface DemoPlayer {
  /** Track steps simulated so far. */
  steps: number;
  /** Real seconds owed to the track. */
  acc: number;
  /** Chapters started so far. */
  chapter: number;
  /** Current playback speed (0 while waiting for Gaz to finish). */
  rate: number;
  done: boolean;
}

export function createDemoPlayer(): DemoPlayer {
  return { steps: 0, acc: 0, chapter: 0, rate: 1, done: false };
}

/** Put the jug where the demo starts (call with a fresh pour). */
export function startDemo(pitcher: PitcherState): void {
  const k = OWNER_DEMO[0];
  if (!k) return;
  pitcher.x = k.x;
  pitcher.y = k.y;
  pitcher.height = k.h;
}

export function demoTime(d: DemoPlayer): number {
  return d.steps * STEP;
}

/**
 * Advance by one game step of `dt` seconds. `narrationLeft` is how long Gaz's current line still
 * has to run (0 if he's quiet). Returns the owner line key to say when a chapter starts.
 */
export function stepDemoPlayer(
  d: DemoPlayer,
  pour: PourState,
  pitcher: PitcherState,
  controls: PitcherControls,
  milk: MilkQuality,
  narrationLeft: number,
  dt: number,
): string | null {
  if (d.done) return null;
  const next = DEMO_CHAPTERS[d.chapter];
  if (next && demoTime(d) >= next.t - 1e-9) {
    if (narrationLeft > 0) {
      d.rate = 0;
      return null;
    }
    d.chapter++;
    d.rate = 1;
    return next.cue;
  }
  const end = DEMO_CHAPTERS[d.chapter]?.t ?? DEMO_DURATION;
  d.rate =
    narrationLeft > 0
      ? Math.min(1, Math.max(MIN_DEMO_RATE, (end - demoTime(d)) / narrationLeft))
      : 1;
  d.acc += dt * d.rate;
  while (d.acc >= STEP - 1e-9 && d.steps < DEMO_STEPS) {
    d.acc -= STEP;
    controlsAt(OWNER_DEMO, demoTime(d), controls);
    stepPourFrame(pour, pitcher, controls, milk, STEP);
    d.steps++;
    const c = DEMO_CHAPTERS[d.chapter];
    if (c && demoTime(d) >= c.t - 1e-9) break; // stop at the boundary: Gaz may still be talking
  }
  if (d.steps >= DEMO_STEPS) d.done = true;
  return null;
}

/** Controls for track time `t` (linear between keys, holds step-wise). */
export function controlsAt(
  track: readonly TrackKey[],
  t: number,
  out?: PitcherControls,
): PitcherControls {
  const c = out ?? { targetX: 0, targetY: 0, targetHeight: 7, holding: false };
  const first = track[0];
  if (!first) return c;
  let a = first;
  let b = first;
  for (let i = 0; i < track.length; i++) {
    const k = track[i] as TrackKey;
    if (k.t <= t) {
      a = k;
      b = track[i + 1] ?? k;
    }
  }
  const span = b.t - a.t;
  const u = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
  c.targetX = a.x + (b.x - a.x) * u;
  c.targetY = a.y + (b.y - a.y) * u;
  c.targetHeight = a.h + (b.h - a.h) * u;
  c.holding = a.hold;
  return c;
}

/** Run a whole track headless. Used by tests and to sanity-check tuning. */
export function runTrack(
  track: readonly TrackKey[],
  milk: MilkQuality,
  duration = DEMO_DURATION,
): { pour: PourState; pitcher: PitcherState } {
  const pour = createPour();
  const pitcher = createPitcher();
  const first = track[0];
  if (first) {
    pitcher.x = first.x;
    pitcher.y = first.y;
    pitcher.height = first.h;
  }
  const c: PitcherControls = { targetX: 0, targetY: 0, targetHeight: 7, holding: false };
  const steps = Math.round(duration / STEP);
  for (let i = 0; i < steps; i++) {
    controlsAt(track, i * STEP, c);
    stepPourFrame(pour, pitcher, c, milk, STEP);
  }
  return { pour, pitcher };
}
