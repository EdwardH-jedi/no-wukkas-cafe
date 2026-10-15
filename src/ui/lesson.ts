// The lesson strip: the four steps of a heart, the one the pour is on, and the controls doing it
// right now ("your hands" while you pour, "Gaz's hands" during his demo), plus the last pour's tip
// while you pour again. Shared by the Day 1 trial and practice. Built once; per frame only
// classes, widths and short texts change.

import { LESSON_HINT, STEP_TEXT } from '../data/coaching';
import { POUR_STEPS, readyToPull, type Finding, type PourLog } from '../sim/latte/coach';
import { demoPullFill } from '../sim/latte/demo';
import { pourTip, type PourTip } from '../sim/latte/feedback';
import { SURF_LOW, type PourState } from '../sim/latte/field';
import {
  nearestPreset,
  pitcherFlow,
  type PitcherControls,
  type PitcherState,
  type PourGate,
} from '../sim/latte/pitcher';
import type { PatternScore } from '../sim/latte/score';

export interface LessonView {
  log: PourLog;
  pour: PourState;
  pitcher: PitcherState;
  controls: PitcherControls;
  gate?: PourGate;
  /** Judged attempts so far (Day 1 hands over the whole trial, which has both): the latest one's
   *  tip shows while the next pour is on, unless LessonExtra.tip says otherwise. */
  findings?: readonly (readonly Finding[])[];
  results?: readonly { readonly pattern: PatternScore; readonly valid: boolean }[];
}

export type LessonMode = 'demo' | 'pour';

export interface LessonExtra {
  /** The player's pour button is down (to explain a press the gate is ignoring). */
  held?: boolean;
  /** Demo playback speed (0 = waiting for Gaz to finish a line). */
  rate?: number;
  /** Demo: the chapter Gaz is narrating (steps before it count as done), instead of the log. */
  chapter?: number;
  /** The last pour's tip, shown while pouring (null: none). Left out, it comes from the view's
   *  judged attempts (Day 1). */
  tip?: PourTip | null;
}

export interface Lesson {
  readonly el: HTMLElement;
  update(mode: LessonMode | null, v: LessonView | null, dt: number, extra?: LessonExtra): void;
}

const escHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Coaching copy to HTML: escape it, then turn [x] into a keycap. */
export function keysHtml(s: string): string {
  return escHtml(s).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
}

