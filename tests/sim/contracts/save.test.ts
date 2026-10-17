import { describe, expect, it } from 'vitest';
import { CUSTOMERS } from '../../../src/data/customers';
import {
  DEFAULT_KEYS,
  DEFAULT_SEED,
  migrate,
  newSave,
  REGULAR_IDS,
  SAVE_VERSION,
  STARTING_DRINKS,
  UNKNOWN_TIME,
  type Save,
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

/** A save as v2 stored it (before the key map). */
const v2: Omit<Save, 'version' | 'keys'> & { version: 2 } = {
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
/** The same save today: v3 adds the player's keys. */
const v3: Save = { ...v2, version: 3, keys: { action: ' ', replay: 'r', serve: '1' } };

describe('migrate', () => {
  it('turns empty or missing data into a fresh save without throwing', () => {
    for (const raw of [undefined, null, '', '   ', 0, [], {}, 'not json', '{"version":', true]) {
      const s = migrate(raw);
      expect(s).toEqual(newSave());
      expect(s.version).toBe(3);
      expect(SAVE_VERSION).toBe(3);
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

  it('loads a v2 save (the previous version) as v3: every field kept, the default keys added', () => {
    expect(migrate(v2)).toEqual(v3);
    expect(migrate(JSON.stringify(v2))).toEqual(v3);
    expect(migrate(v2).keys).toEqual(DEFAULT_KEYS);
  });

  it('round-trips a v3 save, parsed or as JSON', () => {
    const mine: Save = { ...v3, keys: { action: 'j', replay: 'k', serve: 'n' } };
    expect(migrate(mine)).toEqual(mine);
    expect(migrate(JSON.stringify(mine))).toEqual(mine);
    expect(migrate(migrate(mine))).toEqual(mine);
  });

  it("repairs a v3 key map: a key the game already uses, a duplicate or junk falls back to that key's default", () => {
    const keys = (k: unknown) => migrate({ ...v3, keys: k }).keys;
    expect(keys({ action: 'f', replay: 'r', serve: '1' })).toEqual(DEFAULT_KEYS); // f = make
    expect(keys({ action: 'j', replay: 'j', serve: 'k' })).toEqual({
      action: 'j',
      replay: 'r',
      serve: 'k',
    });
    expect(keys({ action: 'J', replay: 7, serve: 'enter' })).toEqual({
      action: ' ',
      replay: 'r',
      serve: '1',
    });
    expect(keys(undefined)).toEqual(DEFAULT_KEYS);
    expect(keys({ action: '1', replay: ' ', serve: 'r' })).toEqual(DEFAULT_KEYS); // others' defaults
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
