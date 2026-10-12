// Day 2, the morning rush: pure rules for orders, serving, patience, satisfaction and tips.
// No DOM, no three, no randomness. Money is integer cents (AGENTS.md §5).

import { band, clamp } from './math';
import type { EspressoScore } from './espresso';
import type { PatternScore } from './latte/score';
import type { MilkScore } from './steam';

export type DrinkType = 'flatWhite' | 'longBlack';

export interface Order {
  type: DrinkType;
  /** Steam the milk to 68–74 °C (flat white only). */
  extraHot: boolean;
  /** Wants a latte-art heart on top (flat white only). */
  heart: boolean;
}

/** A finished drink waiting on the pass. */
export interface MadeDrink {
  type: DrinkType;
  espresso: EspressoScore;
  /** Flat white only. */
  milk: MilkScore | null;
  pattern: PatternScore | null;
  /** Cup fill (1 = brim) and milk spilled, from the pour or the hot water. */
  fill: number;
  spill: number;
  /** Long black: hot water put in before the shot, in cup volumes. */
  water: number;
  /** Drink temperature now, °C. Drops while it sits on the pass. */
  temp: number;
  /** Game time it was finished. */
  madeAt: number;
}

export type Complaint =
  | 'wrongDrink'
  | 'notHotEnough'
  | 'tooHot'
  | 'lukewarm'
  | 'noHeart'
  | 'messy'
  | 'weak'
  | 'strong'
  | 'badShot'
  | 'slow';

export interface ServeContext {
  /** Seconds since the customer reached the register. */
  waited: number;
  /** The customer's full patience, seconds. */
  patience: number;
  /** How forgiving this customer is (1 = normal, <1 harsher). */
  tolerance: number;
  /** Base tip for a perfect, quick drink, cents. */
  tipCents: number;
}

export interface ServeResult {
  /** The customer takes the drink (right type). */
  accepted: boolean;
  /** Right type and every modifier honoured. */
  correct: boolean;
  quality: number;
  satisfaction: number;
  tipCents: number;
  complaints: Complaint[];
}

/** Long-black water before the shot: this band gives the right strength once the shot lands. */
export const LONG_BLACK_WATER: readonly [number, number] = [0.56, 0.74];
export const EXTRA_HOT: readonly [number, number] = [68, 74];
/** Below this a drink is lukewarm at serve time. */
export const LUKEWARM = 52;
/** How fast drinks cool on the pass, °C per second. */
export const COOL_RATE = 0.35;
/** Patience drains this much faster while someone stands at the register un-served. */
export const REGISTER_DRAIN = 1.5;
/** Patience lost (fraction of max) when a customer is handed the wrong drink. */
export const REJECT_PENALTY = 0.15;

export const DRINK_NAME: Record<DrinkType, string> = {
  flatWhite: 'flat white',
  longBlack: 'long black',
};

/** "flat white · extra hot · heart on top" for the ticket. */
export function orderLabel(o: Order): string {
  const parts = [DRINK_NAME[o.type]];
  if (o.extraHot) parts.push('extra hot');
  if (o.heart) parts.push('heart on top');
  return parts.join(' · ');
}

function flatWhiteQuality(d: MadeDrink, o: Order, out: Complaint[]): number {
  const esp = d.espresso.total;
  const milk = d.milk?.texture ?? 0;
  const art = d.pattern?.art ?? 0;
  const cup = band(d.fill, 0.85, 1, 0.3, 1) * (1 - clamp(d.spill / 0.2));
  // Temperature against what they asked for.
  let temp: number;
  if (o.extraHot) {
    temp = band(d.temp, EXTRA_HOT[0], EXTRA_HOT[1] + 4, 10, 6);
    if (d.temp < EXTRA_HOT[0] - 2) out.push('notHotEnough');
  } else {
    temp = band(d.temp, 55, 66, 14, 10);
    if (d.temp > 70) out.push('tooHot');
  }
  if (d.temp < LUKEWARM && !out.includes('notHotEnough')) out.push('lukewarm');
  const heartOk = (d.pattern?.heartness ?? 0) >= 0.5 && art >= 0.55;
  if (o.heart && !heartOk) out.push('noHeart');
  if (d.spill > 0.05 || d.fill < 0.8) out.push('messy');
  if (d.espresso.faults.length > 0) out.push('badShot');
  const w = o.heart
    ? { esp: 0.2, milk: 0.15, temp: 0.15, art: 0.4, cup: 0.1 }
    : { esp: 0.3, milk: 0.2, temp: 0.2, art: 0.15, cup: 0.15 };
  return w.esp * esp + w.milk * milk + w.temp * temp + w.art * art + w.cup * cup;
}

