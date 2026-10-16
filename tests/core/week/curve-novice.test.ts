// Week 1's difficulty curve for a novice (see curve-expert.test.ts): Friday is out of reach on
// the first try (30 seeds: 0 %).

import { describe, expect, it } from 'vitest';
import { firstTryRates } from '../../helpers/pace';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('week 1 curve: novice', () => {
  it('fails Friday', () => {
    expect(firstTryRates('novice', SEEDS)[4]).toBeLessThanOrEqual(0.3);
  }, 180_000);
});
