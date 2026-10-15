import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';
import { endlessArrival, endlessGap, endlessOver } from '../../../src/core/week/endless';
import { ENDLESS, FIRST_ARRIVAL } from '../../../src/data/week';

describe('endless rush', () => {
  it('keeps speeding arrivals up, never below the floor', () => {
    expect(endlessGap(0)).toBe(ENDLESS.gap.first);
    for (let n = 1; n < 200; n++) {
      expect(endlessGap(n)).toBeLessThanOrEqual(endlessGap(n - 1));
      expect(endlessGap(n)).toBeGreaterThanOrEqual(ENDLESS.gap.min);
    }
    expect(endlessGap(500)).toBe(ENDLESS.gap.min);
    expect(endlessArrival(0)).toBe(FIRST_ARRIVAL);
    expect(endlessArrival(2)).toBeCloseTo(FIRST_ARRIVAL + endlessGap(0) + endlessGap(1), 5);
  });

  it('is over at the third walk-out, not before', () => {
    expect([0, 1, 2, 3, 4].map((w) => endlessOver(w))).toEqual([false, false, false, true, true]);
  });

  it('always ends as walk-outs get likelier with the shrinking gaps (1000 seeds)', () => {
    const span = ENDLESS.gap.first - ENDLESS.gap.min;
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = createRng(seed);
      let walkouts = 0;
      let n = 0;
      while (!endlessOver(walkouts)) {
        const pressure = 1 - (endlessGap(n) - ENDLESS.gap.min) / span;
        if (rng.next() < 0.02 + 0.3 * pressure) walkouts++;
        n++;
        expect(n).toBeLessThan(1000);
      }
      expect(walkouts).toBe(ENDLESS.maxWalkouts);
    }
  });
});