export function createLesson(parent: HTMLElement, touch: boolean, id: string): Lesson {
  const el = document.createElement('div');
  el.id = id;
  el.className = 'lesson hide';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Pouring a heart, step by step');
  const steps = POUR_STEPS.map((s, i) => {
    const t = STEP_TEXT[s];
    return `<li data-i="${i}"><i>${i + 1}</i><div><b>${escHtml(t.title)}</b><span>${keysHtml(touch ? t.touch : t.how)}</span></div></li>`;
  }).join('');
  const heights = touch
    ? ''
    : [0, 1, 2].map((i) => `<span class="hk" data-k="h${i}"><kbd>${i + 1}</kbd></span>`).join('');
  el.innerHTML = `<div class="lh"><span class="who"></span><span class="rate"></span></div>
    <div class="last hide"><b>Last pour</b><span></span></div>
    <ol>${steps}</ol>
    <div class="hands" aria-hidden="true">
      <span class="hk pour" data-k="pour"><kbd>${touch ? 'Hold' : 'Space'}</kbd>pour</span>
      ${heights}
      <span class="hcm"></span>
      <span class="hmove"></span>
      <span class="hflow" title="Flow"><i></i></span>
      <span class="hcup" title="Cup"></span>
    </div>
    <div class="hint hide"></div>
    <div class="sr" role="status" aria-live="polite"></div>`;
  parent.append(el);

  const q = <T extends HTMLElement>(s: string): T => el.querySelector(s) as T;
  const who = q('.who');
  const rateEl = q('.rate');
  const items = Array.from(el.querySelectorAll<HTMLElement>('ol li'));
  const pourKey = q('[data-k="pour"]');
  const hKeys = [0, 1, 2].map((i) => el.querySelector<HTMLElement>(`[data-k="h${i}"]`));
  const hcm = q('.hcm');
  const hmove = q('.hmove');
  const hflow = q('.hflow i');
  const hcup = q('.hcup');
  const hint = q('.hint');
  const sr = q('.sr');
  const last = q('.last');
  const lastText = q('.last span');

  let shown = false;
  let lastMode: LessonMode | null = null;
  let stepKey = '';
  let lastX = 0;
  let lastY = 0;
  let vx = 0;
  let vy = 0;
  let moveText = '';
  let hintText = '';
  let rateText = '';
  let pourCls = '';
  let hk = -1;
  let cmText = '';
  let flowW = -1;
  let cupText = '';
  let tipShown: PourTip | null = null;
  // Day 1: the tip of the latest judged attempt, worked out once per attempt.
  let judgedFrom: readonly unknown[] | null = null;
  let judgedCount = -1;
  let judgedTip: PourTip | null = null;
  const trialTip = (v: LessonView): PourTip | null => {
    const fs = v.findings;
    const rs = v.results;
    if (!fs || !rs) return null;
    const n = Math.min(fs.length, rs.length);
    if (rs !== judgedFrom || n !== judgedCount) {
      judgedFrom = rs;
      judgedCount = n;
      const r = rs[n - 1];
      const f = fs[n - 1];
      // An attempt that didn't count (poured on the bench…) has its own reason on the card.
      judgedTip = r && f && r.valid ? pourTip(r.pattern, f) : null;
    }
    return judgedTip;
  };

  const setText = (n: HTMLElement, v: string, cur: string): string => {
    if (v !== cur) n.textContent = v;
    return v;
  };

  return {
    el,
    update(mode, v, dt, extra = {}) {
      const on = mode !== null && v !== null;
      if (on !== shown) {
        shown = on;
        el.classList.toggle('hide', !on);
      }
      if (!on || !v || !mode) return;
      const p = v.pitcher;

      // The last pour's tip, while pouring again.
      const tip = mode === 'pour' ? (extra.tip !== undefined ? extra.tip : trialTip(v)) : null;
      if (tip !== tipShown) {
        if ((tip === null) !== (tipShown === null)) last.classList.toggle('hide', tip === null);
        if (tip && tip.text !== tipShown?.text) lastText.innerHTML = keysHtml(tip.text);
        tipShown = tip;
      }
      if (mode !== lastMode) {
        lastMode = mode;
        who.textContent = mode === 'demo' ? 'Gaz’s hands' : 'Your pour';
        el.classList.toggle('demo', mode === 'demo');
        lastX = p.x;
        lastY = p.y;
        vx = vy = 0;
      }

      // Steps: done ✓, current open with its how-to, the rest folded.
      const log = v.log;
      const ch = extra.chapter;
      const step = ch === undefined ? log.step : Math.max(0, ch);
      const sk = `${step}|${ch === undefined ? log.done.join(',') : ch}`;
      if (sk !== stepKey) {
        stepKey = sk;
        items.forEach((li, i) => {
          const done = ch === undefined ? log.done[i] : i < step;
          li.className = i === step ? 'cur' : done ? 'done' : '';
        });
        const s = POUR_STEPS[step];
        sr.textContent = s
          ? `Step ${log.step + 1} of 4: ${STEP_TEXT[s].title}`
          : 'All four steps done.';
      }

      // Hands: what the controls are doing right now.
      if (dt > 0) {
        const k = 1 - Math.exp(-dt / 0.12);
        vx += ((p.x - lastX) / dt - vx) * k;
        vy += ((p.y - lastY) / dt - vy) * k;
      }
      lastX = p.x;
      lastY = p.y;
      const blocked = extra.held === true && !v.controls.holding && v.gate?.armed === false;
      const pc = blocked ? 'hk pour warn' : v.controls.holding ? 'hk pour on' : 'hk pour';
      if (pc !== pourCls) pourKey.className = pourCls = pc;
      const near = nearestPreset(p.height);
      if (near !== hk) {
        hk = near;
        hKeys.forEach((n, i) => n?.classList.toggle('on', i === near));
      }
      cmText = setText(hcm, `${p.height.toFixed(1)} cm`, cmText);
      const speed = Math.hypot(vx, vy);
      const move =
        speed < 0.3
          ? 'steady'
          : Math.abs(vy) >= Math.abs(vx)
            ? vy > 0
              ? '↑ forward'
              : '↓ back'
            : vx > 0
              ? '→ right'
              : '← left';
      moveText = setText(hmove, move, moveText);
      cupText = setText(hcup, `cup ${Math.round(v.pour.fill * 100)}%`, cupText);
      const fw = Math.round(pitcherFlow(p) * 100);
      if (fw !== flowW) {
        flowW = fw;
        hflow.style.width = `${fw}%`;
      }

      // Demo pace.
      const r = extra.rate;
      const rt =
        mode !== 'demo' || r === undefined || r >= 0.95
          ? ''
          : r === 0
            ? 'Gaz is talking'
            : `slow-mo ×${r.toFixed(1)}`;
      rateText = setText(rateEl, rt, rateText);

      // A nudge when the player's pour is going off the rails (never during the demo).
      let h = '';
      if (mode === 'pour') {
        const pour = v.pour;
        const flowing = pitcherFlow(p) > 0;
        if (blocked) h = LESSON_HINT.held;
        else if (pour.missing) h = LESSON_HINT.miss;
        else if (pour.overflowing || (pour.fill >= 0.97 && flowing)) h = LESSON_HINT.full;
        else if (log.step === 0 && flowing && p.height < 2 && pour.fill < 0.4)
          h = LESSON_HINT.tooLowEarly;
        else if (log.step === 1 && pour.fill >= 0.5 && p.height > SURF_LOW + 0.9)
          h = LESSON_HINT.goLow;
        else if (log.step === 2 && flowing && p.height > SURF_LOW + 0.9)
          h = LESSON_HINT.tooHighToDraw;
        else if (readyToPull(log, pour.fill) && flowing)
          h = LESSON_HINT.pullNow.replace('{n}', String(Math.round(demoPullFill() * 20) * 5));
        else if (log.step === 4) h = LESSON_HINT.done;
      }
      if (h !== hintText) {
        hintText = h;
        hint.innerHTML = keysHtml(h);
        hint.classList.toggle('hide', h === '');
      }
    },
  };
}
