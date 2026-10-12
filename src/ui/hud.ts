// The in-game HUD: top bar, subtitles, instruction, gauges and action buttons.
// Updated every frame, but only touches the DOM when a value actually changed.

import type { Phase, Trial, TrialAction } from '../core/trial';
import { DOSE_TARGET, SHOT_TARGET } from '../sim/espresso';
import { SURF_HIGH, SURF_LOW } from '../sim/latte/field';
import { HEIGHT_MAX, PITCHER_MILK, pitcherFlow } from '../sim/latte/pitcher';
import type { SpokenLine } from '../sim/owner';
import { AERATION_TARGET, TARGET_TEMP } from '../sim/steam';
import { instruction } from './instructions';
import { esc, renderCard, renderVerdict, titleHtml } from './screens';

export interface HudCallbacks {
  action(a: TrialAction): void;
  toggleVoice(): boolean;
  toggleSound(): boolean;
  pause(p: boolean): void;
  restart(): void;
  height(dir: -1 | 0 | 1): void;
  skip(): void;
}

export interface Hud {
  readonly touch: boolean;
  onSay(line: SpokenLine): void;
  onPhase(phase: Phase, t: Trial): void;
  setPaused(p: boolean): void;
  update(t: Trial, dt: number): void;
}

const pct = (v: number, lo: number, hi: number): number =>
  Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

