// Practice HUD: top bar (pours, best, guide), the lesson strip, pour gauges, side buttons, Gaz's
// subtitles while he demonstrates, and the review card: what the foam field actually made, the one
// thing to do next pour, why, and how it compares with the pour before. Only touches the DOM when
// something changed.

import {
  latestAttempt,
  previousAttempt,
  type Practice,
  type PracticeAction,
  type PracticeAttempt,
} from '../core/practice';
import { CAUSE_TEXT, FINDING_TEXT } from '../data/coaching';
import { createEspresso } from '../sim/espresso';
import type { Finding } from '../sim/latte/coach';
import { fillCopy, pourTip, type PourTip } from '../sim/latte/feedback';
import { band } from '../sim/math';
import type { SpokenLine } from '../sim/owner';
import { createSteam } from '../sim/steam';
import { createGauges, type GaugeView } from './gauges';
import { createLesson, keysHtml } from './lesson';
import { drawPattern } from './pattern';

export interface PracticeHudCallbacks {
  action(a: PracticeAction): void;
  title(): void;
  pause(p: boolean): void;
  height(dir: -1 | 0 | 1): void;
  skip(): void;
  audioButtonsHtml: string;
  bindAudio(el: HTMLElement): void;
}

export interface PracticeHud {
  onSay(line: SpokenLine): void;
  onReplay(text: string, seconds: number): void;
  onPhase(p: Practice): void;
  setPaused(p: boolean): void;
  /** `held`: the player's pour button is down (explains a press the pour gate ignores). */
  update(p: Practice, dt: number, held: boolean): void;
}

const pct = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 100);

/** Size as a 0–1 score: 1 inside the 20–55% coverage band a heart wants. */
const sizeScore = (coverage: number): number => band(coverage, 0.2, 0.55, 0.14, 0.3);

function verdict(art: number): { text: string; cls: string } {
  if (art >= 0.85) return { text: 'Proper heart', cls: 'hired' };
  if (art >= 0.6) return { text: 'Getting there', cls: 'almost' };
  if (art >= 0.3) return { text: 'Rough', cls: 'failed' };
  return { text: 'Not a heart yet', cls: 'disaster' };
}

/** One reason. `tipped`: its fix is the "Next pour" tip right above, so it isn't said twice. */
function findingHtml(f: Finding, tipped: boolean): string {
  const t = FINDING_TEXT[f.id];
  const ok = f.id === 'textbook';
  const cause = f.cause
    ? `<span class="cause">${keysHtml(fillCopy(CAUSE_TEXT[f.cause], f))}</span>`
    : '';
  return `<div class="f${ok ? ' ok' : ''}"><b>${ok ? '✓' : '✗'} ${keysHtml(t.label)}</b>
    <span>${keysHtml(fillCopy(t.why, f))}</span>${cause}
    ${tipped ? '' : `<span class="fix">→ ${keysHtml(t.fix)}</span>`}</div>`;
}

/** The tip is the first reason's own fix (its why and cause are listed below it). */
const tipListed = (tip: PourTip | null, findings: readonly Finding[]): boolean =>
  tip !== null &&
  tip.id !== 'textbook' &&
  tip.finding !== null &&
  tip.finding === findings[0] &&
  tip.id === tip.finding.id;

/** The one thing to do next pour, above the reasons. A textbook heart has nothing to add (its
 *  finding says so), and the detail is left out when the first reason below already says it. */
function tipHtml(tip: PourTip, findings: readonly Finding[]): string {
  if (tip.id === 'textbook') return '';
  const detail = tipListed(tip, findings) ? '' : `<small>${keysHtml(tip.detail)}</small>`;
  return `<div class="tip" role="note"><b>Next pour</b><span>${keysHtml(tip.text)}</span>${detail}</div>`;
}

function row(label: string, v: number, prev: number | null, value: string): string {
  let delta = '';
  if (prev !== null) {
    const d = Math.round((v - prev) * 100);
    if (Math.abs(d) >= 3)
      delta = `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</em>`;
  }
  return `<div class="r"><span>${label}</span><i><b style="width:${pct(v)}%"></b></i><span>${value}${delta}</span></div>`;
}

