// Local leaderboard (todo.md M4 T4.1): pure ranking of finished shifts per board. Week shifts and
// Day 2 rank by grade, then served, then tips, then fewer walk-outs; Endless by served, then tips.
// Ties keep the earlier entry; ten per board; a stored copy that is corrupt or another version
// reads as empty.

import { describe, expect, it } from 'vitest';
import type { ShiftSummary } from '../../src/sim/rush';
import {
  bestOf,
  boardKey,
  emptyScores,
  fromSummary,
  insert,
  isNewBest,
  parseScores,
  SCORES_CAP,
  SCORES_VERSION,
  type ScoreEntry,
  type Scores,
} from '../../src/sim/scores';

const AT = '2026-10-19T01:00:00.000Z';
const week = (o: Partial<ScoreEntry> = {}): ScoreEntry => ({
  mode: 'week',
  week: 1,
  shiftIndex: 0,
  seed: 1,
  difficulty: 'normal',
  grade: 'good',
  served: 5,
  walkouts: 1,
  tipsCents: 500,
  at: AT,
  ...o,
});
const endless = (o: Partial<ScoreEntry> = {}): ScoreEntry =>
  week({ mode: 'endless', week: null, shiftIndex: null, grade: 'poor', ...o });
const board = (s: Scores, e: ScoreEntry): ScoreEntry[] => s.boards[boardKey(e)] ?? [];
const fill = (entries: ScoreEntry[]): Scores =>
  entries.reduce((s, e) => insert(s, e).scores, emptyScores());

describe('boardKey', () => {
  it('one board per week shift and difficulty, one per Endless and Day 2 difficulty', () => {
    expect(boardKey(week())).toBe('week:0:normal');
    expect(boardKey(week({ shiftIndex: 4, difficulty: 'hard' }))).toBe('week:4:hard');
    expect(boardKey(week({ week: 2 }))).toBe(boardKey(week()));
    expect(boardKey(endless())).toBe('endless:normal');
    expect(boardKey(week({ mode: 'day2', week: null, shiftIndex: null }))).toBe('day2:normal');
  });
});

describe('insert', () => {
  it('a week shift ranks by grade, then served, then tips, then fewer walk-outs', () => {
    const s = fill([
      week({ seed: 1, grade: 'good', served: 6 }),
      week({ seed: 2, grade: 'excellent', served: 4 }),
      week({ seed: 3, grade: 'good', served: 6, tipsCents: 900 }),
      week({ seed: 4, grade: 'good', served: 6, tipsCents: 900, walkouts: 0 }),
      week({ seed: 5, grade: 'disaster', served: 9 }),
    ]);
    expect(board(s, week()).map((e) => e.seed)).toEqual([2, 4, 3, 1, 5]);
  });

  it('Endless ranks by served, then tips; the grade does not count', () => {
    const s = fill([
      endless({ seed: 1, served: 8, grade: 'good' }),
      endless({ seed: 2, served: 12, grade: 'disaster' }),
      endless({ seed: 3, served: 8, tipsCents: 2000 }),
    ]);
    expect(board(s, endless()).map((e) => e.seed)).toEqual([2, 3, 1]);
  });

  it('a tie keeps the earlier entry first', () => {
    const s = fill([week({ seed: 1 }), week({ seed: 2 })]);
    expect(board(s, week()).map((e) => e.seed)).toEqual([1, 2]);
    expect(insert(s, week({ seed: 3 })).rank).toBe(2);
  });

  it(`keeps the best ${SCORES_CAP}; one that doesn't make it has no rank`, () => {
    const s = fill(Array.from({ length: SCORES_CAP }, (_, i) => week({ seed: i, served: 20 - i })));
    const out = insert(s, week({ seed: 99, served: 1 }));
    expect(out.rank).toBeNull();
    expect(board(out.scores, week())).toHaveLength(SCORES_CAP);
    const top = insert(s, week({ seed: 98, served: 30 }));
    expect(top.rank).toBe(0);
    expect(board(top.scores, week()).map((e) => e.seed)).toEqual([98, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('boards are apart, and the input is never changed', () => {
    const s = fill([week(), endless(), week({ shiftIndex: 1 })]);
    const copy = JSON.stringify(s);
    insert(s, week({ served: 50 }));
    expect(JSON.stringify(s)).toBe(copy);
    expect(Object.keys(s.boards).sort()).toEqual([
      'endless:normal',
      'week:0:normal',
      'week:1:normal',
    ]);
  });
});

describe('isNewBest / bestOf', () => {
  it('only when it beats a best that already exists', () => {
    const empty = emptyScores();
    expect(bestOf(empty, week())).toBeNull();
    expect(isNewBest(empty, week())).toBe(false);
    const s = fill([week({ grade: 'good', served: 5 })]);
    expect(bestOf(s, week())?.served).toBe(5);
    expect(isNewBest(s, week({ grade: 'good', served: 6 }))).toBe(true);
    expect(isNewBest(s, week({ grade: 'good', served: 5 }))).toBe(false);
    expect(isNewBest(s, week({ grade: 'okay', served: 9 }))).toBe(false);
    expect(isNewBest(s, endless({ served: 1 }))).toBe(false);
  });
});

describe('fromSummary', () => {
  it('takes served, walk-outs, tips and the grade from the report', () => {
    const summary: ShiftSummary = {
      customers: 7,
      ordersCompleted: 6,
      correctOrders: 5,
      walkouts: 1,
      avgServeSeconds: 40,
      satisfaction: 70,
      tipsCents: 830,
      wasted: 0,
      grade: 'good',
    };
    expect(
      fromSummary(summary, {
        mode: 'week',
        week: 2,
        shiftIndex: 3,
        seed: 42,
        difficulty: 'hard',
        at: AT,
      }),
    ).toEqual({
      mode: 'week',
      week: 2,
      shiftIndex: 3,
      seed: 42,
      difficulty: 'hard',
      grade: 'good',
      served: 6,
      walkouts: 1,
      tipsCents: 830,
      at: AT,
    });
  });
});

describe('parseScores', () => {
  it('round-trips, and reads anything corrupt or of another version as empty', () => {
    const s = fill([week(), endless()]);
    expect(parseScores(JSON.stringify(s))).toEqual(s);
    expect(parseScores(null)).toEqual(emptyScores());
    expect(parseScores('{nope')).toEqual(emptyScores());
    expect(parseScores(JSON.stringify({ ...s, version: SCORES_VERSION + 1 }))).toEqual(
      emptyScores(),
    );
  });

  it('drops entries that are not scores, keeping the rest of the board', () => {
    const raw = JSON.stringify({
      version: SCORES_VERSION,
      boards: { 'week:0:normal': [week(), { served: 'lots' }, null], x: 'nope' },
    });
    expect(parseScores(raw)).toEqual({
      version: SCORES_VERSION,
      boards: { 'week:0:normal': [week()] },
    });
  });
});
