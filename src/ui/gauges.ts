// Station gauges (dose, shot timer, milk thermometer + foam, jug height/flow/cup, hot water).
// Shared by the Day 1 trial HUD and the Day 2 rush HUD. Only touches the DOM when a value changes.
// Day 2's two hands ('shotSteam'): the shot timer and the milk gauge, stacked.

import { DOSE_TARGET, SHOT_TARGET, type EspressoState } from '../sim/espresso';
import { SURF_HIGH, SURF_LOW, type PourState } from '../sim/latte/field';
import { HEIGHT_MAX, PITCHER_MILK, pitcherFlow, type PitcherState } from '../sim/latte/pitcher';
import { LONG_BLACK_WATER } from '../sim/rush';
import { AERATION_TARGET, TARGET_TEMP, type SteamState } from '../sim/steam';

export type GaugeMode = '' | 'grind' | 'shot' | 'shotSteam' | 'steam' | 'pour' | 'water';

export interface GaugeView {
  espresso: EspressoState;
  steam: SteamState;
  pitcher: PitcherState;
  pour: PourState;
  /** Long black hot water, cup volumes. */
  water?: number;
}

export interface Gauges {
  update(mode: GaugeMode, v: GaugeView): void;
}

const pct = (v: number, lo: number, hi: number): number =>
  Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

const SHOT_CARD = `<div class="gauge"><div class="k"><span>Shot timer</span><span>25–31 s</span></div><div class="v" data-g="sv">0<small>s</small></div>
        <div class="bar"><div class="zone" style="left:${pct(SHOT_TARGET[0], 0, 45)}%;width:${pct(SHOT_TARGET[1], 0, 45) - pct(SHOT_TARGET[0], 0, 45)}%"></div><div class="needle" data-g="sn"></div></div>
        <div class="tag" data-g="st"></div></div>`;
const MILK_CARD = `<div class="gauge"><div class="k"><span>Milk</span><span>55–65 °C</span></div>
        <div class="vgauge"><div class="vbar"><div class="zone" style="bottom:${pct(TARGET_TEMP[0], 0, 85)}%;height:${pct(TARGET_TEMP[1], 0, 85) - pct(TARGET_TEMP[0], 0, 85)}%"></div><div class="needle" data-g="mtn"></div></div>
        <div style="flex:1"><div class="v" data-g="mv">5<small>°C</small></div>
        <div class="k" style="margin-top:6px"><span>Foam</span><span>silky</span></div>
        <div class="bar"><div class="zone" style="left:${AERATION_TARGET[0] * 100}%;width:${(AERATION_TARGET[1] - AERATION_TARGET[0]) * 100}%"></div><div class="needle" data-g="mfn"></div></div>
        <div class="tag" data-g="mt"></div></div></div></div>`;

