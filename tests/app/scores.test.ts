// A finished shift goes on its leaderboard board before the report draws (todo.md M4 T4.3): one
// entry per shift, a worse run never moves the best, a better one is a new best, and Day 2, a week
// shift and Endless keep apart boards. Headless shifts from the bot; a memory store.

import { describe, expect, it } from 'vitest';
import { recordScore } from '../../src/app/scores';
import { createRush } from '../../src/core/rush';
import { createScoresStore } from '../../src/core/save/scores';
import { boardKey } from '../../src/sim/scores';
import { playRush } from '../helpers/rushBot';

const AT = '2026-10-19T01:00:00.000Z';
const MONDAY = {
  shiftIndex: 0,
  unlockedDrinks: ['flatWhite' as const, 'longBlack' as const],
  affinity: {},
};

describe('recordScore', () => {
  it('writes one entry per finished shift; the first is the best but not a "new best"', () => {
    const store = createScoresStore(null);
    const { r } = playRush({ seed: 3 });
    const note = recordScore(store, r, AT);
    expect(note).toMatchObject({
      newBest: false,
      best: { mode: 'day2', served: r.summary!.ordersCompleted, at: AT },
    });
    expect(Object.values(store.read().boards).flat()).toHaveLength(1);
  });

  it('a worse run leaves the best alone; a better one is a new best', () => {
    const store = createScoresStore(null);
    const good = playRush({ seed: 3 }).r;
    const idle = playRush({ seed: 3, idle: true }).r;
    recordScore(store, good, AT);
    const worse = recordScore(store, idle, AT)!;
    expect(worse.newBest).toBe(false);
    expect(worse.best.served).toBe(good.summary!.ordersCompleted);
    const fresh = createScoresStore(null);
    recordScore(fresh, idle, AT);
    expect(recordScore(fresh, good, AT)!.newBest).toBe(true);
  });

  it('a week shift and Endless go on their own boards; no report, no entry', () => {
    const store = createScoresStore(null);
    const monday = playRush({ seed: 3, week: { ...MONDAY, week: 2 } }).r;
    const note = recordScore(store, monday, AT)!;
    expect(note.best).toMatchObject({ mode: 'week', week: 2, shiftIndex: 0 });
    expect(Object.keys(store.read().boards)).toEqual([boardKey(note.best)]);
    expect(recordScore(store, createRush(3), AT)).toBeNull();
    expect(Object.values(store.read().boards).flat()).toHaveLength(1);
  });
});
