// The espresso station during a shift: makes one drink at a time and parks it on the pass.
// Reuses the Day 1 sim modules as they are (grind, shot, steam, the pour simulation and the
// pattern scorer); only the order of steps and what happens to the finished drink differ.
//   flat white: grind → lock → shot → steam → pour → ready
//   long black: grind → lock → water → shot → ready   (water first keeps the crema)

import {
  createEspresso,
  scoreEspresso,
  SHOT_MAX,
  SHOT_TARGET,
  startShot,
  stepGrind,
  stepShot,
  stopShot,
} from '../sim/espresso';
import type { EspressoScore, EspressoState } from '../sim/espresso';
import { createPourLog, trackPour, type PourLog } from '../sim/latte/coach';
import { createPour, ESPRESSO_FILL, type PourState } from '../sim/latte/field';
import {
  applyPourInput,
  createPitcher,
  createPourGate,
  HEIGHT_START,
  pitcherFlow,
  stepPourFrame,
} from '../sim/latte/pitcher';
import type { PitcherControls, PitcherState, PourGate } from '../sim/latte/pitcher';
import { scorePattern } from '../sim/latte/score';
import type { MilkQuality } from '../sim/milk';
import { COOL_RATE, type DrinkType, type MadeDrink, type Milk } from '../sim/rush';
import {
  createSteam,
  milkQuality,
  SCALD_TEMP,
  scoreMilk,
  stepSteam,
  type MilkScore,
  type SteamState,
} from '../sim/steam';
import type { SfxId } from './trial';

export type StationPhase =
  'idle' | 'grind' | 'lock' | 'water' | 'shot' | 'steam' | 'pour' | 'ready';

/** Hot water, cup volumes per second while the tap is held. */
export const WATER_RATE = 0.12;
/** Gaz only warns about hot milk past this in a shift: extra-hot orders want 68–74 °C. */
export const SHIFT_HOT_WARNING = 75;
const LONG_BLACK_TEMP = 70;

export interface BaristaInput {
  holding: boolean;
  pressed: boolean;
  cupX: number;
  cupY: number;
  hasCup: boolean;
  jugDepth: number;
  heightDelta: number;
  heightPreset: number | null;
  /** Lock in / hand over. */
  next: boolean;
}

export type BaristaEvent =
  | { type: 'line'; key: string; priority: 'live' | 'react' }
  | { type: 'sfx'; id: SfxId }
  | { type: 'phase'; phase: StationPhase }
  | { type: 'ready' };

interface PourWatch {
  idle: number;
  lowEarly: number;
  tooHighSaid: boolean;
  drySaid: boolean;
}

export interface Barista {
  phase: StationPhase;
  phaseTime: number;
  drink: DrinkType | null;
  /** Carton in the jug for this flat white (from the ticket being made). */
  milkType: Milk | null;
  espresso: EspressoState;
  espressoScore: EspressoScore | null;
  steam: SteamState;
  milk: MilkQuality | null;
  milkScore: MilkScore | null;
  pour: PourState;
  pitcher: PitcherState;
  controls: PitcherControls;
  /** A button held from before the pour began doesn't pour until let go. */
  gate: PourGate;
  /** The four steps of the heart, live (lesson strip). */
  log: PourLog;
  /** Long black: hot water in the cup, cup volumes. */
  water: number;
  dispensing: boolean;
  /** The finished drink on the pass, if any. */
  ready: MadeDrink | null;
  /** Drinks binned this shift. */
  binned: number;
  watch: PourWatch;
  flags: Record<string, boolean>;
  mark: number;
}

export function createBarista(): Barista {
  const pitcher = createPitcher();
  return {
    phase: 'idle',
    phaseTime: 0,
    drink: null,
    milkType: null,
    espresso: createEspresso(),
    espressoScore: null,
    steam: createSteam(),
    milk: null,
    milkScore: null,
    pour: createPour(),
    pitcher,
    controls: {
      targetX: pitcher.x,
      targetY: pitcher.y,
      targetHeight: HEIGHT_START,
      holding: false,
    },
    gate: createPourGate(),
    log: createPourLog(),
    water: 0,
    dispensing: false,
    ready: null,
    binned: 0,
    watch: { idle: 0, lowEarly: 0, tooHighSaid: false, drySaid: false },
    flags: {},
    mark: -1,
  };
}