function renderReview(
  el: HTMLElement,
  p: Practice,
  tip: PourTip | null,
  act: (a: PracticeAction) => void,
  toTitle: () => void,
  touch: boolean,
): void {
  const a = latestAttempt(p);
  if (!a) return;
  const prev = previousAttempt(p);
  const s = a.score;
  const ps = prev?.score ?? null;
  const v = verdict(s.art);
  const d = ps ? Math.round((s.art - ps.art) * 100) : 0;
  const vsLast =
    ps && prev
      ? `<div class="vs">${d === 0 ? 'Same as' : d > 0 ? `<em class="up">▲${d}</em> on` : `<em class="down">▼${-d}</em> on`} pour #${prev.n}</div>`
      : '';
  const tipped = tipListed(tip, a.findings);
  const findings = a.findings
    .slice(0, 3)
    .map((f, i) => findingHtml(f, tipped && i === 0))
    .join('');
  const history = p.attempts
    .slice(-6)
    .map(
      (h: PracticeAttempt) =>
        `<div class="${h === a ? 'best' : ''}"><canvas width="96" height="96" data-n="${h.n}"></canvas>${pct(h.score.art)}%</div>`,
    )
    .join('');
  el.innerHTML = `<div class="paper">
    <div class="hd"><b>NO WUKKAS</b><span>PRACTICE · POUR #${a.n}</span></div>
    <div class="scoreRow">
      <canvas width="264" height="264" aria-label="Your pattern as you poured it (far side up), with the guide heart in white and the closest heart in gold"></canvas>
      <div>
        <div class="bigScore">${pct(s.art)}<small>% art</small></div>
        <span class="bandTag ${v.cls}">${v.text}</span>
        ${vsLast}
      </div>
    </div>
    <div class="legend"><span class="lg guide">guide</span><span class="lg fit">closest heart</span><span class="lg ctr">centre → yours</span></div>
    ${tip ? tipHtml(tip, a.findings) : ''}
    <div class="rows">
      ${row('Heart', s.shape, ps?.shape ?? null, `${pct(s.shape)}%`)}
      ${row('Symmetry', s.symmetry, ps?.symmetry ?? null, `${pct(s.symmetry)}%`)}
      ${row('Centred', s.position, ps?.position ?? null, `${pct(s.position)}%`)}
      ${row('Crisp', s.definition, ps?.definition ?? null, `${pct(s.definition)}%`)}
      ${row('White', sizeScore(s.coverage), ps ? sizeScore(ps.coverage) : null, `${pct(s.coverage)}%`)}
    </div>
    <div class="faults">${findings}</div>
    ${p.attempts.length > 1 ? `<div class="attempts">${history}</div>` : ''}
    <div class="cardBtns">
      <button class="btn" data-act="again">Pour again${touch ? '' : ' (Space)'}</button>
      <button class="btn ghost small" data-act="demo">Watch Gaz</button>
      <button class="btn ghost small" data-act="title">Back to title</button>
    </div>
  </div>`;
  drawPattern(el.querySelector('canvas') as HTMLCanvasElement, a.foam, s, true, {
    barista: true,
    guide: true,
    centroid: true,
  });
  el.querySelectorAll<HTMLCanvasElement>('.attempts canvas').forEach((c) => {
    const h = p.attempts.find((x) => x.n === Number(c.dataset.n));
    if (h) drawPattern(c, h.foam, h.score, false, { barista: true });
  });
  el.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
    b.onclick = () =>
      b.dataset.act === 'title' ? toTitle() : act(b.dataset.act as PracticeAction);
  });
  (el.querySelector('button.btn') as HTMLButtonElement | null)?.focus({ preventScroll: true });
}

