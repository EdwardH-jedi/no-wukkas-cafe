// The bigger panels: title, the result card between attempts, and the final verdict.

import { attemptsLeft, canFinish, type Trial, type TrialAction } from '../core/trial';
import { BAND_TEXT, FAULT_TEXT, INVALID_TEXT } from '../data/tips';
import { ATTEMPTS, POINTS, type AttemptResult } from '../sim/attempt';
import { drawPattern } from './pattern';

export const esc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

export function titleHtml(touch: boolean): string {
  const controls = touch
    ? `<b>Drag</b><span>move the jug / wand depth</span>
       <b>Press &amp; hold</b><span>grind, steam, pour</span>
       <b>▲ ▼</b><span>jug height while pouring</span>`
    : `<b>Mouse</b><span>move the jug · set steam depth</span>
       <b>Hold click / Space</b><span>grind · steam · pour</span>
       <b>Scroll · W / S</b><span>jug height while pouring</span>
       <b>Enter</b><span>confirm · next</span>
       <b>Esc</b><span>pause</span>`;
  return `<div class="titleCard">
    <div class="kicker">Crown St, Surry Hills · 6:40 am</div>
    <h1>No Wukkas Café</h1>
    <h2>Day 1: The Trial Shift</h2>
    <p>You want the barista job. Gaz, the owner, wants a flat white with a heart on top, and he's watching every move. Three goes. Don't stuff it up.</p>
    <div class="controls">${controls}</div>
    <div class="titleBtns">
      <button class="btn" data-act="start">Start the trial</button>
      <button class="btn ghost" data-act="voice" aria-pressed="true">Voice: on</button>
    </div>
  </div>`;
}

const pct = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 100);

function row(label: string, frac: number, value: string): string {
  return `<div class="r"><span>${label}</span><i><b style="width:${pct(frac)}%"></b></i><span>${value}</span></div>`;
}

export function renderCard(el: HTMLElement, t: Trial, onAction: (a: TrialAction) => void): void {
  const i = t.results.length - 1;
  const r = t.results[i] as AttemptResult | undefined;
  if (!r) return;
  const p = r.pattern;
  const left = attemptsLeft(t);
  const finish = canFinish(t);
  const faults = r.faults
    .filter((f) => i === 0 || !['shotShort', 'shotLong', 'doseLight', 'doseHeavy'].includes(f))
    .slice(0, 3);
  const tag = r.valid
    ? `<span class="bandTag ${r.band}">${BAND_TEXT[r.band].title}</span>`
    : `<span class="bandTag invalid">Doesn't count</span>`;
  el.innerHTML = `<div class="paper">
    <div class="hd"><b>NO WUKKAS</b><span>TRIAL · ATTEMPT ${i + 1} OF ${ATTEMPTS}</span></div>
    <div class="scoreRow">
      <canvas width="264" height="264" aria-label="Your pattern, turned round, with Gaz's heart outline"></canvas>
      <div>
        <div class="bigScore">${r.total}<small>/100</small></div>
        ${tag}
        ${r.valid ? '' : `<div style="margin-top:6px">${esc(INVALID_TEXT[r.invalid ?? 'nothingPoured'])}</div>`}
      </div>
    </div>
    <div class="rows">
      ${row('Heart', p.shape, `${pct(p.shape)}%`)}
      ${row('Symmetry', p.symmetry, `${pct(p.symmetry)}%`)}
      ${row('Centred', p.position, `${pct(p.position)}%`)}
      ${row('Crisp', p.definition, `${pct(p.definition)}%`)}
      ${row('Art', r.art / POINTS.art, `${Math.round(r.art)}/${POINTS.art}`)}
      ${row('Cup', r.cup / POINTS.cup, `${Math.round(r.cup)}/${POINTS.cup}`)}
      ${row('Milk', r.milk / POINTS.milk, `${Math.round(r.milk)}/${POINTS.milk}`)}
      ${row('Shot', r.espresso / POINTS.espresso, `${Math.round(r.espresso)}/${POINTS.espresso}`)}
    </div>
    ${
      faults.length
        ? `<div class="faults">${faults.map((f) => `<div class="f"><b>✗ ${esc(FAULT_TEXT[f].label)}</b><span>${esc(FAULT_TEXT[f].tip)}</span></div>`).join('')}</div>`
        : `<div class="faults"><div class="f"><b>✓ Nothing to fix</b><span>Gaz is lost for words. Briefly.</span></div></div>`
    }
    <div class="cardBtns">
      ${left > 0 ? `<button class="btn" data-act="next">Next attempt (${i + 2}/${ATTEMPTS})</button>` : `<button class="btn" data-act="finish">Hear the verdict</button>`}
      ${left > 0 && finish ? `<button class="btn ghost" data-act="finish">Take the job</button>` : ''}
      ${left > 0 ? `<button class="btn ghost small" data-act="demo">Watch Gaz again</button>` : ''}
    </div>
  </div>`;
  drawPattern(el.querySelector('canvas') as HTMLCanvasElement, t.patterns[i] as Float32Array, p);
  el.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
    b.onclick = () => onAction(b.dataset.act as TrialAction);
  });
  (el.querySelector('button.btn') as HTMLButtonElement | null)?.focus({ preventScroll: true });
}

export function renderVerdict(
  el: HTMLElement,
  t: Trial,
  quote: string,
  onAction: (a: TrialAction) => void,
): void {
  const o = t.outcome;
  if (!o) return;
  const band = BAND_TEXT[o.band];
  const thumbs = t.results
    .map(
      (
        r,
        i,
      ) => `<div class="${i === o.bestIndex ? 'best' : ''}"><canvas width="144" height="144"></canvas>
        ${r.valid ? `${r.total}` : 'DNC'}</div>`,
    )
    .join('');
  el.innerHTML = `<div class="verdictCard"><div class="paper">
    <div class="hd"><b>NO WUKKAS</b><span>BARISTA TRIAL · VERDICT</span></div>
    <div class="stamp ${o.band}">${band.title}</div>
    <div style="text-align:center">${o.bestIndex >= 0 ? `Best attempt: <b>${o.score}/100</b>` : 'No attempt counted.'} · ${esc(band.sub)}</div>
    <div class="attempts">${thumbs}</div>
    <div class="quote">“${esc(quote)}”<br><small>— Gaz, owner</small></div>
    <div class="cardBtns"><button class="btn" data-act="restart">Do the trial again</button></div>
  </div></div>`;
  el.querySelectorAll('canvas').forEach((c, i) => {
    drawPattern(c, t.patterns[i] as Float32Array, t.results[i]?.pattern ?? null, false);
  });
  const btn = el.querySelector('button[data-act]') as HTMLButtonElement;
  btn.onclick = () => onAction('restart');
  btn.focus({ preventScroll: true });
}
