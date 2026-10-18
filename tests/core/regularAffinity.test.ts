// AFFINITY_RULE (Edward, 2026-10-18): a correct drink served to a regular in a week shift adds +1
// affinity (saved by finishShift: tests/core/week/session.test.ts), so THE_USUAL (USUAL_AFFINITY)
// can come up from a fresh save. Day 2 has no save to remember it in; a hand-back earns nothing.
// Every drink a regular takes away (right or not) is a visit (RegularMemory.visits).

import { describe, expect, it } from 'vitest';
import { createRush, type Rush, type RushCustomer } from '../../src/core/rush';
import { serve } from '../../src/core/rush/serve';
import { createSaveStore, type KeyValueStorage } from '../../src/core/save/storage';
import { finishShift } from '../../src/core/week/session';
import { newSave } from '../../src/sim/contracts/save';
import type { MadeDrink } from '../../src/sim/rush';
import { drinkFor } from '../review/leftCustomerSilent';

const WEEK = { shiftIndex: 1, unlockedDrinks: ['longBlack' as const], affinity: {} };

function hand(r: Rush, c: RushCustomer, drink: MadeDrink): void {
  c.state = 'waiting';
  c.heard = { ...c.order };
  c.ticket = 1;
  c.registerAt = r.time;
  r.barista.ready = drink;
  r.barista.phase = 'ready';
  serve(r, c.key);
}

describe('a correct serve to a regular', () => {
  it('adds +1 affinity per correct serve in a week shift', () => {
    const r = createRush(7, 'normal', {}, WEEK);
    const c = r.customers.find((x) => x.def.id === 'dazza')!;
    hand(r, c, drinkFor(c, r.time));
    expect(c.result?.correct).toBe(true);
    expect(r.shiftEvents.affinity).toEqual({ dazza: 1 });
    const other = r.customers.find((x) => x.def.id !== 'dazza')!;
    hand(r, other, drinkFor(other, r.time));
    expect(r.shiftEvents.affinity).toEqual({ dazza: 1, [other.def.id]: 1 });
  });

  it('a drink handed back (the wrong one) adds nothing', () => {
    const r = createRush(7, 'normal', {}, WEEK);
    const c = r.customers.find((x) => x.def.id === 'dazza')!;
    const wrong = drinkFor(c, r.time);
    wrong.type = c.order.type === 'longBlack' ? 'flatWhite' : 'longBlack';
    hand(r, c, wrong);
    expect(c.outcome).not.toBe('served');
    expect(r.shiftEvents.affinity).toEqual({});
  });

  it('Day 2 (no week, nothing saved) keeps no affinity', () => {
    const r = createRush(7);
    const c = r.customers[0]!;
    hand(r, c, drinkFor(c, r.time));
    expect(c.result?.correct).toBe(true);
    expect(r.shiftEvents.affinity).toEqual({});
  });
});

/** A regular with a flat white: the only drink a served cup can still get wrong (too hot). */
function flatWhiteRegular(r: Rush): RushCustomer {
  const c = r.customers.find((x) => x.def.id === 'dazza')!;
  c.order = { ...c.order, type: 'flatWhite', milk: 'full', extraHot: false, heart: false };
  return c;
}

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

describe('a regular who takes a drink away', () => {
  it('counts a visit for every served drink, right or not', () => {
    const right = createRush(7, 'normal', {}, WEEK);
    const a = flatWhiteRegular(right);
    hand(right, a, drinkFor(a, right.time));
    expect(a.result?.correct).toBe(true);
    expect(right.shiftEvents.visits).toEqual({ dazza: 1 });

    const wrong = createRush(7, 'normal', {}, WEEK);
    const b = flatWhiteRegular(wrong);
    hand(wrong, b, { ...drinkFor(b, wrong.time), temp: 72 });
    expect(b.outcome).toBe('served');
    expect(b.result?.correct).toBe(false);
    expect(wrong.shiftEvents.visits).toEqual({ dazza: 1 });
    expect(wrong.shiftEvents.affinity).toEqual({});
  });

  it('a hand-back is no visit; Day 2 keeps none', () => {
    const r = createRush(7, 'normal', {}, WEEK);
    const c = r.customers.find((x) => x.def.id === 'dazza')!;
    const back = drinkFor(c, r.time);
    back.type = c.order.type === 'longBlack' ? 'flatWhite' : 'longBlack';
    hand(r, c, back);
    expect(r.shiftEvents.visits).toEqual({});
    const day2 = createRush(7);
    hand(day2, day2.customers[0]!, drinkFor(day2.customers[0]!, day2.time));
    expect(day2.shiftEvents.visits).toEqual({});
  });

  it('two shifts, one served wrong: the save says two visits, one affinity', () => {
    const store = createSaveStore(new MemoryStorage(), { seed: 9 });
    store.save({ ...newSave({ seed: 9 }), shift: 1 });
    for (const temp of [62, 72]) {
      const r = createRush(7, 'normal', {}, WEEK);
      const c = flatWhiteRegular(r);
      hand(r, c, { ...drinkFor(c, r.time), temp });
      finishShift(
        store,
        {
          customers: 1,
          ordersCompleted: 1,
          correctOrders: 1,
          walkouts: 0,
          avgServeSeconds: 30,
          satisfaction: 70,
          tipsCents: 0,
          wasted: 0,
          grade: 'good',
        },
        r.shiftEvents.affinity,
        r.shiftEvents.visits,
      );
    }
    expect(store.load().regulars.dazza).toEqual({ visits: 2, affinity: 1 });
  });
});