export function createGauges(el: HTMLElement, touch: boolean): Gauges {
  let gaugeMode: GaugeMode | null = null;
  const g: Record<string, HTMLElement> = {};
  const build = (mode: GaugeMode): void => {
    gaugeMode = mode;
    let html = '';
    if (mode === 'grind')
      html = `<div class="gauge"><div class="k"><span>Dose</span><span>18–20 g</span></div><div class="v" data-g="v">0.0<small>g</small></div>
        <div class="bar"><div class="zone" style="left:${pct(DOSE_TARGET[0], 0, 26)}%;width:${pct(DOSE_TARGET[1], 0, 26) - pct(DOSE_TARGET[0], 0, 26)}%"></div><div class="needle" data-g="n"></div></div>
        <div class="tag" data-g="t"></div></div>`;
    else if (mode === 'shot') html = SHOT_CARD;
    else if (mode === 'shotSteam') html = SHOT_CARD + MILK_CARD;
    else if (mode === 'steam') html = MILK_CARD;
    else if (mode === 'pour')
      html = `<div class="gauge"><div class="k"><span>Jug height</span><span data-g="hv"></span></div>
        <div class="vgauge"><div class="vbar"><div class="zone" style="bottom:0;height:${pct(SURF_LOW, 0, HEIGHT_MAX)}%"></div><div class="zone mid" style="bottom:${pct(SURF_LOW, 0, HEIGHT_MAX)}%;height:${pct(SURF_HIGH, 0, HEIGHT_MAX) - pct(SURF_LOW, 0, HEIGHT_MAX)}%"></div><div class="needle" data-g="hn"></div></div>
        <div class="vlabels"><span>${touch ? '' : '[1] '}High · sinks</span><span>${touch ? '' : '[2] '}Lift</span><span>${touch ? '' : '[3] '}Low · draws</span></div></div>
        <div class="tag" data-g="ht"></div>
        <div class="k" style="margin-top:10px"><span>Flow</span></div><div class="bar"><div class="fill" data-g="fl"></div></div>
        <div class="k" style="margin-top:10px"><span>Cup</span><span data-g="cv"></span></div><div class="bar"><div class="zone" style="left:88%;width:12%"></div><div class="fill" data-g="cf"></div></div>
        <div class="k" style="margin-top:10px"><span>Jug</span></div><div class="bar"><div class="fill" data-g="mf" style="background:var(--paper)"></div></div></div>`;
    else if (mode === 'water')
      html = `<div class="gauge"><div class="k"><span>Hot water</span><span>then the shot</span></div><div class="v" data-g="v">0<small>% of cup</small></div>
        <div class="bar"><div class="zone" style="left:${LONG_BLACK_WATER[0] * 100}%;width:${(LONG_BLACK_WATER[1] - LONG_BLACK_WATER[0]) * 100}%"></div><div class="fill" data-g="f"></div></div>
        <div class="tag" data-g="t"></div></div>`;
    el.innerHTML = html;
    el.classList.toggle('hide', html === '');
    for (const k of Object.keys(g)) delete g[k];
    el.querySelectorAll<HTMLElement>('[data-g]').forEach((n) => (g[n.dataset.g as string] = n));
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

  return {
    update(mode, v) {
      if (mode !== gaugeMode) build(mode);
      const e = v.espresso;
      if (mode === 'grind') {
        setText('v', `${e.dose.toFixed(1)}<small>g</small>`);
        setStyle('n', 'left', pct(e.dose, 0, 26));
        if (e.dose > 21.5) setTag('t', 'Too much!', 'bad');
        else if (e.dose >= DOSE_TARGET[0] - 0.4 && e.dose <= DOSE_TARGET[1] + 0.4)
          setTag('t', 'Spot on', 'good');
        else setTag('t', e.grinding ? 'Grinding…' : '', '');
      }
      if (mode === 'shot' || mode === 'shotSteam') {
        const secs = Math.floor(e.shotTime);
        setText('sv', `${secs}<small>s · ${e.yield.toFixed(0)} g out</small>`);
        setStyle('sn', 'left', pct(e.shotTime, 0, 45));
        // Once the pump is off, say so (and how long it ran), not a lingering "Stop now!".
        const inBand = e.shotTime >= SHOT_TARGET[0] && e.shotTime <= SHOT_TARGET[1];
        if (e.done) setTag('st', `Stopped · ${secs} s`, inBand ? 'good' : 'bad');
        else if (!e.extracting) setTag('st', 'Ready', '');
        else if (e.shotTime < 4) setTag('st', 'Pre-infusion…', '');
        else if (e.shotTime < SHOT_TARGET[0]) setTag('st', 'Flowing', 'warn');
        else if (inBand) setTag('st', 'Stop now!', 'good');
        else setTag('st', 'Running long', 'bad');
      }
      if (mode === 'steam' || mode === 'shotSteam') {
        const s = v.steam;
        setText('mv', `${s.temp.toFixed(0)}<small>°C</small>`);
        setStyle('mtn', 'bottom', pct(s.temp, 0, 85));
        setStyle('mfn', 'left', Math.min(100, s.aeration * 100));
        if (s.done) setTag('mt', 'Valve closed', '');
        else if (s.zone === 'chirp') setTag('mt', 'Tss-tss · stretching', 'good');
        else if (s.zone === 'whirl') setTag('mt', 'Spinning · texturing', 'warn');
        else if (s.zone === 'screech') setTag('mt', 'Screeching!', 'bad');
        else setTag('mt', 'Hold to steam', '');
      }
      if (mode === 'pour') {
        const p = v.pitcher;
        setText('hv', `${p.height.toFixed(1)} cm`);
        setStyle('hn', 'bottom', pct(p.height, 0, HEIGHT_MAX));
        if (p.height <= SURF_LOW) setTag('ht', 'Low · foam floats', 'good');
        else if (p.height < SURF_HIGH) setTag('ht', 'Mixing · goes beige', 'warn');
        else setTag('ht', 'High · milk sinks', '');
        setStyle('fl', 'width', pitcherFlow(p) * 100);
        setText('cv', `${Math.round(v.pour.fill * 100)}%`);
        setStyle('cf', 'width', v.pour.fill * 100);
        setStyle('mf', 'width', (p.milk / PITCHER_MILK) * 100);
      } else if (mode === 'water') {
        const w = v.water ?? 0;
        setText('v', `${Math.round(w * 100)}<small>% of cup</small>`);
        setStyle('f', 'width', Math.min(100, w * 100));
        if (w > LONG_BLACK_WATER[1] + 0.04) setTag('t', 'Too much!', 'bad');
        else if (w >= LONG_BLACK_WATER[0]) setTag('t', 'Spot on · let go', 'good');
        else setTag('t', w > 0 ? 'Filling…' : 'Hold for hot water', '');
      }
    },
  };
}
