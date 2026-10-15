import { describe, expect, it } from 'vitest';
import type { ListenRecord } from '../../../src/sim/listening';
import type { Order } from '../../../src/sim/rush';
import { accuracyByField } from '../../../src/sim/listening/stats';
import { playRush } from '../../helpers/rushBot';

const fw = (o: Partial<Order> = {}): Order => ({
  type: 'flatWhite',
  milk: 'full',
  extraHot: false,
  heart: false,
  ...o,
});
const lb: Order = { type: 'longBlack', milk: null, extraHot: false, heart: false };
const rec = (truth: Order, heard: Order | null): ListenRecord => ({
  customer: 'dazza',
  lineId: 'x',
  tier: 1,
  truth,
  heard,
  wrong: [],
  replays: 0,
  repeats: 0,
  clarified: [],
  questions: 0,
});

describe('accuracyByField', () => {
  it('is all zeros for no orders', () => {
    expect(accuracyByField([])).toEqual({
      drink: { total: 0, correct: 0 },
      milk: { total: 0, correct: 0 },
      temp: { total: 0, correct: 0 },
      heart: { total: 0, correct: 0 },
    });
  });

  it('counts each field, only where it could be heard (flat whites, right drink)', () => {
    const a = accuracyByField([
      rec(fw({ milk: 'oat', extraHot: true }), fw({ milk: 'soy', extraHot: true })),
      rec(fw({ heart: true }), lb),
      rec(lb, lb),
      rec(fw(), null),
    ]);
    expect(a.drink).toEqual({ total: 3, correct: 2 });
    expect(a.milk).toEqual({ total: 1, correct: 0 });
    expect(a.temp).toEqual({ total: 1, correct: 1 });
    expect(a.heart).toEqual({ total: 1, correct: 1 });
  });

  it('matches a whole shift rung up exactly as said', () => {
    const { r } = playRush({ seed: 3 });
    const a = accuracyByField(r.listening);
    expect(a.drink.total).toBe(r.listening.length);
    for (const f of ['drink', 'milk', 'temp', 'heart'] as const)
      expect(a[f].correct).toBe(a[f].total);
  });
});
