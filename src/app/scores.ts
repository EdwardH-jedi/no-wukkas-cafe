// The leaderboard at the end of a shift (todo.md M4): every Day 2, week or Endless report goes on
// its board the moment the shift reaches its report, before the report draws, so the report can
// say "New best!" or what the best is. The time stamp is the wall clock (app layer); the ranking
// is sim/scores.ts and the copy on disk core/save/scores.ts.

import type { Rush } from '../core/rush';
import type { ScoresStore } from '../core/save/scores';
import { bestOf, fromSummary, isNewBest, type ScoreMode, type ScoreNote } from '../sim/scores';
import { focusQuietly } from '../ui/screens/keys';
import { renderScores } from '../ui/screens/scores';
import type { App } from './context';

/** Put a finished shift on its board. Null when the rush has no report yet. */
export function recordScore(store: ScoresStore, r: Rush, at: string): ScoreNote | null {
  if (!r.summary) return null;
  const w = r.week;
  const mode: ScoreMode = !w ? 'day2' : w.endless ? 'endless' : 'week';
  const entry = fromSummary(r.summary, {
    mode,
    week: mode === 'week' ? (w?.week ?? 1) : null,
    shiftIndex: mode === 'week' ? (w?.shiftIndex ?? 0) : null,
    seed: r.seed,
    difficulty: r.difficulty,
    at,
  });
  const newBest = isNewBest(store.read(), entry);
  store.put(entry);
  return { newBest, best: bestOf(store.read(), entry) ?? entry };
}

/** The Scores screen over the title; Back returns to the title's Scores button. */
export function openScores(app: App): void {
  const { sfx, uiRoot, scores } = app;
  sfx.unlock();
  sfx.play('click');
  if (uiRoot.querySelector('.scores-screen')) return;
  const close = renderScores(uiRoot, () => scores.read(), {
    clear: () => scores.clear(),
    back: () => {
      close();
      focusQuietly(app.hud1Root.querySelector('#title button[data-act="scores"]'));
    },
  });
}
