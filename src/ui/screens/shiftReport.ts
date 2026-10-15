// The end-of-shift receipt: one report for Day 2, a week shift and Endless Rush. Orders, walk-outs,
// tips, the listening rows ("Listen again" with the missed words marked), what came up during a
// week shift, Gaz's last word, and what to do next.

import type { Rush } from '../../core/rush';
import { passFail, shiftDef } from '../../core/week/progress';
import { cueSpans, summariseListening, wrongFields } from '../../sim/listening';
import { accuracyByField } from '../../sim/listening/stats';
import { formatCents, orderLabel, type ShiftSummary } from '../../sim/rush';
import { marked } from '../pos';
import { esc } from '../screens';

export interface ShiftReportCallbacks {
  /** Day 2 and Endless: run it again. */
  again(): void;
  /** Week mode: the next shift (a pass) or the same one again (a fail). */
  next(): void;
  title(): void;
  /** The save only lasts until the page closes (storage blocked or full). */
  memoryOnly(): boolean;
}

const DIFF_NAME = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const;

const FIELD_HEARD = { drink: 'Drink', milk: 'Milk', temp: 'Temp', heart: 'Heart' } as const;

/** Receipt rows for the listening side of the shift. */
function listenRows(r: Rush): string {
  const l = summariseListening(r.listening);
  const acc = accuracyByField(r.listening);
  const fields = (Object.keys(FIELD_HEARD) as Array<keyof typeof FIELD_HEARD>)
    .filter((f) => acc[f].total > 0)
    .map((f) => `${FIELD_HEARD[f]} ${acc[f].correct}/${acc[f].total}`)
    .join(' · ');
  return `<div class="kv"><span>Orders heard right (${DIFF_NAME[r.difficulty]})</span><b>${l.heardRight}/${l.orders}</b></div>
    ${fields ? `<div class="kv"><span>Heard right by part</span><b>${fields}</b></div>` : ''}
    <div class="kv"><span>Replays · repeats · questions</span><b>${l.replays} · ${l.repeats} · ${l.questions}</b></div>`;
}

/** Receipt rows for what came up during a week shift (none on Day 2). */
function eventRows(r: Rush): string {
  const s = r.shiftEvents;
  if (!r.week || s.log.fired.length === 0) return '';
  const kv = (k: string, v: string): string => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  return [
    kv('Things that came up', String(s.log.fired.length)),
    s.difficultHandled > 0 ? kv('Tricky customers handled', String(s.difficultHandled)) : '',
    s.refused > 0 ? kv('Shown the door', String(s.refused)) : '',
    s.wasteCents > 0 ? kv('Wasted on fixes', formatCents(s.wasteCents)) : '',
    s.reputation !== 0
      ? kv('Reputation', s.reputation > 0 ? `+${s.reputation}` : String(s.reputation))
      : '',
  ].join('');
}

/** What was actually said, for every ticket rung up wrong, with the missed words marked. */
function misheardList(r: Rush): string {
  const items = r.listening
    .filter((x) => x.wrong.length > 0)
    .map((x) => {
      const c = r.customers.find((k) => k.line.id === x.lineId);
      if (!c || !x.heard) return '';
      const wrong = wrongFields(x.heard, x.truth);
      return `<li><b>${esc(c.def.callName)}</b> said “${marked(c.line.text, cueSpans(c.line), wrong)}”<br><small>You rang up ${esc(orderLabel(x.heard))} · they wanted ${esc(orderLabel(x.truth))}</small></li>`;
    })
    .join('');
  return items
    ? `<div class="misheard"><div class="mh">Listen again</div><ul>${items}</ul></div>`
    : '';
}

const GRADE_TEXT: Record<ShiftSummary['grade'], string> = {
  excellent: 'Cracker of a shift',
  good: 'Solid first shift',
  okay: 'Survived it',
  poor: 'Rough morning',
  disaster: 'Total disaster',
};

/** Draw the report for shift `r` (its summary `s`) into `el`; `quote` is Gaz's closing line. */
export function renderShiftReport(
  el: HTMLElement,
  r: Rush,
  s: ShiftSummary,
  quote: string,
  cb: ShiftReportCallbacks,
): void {
  const w = r.week;
  const head = !w
    ? 'DAY 2 · MORNING RUSH · SHIFT REPORT'
    : w.endless
      ? 'ENDLESS RUSH · REPORT'
      : `WEEK ${w.week ?? 1} · ${shiftDef(w.shiftIndex).day.toUpperCase()} · SHIFT REPORT`;
  const band =
    s.grade === 'excellent' || s.grade === 'good'
      ? 'hired'
      : s.grade === 'okay'
        ? 'almost'
        : s.grade === 'poor'
          ? 'failed'
          : 'disaster';
  // Endless always ends at the third walk-out, so its stamp is the count, not a grade.
  const stamp = w?.endless
    ? `<div class="stamp hired">Served ${s.ordersCompleted}</div>`
    : `<div class="stamp ${band}">${esc(GRADE_TEXT[s.grade])}</div>`;
  // A week shift moves on after a pass and is played again after a disaster; a passed
  // shift isn't replayed (Edward, 2026-10-15).
  const [act, label] = !w
    ? ['again', 'Run the rush again']
    : w.endless
      ? ['again', 'Go again']
      : passFail(s) === 'pass'
        ? ['next', 'Next shift']
        : ['next', 'Try this shift again'];
  const note =
    w && !w.endless && cb.memoryOnly()
      ? `<p class="saveNote">Progress won't be saved in this browser.</p>`
      : '';
  el.innerHTML = `<div class="verdictCard"><div class="paper">
    <div class="hd"><b>NO WUKKAS</b><span>${esc(head)}</span></div>
    ${stamp}
    <div class="rows">
      <div class="kv"><span>Orders completed</span><b>${s.ordersCompleted}/${s.customers}</b></div>
      <div class="kv"><span>Correct orders</span><b>${s.correctOrders}/${s.customers}</b></div>
      <div class="kv"><span>Walk-outs</span><b>${s.walkouts}</b></div>
      <div class="kv"><span>Average serve time</span><b>${s.ordersCompleted ? `${s.avgServeSeconds.toFixed(0)} s` : '–'}</b></div>
      <div class="kv"><span>Customer satisfaction</span><b>${s.satisfaction}%</b></div>
      <div class="kv"><span>Tips</span><b>${formatCents(s.tipsCents)}</b></div>
      <div class="kv"><span>Drinks wasted</span><b>${s.wasted}</b></div>
      ${listenRows(r)}
      ${eventRows(r)}
    </div>
    ${misheardList(r)}
    ${quote ? `<div class="quote">“${esc(quote)}”<br><small>— Gaz, owner</small></div>` : ''}
    ${note}
    <div class="cardBtns"><button class="btn" data-s="${act}">${label}</button><button class="btn ghost" data-s="title">Title screen</button></div>
  </div></div>`;
  el.querySelectorAll<HTMLButtonElement>('button[data-s]').forEach((b) => {
    const s = b.dataset.s;
    b.onclick = () => (s === 'again' ? cb.again() : s === 'next' ? cb.next() : cb.title());
  });
  (el.querySelector('button') as HTMLButtonElement).focus({ preventScroll: true });
}