function go(b: Barista, phase: StationPhase, out: BaristaEvent[]): void {
  b.phase = phase;
  b.phaseTime = 0;
  b.mark = -1;
  out.push({ type: 'phase', phase });
  if (phase === 'lock') out.push({ type: 'sfx', id: 'tamp' });
  if (phase === 'steam') {
    b.steam = createSteam();
    b.flags = {};
  }
  if (phase === 'pour') {
    b.pour = createPour();
    b.pitcher = createPitcher();
    b.controls = {
      targetX: b.pitcher.x,
      targetY: b.pitcher.y,
      targetHeight: HEIGHT_START,
      holding: false,
    };
    b.gate = createPourGate();
    b.log = createPourLog();
    b.watch = { idle: 0, lowEarly: 0, tooHighSaid: false, drySaid: false };
  }
}

/** Start a new drink. Only from idle with nothing waiting on the pass. */
export function startDrink(
  b: Barista,
  type: DrinkType,
  out: BaristaEvent[],
  milk: Milk = 'full',
): boolean {
  if (b.phase !== 'idle' || b.ready) return false;
  b.drink = type;
  b.milkType = type === 'flatWhite' ? milk : null;
  b.espresso = createEspresso();
  b.espressoScore = null;
  b.milk = null;
  b.milkScore = null;
  b.water = 0;
  b.dispensing = false;
  b.pour = createPour();
  go(b, 'grind', out);
  return true;
}

/** Throw away whatever is being made, or the drink on the pass. */
export function binDrink(b: Barista, out: BaristaEvent[]): boolean {
  if (b.phase === 'idle' && !b.ready) return false;
  b.binned++;
  b.ready = null;
  b.drink = null;
  go(b, 'idle', out);
  return true;
}

/** Hand the drink on the pass to someone (the caller judges it). */
export function takeReady(b: Barista, out: BaristaEvent[]): MadeDrink | null {
  const d = b.ready;
  if (!d) return null;
  b.ready = null;
  b.drink = null;
  go(b, 'idle', out);
  return d;
}

/** Put a rejected drink back on the pass, still cooling. */
export function returnReady(b: Barista, d: MadeDrink): void {
  b.ready = d;
  b.drink = d.type;
  b.milkType = d.milkType;
  b.phase = 'ready';
}

function finishDrink(b: Barista, now: number, out: BaristaEvent[]): void {
  const esp = b.espressoScore ?? scoreEspresso(b.espresso);
  if (b.drink === 'longBlack') {
    const total = b.water + ESPRESSO_FILL;
    b.ready = {
      type: 'longBlack',
      milkType: null,
      espresso: esp,
      milk: null,
      pattern: null,
      fill: Math.min(1, total),
      spill: Math.max(0, total - 1),
      water: b.water,
      temp: LONG_BLACK_TEMP,
      madeAt: now,
    };
  } else {
    const milk = b.milk ?? milkQuality(b.steam);
    b.ready = {
      type: 'flatWhite',
      milkType: b.milkType ?? 'full',
      espresso: esp,
      milk: b.milkScore ?? scoreMilk(milk),
      pattern: scorePattern(b.pour.foam),
      fill: b.pour.fill,
      spill: b.pour.spill,
      water: 0,
      temp: milk.temp - 2,
      madeAt: now,
    };
  }
  out.push({ type: 'sfx', id: 'clink' });
  out.push({ type: 'ready' });
  go(b, 'ready', out);
}

