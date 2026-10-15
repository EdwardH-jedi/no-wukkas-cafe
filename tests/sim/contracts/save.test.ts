import { describe, expect, it } from 'vitest';
import { CUSTOMERS } from '../../../src/data/customers';
import {
  DEFAULT_SEED,
  migrate,
  newSave,
  REGULAR_IDS,
  STARTING_DRINKS,
  UNKNOWN_TIME,
  type SaveV2,
} from '../../../src/sim/contracts/save';
import type { ShiftSummary } from '../../../src/sim/rush';

const summary: ShiftSummary = {
  customers: 6,
  ordersCompleted: 5,
  correctOrders: 4,
  walkouts: 1,
  avgServeSeconds: 41.5,
  satisfaction: 71,
  tipsCents: 850,
  wasted: 1,
  grade: 'good',
};

const v2: SaveV2 = {
  version: 2,
  createdAt: '2026-10-15T04:00:00.000Z',
  seed: 7,
  difficulty: 'hard',
  week: 1,
  shift: 3,
  unlockedDrinks: ['flatWhite', 'longBlack', 'cappuccino', 'latte'],
  upgrades: ['grinder'],
  regulars: {
    dazza: {
      visits: 3,
      affinity: 2.5,
      lastOrder: { type: 'longBlack', milk: null, extraHot: false, heart: false },
    },
    beryl: { visits: 1, affinity: 0.5 },
  },
  reports: [{ week: 1, shift: 0, summary }],
  cents: 12345,
};

describe('migrate', () => {
  it('turns empty or missing data into a fresh save without throwing', () => {
    for (const raw of [undefined, null, '', '   ', 0, [], {}, 'not json', '{"version":', true]) {
      const s = migrate(raw);
      expect(s).toEqual(newSave());
      expect(s.version).toBe(2);
    }
  });

  it('a fresh save uses the defaults it is given (no clock read)', () => {
    const s = migrate(undefined, {
      seed: 99,
      createdAt: '2026-10-15T00:00:00.000Z',
      difficulty: 'easy',
    });
    expect(s).toMatchObject({
      seed: 99,
      createdAt: '2026-10-15T00:00:00.000Z',
      difficulty: 'easy',
    });
    expect(newSave().createdAt).toBe(UNKNOWN_TIME);
    expect(newSave().seed).toBe(DEFAULT_SEED);
    expect(newSave().unlockedDrinks).toEqual(STARTING_DRINKS);
  });

  it('a pre-v2 shape (no v1 save ever shipped) starts fresh, keeping a valid difficulty and seed', () => {
    const s = migrate({ version: 1, difficulty: 'hard', seed: 42, cents: 999, week: 4 });
    expect(s).toEqual({ ...newSave({ difficulty: 'hard', seed: 42 }) });
    expect(migrate({ version: 1, difficulty: 'insane' }).difficulty).toBe('normal');
  });

  it('round-trips a v2 save, parsed or as JSON', () => {
    expect(migrate(v2)).toEqual(v2);
    expect(migrate(JSON.stringify(v2))).toEqual(v2);
    expect(migrate(migrate(v2))).toEqual(v2);
  });

  it('repairs a damaged v2 save field by field', () => {
    const s = migrate({
      ...v2,
      createdAt: 5,
      seed: 'x',
      difficulty: 'nope',
      week: 0,
      shift: -2,
      unlockedDrinks: ['latte', 'flat_white', 'latte', 7],
      upgrades: ['grinder', '', 3, 'grinder'],
      regulars: {
        dazza: { visits: 2, affinity: 1, lastOrder: { type: 'mocha' } },
        priya: { visits: -1, affinity: 1 },
        gaz: { visits: 9, affinity: 9 },
        karen: { visits: 1, affinity: Number.NaN },
      },
      reports: [
        { week: 1, shift: 0, summary },
        { week: 1, shift: 1, summary: { grade: 'good' } },
        'x',
      ],
      cents: 10.6,
    });
    expect(s.createdAt).toBe(UNKNOWN_TIME);
    expect(s.seed).toBe(DEFAULT_SEED);
    expect(s.difficulty).toBe('normal');
    expect(s.week).toBe(1);
    expect(s.shift).toBe(0);
    expect(s.unlockedDrinks).toEqual(['flatWhite', 'longBlack', 'latte']);
    expect(s.upgrades).toEqual(['grinder']);
    expect(s.regulars).toEqual({ dazza: { visits: 2, affinity: 1 } });
    expect(s.reports).toEqual([{ week: 1, shift: 0, summary }]);
    expect(s.cents).toBe(11);
    expect(Number.isInteger(s.cents)).toBe(true);
  });

  it('never shares arrays or objects with its input', () => {
    const s = migrate(v2);
    expect(s.unlockedDrinks).not.toBe(v2.unlockedDrinks);
    expect(s.reports[0]).not.toBe(v2.reports[0]);
    expect(s.regulars.dazza).not.toBe(v2.regulars.dazza);
  });

  it('REGULAR_IDS are exactly the Day 2 customers', () => {
    expect([...REGULAR_IDS].sort()).toEqual(CUSTOMERS.map((c) => c.id).sort());
  });
});