function longBlackQuality(d: MadeDrink, out: Complaint[]): number {
  const esp = d.espresso.total;
  const strength = band(d.water, LONG_BLACK_WATER[0], LONG_BLACK_WATER[1], 0.25, 0.2);
  if (d.water > LONG_BLACK_WATER[1] + 0.05) out.push('weak');
  if (d.water < LONG_BLACK_WATER[0] - 0.08) out.push('strong');
  const temp = band(d.temp, 60, 75, 15, 10);
  if (d.temp < LUKEWARM) out.push('lukewarm');
  if (d.spill > 0.05) out.push('messy');
  if (d.espresso.faults.length > 0) out.push('badShot');
  return 0.45 * esp + 0.35 * strength + 0.2 * temp - (d.spill > 0.05 ? 0.15 : 0);
}

/** Judge a drink handed to a customer. */
export function evaluateServe(order: Order, drink: MadeDrink, ctx: ServeContext): ServeResult {
  if (drink.type !== order.type) {
    return {
      accepted: false,
      correct: false,
      quality: 0,
      satisfaction: 0,
      tipCents: 0,
      complaints: ['wrongDrink'],
    };
  }
  const complaints: Complaint[] = [];
  let quality =
    drink.type === 'flatWhite'
      ? flatWhiteQuality(drink, order, complaints)
      : longBlackQuality(drink, complaints);
  if (complaints.includes('lukewarm')) quality *= 0.75;
  quality = clamp(quality);
  // Speed: anything past ~40% of their patience starts to cost satisfaction.
  const waitRatio = ctx.patience > 0 ? ctx.waited / ctx.patience : 1;
  if (waitRatio > 0.6) complaints.push('slow');
  const speed = clamp(1 - Math.max(0, waitRatio - 0.4) / 0.6);
  const raw = 100 * (0.75 * quality + 0.25 * speed);
  const satisfaction = Math.round(clamp(raw * ctx.tolerance, 0, 100));
  const correct = !complaints.some(
    (c) => c === 'notHotEnough' || c === 'noHeart' || c === 'tooHot',
  );
  const tipFrac = clamp((satisfaction - 55) / 40);
  const tipCents = Math.round((ctx.tipCents * tipFrac) / 10) * 10;
  return { accepted: true, correct, quality, satisfaction, tipCents, complaints };
}

/** Patience drain multiplier for where the customer is. */
export function drainRate(atRegisterUntaken: boolean): number {
  return atRegisterUntaken ? REGISTER_DRAIN : 1;
}

// ------------------------------------------------------------------ shift summary

export interface ServeRecord {
  customer: string;
  accepted: boolean;
  correct: boolean;
  /** Seconds from reaching the register to getting an accepted drink. */
  waited: number;
  satisfaction: number;
  tipCents: number;
}

export type ShiftGrade = 'excellent' | 'good' | 'okay' | 'poor' | 'disaster';

export interface ShiftSummary {
  customers: number;
  ordersCompleted: number;
  correctOrders: number;
  walkouts: number;
  /** Mean seconds to serve, over completed orders (0 if none). */
  avgServeSeconds: number;
  /** Mean satisfaction over all customers; walkouts count as 0. */
  satisfaction: number;
  tipsCents: number;
  /** Drinks binned or left on the pass. */
  wasted: number;
  grade: ShiftGrade;
}

export function gradeShift(satisfaction: number, walkouts: number): ShiftGrade {
  if (walkouts >= 3 || satisfaction < 25) return 'disaster';
  if (walkouts === 0 && satisfaction >= 80) return 'excellent';
  if (walkouts <= 1 && satisfaction >= 65) return 'good';
  if (satisfaction >= 45) return 'okay';
  return 'poor';
}

export function summariseShift(
  records: readonly ServeRecord[],
  customers: number,
  wasted: number,
): ShiftSummary {
  const done = records.filter((r) => r.accepted);
  const walkouts = customers - done.length;
  const satisfaction =
    customers > 0 ? Math.round(done.reduce((s, r) => s + r.satisfaction, 0) / customers) : 0;
  const avg = done.length > 0 ? done.reduce((s, r) => s + r.waited, 0) / done.length : 0;
  return {
    customers,
    ordersCompleted: done.length,
    correctOrders: done.filter((r) => r.correct).length,
    walkouts,
    avgServeSeconds: Math.round(avg * 10) / 10,
    satisfaction,
    tipsCents: done.reduce((s, r) => s + r.tipCents, 0),
    wasted,
    grade: gradeShift(satisfaction, walkouts),
  };
}

const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
export const formatCents = (c: number): string => AUD.format(c / 100);
