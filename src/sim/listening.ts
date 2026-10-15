// Listening comprehension: what a customer said versus what the player rang up. Pure rules for the
// answer key, order difficulty, clarifying answers and when a transcript may be shown.
// Difficulty comes from HOW an order is said (pace, run-together speech, slang, chat around it,
// how many modifiers), never from who says it: every accent group has easy and hard orders.

import type { Rng } from '../core/rng';
import type { DrinkType, Milk, Order } from './rush';

export type OrderField = 'drink' | 'milk' | 'temp' | 'heart';
export const ORDER_FIELDS: readonly OrderField[] = ['drink', 'milk', 'temp', 'heart'];

export type Pace = 'slow' | 'normal' | 'fast';
/** `say` rate multiplier for each pace (applied on top of the speaker's own rate). */
export const PACE_RATE: Record<Pace, number> = { slow: 0.88, normal: 1, fast: 1.12 };

/** One curated way a customer orders. `text` is exactly what they say; `order` is the answer key. */
export interface OrderLine {
  id: string;
  text: string;
  order: Order;
  pace: Pace;
  /** Run-together speech and self-corrections: 0 none, 2 lots ("Long black, no wait…"). */
  connected: 0 | 1 | 2;
  /** Slang or words from another language the player must know: 0 none, 2 several. */
  slang: 0 | 1 | 2;
  /** Chat around the order the player must listen past: 0 straight to it, 2 buried. */
  chatter: 0 | 1 | 2;
  /** The words that carry each part of the order, exactly as in `text` (highlighted in learning
   *  mode). Every field that isn't the default must have one: that's what makes it fair. */
  cues: Partial<Record<OrderField, string>>;
  /** Said on the player's first shift. A customer with any such line orders only from those on
   *  that shift, whatever the difficulty (the nearest tier stands in when none is in range). */
  firstShift?: boolean;
}

/** Short answers to "What milk was that?" and friends, in the customer's own words. */
export interface ClarifyAnswers {
  drink: Record<DrinkType, string>;
  milk: Record<Milk | 'none', string>;
  temp: { normal: string; extraHot: string; none: string };
  heart: { yes: string; no: string; none: string };
}

/** The question the player asks, shown as their subtitle. */
export const CLARIFY_QUESTION: Record<OrderField, string> = {
  drink: 'Sorry, what was the drink?',
  milk: 'Which milk was that?',
  temp: 'Hot or extra hot?',
  heart: 'Did you want a heart on top?',
};

/** Long blacks carry no milk/temperature/heart; flat whites default to full cream. */
export function normaliseOrder(o: Order): Order {
  return o.type === 'longBlack'
    ? { type: 'longBlack', milk: null, extraHot: false, heart: false }
    : { type: 'flatWhite', milk: o.milk ?? 'full', extraHot: o.extraHot, heart: o.heart };
}

/** Which parts of the ticket don't match what was said. A wrong drink trumps everything. */
export function wrongFields(heard: Order, truth: Order): OrderField[] {
  const h = normaliseOrder(heard);
  const t = normaliseOrder(truth);
  if (h.type !== t.type) return ['drink'];
  if (t.type === 'longBlack') return [];
  const out: OrderField[] = [];
  if (h.milk !== t.milk) out.push('milk');
  if (h.extraHot !== t.extraHot) out.push('temp');
  if (h.heart !== t.heart) out.push('heart');
  return out;
}

export function modifierCount(o: Order): number {
  const n = normaliseOrder(o);
  return (n.milk && n.milk !== 'full' ? 1 : 0) + (n.extraHot ? 1 : 0) + (n.heart ? 1 : 0);
}

const PACE_SCORE: Record<Pace, number> = { slow: 0, normal: 1, fast: 2 };

export function difficultyScore(l: OrderLine): number {
  return PACE_SCORE[l.pace] + l.connected + l.slang + l.chatter + modifierCount(l.order);
}

export type Tier = 1 | 2 | 3;

export function orderTier(l: OrderLine): Tier {
  const s = difficultyScore(l);
  return s <= 2 ? 1 : s <= 5 ? 2 : 3;
}

export type Difficulty = 'easy' | 'normal' | 'hard';
export type SubtitleMode = 'always' | 'afterRepeat' | 'off';

export interface DifficultyRules {
  /** Which order tiers customers pick from. */
  tiers: readonly Tier[];
  /** Café murmur level (multiplies the ambience). */
  noise: number;
  /** Subtitle rule when the player hasn't chosen one. */
  subtitles: SubtitleMode;
}

export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  easy: { tiers: [1], noise: 0.6, subtitles: 'always' },
  normal: { tiers: [1, 2], noise: 1, subtitles: 'afterRepeat' },
  hard: { tiers: [2, 3], noise: 1.7, subtitles: 'off' },
};

