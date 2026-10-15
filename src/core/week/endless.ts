// Endless Rush: the service loop with no customer cap and arrivals that keep speeding up, until the
// third walk-out. Pure rules; running it needs the machine hook (docs/integration/T5-hook.md).

import { ENDLESS, FIRST_ARRIVAL } from '../../data/week';

/** Seconds between customer n and customer n + 1 (0-based); never below ENDLESS.gap.min. */
export function endlessGap(n: number): number {
  const gap = Math.round(ENDLESS.gap.first * ENDLESS.gap.decay ** n * 10) / 10;
  return Math.max(ENDLESS.gap.min, gap);
}

/** When customer n walks in, in service seconds. */
export function endlessArrival(n: number): number {
  let t = FIRST_ARRIVAL;
  for (let i = 0; i < n; i++) t += endlessGap(i);
  return Math.round(t * 10) / 10;
}

export const endlessOver = (walkouts: number): boolean => walkouts >= ENDLESS.maxWalkouts;
