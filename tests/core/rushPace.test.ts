// Day 2 is the player's first shift: it has to be survivable for someone who reacts like a
// human, not just for the instant bot (measured 2026-10-14: a careful first play lost 4 of 6).
// `npm run pace` prints the same measurements as a table.

import { describe, expect, it } from 'vitest';
import { CUSTOMERS } from '../../src/data/customers';
import { paceRun } from '../helpers/pace';
import { BOT_FIRST_TIMER, BOT_IDEAL } from '../helpers/rushBot';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const position = (id: string): number => CUSTOMERS.findIndex((c) => c.id === id);

describe('Day 2 first-shift pacing', () => {
  it('a first-timer on Normal keeps customers 1–3, loses at most one, and Dazza has time to spare', () => {
    for (const seed of SEEDS) {
      const x = paceRun(BOT_FIRST_TIMER, seed, 'normal');
      const at = `seed ${seed}`;
      expect(
        x.walkouts.filter((id) => position(id) < 3),
        at,
      ).toEqual([]);
      expect(x.walkouts.length, at).toBeLessThanOrEqual(1);
      expect(x.left[CUSTOMERS[0]!.id], at).toBeGreaterThanOrEqual(25);
      expect(x.maxLine, at).toBeLessThanOrEqual(2);
    }
  }, 120_000);

  it('a perfect player still loses nobody, on Easy or Normal', () => {
    for (const seed of SEEDS)
      for (const d of ['easy', 'normal'] as const)
        expect(paceRun(BOT_IDEAL, seed, d).walkouts, `seed ${seed} ${d}`).toEqual([]);
  }, 120_000);
});

describe('Day 2 first-shift customers', () => {
  it('the first customer is patient, and everyone who might order a flat white has 110 s+', () => {
    expect(CUSTOMERS[0]!.patience).toBeGreaterThanOrEqual(120);
    for (const c of CUSTOMERS) {
      const first = c.orders.some((l) => l.firstShift)
        ? c.orders.filter((l) => l.firstShift)
        : c.orders;
      if (first.some((l) => l.order.type === 'flatWhite'))
        expect(c.patience, c.id).toBeGreaterThanOrEqual(110);
    }
  });

  it('Karen comes last and is the hardest to please', () => {
    const karen = CUSTOMERS[CUSTOMERS.length - 1]!;
    expect(karen.id).toBe('karen');
    for (const c of CUSTOMERS.slice(0, -1)) {
      expect(c.patience, c.id).toBeGreaterThan(karen.patience);
      expect(c.tolerance, c.id).toBeGreaterThan(karen.tolerance);
    }
  });

  it('arrivals are at least 35 s apart, so the line stays short', () => {
    for (let i = 1; i < CUSTOMERS.length; i++)
      expect(
        CUSTOMERS[i]!.arriveAt - CUSTOMERS[i - 1]!.arriveAt,
        CUSTOMERS[i]!.id,
      ).toBeGreaterThanOrEqual(35);
  });
});
