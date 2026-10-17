// AFFINITY_RULE (Edward, 2026-10-18): a correct drink served to a regular in a week shift adds +1
// affinity (saved by finishShift: tests/core/week/session.test.ts), so THE_USUAL (USUAL_AFFINITY)
// can come up from a fresh save. Day 2 has no save to remember it in; a hand-back earns nothing.

import { describe, expect, it } from 'vitest';
import { createRush, type Rush, type RushCustomer } from '../../src/core/rush';
import { serve } from '../../src/core/rush/serve';
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
