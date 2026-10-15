// Week mode in the Day 2 machine: the register takes generated orders (docs/integration/T3-hook.md).
// Day 2 without a week is guarded byte-for-byte by rushTrace.test.ts.

import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  createRush,
  emptyRushInput,
  restartRush,
  stepRush,
  type RushWeek,
} from '../../src/core/rush';
import { ENDLESS_BATCH } from '../../src/core/rush/machine';
import { endlessArrival } from '../../src/core/week/endless';
import { arrivalTimes, shiftDef } from '../../src/core/week/progress';
import { CUSTOMERS } from '../../src/data/customers';
import { PATIENCE_SCALE, WEEK } from '../../src/data/week';
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

const at = (shiftIndex: number, extra: Partial<RushWeek> = {}): RushWeek => ({
  ...WEEK0,
  shiftIndex,
  ...extra,
});

describe('week mode: the week table sets the shift', () => {
  it('size, arrivals and patience come from the shift and the difficulty', () => {
    for (const d of WEEK) {
      const r = createRush(7, 'hard', {}, at(d.index));
      expect(r.customers).toHaveLength(d.customers);
      expect(r.customers.map((c) => c.arriveAt)).toEqual(arrivalTimes(shiftDef(d.index)));
      for (const c of r.customers)
        expect(c.maxPatience).toBeCloseTo(c.def.patience * PATIENCE_SCALE.hard);
      // Regulars come back in longer shifts: each visit has its own key.
      const keys = r.customers.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.slice(0, 6)).toEqual(CUSTOMERS.map((c) => c.id));
      if (d.customers > 6) expect(keys[6]).toBe(`${r.customers[6]?.def.id}#2`);
    }
  });

  it('Day 2 keeps its own arrivals, patience and keys', () => {
    const r = createRush(7);
    expect(r.customers.map((c) => [c.key, c.arriveAt, c.maxPatience])).toEqual(
      CUSTOMERS.map((c) => [c.id, c.arriveAt, c.patience]),
    );
  });

  it("week 2's Monday doesn't replay week 1's orders", () => {
    const one = createRush(7, 'normal', {}, at(0)).customers.map((c) => c.line.text);
    const two = createRush(7, 'normal', {}, at(0, { week: 2 })).customers.map((c) => c.line.text);
    expect(two).not.toEqual(one);
  });

  it('a returning regular waits outside until their earlier visit has left', () => {
    const r = createRush(4, 'normal', {}, at(4));
    const [first, back] = [r.customers[0], r.customers[6]];
    if (!first || !back) throw new Error('Friday has ten customers');
    expect(back.def).toBe(first.def);
    // The first visit stays at the register long past the second one's arrival.
    first.maxPatience = 1e6;
    first.patience = 1e6;
    const input = emptyRushInput(); // nobody serves
    let waited = false;
    let enteredAt = -1;
    for (let n = 0; n < 900 / STEP && r.phase !== 'summary'; n++) {
      stepRush(r, input, STEP);
      r.events.length = 0;
      for (const def of CUSTOMERS) {
        const here = r.customers.filter(
          (c) => c.def === def && c.state !== 'outside' && c.state !== 'gone',
        );
        expect(here.length).toBeLessThanOrEqual(1);
      }
      if (!waited && back.state === 'outside' && r.serviceTime > back.arriveAt + 5) {
        waited = true;
        first.patience = 0; // now they go
      }
      if (enteredAt < 0 && back.state !== 'outside') enteredAt = r.serviceTime;
    }
    expect(waited).toBe(true);
    expect(enteredAt).toBeGreaterThan(back.arriveAt + 5);
    expect(r.phase).toBe('summary');
    expect(r.summary?.customers).toBe(10);
  }, 20000);

  it("a full Friday (ten customers) runs to the report, serving by each visit's key", () => {
    const { r } = playRush({ seed: 2, week: at(4) });
    expect(r.phase).toBe('summary');
    expect(r.summary?.customers).toBe(10);
    expect(r.customers.every((c) => c.outcome !== null)).toBe(true);
    expect(r.records.length).toBeGreaterThan(6); // returning regulars were served too
  }, 20000);
});

describe('Endless Rush', () => {
  const ENDLESS: RushWeek = { ...WEEK0, shiftIndex: 4, endless: true };

  it('lines up a batch of generated customers on the Endless clock', () => {
    const r = createRush(5, 'normal', {}, ENDLESS);
    expect(r.customers).toHaveLength(ENDLESS_BATCH);
    expect(r.customers.map((c) => c.arriveAt)).toEqual(
      Array.from({ length: ENDLESS_BATCH }, (_, n) => endlessArrival(n)),
    );
    expect(r.shiftEvents.bird).toBe(false);
  });

  it('ends at the third walk-out, counting only who came in, with no shift events', () => {
    const { r, events } = playRush({ seed: 5, week: ENDLESS, idle: true });
    expect(r.phase).toBe('summary');
    expect(r.summary?.walkouts).toBe(3);
    // Only visits that ended count: those still waiting or yet to come don't.
    const ended = r.customers.filter((c) => c.outcome !== null).length;
    expect(ended).toBe(3);
    expect(r.summary?.customers).toBe(3);
    expect(r.customers.filter((c) => c.state !== 'outside').length).toBeLessThan(ENDLESS_BATCH);
    expect(events.some((e) => e.type === 'shiftEvent')).toBe(false);
  }, 20000);
});