export function stepBarista(
  b: Barista,
  input: BaristaInput,
  dt: number,
  now: number,
  out: BaristaEvent[],
): void {
  b.phaseTime += dt;
  const live = (key: string): void => void out.push({ type: 'line', key, priority: 'live' });
  const react = (key: string): void => void out.push({ type: 'line', key, priority: 'react' });
  const e = b.espresso;
  switch (b.phase) {
    case 'idle':
      break;
    case 'grind':
      stepGrind(e, input.holding, dt);
      if (e.grinding && e.dose > 21.5 && !b.flags.grindOver) {
        b.flags.grindOver = true;
        live('grind.over');
      }
      if (input.next && e.dose >= 8) {
        e.grinding = false;
        if (e.dose < 16.5) react('dose.light');
        else if (e.dose > 21.5) react('dose.heavy');
        go(b, 'lock', out);
      }
      break;
    case 'lock':
      if (b.phaseTime >= 0.75 && !b.flags.locked) {
        b.flags.locked = true;
        out.push({ type: 'sfx', id: 'lock' });
      }
      if (b.phaseTime >= 1.5) {
        b.flags.locked = false;
        go(b, b.drink === 'longBlack' ? 'water' : 'shot', out);
      }
      break;
    case 'water': {
      const wasOn = b.dispensing;
      b.dispensing = input.holding;
      if (b.dispensing) {
        b.water += WATER_RATE * dt;
        if (b.water + ESPRESSO_FILL > 1.02 && !b.flags.waterOver) {
          b.flags.waterOver = true;
          live('water.overflow');
        }
      }
      if (wasOn && !b.dispensing && b.water > 0.05) go(b, 'shot', out);
      break;
    }
    case 'shot':
      if (!e.done && input.pressed) {
        if (!e.extracting) startShot(e);
        else stopShot(e);
      }
      stepShot(e, dt);
      if (e.extracting && e.shotTime > SHOT_TARGET[1] + 2 && !b.flags.shotLong) {
        b.flags.shotLong = true;
        live('shot.long');
      }
      if (e.done && b.mark < 0) {
        b.mark = b.phaseTime;
        const s = scoreEspresso(e);
        b.espressoScore = s;
        if (s.faults.includes('shotLong') || e.shotTime >= SHOT_MAX) react('shot.over');
        else if (s.faults.includes('shotShort')) react('shot.short');
      }
      if (b.mark >= 0 && b.phaseTime - b.mark > 0.6) {
        if (b.drink === 'longBlack') finishDrink(b, now, out);
        else go(b, 'steam', out);
      }
      break;
    case 'steam': {
      const s = b.steam;
      if (s.done) {
        if (b.phaseTime - b.mark > 0.6) go(b, 'pour', out);
        break;
      }
      const wasOpen = s.valveOpen;
      stepSteam(s, input.holding, input.jugDepth, dt);
      if (s.valveOpen) {
        if (s.zone === 'screech') live('steam.screech');
        if (s.temp > 42 && s.aeration < 0.12 && !b.flags.noAir) {
          b.flags.noAir = true;
          live('steam.noAir');
        }
        if (s.aeration > 0.78 && !b.flags.tooMuch) {
          b.flags.tooMuch = true;
          live('steam.tooMuchAir');
        }
        if (s.temp >= SHIFT_HOT_WARNING && !b.flags.hot) {
          b.flags.hot = true;
          live('steam.hot');
        }
      }
      const released = wasOpen && !s.valveOpen;
      if (s.temp >= SCALD_TEMP || (released && s.temp >= 45)) {
        s.done = true;
        s.valveOpen = false;
        s.zone = 'off';
        b.mark = b.phaseTime;
        const milk = milkQuality(s);
        b.milk = milk;
        b.milkScore = scoreMilk(milk);
        const f = b.milkScore.faults;
        if (f.includes('scalded')) react('steam.scalded');
        else if (f.includes('flatMilk')) react('steam.flat');
        else if (f.includes('stiffMilk')) react('steam.stiff');
      } else if (released) live('steam.tooEarly');
      break;
    }
    case 'pour': {
      const c = b.controls;
      applyPourInput(c, b.gate, input);
      stepPourFrame(b.pour, b.pitcher, c, b.milk ?? milkQuality(b.steam), dt);
      trackPour(b.log, b.pour, b.pitcher);
      const p = b.pour;
      const w = b.watch;
      const flowing = pitcherFlow(b.pitcher) > 0;
      if (p.missing) live('pour.outside');
      else if (p.overflowing) live('pour.overflow');
      else if (p.lateHighTime > 1.0 && !w.tooHighSaid) {
        w.tooHighSaid = true;
        live('pour.tooHigh');
      }
      if (flowing && b.pitcher.height < 2 && p.fill < 0.4) {
        w.lowEarly += dt;
        if (w.lowEarly > 0.7) live('pour.earlyLow');
      }
      if (b.pitcher.milk <= 0 && !w.drySaid) {
        w.drySaid = true;
        live('pour.dry');
      }
      if (!flowing && p.poured > 0) w.idle += dt;
      else w.idle = 0;
      const full = p.fill >= 0.88 && w.idle >= 1.1;
      const dry = b.pitcher.milk <= 0 && w.idle >= 0.6;
      if (full || dry || (input.next && p.poured > 0) || b.phaseTime > 45) {
        c.holding = false;
        finishDrink(b, now, out);
      }
      break;
    }
    case 'ready':
      if (b.ready) b.ready.temp = Math.max(20, b.ready.temp - COOL_RATE * dt);
      break;
  }
}
