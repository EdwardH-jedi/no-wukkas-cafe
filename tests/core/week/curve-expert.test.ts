// Week 1's difficulty curve (docs/TODO.md Phase 2) from the headless skill bots
// (tests/helpers/rushBot.ts SKILLS), first tries over 10 seeds; `npm run balance` prints the same
// over 30. One file per profile so they run side by side. Bands are wide: one seed flipping
// doesn't fail them, a change that moves the curve does.

import { describe, expect, it } from 'vitest';
import { firstTryRates } from '../../helpers/pace';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('week 1 curve: expert', () => {
  it('never fails a shift', () => {
    expect(firstTryRates('expert', SEEDS)).toEqual([1, 1, 1, 1, 1]);
  }, 180_000);
});
