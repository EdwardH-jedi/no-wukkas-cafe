// The in-game HUD: top bar, subtitles, instruction, gauges and action buttons.
// Updated every frame, but only touches the DOM when a value actually changed.

import type { Phase, Trial, TrialAction } from '../core/trial';
import type { SpokenLine } from '../sim/owner';
import { createGauges } from './gauges';
import { instruction } from './instructions';
import { esc, renderCard, renderVerdict, titleHtml } from './screens';

export interface HudCallbacks {
  action(a: TrialAction): void;
  /** Start Day 2 (title screen or verdict). */
  day2(): void;
  /** Open the sound settings. */
  sound(): void;
  /** Replay + Sound buttons for the top bar, and how to wire them. */
  audioButtonsHtml: string;
  bindAudio(el: HTMLElement): void;
  pause(p: boolean): void;
  restart(): void;
  height(dir: -1 | 0 | 1): void;
  skip(): void;
}

export interface Hud {
  readonly touch: boolean;
  onSay(line: SpokenLine): void;
  /** Show a replayed line for `seconds`. */
  onReplay(text: string, seconds: number): void;
  onPhase(phase: Phase, t: Trial): void;
  setPaused(p: boolean): void;
  update(t: Trial, dt: number): void;
}

export function createHud(root: HTMLElement, cb: HudCallbacks): Hud {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  root.innerHTML = `
    <div id="title">${titleHtml(touch)}</div>
    <div id="topbar" class="hide">
      <div class="chip"><span class="k">Trial</span><div class="steps"><span data-s="shot">1 Shot</span><span data-s="milk">2 Milk</span><span data-s="art">3 Heart</span></div></div>
      <div class="chip"><span class="k">Goes</span><div class="pips"><i></i><i></i><i></i></div></div>
      <div class="chip" id="bestChip"><span class="k">Best</span><b id="bestV">–</b></div>
      <div class="spacer"></div>
      ${cb.audioButtonsHtml}
      <button class="iconbtn" id="pauseBtn" aria-label="Pause">❚❚</button>
    </div>
    <div id="instr" class="hide"><div class="h"></div><div class="b"></div></div>
    <div id="gauges" class="hide"></div>
    <div id="actionBar"></div>
    <div id="touchHeight" class="hide"><button data-h="1" aria-label="Raise jug">▲</button><button data-h="-1" aria-label="Lower jug">▼</button></div>
    <div id="subs" class="gone" role="status" aria-live="polite"><div class="who">GAZ<small>Owner</small></div><div class="text"></div></div>
    <div id="card" class="hide"></div>
    <div id="verdict" class="hide"></div>
    <div id="pause" class="hide"><div class="box"><h3>Paused</h3><div class="titleBtns"><button class="btn" id="resumeBtn">Back to it</button><button class="btn ghost" id="restartBtn">Restart trial</button></div></div></div>`;
  const $ = <T extends HTMLElement>(s: string): T => root.querySelector(s) as T;
  const title = $('#title');
  const topbar = $('#topbar');
  const instr = $('#instr');
  const gauges = $('#gauges');
  const actionBar = $('#actionBar');
  const touchHeight = $('#touchHeight');
  const subs = $('#subs');
  const subsText = subs.querySelector('.text') as HTMLElement;
  const card = $('#card');
  const verdict = $('#verdict');
  const pauseEl = $('#pause');

  title.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.act === 'day2') cb.day2();
      else if (b.dataset.act === 'sound') cb.sound();
      else cb.action('start');
    };
  });
  cb.bindAudio(topbar);
  $('#pauseBtn').onclick = () => cb.pause(true);
  $('#resumeBtn').onclick = () => cb.pause(false);
  $('#restartBtn').onclick = () => cb.restart();
  subs.onclick = () => cb.skip();
  touchHeight.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const dir = Number(b.dataset.h) as -1 | 1;
    b.onpointerdown = (e) => {
      e.preventDefault();
      cb.height(dir);
    };
    b.onpointerup = b.onpointerleave = b.onpointercancel = () => cb.height(0);
  });

  // ---------------------------------------------------------------- subtitles
  let subFull = '';
  let subShown = 0;
  let subHideIn = 0;
  let replayHold = 0;
  let lastQuote = '';

  // ---------------------------------------------------------------- gauges
  const gaugePanel = createGauges(gauges, touch);

  // ---------------------------------------------------------------- action buttons
  let actionKey = '';
  const setActions = (
    key: string,
    buttons: Array<{ label: string; act: TrialAction; disabled?: boolean }>,
  ): void => {
    if (key === actionKey) return;
    actionKey = key;
    actionBar.innerHTML = buttons
      .map(
        (b) =>
          `<button class="btn small" data-act="${b.act}" ${b.disabled ? 'disabled style="opacity:.5"' : ''}>${esc(b.label)}</button>`,
      )
      .join('');
    actionBar.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.onclick = () => cb.action(b.dataset.act as TrialAction);
    });
  };

  let instrKey = '';
  let stepKey = '';
  let pipKey = '';

  return {
    touch,
    onSay(line) {
      subFull = line.text;
      subShown = 0;
      subHideIn = 0;
      lastQuote =
        line.key.startsWith('verdict.') && line.key !== 'verdict.hiredAfter'
          ? line.text
          : lastQuote;
      subs.classList.remove('gone');
    },
    onReplay(text, seconds) {
      subFull = text;
      subShown = 0;
      replayHold = seconds;
      subs.classList.remove('gone');
    },
    onPhase(phase, t) {
      title.classList.toggle('hide', phase !== 'title');
      topbar.classList.toggle('hide', phase === 'title');
      card.classList.toggle('hide', phase !== 'feedback');
      verdict.classList.toggle('hide', phase !== 'verdict');
      if (phase === 'feedback') renderCard(card, t, cb.action);
      if (phase === 'verdict') {
        verdict.innerHTML = '';
        lastQuote = '';
      }
    },
    setPaused(p) {
      pauseEl.classList.toggle('hide', !p);
    },
    update(t, dt) {
      // Subtitles: quick typewriter reveal, fade when he stops talking.
      if (replayHold > 0) replayHold -= dt;
      if (t.speech.current || replayHold > 0) {
        subHideIn = 0.35;
        if (subShown < subFull.length) {
          subShown = Math.min(subFull.length, subShown + dt * 70);
          subsText.textContent = subFull.slice(0, Math.ceil(subShown));
        }
      } else if (subHideIn > 0) {
        subHideIn -= dt;
        if (subHideIn <= 0) subs.classList.add('gone');
      }
      if (t.phase === 'verdict' && verdict.innerHTML === '' && t.phaseTime > 0.8 && lastQuote) {
        renderVerdict(verdict, t, lastQuote, cb.action, cb.day2);
      }

      // Steps + attempt pips.
      const ph = t.phase;
      const step =
        ph === 'grind' || ph === 'lock' || ph === 'shot'
          ? 'shot'
          : ph === 'steam'
            ? 'milk'
            : ph === 'demo' || ph === 'pour'
              ? 'art'
              : '';
      const doneShot = t.espressoScore !== null;
      const sk = `${step}|${doneShot}|${t.milkScore !== null}`;
      if (sk !== stepKey) {
        stepKey = sk;
        topbar.querySelectorAll<HTMLElement>('.steps span').forEach((s) => {
          s.className =
            s.dataset.s === step ? 'on' : s.dataset.s === 'shot' && doneShot ? 'done' : '';
        });
      }
      const pk = `${t.attempt}|${t.results.map((r) => (r.valid ? r.total : -1)).join(',')}`;
      if (pk !== pipKey) {
        pipKey = pk;
        topbar.querySelectorAll<HTMLElement>('.pips i').forEach((p, i) => {
          const r = t.results[i];
          p.className = r
            ? r.valid && r.total >= 60
              ? 'ok'
              : 'bad'
            : i === t.attempt
              ? 'cur'
              : '';
        });
        const best = t.results.filter((r) => r.valid).reduce((m, r) => Math.max(m, r.total), -1);
        const bv = $('#bestV');
        bv.textContent = best >= 0 ? String(best) : '–';
      }

      // Instruction panel.
      const ins = instruction(t, touch);
      const ik = ins ? ins.title + ins.html : '';
      if (ik !== instrKey) {
        instrKey = ik;
        instr.classList.toggle('hide', !ins);
        if (ins) {
          (instr.querySelector('.h') as HTMLElement).textContent = ins.title;
          (instr.querySelector('.b') as HTMLElement).innerHTML = ins.html;
        }
      }

      // Gauges.
      const mode =
        ph === 'grind'
          ? 'grind'
          : ph === 'shot'
            ? 'shot'
            : ph === 'steam'
              ? 'steam'
              : ph === 'pour' || (ph === 'demo' && t.demoActive)
                ? 'pour'
                : '';
      gaugePanel.update(mode, t);
      const e = t.espresso;

      // Buttons + touch height pad.
      if (ph === 'grind') {
        const ok = e.dose >= 8 && !e.grinding;
        setActions(`grind|${ok}`, [{ label: 'Tamp & lock in', act: 'next', disabled: !ok }]);
      } else if (ph === 'pour') {
        const ok = t.pour.poured > 0;
        setActions(`pour|${ok}`, ok ? [{ label: 'Hand it over', act: 'next' }] : []);
      } else if (ph === 'demo' && t.demoSeen && t.demoActive)
        setActions('demo', [{ label: 'Skip', act: 'next' }]);
      else setActions('', []);
      touchHeight.classList.toggle('hide', !(touch && ph === 'pour'));
    },
  };
}
