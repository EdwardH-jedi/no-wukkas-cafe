// The Scores screen (todo.md M4 T4.4), drawn from the stored scores: each week shift's best per
// difficulty (or not played yet), Day 2's best, and the Endless Rush top ten with served and tips
// in dollars. Pure markup: the dialog itself is checked in the week UI e2e.

import { describe, expect, it } from 'vitest';
import { emptyScores, insert, type ScoreEntry, type Scores } from '../../src/sim/scores';
import { scoresHtml } from '../../src/ui/screens/scores';

const AT = '2026-10-19T01:00:00.000Z';
const entry = (o: Partial<ScoreEntry>): ScoreEntry => ({
  mode: 'week',
  week: 1,
  shiftIndex: 0,
  seed: 1,
  difficulty: 'normal',
  grade: 'good',
  served: 6,
  walkouts: 0,
  tipsCents: 830,
  at: AT,
  ...o,
});
const fill = (es: ScoreEntry[]): Scores => es.reduce((s, e) => insert(s, e).scores, emptyScores());

describe('scoresHtml', () => {
  it('nothing yet says so', () => {
    expect(scoresHtml(emptyScores())).toContain('No scores yet');
  });

  it("lists each week shift's best for a difficulty played, and the shifts not played", () => {
    const html = scoresHtml(
      fill([
        entry({}),
        entry({ grade: 'excellent', served: 7, tipsCents: 1205 }),
        entry({ shiftIndex: 2, grade: 'okay', served: 5, tipsCents: 40 }),
      ]),
    );
    expect(html).toContain('The week · Normal');
    expect(html).toMatch(/Monday<\/b><span>Excellent · 7 served · \$12\.05<\/span>/);
    expect(html).toMatch(/Tuesday<\/b><span>Not played yet<\/span>/);
    expect(html).toMatch(/Wednesday<\/b><span>Okay · 5 served · \$0\.40<\/span>/);
    expect(html).not.toContain('The week · Hard');
  });

  it("Day 2's best, and Endless as a ranked top ten of served and tips", () => {
    const endless = (served: number, tipsCents: number): ScoreEntry =>
      entry({ mode: 'endless', week: null, shiftIndex: null, grade: 'poor', served, tipsCents });
    const html = scoresHtml(
      fill([
        entry({ mode: 'day2', week: null, shiftIndex: null, difficulty: 'easy' }),
        endless(9, 500),
        endless(14, 2150),
        endless(9, 900),
      ]),
    );
    expect(html).toMatch(/Day 2 · Easy<\/b><span>Good · 6 served · \$8\.30<\/span>/);
    const ranks = [...html.matchAll(/<li>(\d+ served · \$[\d.]+)<\/li>/g)].map((m) => m[1]);
    expect(ranks).toEqual(['14 served · $21.50', '9 served · $9.00', '9 served · $5.00']);
  });
});
