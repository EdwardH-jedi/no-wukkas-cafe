import { describe, expect, it } from 'vitest';
import { type KeyValueStorage } from '../../../src/core/save/storage';
import { createTelemetryStore, TELEMETRY_KEY } from '../../../src/core/save/telemetry';
import {
  shiftTelemetry,
  TELEMETRY_CAP,
  TELEMETRY_VERSION,
  type RecordMeta,
  type ShiftTelemetry,
} from '../../../src/sim/telemetry';

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

function rec(id: string, ending: RecordMeta['ending'] = 'finished'): ShiftTelemetry {
  return shiftTelemetry(
    {
      seed: 3,
      difficulty: 'normal',
      week: null,
      phase: 'summary',
      serviceTime: 300,
      barista: { phase: 'idle' },
      customers: [],
      records: [],
      listening: [],
      summary: null,
      shiftEvents: { log: { fired: [] } },
    },
    {
      id,
      session: '2026-10-17T00:00:00.000Z',
      startedAt: '2026-10-17T00:00:10.000Z',
      endedAt: '2026-10-17T00:05:10.000Z',
      ending,
    },
  );
}

describe('telemetry store', () => {
  it('writes its own key, versioned, and reads it back', () => {
    const s = new FakeStorage();
    const store = createTelemetryStore(s);
    expect(store.read()).toEqual({ version: TELEMETRY_VERSION, records: [] });
    store.put(rec('a'));
    store.put(rec('b'));
    expect([...s.data.keys()]).toEqual([TELEMETRY_KEY]);
    expect(JSON.parse(s.data.get(TELEMETRY_KEY) as string).version).toBe(1);
    // A fresh store (the next page load) sees the same log.
    expect(
      createTelemetryStore(s)
        .read()
        .records.map((r) => r.id),
    ).toEqual(['a', 'b']);
  });

  it('corrupt JSON or another version reads as an empty log, and the next record starts it over', () => {
    const s = new FakeStorage();
    s.data.set(TELEMETRY_KEY, '{"version":1,"records":[');
    const store = createTelemetryStore(s);
    expect(store.read().records).toEqual([]);
    store.put(rec('a'));
    expect(store.read().records.map((r) => r.id)).toEqual(['a']);
    s.data.set(TELEMETRY_KEY, JSON.stringify({ version: 99, records: [rec('x')] }));
    expect(store.read().records).toEqual([]);
  });

  it('replaces a provisional "closed" record when the same shift closes later', () => {
    const store = createTelemetryStore(new FakeStorage());
    store.put(rec('a', 'closed'));
    store.put(rec('a', 'finished'));
    expect(store.read().records.map((r) => [r.id, r.ending])).toEqual([['a', 'finished']]);
  });

  it(`keeps only the last ${TELEMETRY_CAP} records`, () => {
    const s = new FakeStorage();
    const store = createTelemetryStore(s);
    for (let i = 0; i < TELEMETRY_CAP + 3; i++) store.put(rec(`r${i}`));
    const ids = store.read().records.map((r) => r.id);
    expect(ids).toHaveLength(TELEMETRY_CAP);
    expect(ids[0]).toBe('r3');
  });

  it('Clear empties it', () => {
    const s = new FakeStorage();
    const store = createTelemetryStore(s);
    store.put(rec('a'));
    store.clear();
    expect(store.read().records).toEqual([]);
    expect(createTelemetryStore(s).read().records).toEqual([]);
  });

  it('keeps the records it read when a later read throws (acceptance F2)', () => {
    const s = new FakeStorage();
    const first = createTelemetryStore(s);
    for (const id of ['a', 'b', 'c', 'd', 'e']) first.put(rec(id));
    const store = createTelemetryStore(s);
    expect(store.read().records).toHaveLength(5);
    s.failGet = true;
    store.put(rec('f'));
    expect(store.memoryOnly).toBe(true);
    expect(store.read().records.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('blocked or full storage falls back to memory for the session (never throws)', () => {
    const full = new FakeStorage();
    full.failSet = true;
    const a = createTelemetryStore(full);
    expect(() => a.put(rec('a'))).not.toThrow();
    expect(a.memoryOnly).toBe(true);
    expect(a.read().records.map((r) => r.id)).toEqual(['a']);

    const blocked = new FakeStorage();
    blocked.failGet = true;
    const b = createTelemetryStore(blocked);
    expect(b.read().records).toEqual([]);
    expect(b.memoryOnly).toBe(true);
    b.put(rec('b'));
    expect(b.read().records.map((r) => r.id)).toEqual(['b']);

    const none = createTelemetryStore(null);
    none.put(rec('c'));
    expect(none.memoryOnly).toBe(true);
    expect(none.read().records.map((r) => r.id)).toEqual(['c']);
  });
});
