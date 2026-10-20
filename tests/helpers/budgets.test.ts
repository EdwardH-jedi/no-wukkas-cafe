// tests/e2e/helpers/budgets.ts against the sim: the browser specs wait on the game's clock for as
// long as the shift really takes headless, plus a margin, so a retuned shift moves this test first.

import { describe, expect, it } from 'vitest';
import { createRush, stepRush } from '../../src/core/rush';
import { emptyRushInput } from '../../src/core/rush/state';
import { weekFor } from '../../src/core/week/session';
import { newSave } from '../../src/sim/contracts/save';
import { MONDAY_UNSERVED_SECONDS } from '../e2e/helpers/budgets';

/** Service seconds until the report when nobody takes an order (the intro is skipped). */
function unservedServiceSeconds(seed: number): number {
  const r = createRush(seed, 'normal', {}, weekFor(newSave({ seed })));
  const input = emptyRushInput();
  for (let i = 0; r.phase !== 'summary' && i < 100_000; i++) {
    input.skip = r.phase === 'intro';
    stepRush(r, input, 0.1);
  }
  expect(r.phase).toBe('summary');
  expect(r.customers.every((c) => c.outcome === 'walkout')).toBe(true);
  return r.serviceTime;
}

describe('game-time budgets for the browser specs', () => {
  it("Monday unserved (week.spec.ts) fits its budget with 20 % to spare, and isn't padded past double", () => {
    for (const seed of [7, 1, 20]) {
      const t = unservedServiceSeconds(seed);
      expect(t * 1.2, `seed ${seed}: ${t} s`).toBeLessThanOrEqual(MONDAY_UNSERVED_SECONDS);
      expect(t * 2, `seed ${seed}: ${t} s`).toBeGreaterThan(MONDAY_UNSERVED_SECONDS);
    }
  });
});
