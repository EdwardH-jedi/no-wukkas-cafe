// The espresso station during a shift: makes one drink at a time and parks it on the pass.
// Reuses the Day 1 sim modules as they are (grind, shot, steam, the pour simulation and the
// pattern scorer); only the order of steps and what happens to the finished drink differ.
//   flat white: grind → lock → shot → steam → pour → ready
//               grind → lock → shot → shotSteam → (steam) → pour → ready   (two hands)
//   long black: grind → lock → water → shot → ready   (water first keeps the crema)
// Two hands: while a flat white's shot runs, holding the button steams the milk (shotSteam).
// Before that, a click stops the shot as usual; once steaming, Enter (or the shot card) does,
// because a click can't be told from grabbing the jug again. That overlap is where a busy
// shift's speed comes from.

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
import { BASE_STATION, type StationParams } from '../sim/shop';
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
  | 'idle'
  | 'grind'
  | 'lock'
  | 'water'
  | 'shot'
  /** A flat white's shot still running (or settling) while the milk is being steamed. */
  | 'shotSteam'
  | 'steam'
  | 'pour'
  | 'ready';

/** Hot water, cup volumes per second while the tap is held. */
export const WATER_RATE = 0.12;
/** Gaz only warns about hot milk past this in a shift: extra-hot orders want 68–74 °C. */
export const SHIFT_HOT_WARNING = 75;
const LONG_BLACK_TEMP = 70;
/** During a flat white's shot (before the milk goes on), a press let go within this is a click
 *  (stops the shot); held longer, it steams the milk. */
export const TAP_MAX = 0.25;
/** After two hands, seconds into the steam step a warm jug can be left before it counts as
 *  finished (on top of the 0.6 s the shot takes to settle). */
export const CARRIED_GRACE = 0.6;

export interface BaristaInput {
  holding: boolean;
  pressed: boolean;
  cupX: number;
  cupY: number;
  hasCup: boolean;
  jugDepth: number;
  heightDelta: number;
  heightPreset: number | null;
  /** Lock in / hand over / stop the shot while steaming. */
  next: boolean;
}

export type BaristaEvent =
  | { type: 'line'; key: string; priority: 'live' | 'react' }
  | { type: 'sfx'; id: SfxId }
  | { type: 'phase'; phase: StationPhase }
  /** The shot is over and scored. */
  | { type: 'shotDone' }
  /** The milk is finished and scored. */
  | { type: 'milkDone' }
  | { type: 'ready' };

/** The station button while a flat white's shot runs: click or hold. */
export interface Press {
  /** The press that started the pump must be let go before a hold can steam (the pour's
   *  arm-on-release gate, reused). */
  gate: PourGate;
  /** Seconds the current press has been held (0 while the button is up). */
  held: number;
}

const createPress = (): Press => ({ gate: createPourGate(), held: 0 });

/** One step of the button during the shot, before the milk goes on. A press let go within TAP_MAX
 *  is a click; a press and release inside one step (keyboard, the headless bots) is a click. Held
 *  past TAP_MAX, it steams. A second press while one is held is just more holding. */
export function stepPress(
  p: Press,
  input: Pick<BaristaInput, 'holding' | 'pressed'>,
  dt: number,
): { click: boolean; steam: boolean } {
  if (!input.holding) {
    const armed = p.gate.armed;
    p.gate.armed = true;
    const click = armed && ((p.held > 0 && p.held < TAP_MAX) || input.pressed);
    p.held = 0;
    return { click, steam: false };
  }
  if (!p.gate.armed) return { click: false, steam: false };
  p.held += dt;
  return { click: false, steam: p.held >= TAP_MAX };
}

/** One step of the button while steaming during the shot: holding steams, nothing held pauses
 *  the valve. No click timing here; the shot stops on `next` (Enter or the shot card) or a press
 *  and release inside one step. */
function stepHands(
  p: Press,
  input: Pick<BaristaInput, 'holding' | 'pressed' | 'next'>,
): { click: boolean; steam: boolean } {
  if (!input.holding) {
    p.gate.armed = true;
    p.held = 0;
    return { click: input.pressed || input.next, steam: false };
  }
  return { click: input.next, steam: p.gate.armed };
}

/** The game paused: forget any press in flight, so a release first seen on resume is never a
 *  click (the button may have been let go while the clock was stopped). */
export function cancelPress(b: Barista): void {
  b.press.held = 0;
}

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
  /** This flat white's ticket says extra hot: the milk gauge's target follows it (68–74 °C). */
  extraHot: boolean;
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
  /** Click or hold, while a flat white's shot runs. */
  press: Press;
  /** Flat whites whose milk was steamed during the shot (Gaz notices the first). */
  overlaps: number;
  watch: PourWatch;
  flags: Record<string, boolean>;
  mark: number;
  /** What the café's upgrades make the machine do (week mode; today's station otherwise). */
  station: StationParams;
}

export function createBarista(station: Readonly<StationParams> = BASE_STATION): Barista {
  const pitcher = createPitcher();
  return {
    phase: 'idle',
    phaseTime: 0,
    drink: null,
    milkType: null,
    extraHot: false,
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
    press: createPress(),
    overlaps: 0,
    watch: { idle: 0, lowEarly: 0, tooHighSaid: false, drySaid: false },
    flags: {},
    mark: -1,
    station: { ...station },
  };
}