export function createPracticeHud(root: HTMLElement, cb: PracticeHudCallbacks): PracticeHud {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  root.innerHTML = `
    <div id="ptopbar">
      <div class="chip"><span class="k">Practice</span><b>Latte art</b></div>
      <div class="chip"><span class="k">Pours</span><b data-v="count">0</b></div>
      <div class="chip"><span class="k">Best</span><b data-v="best">–</b></div>
      <div class="spacer"></div>
      <button class="iconbtn" id="pGuide" aria-pressed="true" title="Heart guide on the coffee">Guide${touch ? '' : ' <kbd>G</kbd>'}</button>
      ${cb.audioButtonsHtml}
      <button class="iconbtn" id="pPause" aria-label="Pause">❚❚</button>
    </div>
    <div id="pgauges" class="hide"></div>
    <div id="pactions" class="side"></div>
    <div id="ptouchHeight" class="hide"><button data-h="1" aria-label="Raise jug">▲</button><button data-h="-1" aria-label="Lower jug">▼</button></div>
    <div id="psubs" class="gone" role="status" aria-live="polite"><div class="who">GAZ<small>Owner</small></div><div class="text"></div></div>
    <div id="pcard" class="hide"></div>
    <div id="ppause" class="hide"><div class="box"><h3>Paused</h3><div class="titleBtns"><button class="btn" id="pResume">Back to it</button><button class="btn ghost" id="pTitle">Back to title</button></div></div></div>`;
  const $ = <T extends HTMLElement>(s: string): T => root.querySelector(s) as T;
  const topbar = $('#ptopbar');
  const gaugesEl = $('#pgauges');
  const actions = $('#pactions');
  const touchPad = $('#ptouchHeight');
  const subs = $('#psubs');
  const subsText = subs.querySelector('.text') as HTMLElement;
  const card = $('#pcard');
  const pauseEl = $('#ppause');
  const guideBtn = $('#pGuide');
  const countEl = $('[data-v="count"]');
  const bestEl = $('[data-v="best"]');
  const lesson = createLesson(root, touch, 'plesson');
  const gauges = createGauges(gaugesEl, touch);
  let gaugeView: GaugeView | null = null;

  cb.bindAudio(topbar);
  guideBtn.onclick = () => cb.action('guide');
  $('#pPause').onclick = () => cb.pause(true);
  $('#pResume').onclick = () => cb.pause(false);
  $('#pTitle').onclick = () => cb.title();
  subs.onclick = () => cb.skip();
  touchPad.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const dir = Number(b.dataset.h) as -1 | 1;
    b.onpointerdown = (e) => {
      e.preventDefault();
      cb.height(dir);
    };
    b.onpointerup = b.onpointerleave = b.onpointercancel = () => cb.height(0);
  });

  let subFull = '';
  let subShown = 0;
  let subHideIn = 0;
  let replayHold = 0;
  let actionKey = '';
  let topKey = '';
  let guideOn: boolean | null = null;
  // The latest attempt's tip: on its review card, then in the lesson strip for the next pour.
  let tipOf: PracticeAttempt | null = null;
  let tip: PourTip | null = null;
  const latestTip = (p: Practice): PourTip | null => {
    const a = latestAttempt(p);
    if (a !== tipOf) {
      tipOf = a;
      tip = a ? pourTip(a.score, a.findings) : null;
    }
    return tip;
  };

  const setActions = (
    key: string,
    buttons: Array<{ label: string; act: PracticeAction }>,
  ): void => {
    if (key === actionKey) return;
    actionKey = key;
    actions.innerHTML = buttons
      .map(
        (b) =>
          `<button class="btn small${b.act === 'done' ? '' : ' ghost'}" data-act="${b.act}">${b.label}</button>`,
      )
      .join('');
    actions.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => cb.action(b.dataset.act as PracticeAction);
    });
  };

  return {
    onSay(line) {
      subFull = line.text;
      subShown = 0;
      subHideIn = 0;
      subs.classList.remove('gone');
    },
    onReplay(text, seconds) {
      subFull = text;
      subShown = 0;
      replayHold = seconds;
      subs.classList.remove('gone');
    },
    onPhase(p) {
      card.classList.toggle('hide', p.phase !== 'review');
      if (p.phase === 'review') renderReview(card, p, latestTip(p), cb.action, cb.title, touch);
    },
    setPaused(paused) {
      pauseEl.classList.toggle('hide', !paused);
    },
    update(p, dt, held) {
      if (replayHold > 0) replayHold -= dt;
      if (p.speech.current || replayHold > 0) {
        subHideIn = 0.35;
        if (subShown < subFull.length) {
          subShown = Math.min(subFull.length, subShown + dt * 70);
          subsText.textContent = subFull.slice(0, Math.ceil(subShown));
        }
      } else if (subHideIn > 0) {
        subHideIn -= dt;
        if (subHideIn <= 0) subs.classList.add('gone');
      }

      const tk = `${p.count}|${p.best}`;
      if (tk !== topKey) {
        topKey = tk;
        countEl.textContent = String(p.count);
        bestEl.textContent = p.best >= 0 ? `${pct(p.best)}%` : '–';
      }
      if (p.guide !== guideOn) {
        guideOn = p.guide;
        guideBtn.setAttribute('aria-pressed', String(p.guide));
        guideBtn.classList.toggle('off', !p.guide);
      }

      const pouring = p.phase === 'pour';
      const demo = p.phase === 'demo' && (p.demoActive || p.demoEndedAt >= 0);
      lesson.update(pouring ? 'pour' : demo ? 'demo' : null, pouring || demo ? p : null, dt, {
        held,
        rate: p.demo.rate,
        chapter: demo ? p.demo.chapter - 1 : undefined,
        tip: latestTip(p),
      });
      // The pour gauge reads only the jug and the cup; practice has no grinder or steam wand.
      gaugeView ??= {
        espresso: createEspresso(),
        steam: createSteam(),
        pitcher: p.pitcher,
        pour: p.pour,
      };
      gaugeView.pitcher = p.pitcher;
      gaugeView.pour = p.pour;
      gauges.update(pouring || (p.phase === 'demo' && p.demoActive) ? 'pour' : '', gaugeView);

      if (pouring)
        setActions(`pour|${p.pour.poured > 0}`, [
          ...(p.pour.poured > 0
            ? [{ label: touch ? 'Done' : 'Done (Enter)', act: 'done' as const }]
            : []),
          { label: touch ? 'Reset cup' : 'Reset cup (R)', act: 'reset' },
          { label: touch ? 'Watch Gaz' : 'Watch Gaz (D)', act: 'demo' },
        ]);
      else if (p.phase === 'demo')
        setActions('demo', [{ label: touch ? 'Skip' : 'Skip (Enter)', act: 'skip' }]);
      else setActions('', []);
      touchPad.classList.toggle('hide', !(touch && pouring));
    },
  };
}
