// The leaderboard line on the shift report (todo.md M4 T4.3): "New best!" when the shift beat a
// best that was there, otherwise the board's best (grade and served; Endless by served and tips).

import { describe, expect, it } from 'vitest';
import type { ScoreEntry } from '../../src/sim/scores';
import { bestLine } from '../../src/ui/screens/shiftReport';

const best = (o: Partial<ScoreEntry> = {}): ScoreEntry => ({
  mode: 'week',
  week: 1,
  shiftIndex: 0,
  seed: 1,
  difficulty: 'normal',
  grade: 'good',
  served: 6,
  walkouts: 0,
  tipsCents: 830,
  at: '2026-10-19T01:00:00.000Z',
  ...o,
});

describe('bestLine', () => {
  it('says "New best!" for a shift that beat the board', () => {
    expect(bestLine({ newBest: true, best: best() })).toBe('New best!');
  });

  it('otherwise the best so far: grade and served for a shift, served and tips for Endless', () => {
    expect(bestLine({ newBest: false, best: best() })).toBe('Best so far: Good, 6 served');
    expect(bestLine({ newBest: false, best: best({ served: 1, grade: 'disaster' }) })).toBe(
      'Best so far: Disaster, 1 served',
    );
    expect(
      bestLine({
        newBest: false,
        best: best({ mode: 'endless', week: null, shiftIndex: null, served: 14, tipsCents: 2150 }),
      }),
    ).toBe('Best so far: 14 served, $21.50 in tips');
  });

  it('no note (nothing recorded), no line', () => {
    expect(bestLine(null)).toBeNull();
  });
});
