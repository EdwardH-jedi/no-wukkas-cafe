// The Scores screen: the local leaderboard (sim/scores.ts, stored by core/save/scores.ts). Each
// week shift's best per difficulty played, Day 2's best, and the Endless Rush top ten, all on this
// device only. Opened from the title; "Clear scores" asks twice, as "Clear log" does.

import { WEEK } from '../../data/week';
import type { Difficulty } from '../../sim/listening';
import { formatCents } from '../../sim/rush';
import { boardKey, type ScoreEntry, type Scores } from '../../sim/scores';
import { esc } from '../screens';
import { focusQuietly, menuKeys } from './keys';
import { GRADE_NAME } from './labels';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const DIFF_NAME: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

const shiftText = (e: ScoreEntry): string =>
  `${GRADE_NAME[e.grade]} · ${e.served} served · ${formatCents(e.tipsCents)}`;
const row = (name: string, value: string): string =>
  `<div class="sc-row"><b>${esc(name)}</b><span>${esc(value)}</span></div>`;

/** The screen's body for these scores (no buttons). */
export function scoresHtml(s: Scores): string {
  const top = (key: string): ScoreEntry[] => s.boards[key] ?? [];
  const parts: string[] = [];
  for (const d of DIFFICULTIES) {
    const days = WEEK.map(
      (w) => top(boardKey({ mode: 'week', shiftIndex: w.index, difficulty: d }))[0],
    );
    if (days.every((x) => !x)) continue;
    parts.push(
      `<section class="sc-board"><h3>${esc(`The week · ${DIFF_NAME[d]}`)}</h3>${WEEK.map((w, i) =>
        row(w.day, days[i] ? shiftText(days[i]) : 'Not played yet'),
      ).join('')}</section>`,
    );
  }
  const day2 = DIFFICULTIES.map(
    (d) => [d, top(boardKey({ mode: 'day2', shiftIndex: null, difficulty: d }))[0]] as const,
  )
    .filter(([, e]) => e)
    .map(([d, e]) => row(`Day 2 · ${DIFF_NAME[d]}`, shiftText(e!)));
  if (day2.length > 0)
    parts.push(`<section class="sc-board"><h3>Day 2</h3>${day2.join('')}</section>`);
  for (const d of DIFFICULTIES) {
    const list = top(boardKey({ mode: 'endless', shiftIndex: null, difficulty: d }));
    if (list.length === 0) continue;
    parts.push(
      `<section class="sc-board"><h3>${esc(`Endless Rush · ${DIFF_NAME[d]}`)}</h3><ol class="sc-top">${list
        .map((e) => `<li>${esc(`${e.served} served · ${formatCents(e.tipsCents)}`)}</li>`)
        .join('')}</ol></section>`,
    );
  }
  return parts.length > 0
    ? parts.join('')
    : '<p class="sc-empty">No scores yet. Finish a shift and it lands here.</p>';
}

export interface ScoresActions {
  /** Forget every score. */
  clear(): void;
  back(): void;
}

/** Shows the screen in `root` with the scores `read()` returns; returns a function that removes
 *  it. */
export function renderScores(root: HTMLElement, read: () => Scores, on: ScoresActions): () => void {
  const el = document.createElement('section');
  el.className = 'scores-screen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Scores');
  el.innerHTML = `<div class="sc-card">
    <header><h2>Scores</h2><p>Your best shifts and Endless runs, on this device only.</p></header>
    <div class="sc-body"></div>
    <div class="sc-btns">
      <button type="button" class="sc-clear">Clear scores</button>
      <button type="button" class="shift-select-back sc-back">Back</button>
    </div>
  </div>`;
  const body = el.querySelector('.sc-body') as HTMLElement;
  const clear = el.querySelector('.sc-clear') as HTMLButtonElement;
  const draw = (): void => {
    body.innerHTML = scoresHtml(read());
  };
  // Clear asks twice: the first press only arms it.
  let armed = false;
  clear.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      clear.textContent = 'Press again to clear';
      return;
    }
    armed = false;
    on.clear();
    clear.textContent = 'Clear scores';
    draw();
  });
  (el.querySelector('.sc-back') as HTMLButtonElement).addEventListener('click', () => on.back());
  draw();
  menuKeys(el, { modal: true, escape: () => on.back() });
  root.append(el);
  focusQuietly(el.querySelector('.sc-back'));
  return () => el.remove();
}
