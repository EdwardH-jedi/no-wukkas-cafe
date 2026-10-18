// Week mode between the save and the rush (docs/integration/T5-hook.md): only the current shift is
// playable, the rush's week context comes from the save, and a finished shift is written once.

import { describe, expect, it } from 'vitest';
import { createSaveStore, SAVE_KEY, type KeyValueStorage } from '../../../src/core/save/storage';
import { canPlay, endlessFor, finishShift, weekFor } from '../../../src/core/week/session';
import { newSave, type SaveV2 } from '../../../src/sim/contracts/save';
import type { ShiftSummary } from '../../../src/sim/rush';
import { BASE_STATION } from '../../../src/sim/shop';

class CountingStorage implements KeyValueStorage {
  data = new Map<string, string>();
  writes = 0;
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.writes++;
    this.data.set(k, v);
  }
}

const report = (grade: ShiftSummary['grade']): ShiftSummary => ({
  customers: 7,
  ordersCompleted: 6,
  correctOrders: 5,
  walkouts: grade === 'disaster' ? 3 : 1,
  avgServeSeconds: 41,
  satisfaction: grade === 'disaster' ? 20 : 70,
  tipsCents: 450,
  wasted: 1,
  grade,
});

const onShift = (shift: number, extra: Partial<SaveV2> = {}): SaveV2 => ({
  ...newSave({ seed: 9 }),
  shift,
  ...extra,
});

describe('week session', () => {
  it('only the shift the week is on can be played', () => {
    const save = onShift(2);
    expect([0, 1, 2, 3, 4].map((i) => canPlay(save, i))).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it("builds the rush's week from the save", () => {
    const save = onShift(3, {
      week: 2,
      unlockedDrinks: ['flatWhite', 'longBlack', 'cappuccino'],
      regulars: { dazza: { visits: 4, affinity: 2 } },
    });
    const w = weekFor(save, { THE_NAME: 7 }, 'THE_NAME');
    expect(w).toEqual({
      week: 2,
      shiftIndex: 3,
      unlockedDrinks: ['flatWhite', 'longBlack', 'cappuccino'],
      eventCooldowns: { THE_NAME: 7 },
      lastEvent: 'THE_NAME',
      affinity: { dazza: 2 },
      station: BASE_STATION, // no upgrades bought
    });
    expect(endlessFor(save)).toMatchObject({ week: 2, shiftIndex: 4, endless: true });
  });

  it('a pass records the receipt and moves on; regulars keep what events taught them', () => {
    const disk = new CountingStorage();
    const store = createSaveStore(disk, { seed: 9 });
    store.save(onShift(1, { regulars: { beryl: { visits: 2, affinity: 1 } } }));
    disk.writes = 0;
    const s = finishShift(store, report('good'), { beryl: 1, jiwoo: -1 });
    expect(disk.writes).toBe(1);
    expect(s.shift).toBe(2);
    expect(s.reports).toEqual([{ week: 1, shift: 1, summary: report('good') }]);
    expect(s.cents).toBe(450);
    expect(s.unlockedDrinks).toContain('latte');
    expect(s.regulars).toEqual({
      beryl: { visits: 2, affinity: 2 },
      jiwoo: { visits: 0, affinity: -1 },
    });
    expect(JSON.parse(disk.data.get(SAVE_KEY) ?? '{}')).toMatchObject({ shift: 2, cents: 450 });
  });

  it("visits add up beside affinity and a regular's last order is kept", () => {
    const store = createSaveStore(new CountingStorage(), { seed: 9 });
    const lastOrder = { type: 'longBlack' as const, milk: null, extraHot: false, heart: false };
    store.save(onShift(1, { regulars: { dazza: { visits: 3, affinity: 2, lastOrder } } }));
    const s = finishShift(store, report('good'), { dazza: 1 }, { dazza: 2, mei: 1 });
    expect(s.regulars).toEqual({
      dazza: { visits: 5, affinity: 3, lastOrder },
      mei: { visits: 1, affinity: 0 },
    });
  });

  it('a disaster keeps the receipt and tips but plays the same shift again', () => {
    const store = createSaveStore(new CountingStorage(), { seed: 9 });
    store.save(onShift(1));
    const s = finishShift(store, report('disaster'));
    expect(s.shift).toBe(1);
    expect(s.reports).toHaveLength(1);
    expect(s.cents).toBe(450);
    expect(canPlay(s, 1)).toBe(true);
  });

  it('the last shift of the week starts the next week', () => {
    const store = createSaveStore(new CountingStorage(), { seed: 9 });
    store.save(onShift(4));
    const s = finishShift(store, report('okay'));
    expect([s.week, s.shift]).toEqual([2, 0]);
  });
});