export function createHud(root: HTMLElement, cb: HudCallbacks): Hud {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  root.innerHTML = `
    <div id="title">${titleHtml(touch)}</div>
    <div id="topbar" class="hide">
      <div class="chip"><span class="k">Trial</span><div class="steps"><span data-s="shot">1 Shot</span><span data-s="milk">2 Milk</span><span data-s="art">3 Heart</span></div></div>
      <div class="chip"><span class="k">Goes</span><div class="pips"><i></i><i></i><i></i></div></div>
      <div class="chip" id="bestChip"><span class="k">Best</span><b id="bestV">–</b></div>
      <div class="spacer"></div>
      <button class="iconbtn" id="voiceBtn" aria-label="Toggle voice">Voice</button>
      <button class="iconbtn" id="sndBtn" aria-label="Toggle sound">Sound</button>
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
      if (b.dataset.act === 'voice') {
        const on = cb.toggleVoice();
        b.textContent = `Voice: ${on ? 'on' : 'off'}`;
        b.setAttribute('aria-pressed', String(on));
        $('#voiceBtn').classList.toggle('off', !on);
      } else cb.action('start');
    };
  });
  $('#voiceBtn').onclick = (e) => {
    const on = cb.toggleVoice();
    (e.currentTarget as HTMLElement).classList.toggle('off', !on);
  };
  $('#sndBtn').onclick = (e) => {
    const on = cb.toggleSound();
    (e.currentTarget as HTMLElement).classList.toggle('off', !on);
  };
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
  let lastQuote = '';

  // ---------------------------------------------------------------- gauges
  let gaugeMode = '';
  const g: Record<string, HTMLElement> = {};
  const buildGauges = (mode: string): void => {
    gaugeMode = mode;
    let html = '';
    if (mode === 'grind')
      html = `<div class="gauge"><div class="k"><span>Dose</span><span>18–20 g</span></div><div class="v" data-g="v">0.0<small>g</small></div>
        <div class="bar"><div class="zone" style="left:${pct(DOSE_TARGET[0], 0, 26)}%;width:${pct(DOSE_TARGET[1], 0, 26) - pct(DOSE_TARGET[0], 0, 26)}%"></div><div class="needle" data-g="n"></div></div>
        <div class="tag" data-g="t"></div></div>`;
    else if (mode === 'shot')
      html = `<div class="gauge"><div class="k"><span>Shot timer</span><span>25–31 s</span></div><div class="v" data-g="v">0<small>s</small></div>
        <div class="bar"><div class="zone" style="left:${pct(SHOT_TARGET[0], 0, 45)}%;width:${pct(SHOT_TARGET[1], 0, 45) - pct(SHOT_TARGET[0], 0, 45)}%"></div><div class="needle" data-g="n"></div></div>
        <div class="tag" data-g="t"></div></div>`;
    else if (mode === 'steam')
      html = `<div class="gauge"><div class="k"><span>Milk</span><span>55–65 °C</span></div>
        <div class="vgauge"><div class="vbar"><div class="zone" style="bottom:${pct(TARGET_TEMP[0], 0, 85)}%;height:${pct(TARGET_TEMP[1], 0, 85) - pct(TARGET_TEMP[0], 0, 85)}%"></div><div class="needle" data-g="tn"></div></div>
        <div style="flex:1"><div class="v" data-g="v">5<small>°C</small></div>
        <div class="k" style="margin-top:6px"><span>Foam</span><span>silky</span></div>
        <div class="bar"><div class="zone" style="left:${AERATION_TARGET[0] * 100}%;width:${(AERATION_TARGET[1] - AERATION_TARGET[0]) * 100}%"></div><div class="needle" data-g="fn"></div></div>
        <div class="tag" data-g="t"></div></div></div></div>`;
    else if (mode === 'pour')
      html = `<div class="gauge"><div class="k"><span>Jug height</span><span data-g="hv"></span></div>
        <div class="vgauge"><div class="vbar"><div class="zone" style="bottom:0;height:${pct(SURF_LOW, 0, HEIGHT_MAX)}%"></div><div class="zone mid" style="bottom:${pct(SURF_LOW, 0, HEIGHT_MAX)}%;height:${pct(SURF_HIGH, 0, HEIGHT_MAX) - pct(SURF_LOW, 0, HEIGHT_MAX)}%"></div><div class="needle" data-g="hn"></div></div>
        <div class="vlabels"><span>${touch ? '' : '[1] '}High · sinks</span><span>${touch ? '' : '[2] '}Lift</span><span>${touch ? '' : '[3] '}Low · draws</span></div></div>
        <div class="tag" data-g="ht"></div>
        <div class="k" style="margin-top:10px"><span>Flow</span></div><div class="bar"><div class="fill" data-g="fl"></div></div>
        <div class="k" style="margin-top:10px"><span>Cup</span><span data-g="cv"></span></div><div class="bar"><div class="zone" style="left:88%;width:12%"></div><div class="fill" data-g="cf"></div></div>
        <div class="k" style="margin-top:10px"><span>Jug</span></div><div class="bar"><div class="fill" data-g="mf" style="background:var(--paper)"></div></div></div>`;
    gauges.innerHTML = html;
    gauges.classList.toggle('hide', html === '');
    for (const k of Object.keys(g)) delete g[k];
    gauges.querySelectorAll<HTMLElement>('[data-g]').forEach((n) => (g[n.dataset.g as string] = n));
  };
  const setText = (k: string, v: string): void => {
    const n = g[k];
    if (n && n.innerHTML !== v) n.innerHTML = v;
  };
  const setStyle = (k: string, prop: 'left' | 'bottom' | 'width', v: number): void => {
    const n = g[k];
    if (n) n.style[prop] = `${v.toFixed(1)}%`;
  };
  const setTag = (k: string, text: string, cls: '' | 'good' | 'warn' | 'bad'): void => {
    const n = g[k];
    if (!n) return;
    if (n.textContent !== text) n.textContent = text;
    const c = `tag ${cls}`;
    if (n.className !== c) n.className = c;
  };

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
      if (t.speech.current) {
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
        renderVerdict(verdict, t, lastQuote, cb.action);
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
      if (mode !== gaugeMode) buildGauges(mode);
      const e = t.espresso;
      if (mode === 'grind') {
        setText('v', `${e.dose.toFixed(1)}<small>g</small>`);
        setStyle('n', 'left', pct(e.dose, 0, 26));
        if (e.dose > 21.5) setTag('t', 'Too much!', 'bad');
        else if (e.dose >= DOSE_TARGET[0] - 0.4 && e.dose <= DOSE_TARGET[1] + 0.4)
          setTag('t', 'Spot on', 'good');
        else setTag('t', e.grinding ? 'Grinding…' : '', '');
      } else if (mode === 'shot') {
        setText('v', `${Math.floor(e.shotTime)}<small>s · ${e.yield.toFixed(0)} g out</small>`);
        setStyle('n', 'left', pct(e.shotTime, 0, 45));
        if (!e.extracting && !e.done) setTag('t', 'Ready', '');
        else if (e.shotTime < 4) setTag('t', 'Pre-infusion…', '');
        else if (e.shotTime < SHOT_TARGET[0]) setTag('t', 'Flowing', 'warn');
        else if (e.shotTime <= SHOT_TARGET[1]) setTag('t', 'Stop now!', 'good');
        else setTag('t', 'Running long', 'bad');
      } else if (mode === 'steam') {
        const s = t.steam;
        setText('v', `${s.temp.toFixed(0)}<small>°C</small>`);
        setStyle('tn', 'bottom', pct(s.temp, 0, 85));
        setStyle('fn', 'left', Math.min(100, s.aeration * 100));
        if (s.done) setTag('t', 'Valve closed', '');
        else if (s.zone === 'chirp') setTag('t', 'Tss-tss · stretching', 'good');
        else if (s.zone === 'whirl') setTag('t', 'Spinning · texturing', 'warn');
        else if (s.zone === 'screech') setTag('t', 'Screeching!', 'bad');
        else setTag('t', 'Hold to steam', '');
      } else if (mode === 'pour') {
        const p = t.pitcher;
        setText('hv', `${p.height.toFixed(1)} cm`);
        setStyle('hn', 'bottom', pct(p.height, 0, HEIGHT_MAX));
        if (p.height <= SURF_LOW) setTag('ht', 'Low · foam floats', 'good');
        else if (p.height < SURF_HIGH) setTag('ht', 'Mixing · goes beige', 'warn');
        else setTag('ht', 'High · milk sinks', '');
        setStyle('fl', 'width', pitcherFlow(p) * 100);
        setText('cv', `${Math.round(t.pour.fill * 100)}%`);
        setStyle('cf', 'width', t.pour.fill * 100);
        setStyle('mf', 'width', (p.milk / PITCHER_MILK) * 100);
      }

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
