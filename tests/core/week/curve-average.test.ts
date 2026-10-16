// Week 1's difficulty curve for an average player (see curve-expert.test.ts): Monday to Wednesday
// passed first try, Thursday about 70 % of the time, Friday about half (30 seeds: 80 % and 60 %).

import { describe, expect, it } from 'vitest';
import { firstTryRates } from '../../helpers/pace';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('week 1 curve: average', () => {
  it('passes Mon–Wed, about 70 % of Thursdays and half of Fridays', () => {
    const [mon, tue, wed, thu, fri] = firstTryRates('average', SEEDS) as [
      number,
      number,
      number,
      number,
      number,
    ];
    for (const r of [mon, tue, wed]) expect(r).toBeGreaterThanOrEqual(0.9);
    expect(thu).toBeGreaterThanOrEqual(0.5);
    expect(thu).toBeLessThanOrEqual(0.9);
    expect(fri).toBeGreaterThanOrEqual(0.2);
    expect(fri).toBeLessThanOrEqual(0.8);
    expect(fri).toBeLessThanOrEqual(thu);
  }, 180_000);
});
