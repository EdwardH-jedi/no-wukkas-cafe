// Espresso: grind a dose into the portafilter, then pull the shot and stop it on time.
// Shot time is shown in "barista seconds" (what a real shot timer would read) but runs
// SHOT_TIME_SCALE× faster than real time so the trial keeps moving.

import { band, clamp } from './math';

export const GRIND_RATE = 5.2; // g per second while the grinder runs
export const DOSE_TARGET: readonly [number, number] = [18, 20];
export const SHOT_TIME_SCALE = 3.4;
export const SHOT_TARGET: readonly [number, number] = [25, 31];
export const SHOT_MAX = 60; // the machine gives up (and so does the owner)

export interface EspressoState {
  dose: number;
  grinding: boolean;
  /** Barista seconds since the pump started. */
  shotTime: number;
  extracting: boolean;
  /** Espresso in the cup, grams. */
  yield: number;
  done: boolean;
}

export function createEspresso(): EspressoState {
  return { dose: 0, grinding: false, shotTime: 0, extracting: false, yield: 0, done: false };
}

export function stepGrind(e: EspressoState, holding: boolean, dt: number): void {
  e.grinding = holding;
  if (holding) e.dose = Math.min(30, e.dose + GRIND_RATE * dt);
}

/** Yield flow in g per barista-second: a heavier dose chokes the shot and runs slower. */
export function shotFlow(dose: number): number {
  const d = Math.max(8, dose);
  return 1.35 * (19 / d) ** 2.2;
}

export function stepShot(e: EspressoState, dt: number): void {
  if (!e.extracting) return;
  const bs = dt * SHOT_TIME_SCALE;
  e.shotTime += bs;
  // Pre-infusion: nothing drips for the first ~4 s.
  if (e.shotTime > 4) e.yield += shotFlow(e.dose) * bs;
  if (e.shotTime >= SHOT_MAX) stopShot(e);
}

export function startShot(e: EspressoState): void {
  e.extracting = true;
}

export function stopShot(e: EspressoState): void {
  e.extracting = false;
  e.done = true;
}

/** 0 = sour/under, 0.5 = balanced, 1 = bitter/over: drives the stream colour and the taste. */
export function extractionLevel(e: EspressoState): number {
  return clamp((e.shotTime - 12) / 36);
}

export type EspressoFault = 'doseLight' | 'doseHeavy' | 'shotShort' | 'shotLong';

export interface EspressoScore {
  dose: number;
  time: number;
  total: number;
  faults: EspressoFault[];
}

export function scoreEspresso(e: EspressoState): EspressoScore {
  const dose = band(e.dose, DOSE_TARGET[0], DOSE_TARGET[1], 4, 4);
  const time = band(e.shotTime, SHOT_TARGET[0], SHOT_TARGET[1], 10, 12);
  const faults: EspressoFault[] = [];
  if (e.dose < DOSE_TARGET[0] - 1.5) faults.push('doseLight');
  if (e.dose > DOSE_TARGET[1] + 1.5) faults.push('doseHeavy');
  if (e.shotTime < SHOT_TARGET[0] - 4) faults.push('shotShort');
  if (e.shotTime > SHOT_TARGET[1] + 5) faults.push('shotLong');
  return { dose, time, total: 0.4 * dose + 0.6 * time, faults };
}
