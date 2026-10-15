import { describe, expect, it } from 'vitest';
import {
  browserStorage,
  createSaveStore,
  recordShift,
  SAVE_KEY,
  type KeyValueStorage,
} from '../../../src/core/save/storage';
import { newSave, type SaveV2 } from '../../../src/sim/contracts/save';
import type { ShiftSummary } from '../../../src/sim/rush';

class FakeStorage implements KeyValueStorage {
  data = new Map<string, string>();
  failGet = false;
  failSet = false;
  getItem(k: string): string | null {
    if (this.failGet) throw new Error('SecurityError');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failSet) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
}

const D = { seed: 7, createdAt: '2026-10-15T00:00:00.000Z' };
const report: ShiftSummary = {
  customers: 6,
  ordersCompleted: 6,
  correctOrders: 6,
  walkouts: 0,
  avgServeSeconds: 38.5,
  satisfaction: 82,
  tipsCents: 640,
  wasted: 0,
  grade: 'excellent',
};

describe('save storage', () => {
  it('starts fresh when nothing is stored', () => {
    const st = createSaveStore(new FakeStorage(), D);
    expect(st.load()).toEqual(newSave(D));
    expect(st.memoryOnly).toBe(false);
  });

  it('round-trips a save through storage as JSON', () => {
    const fs = new FakeStorage();
    const st = createSaveStore(fs, D);
    const s: SaveV2 = { ...newSave(D), shift: 2, cents: 990, upgrades: ['grinder'] };
    st.save(s);
    expect(JSON.parse(fs.data.get(SAVE_KEY) ?? 'null')).toEqual(s);
    expect(st.load()).toEqual(s);
    expect(createSaveStore(fs, D).load()).toEqual(s);
  });

  it('reads old, empty or corrupt data through migrate, never throwing', () => {
    for (const raw of ['', '{', 'null', '[]', JSON.stringify({ version: 1, difficulty: 'hard' })]) {
      const fs = new FakeStorage();
      fs.data.set(SAVE_KEY, raw);
      expect(createSaveStore(fs, D).load().version).toBe(2);
    }
    const fs = new FakeStorage();
    fs.data.set(SAVE_KEY, JSON.stringify({ version: 1, difficulty: 'hard' }));
    expect(createSaveStore(fs, D).load().difficulty).toBe('hard');
  });

  it('falls back to memory when storage is blocked', () => {
    const fs = new FakeStorage();
    fs.failGet = true;
    fs.failSet = true;
    const st = createSaveStore(fs, D);
    expect(st.load()).toEqual(newSave(D));
    expect(st.memoryOnly).toBe(true);
    const s = { ...newSave(D), shift: 3 };
    st.save(s);
    expect(st.load()).toEqual(s);
  });

  it('keeps the latest save in memory when storage is full', () => {
    const fs = new FakeStorage();
    const st = createSaveStore(fs, D);
    st.save({ ...newSave(D), shift: 1 });
    fs.failSet = true;
    st.save({ ...newSave(D), shift: 2 });
    expect(st.memoryOnly).toBe(true);
    expect(st.load().shift).toBe(2);
  });

  it('works with no storage at all', () => {
    const st = createSaveStore(null, D);
    st.save({ ...newSave(D), cents: 5 });
    expect(st.load().cents).toBe(5);
    expect(st.memoryOnly).toBe(true);
  });

  it('autosaves after each shift report', () => {
    const fs = new FakeStorage();
    const st = createSaveStore(fs, D);
    const after = recordShift(st, report);
    expect(after.shift).toBe(1);
    expect(after.cents).toBe(640);
    expect(after.reports).toEqual([{ week: 1, shift: 0, summary: report }]);
    expect(createSaveStore(fs, D).load()).toEqual(after);
  });

  it('finding browser storage never throws', () => {
    expect(() => browserStorage()).not.toThrow();
  });
});
