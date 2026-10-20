// Station gauges (dose, shot timer, milk thermometer + foam, jug height/flow/cup, hot water).
// Shared by the Day 1 trial HUD, the Day 2 rush HUD and practice. Only touches the DOM when a value
// changes. Day 2's two hands ('shotSteam'): a strip saying what each hand is doing, then the shot
// timer and the milk gauge, stacked. Day 2's milk gauge names the carton in the jug, in words and
// an icon (never colour alone).

import { DOSE_TARGET, SHOT_TARGET, type EspressoState } from '../sim/espresso';
import { SURF_HIGH, SURF_LOW, type PourState } from '../sim/latte/field';
import { HEIGHT_MAX, PITCHER_MILK, pitcherFlow, type PitcherState } from '../sim/latte/pitcher';
import { EXTRA_HOT, LONG_BLACK_WATER, MILK_NAME, type Milk } from '../sim/rush';
import { AERATION_TARGET, TARGET_TEMP, type SteamState } from '../sim/steam';

export type GaugeMode = '' | 'grind' | 'shot' | 'shotSteam' | 'steam' | 'pour' | 'water';

export interface GaugeView {
  espresso: EspressoState;
  steam: SteamState;
  pitcher: PitcherState;
  pour: PourState;
  /** Long black hot water, cup volumes. */
  water?: number;
  /** Day 2: the carton in the jug for this flat white (from the ticket being made). */
  milkType?: Milk | null;
  /** Day 2: the ticket being made says extra hot, so the milk's target is 68–74 °C. */
  extraHot?: boolean;
}

/** The milk gauge's target zone: an extra-hot ticket's (what that drink is scored against),
 *  otherwise the flat white's. Day 1 and practice never ask for extra hot. */
export function milkTarget(extraHot: boolean | undefined): readonly [number, number] {
  return extraHot ? EXTRA_HOT : TARGET_TEMP;
}

/** The milk card's target as it reads: "55–65 °C", or "68–74 °C" on an extra-hot ticket. */
export function milkTargetLabel(extraHot: boolean | undefined): string {
  const [lo, hi] = milkTarget(extraHot);
  return `${lo}–${hi} °C`;
}

/** A shape for each carton, so the milk reads without colour (and without reading the word). */
export const MILK_ICON: Record<Milk, string> = {
  full: '🐄',
  oat: '🌾',
  soy: '🌱',
  almond: '🌰',
};

