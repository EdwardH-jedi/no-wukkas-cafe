// Week mode in the Day 2 machine: the register takes generated orders (docs/integration/T3-hook.md).
// Day 2 without a week is guarded byte-for-byte by rushTrace.test.ts.

import { describe, expect, it } from 'vitest';
import { createRush, restartRush, type RushWeek } from '../../src/core/rush';
import { CUSTOMERS } from '../../src/data/customers';
import { generateOrders } from '../../src/sim/listening/generate';
import { playRush } from '../helpers/rushBot';

const WEEK0: RushWeek = { shiftIndex: 0, unlockedDrinks: ['flatWhite', 'longBlack'] };

describe('week mode: generated orders at the register', () => {
  it('each customer says the generated order for their slot', () => {
    const r = createRush(7, 'normal', {}, WEEK0);
    const specs = generateOrders(7, {
      shiftIndex: 0,
      difficulty: 'normal',
      count: CUSTOMERS.length,
      unlockedDrinks: WEEK0.unlockedDrinks,
      speakers: CUSTOMERS.map((c) => c.id),
    });
    expect(r.customers.map((c) => c.line.text)).toEqual(specs.map((s) => s.text));
    expect(r.customers.map((c) => c.def.id)).toEqual(specs.map((s) => s.speaker));
    expect(r.customers.map((c) => c.order)).toEqual(specs.map((s) => s.order));
  });

  it('is deterministic for a seed and differs from shift to shift', () => {
    const a = createRush(7, 'normal', {}, WEEK0).customers.map((c) => c.line.text);
    const b = createRush(7, 'normal', {}, WEEK0).customers.map((c) => c.line.text);
    const c = createRush(7, 'normal', {}, { ...WEEK0, shiftIndex: 1 }).customers.map(
      (x) => x.line.text,
    );
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
  });

  it('Day 2 (no week) still picks from the curated lines', () => {
    const r = createRush(7);
    expect(r.week).toBeNull();
    for (const c of r.customers) expect(c.def.orders.map((o) => o.id)).toContain(c.line.id);
  });

  it('a restart keeps the week and replays the same orders', () => {
    const r = createRush(9, 'hard', {}, WEEK0);
    const before = r.customers.map((c) => c.line.text);
    restartRush(r);
    expect(r.week).toEqual(WEEK0);
    expect(r.customers.map((c) => c.line.text)).toEqual(before);
  });

  it('a headless shift on generated orders runs to the report', () => {
    for (const seed of [1, 2, 3]) {
      const { r } = playRush({ seed, week: WEEK0 });
      expect(r.phase).toBe('summary');
      expect(r.listening.map((x) => x.lineId)).toEqual(
        expect.arrayContaining(r.customers.map((c) => c.line.id)),
      );
      // Rung up exactly as said: every field heard right.
      expect(r.listening.every((x) => x.wrong.length === 0)).toBe(true);
    }
  });
});
