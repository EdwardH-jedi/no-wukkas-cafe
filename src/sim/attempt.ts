// One attempt = one flat white. Combines the pattern on the coffee with the cup, milk and shot,
// decides whether the attempt counts, and lists what went wrong (worst first).

import { band, clamp } from './math';
import type { EspressoFault, EspressoScore } from './espresso';
import type { PatternScore } from './latte/score';
import type { MilkFault, MilkScore } from './steam';

export const POINTS = { art: 70, cup: 10, milk: 12, espresso: 8 } as const;
export const ATTEMPTS = 3;

export type ArtFault =
  | 'noArt'
  | 'muddy'
  | 'blob'
  | 'split'
  | 'noTip'
  | 'noCleft'
  | 'lopsided'
  | 'offCentre'
  | 'tooSmall'
  | 'tooBig';
export type CupFault = 'overflow' | 'spill' | 'underfilled';
export type Fault = ArtFault | CupFault | MilkFault | EspressoFault;
export type InvalidReason = 'nothingPoured' | 'mostlySpilled' | 'halfEmpty';
export type Band = 'disaster' | 'failed' | 'almost' | 'hired';

const SEVERITY: Record<Fault, number> = {
  noArt: 10,
  blob: 8,
  split: 7,
  muddy: 7,
  noTip: 6,
  noCleft: 6,
  overflow: 5.5,
  spill: 5,
  lopsided: 5,
  scalded: 4.5,
  flatMilk: 4.2,
  stiffMilk: 4,
  offCentre: 4,
  tooSmall: 3.8,
  tooBig: 3.8,
  bubbly: 3.5,
  milkHot: 3.2,
  milkCold: 3.2,
  underfilled: 3,
  shotLong: 2.5,
  shotShort: 2.5,
  doseHeavy: 2,
  doseLight: 2,
};

export interface PourTotals {
  fill: number;
  spill: number;
  overflow: number;
  milkIn: number;
}

export interface AttemptResult {
  /** 0–100, rounded. */
  total: number;
  art: number;
  cup: number;
  milk: number;
  espresso: number;
  valid: boolean;
  invalid: InvalidReason | null;
  /** Worst first. */
  faults: Fault[];
  band: Band;
  pattern: PatternScore;
}

export function bandFor(score: number): Band {
  if (score >= 85) return 'hired';
  if (score >= 60) return 'almost';
  if (score >= 25) return 'failed';
  return 'disaster';
}

export function artFaults(p: PatternScore): ArtFault[] {
  const f: ArtFault[] = [];
  if (p.coverage < 0.04) return ['noArt'];
  const muddy = p.definition < 0.45;
  if (muddy) f.push('muddy');
  if (p.notchRatio > 2.4) f.push('split');
  else if (p.heartness < 0.3 && !muddy) f.push('blob');
  else {
    if (p.tip < 0.45 && p.notch >= 0.5) f.push('noTip');
    if (p.notch < 0.45 && p.tip >= 0.5) f.push('noCleft');
  }
  if (p.symmetry < 0.55 && p.heartness >= 0.3) f.push('lopsided');
  if (p.position < 0.6) f.push('offCentre');
  if (p.coverage < 0.15) f.push('tooSmall');
  else if (p.coverage > 0.62) f.push('tooBig');
  return f;
}

export function scoreAttempt(
  pattern: PatternScore,
  pour: PourTotals,
  milk: MilkScore,
  espresso: EspressoScore,
): AttemptResult {
  const fillS = band(pour.fill, 0.88, 1, 0.3, 1);
  const spillS = 1 - clamp(pour.spill / 0.2);
  const art = POINTS.art * pattern.art;
  const cup = POINTS.cup * (0.5 * fillS + 0.5 * spillS);
  const milkPts = POINTS.milk * milk.total;
  const espPts = POINTS.espresso * espresso.total;
  const total = Math.round(art + cup + milkPts + espPts);

  let invalid: InvalidReason | null = null;
  if (pour.milkIn < 0.15) invalid = 'nothingPoured';
  else if (pour.spill > 0.35) invalid = 'mostlySpilled';
  else if (pour.fill < 0.6) invalid = 'halfEmpty';

  const faults: Fault[] = [...artFaults(pattern), ...milk.faults, ...espresso.faults];
  if (pour.overflow > 0.02) faults.push('overflow');
  if (pour.spill - pour.overflow > 0.04) faults.push('spill');
  if (pour.fill < 0.85) faults.push('underfilled');
  faults.sort((a, b) => SEVERITY[b] - SEVERITY[a]);

  return {
    total,
    art,
    cup,
    milk: milkPts,
    espresso: espPts,
    valid: invalid === null,
    invalid,
    faults,
    band: bandFor(total),
    pattern,
  };
}

/** Index of the best valid attempt, or -1 if none counted. */
export function bestValidIndex(results: readonly AttemptResult[]): number {
  let best = -1;
  results.forEach((r, i) => {
    if (r.valid && (best < 0 || r.total > (results[best] as AttemptResult).total)) best = i;
  });
  return best;
}

export interface TrialOutcome {
  band: Band;
  score: number;
  bestIndex: number;
}

/** Verdict from the best valid attempt. No valid attempt at all is a disaster. */
export function trialOutcome(results: readonly AttemptResult[]): TrialOutcome {
  const i = bestValidIndex(results);
  if (i < 0) return { band: 'disaster', score: 0, bestIndex: -1 };
  const score = (results[i] as AttemptResult).total;
  return { band: bandFor(score), score, bestIndex: i };
}