/** A customer's order for today: one of their lines in the difficulty's tiers (seeded). On the
 *  first shift, their `firstShift` lines are the only candidates if they have any. Always one
 *  `rng.pick`, so the other customers' orders don't shift with this one's pool size. */
export function pickOrder(
  all: readonly OrderLine[],
  d: Difficulty,
  rng: Rng,
  firstShift = false,
): OrderLine {
  const lines = firstShift && all.some((l) => l.firstShift) ? all.filter((l) => l.firstShift) : all;
  const want = DIFFICULTY[d].tiers;
  let pool = lines.filter((l) => want.includes(orderTier(l)));
  if (pool.length === 0) {
    // Nearest tier to what was asked for.
    const target = want[0] as Tier;
    const best = Math.min(...lines.map((l) => Math.abs(orderTier(l) - target)));
    pool = lines.filter((l) => Math.abs(orderTier(l) - target) === best);
  }
  return rng.pick(pool);
}

/** The customer's answer to a clarifying question, from the answer key. */
export function answerFor(a: ClarifyAnswers, truth: Order, field: OrderField): string {
  const t = normaliseOrder(truth);
  const lb = t.type === 'longBlack';
  switch (field) {
    case 'drink':
      return a.drink[t.type];
    case 'milk':
      return lb ? a.milk.none : a.milk[t.milk ?? 'full'];
    case 'temp':
      return lb ? a.temp.none : t.extraHot ? a.temp.extraHot : a.temp.normal;
    case 'heart':
      return lb ? a.heart.none : t.heart ? a.heart.yes : a.heart.no;
  }
}

export type ListenStage = 'speaking' | 'deciding' | 'rungUp';

/** "Could you repeat that?" this many times before 'afterRepeat' shows the words: one repeat
 *  is a few seconds of patience, too cheap a way around listening. */
export const REPEATS_FOR_SUBTITLES = 2;

/**
 * May the order's transcript be on screen? 'always' shows it; 'afterRepeat' only once they've
 * been asked to repeat it twice; 'off' never. Learning mode adds the transcript (with the key
 * words marked) once the ticket is rung up, so the player can see what they missed.
 */
export function transcriptVisible(
  mode: SubtitleMode,
  learning: boolean,
  stage: ListenStage,
  repeats: number,
): boolean {
  if (mode === 'always') return true;
  if (learning && stage === 'rungUp') return true;
  return mode === 'afterRepeat' && repeats >= REPEATS_FOR_SUBTITLES;
}

/** Is this listening line a customer's answer to a clarifying question (not the order)? */
export const isAnswerKey = (key: string): boolean => key.includes('.answer.');

/** An answer the player can't hear at all (voices off, or neither a recording nor a browser
 *  voice) is shown as text, or asking would be useless. Only answers: never the order itself. */
export function answerAsText(isAnswer: boolean, audible: boolean): boolean {
  return isAnswer && !audible;
}

/** Where each cue sits in the transcript, for highlighting. Cues that aren't found are skipped. */
export function cueSpans(l: OrderLine): Array<{ field: OrderField; start: number; end: number }> {
  const lower = l.text.toLowerCase();
  const out: Array<{ field: OrderField; start: number; end: number }> = [];
  for (const f of ORDER_FIELDS) {
    const cue = l.cues[f];
    if (!cue) continue;
    const start = lower.indexOf(cue.toLowerCase());
    if (start >= 0) out.push({ field: f, start, end: start + cue.length });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Patience (seconds) each listening aid costs the customer: listening still has to happen. */
export const LISTEN_COST = { replay: 1, repeat: 6, clarify: 3 } as const;
/** "Sorry, could you repeat that?" at most this many times per customer. */
export const MAX_REPEATS = 2;

export interface ListenRecord {
  customer: string;
  lineId: string;
  tier: Tier;
  truth: Order;
  heard: Order | null;
  wrong: OrderField[];
  replays: number;
  repeats: number;
  clarified: OrderField[];
  /** Questions asked (each costs patience), including repeats of the same question. */
  questions: number;
}

export interface ListenSummary {
  orders: number;
  /** Tickets rung up exactly as said. */
  heardRight: number;
  replays: number;
  repeats: number;
  questions: number;
}

export function summariseListening(records: readonly ListenRecord[]): ListenSummary {
  let heardRight = 0;
  let replays = 0;
  let repeats = 0;
  let questions = 0;
  for (const r of records) {
    if (r.heard && r.wrong.length === 0) heardRight++;
    replays += r.replays;
    repeats += r.repeats;
    questions += r.questions;
  }
  return { orders: records.length, heardRight, replays, repeats, questions };
}