/** `keepMilk`: from shotSteam to steam, the milk in the jug carries on. */
function go(b: Barista, phase: StationPhase, out: BaristaEvent[], keepMilk = false): void {
  b.phase = phase;
  b.phaseTime = 0;
  b.mark = -1;
  out.push({ type: 'phase', phase });
  if (phase === 'lock') out.push({ type: 'sfx', id: 'tamp' });
  if (phase === 'shotSteam') {
    // Fresh milk; the shot (and whether Gaz already called it long) carries on.
    b.steam = createSteam();
    b.flags = { shotLong: b.flags.shotLong === true };
  }
  if (phase === 'steam' && !keepMilk) {
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
  extraHot = false,
): boolean {
  if (b.phase !== 'idle' || b.ready) return false;
  b.drink = type;
  b.milkType = type === 'flatWhite' ? milk : null;
  b.extraHot = type === 'flatWhite' && extraHot;
  b.espresso = createEspresso();
  b.espressoScore = null;
  b.steam = createSteam(); // a cold jug: the milk gauge shows during a flat white's shot
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

type Say = (key: string) => void;

/** The milk is done: score it and let Gaz judge it. */
function finishMilk(b: Barista, react: Say, out: BaristaEvent[]): void {
  const s = b.steam;
  s.done = true;
  s.valveOpen = false;
  s.zone = 'off';
  const milk = milkQuality(s);
  b.milk = milk;
  b.milkScore = scoreMilk(milk);
  out.push({ type: 'milkDone' });
  const f = b.milkScore.faults;
  if (f.includes('scalded')) react('steam.scalded');
  else if (f.includes('flatMilk')) react('steam.flat');
  else if (f.includes('stiffMilk')) react('steam.stiff');
}

/** One step of steaming. Letting go past 45 °C finishes the milk, earlier is "too early";
 *  but while the shot is still running, letting go only pauses the valve (the player is
 *  clicking the shot off, or just waiting for it). */
function steamMilk(
  b: Barista,
  open: boolean,
  depth: number,
  dt: number,
  live: Say,
  react: Say,
  pauseOnly: boolean,
  out: BaristaEvent[],
): void {
  const s = b.steam;
  if (s.done) return;
  const wasOpen = s.valveOpen;
  stepSteam(s, open, depth, dt * b.station.steamSpeed);
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
  if (s.temp >= SCALD_TEMP || (released && s.temp >= 45 && !pauseOnly)) finishMilk(b, react, out);
  else if (released && !pauseOnly) live('steam.tooEarly');
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
      stepGrind(e, input.holding, dt * b.station.grindSpeed);
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
    case 'shotSteam': {
      const twoHands = b.drink === 'flatWhite';
      // Was the shot running as this step began? (Letting go of the jug then only pauses it.)
      let running = false;
      let steam = false;
      if (!e.extracting && !e.done) {
        if (input.pressed) {
          startShot(e);
          b.press = createPress(); // the click that started the pump has to be let go first
        }
      } else if (twoHands) {
        running = e.extracting;
        const p =
          b.phase === 'shotSteam' ? stepHands(b.press, input) : stepPress(b.press, input, dt);
        if (p.click && running) stopShot(e);
        steam = p.steam;
        if (steam && running && b.phase === 'shot') {
          go(b, 'shotSteam', out);
          if (b.overlaps++ === 0) live('shot.overlap');
        }
      } else if (e.extracting && input.pressed) stopShot(e);
      stepShot(e, dt);
      if (e.extracting && e.shotTime > SHOT_TARGET[1] + 2 && !b.flags.shotLong) {
        b.flags.shotLong = true;
        live('shot.long');
      }
      if (e.done && b.mark < 0) {
        if (b.phase === 'shotSteam' && e.shotTime >= SHOT_MAX) {
          // Left running to the machine's limit while steaming: that shot's for the bin.
          react('shot.over');
          binDrink(b, out);
          break;
        }
        b.mark = b.phaseTime;
        const s = scoreEspresso(e);
        b.espressoScore = s;
        out.push({ type: 'shotDone' });
        if (s.faults.includes('shotLong') || e.shotTime >= SHOT_MAX) react('shot.over');
        else if (s.faults.includes('shotShort')) react('shot.short');
      }
      // The milk after the shot, so a shot stopped on the step the milk finishes is judged first.
      if (b.phase === 'shotSteam')
        steamMilk(b, steam, input.jugDepth, dt, live, react, running, out);
      if (b.mark >= 0 && b.phaseTime - b.mark > 0.6) {
        if (b.drink === 'longBlack') finishDrink(b, now, out);
        else if (b.phase === 'shotSteam') {
          // The same jug carries on (or straight to the pour if it's finished).
          go(b, b.steam.done ? 'pour' : 'steam', out, true);
          b.flags.carried = true;
        } else go(b, 'steam', out);
      }
      break;
    }
    case 'steam': {
      const s = b.steam;
      if (s.done) {
        if (b.phaseTime - b.mark > 0.6) go(b, 'pour', out);
        break;
      }
      if (input.holding) b.flags.carried = false;
      // Milk steamed during the shot, then left alone once the shot was off: the player let go
      // of it deliberately, so (warm enough) it's finished. Grabbing it again carries on.
      if (b.flags.carried && b.phaseTime >= CARRIED_GRACE && s.temp >= 45)
        finishMilk(b, react, out);
      else steamMilk(b, input.holding, input.jugDepth, dt, live, react, false, out);
      if (s.done) b.mark = b.phaseTime;
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