/** The milk gauge's label: "· 🌾 Oat" for the carton in the jug ('' on Day 1 and in practice). */
export function milkTag(m: Milk | null | undefined): string {
  if (!m) return '';
  const name = MILK_NAME[m];
  return ` · <i aria-hidden="true">${MILK_ICON[m]}</i> ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export type Hands = 'ready' | 'shot' | 'both' | 'milk';

/** Day 2's two hands while a flat white's shot runs: the pump not on yet, the shot running alone,
 *  the shot and the steam at once, or the shot done and the milk still to finish. */
export function handsState(e: EspressoState, s: SteamState): Hands {
  if (!e.extracting) return e.done ? 'milk' : 'ready';
  return s.valveOpen ? 'both' : 'shot';
}

export const HANDS_TEXT: Record<Hands, string> = {
  ready: 'Two hands: start the shot, then steam while it runs',
  shot: 'Shot running · steam the milk now',
  both: 'Both hands: shot running + steaming',
  milk: 'Shot done · now finish the milk',
};

export interface Gauges {
  /** `stoppable`: Day 2 two hands, the shot card's Stop button shows (the shot stops on Enter). */
  update(mode: GaugeMode, v: GaugeView, stoppable?: boolean): void;
}

const pct = (v: number, lo: number, hi: number): number =>
  Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

const shotCard = (
  touch: boolean,
): string => `<div class="gauge"><div class="k"><span>Shot timer</span><span>25–31 s</span></div><div class="v" data-g="sv">0<small>s</small></div>
        <div class="bar"><div class="zone" style="left:${pct(SHOT_TARGET[0], 0, 45)}%;width:${pct(SHOT_TARGET[1], 0, 45) - pct(SHOT_TARGET[0], 0, 45)}%"></div><div class="needle" data-g="sn"></div></div>
        <div class="tagRow"><div class="tag" data-g="st"></div><button type="button" class="gstop hide" data-g="ss">${touch ? 'Stop' : 'Stop · Enter'}</button></div></div>`;
const milkCard = (extraHot: boolean): string => {
  const [lo, hi] = milkTarget(extraHot);
  return `<div class="gauge"><div class="k"><span>Milk<span data-g="mk"></span></span><span>${milkTargetLabel(extraHot)}</span></div>
        <div class="vgauge"><div class="vbar"><div class="zone" style="bottom:${pct(lo, 0, 85)}%;height:${pct(hi, 0, 85) - pct(lo, 0, 85)}%"></div><div class="needle" data-g="mtn"></div></div>
        <div style="flex:1"><div class="v" data-g="mv">5<small>°C</small></div>
        <div class="k" style="margin-top:6px"><span>Foam</span><span>silky</span></div>
        <div class="bar"><div class="zone" style="left:${AERATION_TARGET[0] * 100}%;width:${(AERATION_TARGET[1] - AERATION_TARGET[0]) * 100}%"></div><div class="needle" data-g="mfn"></div></div>
        <div class="tag" data-g="mt"></div></div></div></div>`;
};

/** `onStop`: the shot card's Stop button was pressed (Day 2 two hands). */
export function createGauges(el: HTMLElement, touch: boolean, onStop?: () => void): Gauges {
  let gaugeMode: GaugeMode | null = null;
  const g: Record<string, HTMLElement> = {};
  // What the milk label and the two-hands strip show (null: rebuilt, write on the next update).
  let milkShown: Milk | '' | null = null;
  let handsShown: Hands | null = null;
  // The ticket's extra hot the cards were built for (the milk card's target follows it).
  let hotBuilt = false;
  const build = (mode: GaugeMode, hot: boolean): void => {
    gaugeMode = mode;
    hotBuilt = hot;
    milkShown = null;
    handsShown = null;
    let html = '';
    if (mode === 'grind')
      html = `<div class="gauge"><div class="k"><span>Dose</span><span>18–20 g</span></div><div class="v" data-g="v">0.0<small>g</small></div>
        <div class="bar"><div class="zone" style="left:${pct(DOSE_TARGET[0], 0, 26)}%;width:${pct(DOSE_TARGET[1], 0, 26) - pct(DOSE_TARGET[0], 0, 26)}%"></div><div class="needle" data-g="n"></div></div>
        <div class="tag" data-g="t"></div></div>`;
    else if (mode === 'shot') html = shotCard(touch);
    else if (mode === 'shotSteam')
      html = `<div class="hands" role="status" data-g="hands"></div>${shotCard(touch)}${milkCard(hot)}`;
    else if (mode === 'steam') html = milkCard(hot);
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
    if (g.ss) g.ss.onclick = () => onStop?.();
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
    update(mode, v, stoppable = false) {
      const hot = v.extraHot === true;
      if (mode !== gaugeMode || hot !== hotBuilt) build(mode, hot);
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
        const stop = g.ss;
        const show = stoppable && e.extracting;
        if (stop && stop.classList.contains('hide') === show) stop.classList.toggle('hide', !show);
      }
      if (mode === 'shotSteam') {
        const h = handsState(e, v.steam);
        if (h !== handsShown) {
          handsShown = h;
          setText('hands', HANDS_TEXT[h]);
        }
      }
      if (mode === 'steam' || mode === 'shotSteam') {
        const s = v.steam;
        const m = v.milkType ?? '';
        if (m !== milkShown) {
          milkShown = m;
          setText('mk', milkTag(v.milkType));
        }
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
