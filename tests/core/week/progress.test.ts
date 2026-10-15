import { describe, expect, it } from 'vitest';
import {
  arrivalTimes,
  bestGrade,
  endlessUnlocked,
  nextShift,
  passFail,
  shiftRows,
  SHIFTS_PER_WEEK,
  unlocksFor,
} from '../../../src/core/week/progress';
import { UPGRADES } from '../../../src/data/upgrades';
import { FIRST_ARRIVAL, PATIENCE_SCALE, WEEK } from '../../../src/data/week';
import { newSave } from '../../../src/sim/contracts/save';
import { DRINK_IDS, DRINKS, isDrinkId } from '../../../src/sim/contracts/ticket';
import { gradeShift, type ShiftGrade, type ShiftSummary } from '../../../src/sim/rush';

const report = (grade: ShiftGrade, tipsCents = 500): ShiftSummary => ({
  customers: 6,
  ordersCompleted: 6,
  correctOrders: 5,
  walkouts: 0,
  avgServeSeconds: 40,
  satisfaction: 75,
  tipsCents,
  wasted: 0,
  grade,
});

describe('week table', () => {
  it('is five shifts of 6, 7, 8, 9 and 10 customers', () => {
    expect(WEEK.map((s) => s.customers)).toEqual([6, 7, 8, 9, 10]);
    expect(WEEK.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(SHIFTS_PER_WEEK).toBe(5);
  });

  it('unlocks every drink exactly once, each one in the recipe table', () => {
    const all = WEEK.flatMap((s) => s.unlocks);
    for (const d of all) {
      expect(isDrinkId(d)).toBe(true);
      expect(DRINKS[d]).toBeDefined();
    }
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...DRINK_IDS].sort());
    expect(unlocksFor(0)).toEqual(['flatWhite', 'longBlack']);
    expect(unlocksFor(1)).toContain('cappuccino');
    expect(unlocksFor(2)).toContain('latte');
    expect(unlocksFor(3)).toContain('piccolo');
    expect(unlocksFor(4)).toContain('icedLongBlack');
  });

  it('has no events on the first shift; Hard is the same table with less patience', () => {
    expect(WEEK[0]?.eventCap).toBe(0);
    expect(PATIENCE_SCALE.hard).toBeLessThan(PATIENCE_SCALE.normal);
    expect(PATIENCE_SCALE.normal).toBeLessThan(PATIENCE_SCALE.easy);
  });

  it('speeds arrivals up through each shift', () => {
    for (const s of WEEK) {
      const t = arrivalTimes(s);
      expect(t).toHaveLength(s.customers);
      expect(t[0]).toBe(FIRST_ARRIVAL);
      const gaps = t.slice(1).map((x, i) => x - (t[i] as number));
      for (const g of gaps) expect(g).toBeGreaterThan(0);
      for (let i = 1; i < gaps.length; i++)
        expect(gaps[i] as number).toBeLessThanOrEqual((gaps[i - 1] as number) + 0.11);
      expect(gaps[0]).toBeCloseTo(s.gap.first, 0);
      expect(gaps.at(-1)).toBeCloseTo(s.gap.last, 0);
    }
  });
});

describe('progression', () => {
  it('plays a full week from a fixed seed, deterministically', () => {
    const play = () => {
      let s = newSave({ seed: 42, createdAt: '2026-10-15T00:00:00.000Z' });
      for (let i = 0; i < 5; i++) s = nextShift(s, report('good', 100 * (i + 1)));
      return s;
    };
    const end = play();
    expect(end.week).toBe(2);
    expect(end.shift).toBe(0);
    expect([...end.unlockedDrinks].sort()).toEqual([...DRINK_IDS].sort());
    expect(end.reports.map((r) => r.shift)).toEqual([0, 1, 2, 3, 4]);
    expect(end.cents).toBe(1500);
    expect(end).toEqual(play());
  });

  it('replays a failed shift, never a game over: receipt and tips kept, nothing unlocked', () => {
    const s0 = nextShift(newSave(), report('good'));
    const failed = nextShift(s0, report('disaster', 30));
    expect(failed.week).toBe(1);
    expect(failed.shift).toBe(1);
    expect(failed.unlockedDrinks).toEqual(s0.unlockedDrinks);
    expect(failed.reports).toHaveLength(2);
    expect(failed.cents).toBe(s0.cents + 30);
    expect(passFail(report('poor'))).toBe('pass');
    expect(passFail(report('disaster'))).toBe('fail');
    expect(gradeShift(10, 3)).toBe('disaster');
  });

  it("adds the next shift's drinks as it is reached", () => {
    expect(nextShift(newSave(), report('okay')).unlockedDrinks).toEqual([
      'flatWhite',
      'longBlack',
      'cappuccino',
    ]);
  });

  it('never changes the save it is given', () => {
    const s = newSave();
    const copy = JSON.parse(JSON.stringify(s)) as unknown;
    nextShift(s, report('good'));
    expect(s).toEqual(copy);
  });

  it('lists shifts as locked ahead, open now, done with the best grade', () => {
    let s = newSave();
    expect(shiftRows(s).map((r) => r.status)).toEqual([
      'open',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(endlessUnlocked(s)).toBe(false);
    s = nextShift(s, report('okay'));
    s = nextShift(s, report('disaster'));
    const rows = shiftRows(s);
    expect(rows.map((r) => r.status)).toEqual(['done', 'open', 'locked', 'locked', 'locked']);
    expect(rows[0]?.best).toBe('okay');
    expect(rows[1]?.best).toBe('disaster');
    expect(bestGrade(nextShift(s, report('excellent')), 1)).toBe('excellent');
    expect(endlessUnlocked(s)).toBe(true);
  });
});

describe('upgrades', () => {
  it('are data only: unique ids, whole-cent prices, a parameter each changes', () => {
    expect(UPGRADES.map((u) => u.id).sort()).toEqual([
      'docketRail',
      'grinder',
      'secondGroup',
      'steamWand',
    ]);
    for (const u of UPGRADES) {
      expect(Number.isInteger(u.costCents)).toBe(true);
      expect(u.costCents).toBeGreaterThan(0);
      expect(u.to).not.toBe(u.from);
    }
  });
});
