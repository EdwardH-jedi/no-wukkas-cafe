import { describe, expect, it } from 'vitest';
import { createScoresStore, SCORES_KEY } from '../../../src/core/save/scores';
import { type KeyValueStorage } from '../../../src/core/save/storage';
import { SCORES_CAP, SCORES_VERSION, boardKey, type ScoreEntry } from '../../../src/sim/scores';

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

function entry(served = 5, tipsCents = 500): ScoreEntry {
  return {
    mode: 'week',
    week: 1,
    shiftIndex: 0,
    seed: 1,
    difficulty: 'normal',
    grade: 'good',
    served,
    walkouts: 1,
    tipsCents,
    at: '2026-10-19T01:00:00.000Z',
  };
}

const count = (s: ReturnType<ReturnType<typeof createScoresStore>['read']>): number =>
  Object.values(s.boards).reduce((n, b) => n + b.length, 0);

describe('scores store', () => {
  it('writes its own key, versioned, and reads it back', () => {
    const s = new FakeStorage();
    const store = createScoresStore(s);
    expect(store.read().version).toBe(SCORES_VERSION);
    expect(count(store.read())).toBe(0);
    store.put(entry(5));
    store.put(entry(6));
    expect(SCORES_KEY).toBe('nwc.scores.v1');
    expect([...s.data.keys()]).toEqual([SCORES_KEY]);
    expect(JSON.parse(s.data.get(SCORES_KEY) as string).version).toBe(SCORES_VERSION);
    // A fresh store (the next page load) sees the same scores.
    expect(count(createScoresStore(s).read())).toBe(2);
    expect(createScoresStore(s).read().boards[boardKey(entry())]).toHaveLength(2);
  });

  it('corrupt JSON reads as empty scores, and the next put starts it over', () => {
    const s = new FakeStorage();
    s.data.set(SCORES_KEY, '{"version":1,"boards":{');
    const store = createScoresStore(s);
    expect(count(store.read())).toBe(0);
    store.put(entry());
    expect(count(store.read())).toBe(1);
  });

  it('put returns 0 for the first entry and null for one that misses the top ten', () => {
    const store = createScoresStore(new FakeStorage());
    expect(store.put(entry(20, 2000))).toBe(0);
    for (let i = 1; i < SCORES_CAP; i++) store.put(entry(20, 2000));
    expect(store.put(entry(1, 0))).toBeNull();
    expect(count(store.read())).toBe(SCORES_CAP);
  });

  it('Clear empties it', () => {
    const s = new FakeStorage();
    const store = createScoresStore(s);
    store.put(entry());
    store.clear();
    expect(count(store.read())).toBe(0);
    expect(count(createScoresStore(s).read())).toBe(0);
  });

  it('blocked or full storage falls back to memory for the session (never throws)', () => {
    const full = new FakeStorage();
    full.failSet = true;
    const a = createScoresStore(full);
    expect(() => a.put(entry())).not.toThrow();
    expect(a.memoryOnly).toBe(true);
    expect(count(a.read())).toBe(1);

    const blocked = new FakeStorage();
    blocked.failGet = true;
    const b = createScoresStore(blocked);
    expect(count(b.read())).toBe(0);
    expect(b.memoryOnly).toBe(true);
    b.put(entry());
    expect(count(b.read())).toBe(1);

    const none = createScoresStore(null);
    none.put(entry());
    expect(none.memoryOnly).toBe(true);
    expect(count(none.read())).toBe(1);
  });
});
