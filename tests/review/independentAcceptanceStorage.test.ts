// Acceptance regressions: a successful disk read must survive a later storage exception.
import { describe, expect, it } from 'vitest';
import { createSaveStore, SAVE_KEY, type KeyValueStorage } from '../../src/core/save/storage';
import { createTelemetryStore, TELEMETRY_KEY } from '../../src/core/save/telemetry';
import { finishShift } from '../../src/core/week/session';
import { newSave } from '../../src/sim/contracts/save';
import type { ShiftSummary } from '../../src/sim/rush';
import { parseLog, type TelemetryRecord } from '../../src/sim/telemetry';
import sample from '../fixtures/telemetry/sample.json';

class Storage implements KeyValueStorage {
  data = new Map<string, string>();
  failRead = false;
  getItem(k: string): string | null {
    if (this.failRead) throw new Error('SecurityError');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}
const report: ShiftSummary = {
  customers: 6,
  ordersCompleted: 6,
  correctOrders: 6,
  walkouts: 0,
  avgServeSeconds: 30,
  satisfaction: 90,
  tipsCents: 500,
  wasted: 0,
  grade: 'good',
};

describe('independent acceptance: last good storage reads', () => {
  it('preserves an advanced save and autosaves the next shift in the same session after getItem fails', () => {
    const disk = new Storage();
    const previous = {
      ...newSave({ seed: 42 }),
      week: 3,
      shift: 2,
      cents: 12500,
      regulars: { dazza: { visits: 8, affinity: 6 } },
      upgrades: ['grinder' as const],
    };
    disk.setItem(SAVE_KEY, JSON.stringify(previous));
    const store = createSaveStore(disk);
    const loaded = store.load();
    expect(loaded).toMatchObject(previous);
    disk.failRead = true;
    expect
      .soft(store.load(), 'last successful disk load must seed memory fallback')
      .toEqual(loaded);
    const next = finishShift(store, report, { dazza: 1 }, { dazza: 1 });
    expect.soft(next).toMatchObject({
      week: 3,
      shift: 3,
      cents: 13000,
      upgrades: ['grinder'],
      regulars: { dazza: { visits: 9, affinity: 7 } },
    });
    expect(store.memoryOnly).toBe(true);
    expect(JSON.parse(disk.data.get(SAVE_KEY)!)).toEqual(previous);
  });

  it('preserves previously exported records when a later read fails before the next log write', () => {
    const disk = new Storage();
    disk.setItem(TELEMETRY_KEY, JSON.stringify(sample));
    const store = createTelemetryStore(disk);
    const loaded = store.read();
    expect(loaded.records.length).toBeGreaterThan(0);
    disk.failRead = true;
    expect.soft(store.read()).toEqual(loaded);
    const next = { ...loaded.records[0]!, id: 'independent-new-session-record' } as TelemetryRecord;
    store.put(next);
    expect(store.read().records.map((r) => r.id)).toEqual([
      ...loaded.records.map((r) => r.id),
      next.id,
    ]);
    expect(parseLog(disk.data.get(TELEMETRY_KEY))).toEqual(loaded);
  });
});
