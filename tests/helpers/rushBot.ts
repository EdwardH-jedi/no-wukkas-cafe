// A headless Day 2 barista for listening tests: the same inputs the mouse/keyboard produce,
// decided from state. Listening decisions (what to ring up, which aids to use) are pluggable.

import { STEP } from '../../src/core/clock';
import {
  atCounter,
  atRegister,
  createRush,
  emptyRushInput,
  stepRush,
  waitingCustomers,
  type LineOverrides,
  type Rush,
  type RushAction,
  type RushCustomer,
  type RushEvent,
  type RushInput,
  type RushWeek,
} from '../../src/core/rush';
import { createRng, type Rng } from '../../src/core/rng';
import { CUSTOMERS, type CustomerId } from '../../src/data/customers';
import { controlsAt, type TrackKey } from '../../src/sim/latte/demo';
import { pitcherFlow } from '../../src/sim/latte/pitcher';
import {
  difficultyScore,
  normaliseOrder,
  type Difficulty,
  type OrderField,
} from '../../src/sim/listening';
import type { Milk, Order } from '../../src/sim/rush';

/** The bot's pour: Gaz's demo as it was in Session A (lift, let go, sweep within 0.3 s). It still
 *  pours a heart with the pull-through cap, bit for bit as before, so `npm run pace` stays
 *  comparable across changes to the taught pour (OWNER_DEMO now keeps pouring through the sweep). */
export const BOT_POUR: readonly TrackKey[] = [
  { t: 0.0, x: 0, y: -0.3, h: 7, hold: false },
  { t: 0.5, x: 0, y: -0.3, h: 7, hold: true },
  { t: 3.6, x: 0, y: -0.3, h: 6, hold: true },
  { t: 4.0, x: 0, y: -0.35, h: 0.7, hold: true },
  { t: 6.4, x: 0, y: -0.35, h: 0.7, hold: true },
  { t: 6.5, x: 0, y: -0.4, h: 2.6, hold: true },
  { t: 6.7, x: 0, y: 0.1, h: 3.0, hold: false },
  { t: 7.0, x: 0, y: 0.85, h: 3.6, hold: false },
  { t: 7.6, x: 0, y: 0.6, h: 8, hold: false },
];

/** How long a human takes to act, in game seconds. Zero everywhere is the old instant bot. */
export interface BotLatency {
  /** After the customer has finished talking, before ringing the order up. */
  decide: number;
  /** After the customer has finished talking, before each listening aid. */
  perAid: number;
  /** Before each station step: making, starting the grind, locking in, the pump, steaming, the
   *  pour, serving. */
  station: number;
}

/** A perfect player: no reaction time, the milk steamed while the shot runs, and the drink
 *  handed over ("Hand it over", Enter) the moment the pour's stream stops. */
export const BOT_IDEAL: Pick<ListenBot, 'latency' | 'overlap' | 'handOver'> = {
  latency: { decide: 0, perAid: 0, station: 0 },
  overlap: true,
  handOver: true,
};

/** Someone on their first shift, measured against a real first play-through (2026-10-14): slow
 *  to ring up, a beat between station steps, and one "Sorry, what was the drink?" for each of the
 *  first two customers. */
export const BOT_FIRST_TIMER: Pick<ListenBot, 'latency' | 'aids'> = {
  latency: { decide: 6, perAid: 5, station: 1.5 },
  aids: (c) =>
    CUSTOMERS.indexOf(c.def) < 2 ? [{ type: 'clarify', field: 'drink' } as RushAction] : [],
};

/** A heart that didn't come off: the white laid on the surface but never pulled through
 *  (art ≈ 0.16, no heart, the cup still full). */
export const BOT_POUR_BLOB: readonly TrackKey[] = [
  { t: 0.0, x: 0, y: -0.3, h: 7, hold: false },
  { t: 0.5, x: 0, y: -0.3, h: 7, hold: true },
  { t: 3.6, x: 0, y: -0.3, h: 6, hold: true },
  { t: 4.0, x: 0, y: -0.35, h: 0.7, hold: true },
  { t: 6.4, x: 0, y: -0.35, h: 0.7, hold: true },
  { t: 6.6, x: 0, y: -0.35, h: 8, hold: false },
];

/** How well someone listens, works the station and pours: the week's balance profiles
 *  (scripts/balance.ts). Guesses, not measurements, until playtests give real numbers. */
export interface Skill {
  latency: BotLatency;
  /** Steams a flat white's milk while its shot runs (two hands). */
  overlap: boolean;
  handOver: boolean;
  /** Chance of ringing up one said part of an order (the drink, an alternative milk, extra hot,
   *  a heart) wrong, for an order of average difficulty; harder orders scale it up. */
  mishear: number;
  /** Chance of noticing they aren't sure and asking (clarify) instead of guessing. */
  notice: number;
  /** Chance a flat white's pour comes off (otherwise a blob, BOT_POUR_BLOB). */
  art: number;
}

export type SkillName = 'novice' | 'average' | 'expert';

export const SKILLS: Record<SkillName, Skill> = {
  /** The first-timer's hands (BOT_FIRST_TIMER), one thing at a time, often unsure of the words. */
  novice: {
    latency: BOT_FIRST_TIMER.latency as BotLatency,
    overlap: false,
    handOver: false,
    mishear: 0.12,
    notice: 0.4,
    art: 0.3,
  },
  /** Has played the trial and Day 2: two hands most of the time, asks when unsure. */
  average: {
    latency: { decide: 3, perAid: 3, station: 0.8 },
    overlap: true,
    handOver: true,
    mishear: 0.06,
    notice: 0.5,
    art: 0.7,
  },
  /** Knows the slang and the station. */
  expert: {
    latency: { decide: 1, perAid: 1.5, station: 0.3 },
    overlap: true,
    handOver: true,
    mishear: 0.02,
    notice: 0.8,
    art: 0.95,
  },
};

const ALT_MILKS: readonly Milk[] = ['oat', 'soy', 'almond'];

/** What a skill hears for one customer: the fields it asks about, and the ticket it rings up. */
interface Heard {
  aids: RushAction[];
  order: Order;
}

function hear(skill: Skill, c: RushCustomer, rng: Rng): Heard {
  const truth = normaliseOrder(c.order);
  const line = c.line;
  // An order of average difficulty (score 4) hears at `mishear`; the easiest at a third of it.
  const hardness = (1 + difficultyScore(line)) / 5;
  const changed = 'change' in line || line.connected === 2;
  const said: OrderField[] = ['drink'];
  if (line.cues.milk) said.push('milk');
  if (line.cues.temp) said.push('temp');
  if (line.cues.heart) said.push('heart');
  const aids: RushAction[] = [];
  const order: Order = { ...truth };
  // "Just a coffee": nobody can guess that, so everyone asks.
  if (!line.cues.drink) aids.push({ type: 'clarify', field: 'drink' });
  for (const f of said) {
    if (f === 'drink' && !line.cues.drink) continue;
    const p = Math.min(0.9, skill.mishear * hardness * (f === 'drink' && changed ? 2 : 1));
    if (rng.next() >= p) continue;
    if (rng.next() < skill.notice) {
      aids.push({ type: 'clarify', field: f });
      continue;
    }
    if (f === 'drink')
      Object.assign(
        order,
        truth.type === 'flatWhite'
          ? { type: 'longBlack', milk: null, extraHot: false, heart: false }
          : { type: 'flatWhite', milk: 'full', extraHot: false, heart: false },
      );
    else if (f === 'milk') order.milk = rng.pick(ALT_MILKS.filter((m) => m !== truth.milk));
    else if (f === 'temp') order.extraHot = false;
    else order.heart = false;
  }
  return { aids, order: normaliseOrder(order) };
}

/** A bot that listens and pours with this skill. `seed` drives its mistakes (one seed, one run). */
export function skillBot(skill: Skill, seed: number): ListenBot {
  const rng = createRng(seed);
  const plans = new Map<string, Heard>();
  const plan = (c: RushCustomer): Heard => {
    let p = plans.get(c.key);
    if (!p) {
      p = hear(skill, c, rng);
      plans.set(c.key, p);
    }
    return p;
  };
  return {
    latency: skill.latency,
    overlap: skill.overlap,
    handOver: skill.handOver,
    aids: (c) => [...plan(c).aids],
    heard: (c) => plan(c).order,
    pour: () => (rng.next() < skill.art ? BOT_POUR : BOT_POUR_BLOB),
  };
}

export interface ListenBot {
  /** What to ring up for this customer (default: exactly what they said). */
  heard?: (c: RushCustomer) => Order;
  /** Listening aids to use, in order, before ringing up (one per step). */
  aids?: (c: RushCustomer) => RushAction[];
  /** Ring up as soon as the register opens, skipping the rest of the order line. */
  hurry?: boolean;
  /** Never take orders (everyone times out). */
  idle?: boolean;
  difficulty?: Difficulty;
  lines?: LineOverrides;
  /** Week mode (generated orders); default Day 2. */
  week?: RushWeek;
  /** Human reaction times (default: none). */
  latency?: BotLatency;
  /** Steam a flat white's milk while its shot runs (two hands), stopping the shot at 25.5 s. */
  overlap?: boolean;
  /** Hand the drink over as soon as the pour is done, instead of waiting for it to settle. */
  handOver?: boolean;
  /** The pour for this customer's drink, chosen when it is started (default BOT_POUR). */
  pour?: (c: RushCustomer) => readonly TrackKey[];
  seed?: number;
  maxSeconds?: number;
  /** Answer to a shift event on screen (week mode); default its first choice. */
  eventChoice?: (r: Rush) => string;
  /** Called after every step (assertions, tracing). */
  each?: (r: Rush) => void;
}

export interface Played {
  r: Rush;
  events: Array<RushEvent & { at: number }>;
  said: string[];
  /** Patience just before and just after each listening action, per customer. */
  patienceLog: Array<{ id: CustomerId; action: string; before: number; after: number }>;
}

interface Mem {
  target: RushCustomer | null;
  /** The pour for the drink being made. */
  track: readonly TrackKey[];
  step: number;
  aidsLeft: Map<string, RushAction[]>;
  /** When the customer at the counter last finished talking (null while they talk). */
  quietSince: number | null;
  /** The station step being waited on, and since when (for `latency.station`). */
  stepKey: string;
  stepSince: number;
}

const NO_LATENCY: BotLatency = { decide: 0, perAid: 0, station: 0 };

/** Register work: answer a shift event, take the order, use aids, ring up. Null when there's
 *  nothing to do. */
function registerAction(r: Rush, o: ListenBot, m: Mem, i: RushInput): RushAction | null {
  const ev = r.shiftEvents.current;
  if (ev) return { type: 'eventChoice', choice: o.eventChoice?.(r) ?? ev.def.choices[0]?.id ?? '' };
  if (atRegister(r)) return { type: 'takeOrder' };
  const c = atCounter(r);
  if (!c) return null;
  if (c.state === 'ordering') {
    if (o.hurry) i.skip = true; // click the subtitle: they've said enough
    m.quietSince = null;
    return null;
  }
  let left = m.aidsLeft.get(c.def.id);
  if (!left) {
    left = [...(o.aids?.(c) ?? [])];
    m.aidsLeft.set(c.def.id, left);
  }
  // A human waits for them to finish (an answer included), then takes a moment.
  const lat = o.latency ?? NO_LATENCY;
  const talking =
    r.speech.current?.speaker === c.def.id ||
    r.speech.queue.some((q) => q.listen === true && q.speaker === c.def.id);
  if (talking) m.quietSince = null;
  else m.quietSince ??= r.time;
  const after = (wait: number): boolean =>
    wait <= 0 || (m.quietSince !== null && r.time - m.quietSince >= wait);
  if (left.length > 0) {
    if (!after(lat.perAid)) return null;
    m.quietSince = null;
    return left.shift() ?? null;
  }
  if (!after(lat.decide)) return null;
  return { type: 'ringUp', order: o.heard ? o.heard(c) : c.order };
}

/** Wait `latency.station` before acting on a new step; `key` names the step. */
function stepReady(r: Rush, o: ListenBot, m: Mem, key: string): boolean {
  if (m.stepKey !== key) {
    m.stepKey = key;
    m.stepSince = r.time;
  }
  return r.time - m.stepSince >= (o.latency ?? NO_LATENCY).station;
}

/** Station work, like a player's hands: holding/aiming plus at most one action. */
function stationInput(r: Rush, o: ListenBot, m: Mem, i: RushInput): RushAction | null {
  const b = r.barista;
  const lag = (o.latency ?? NO_LATENCY).station;
  switch (b.phase) {
    case 'idle': {
      const queue = waitingCustomers(r).sort((a, z) => (a.ticket ?? 0) - (z.ticket ?? 0));
      const next = queue[0];
      if (!next?.heard || !stepReady(r, o, m, `make:${next.def.id}`)) return null;
      m.target = next;
      m.track = o.pour?.(next) ?? BOT_POUR;
      return { type: 'make', drink: next.heard.type, milk: next.heard.milk ?? 'full' };
    }
    case 'grind':
      if (b.espresso.dose < 19) i.holding = stepReady(r, o, m, 'grind');
      else if (stepReady(r, o, m, 'lock')) return { type: 'next' };
      return null;
    case 'water':
      i.holding = stepReady(r, o, m, 'water') && b.water < 0.65;
      return null;
    case 'shot':
    case 'shotSteam': {
      const e = b.espresso;
      if (!e.extracting && !e.done) i.pressed = stepReady(r, o, m, 'pump') && m.step % 10 === 0;
      if (o.overlap && b.drink === 'flatWhite' && (e.extracting || b.phase === 'shotSteam')) {
        // Hold to steam; let go for one step and click when the shot is in the window.
        const hot = m.target?.heard?.extraHot ? 71 : 60;
        const stop = e.extracting && e.shotTime >= 25.5;
        // (The click that started the pump is let go first, as a hand would.)
        i.holding = b.press.gate.armed && !stop && !b.steam.done && b.steam.temp < hot;
        i.pressed = stop;
        i.jugDepth = b.steam.aeration < 0.4 ? 0.2 : 2.5;
      } else if (e.extracting && e.shotTime >= 27) i.pressed = true;
      return null;
    }
    case 'steam': {
      const hot = m.target?.heard?.extraHot ? 71 : 60;
      i.holding = stepReady(r, o, m, 'steam') && !b.steam.done && b.steam.temp < hot;
      i.jugDepth = b.steam.aeration < 0.4 ? 0.2 : 2.5;
      return null;
    }
    case 'pour': {
      // The Session A demo pour (or the profile's), started `lag` late.
      if (b.phaseTime < lag) return null;
      const k = controlsAt(m.track, b.phaseTime - lag);
      i.hasCup = true;
      i.cupX = k.targetX;
      i.cupY = k.targetY;
      i.holding = k.holding;
      i.heightDelta = k.targetHeight - b.controls.targetHeight;
      // The demo's last move is at 7.6 s; after that, once the stream has stopped, it's done.
      const done = b.phaseTime - lag > 7.6 && pitcherFlow(b.pitcher) === 0 && b.pour.fill >= 0.88;
      return o.handOver && done ? { type: 'next' } : null;
    }
    case 'ready': {
      if (!stepReady(r, o, m, 'serve')) return null;
      const t = m.target;
      const d = b.ready;
      // Whoever it was for has gone, or the drink no longer matches their (corrected) ticket.
      const stale =
        !t ||
        t.state !== 'waiting' ||
        !t.heard ||
        !d ||
        d.type !== t.heard.type ||
        (d.type === 'flatWhite' && d.milkType !== t.heard.milk);
      return stale ? { type: 'bin' } : { type: 'serve', customer: t.key };
    }
    default:
      return null;
  }
}

function botInput(r: Rush, o: ListenBot, m: Mem): RushInput {
  const i = emptyRushInput();
  m.step++;
  if (r.phase === 'intro') {
    i.pressed = m.step % 20 === 0;
    return i;
  }
  if (r.phase !== 'service' || o.idle) return i;
  // Hands keep working (holding the steam, pouring) while the register is served; only one
  // button press per step, and the register goes first except mid-pour/steam.
  const station = stationInput(r, o, m, i);
  const busyHands = r.barista.phase === 'steam' || r.barista.phase === 'pour';
  const reg = busyHands && station ? null : registerAction(r, o, m, i);
  i.action = reg ?? station;
  return i;
}

export function playRush(o: ListenBot = {}): Played {
  const r = createRush(o.seed ?? 3, o.difficulty ?? 'normal', o.lines ?? {}, o.week ?? null);
  const m: Mem = {
    target: null,
    track: BOT_POUR,
    step: 0,
    aidsLeft: new Map(),
    quietSince: null,
    stepKey: '',
    stepSince: 0,
  };
  const events: Played['events'] = [];
  const said: string[] = [];
  const patienceLog: Played['patienceLog'] = [];
  const max = (o.maxSeconds ?? 900) / STEP;
  for (let n = 0; n < max; n++) {
    const input = botInput(r, o, m);
    const a = input.action;
    const c =
      a && (a.type === 'replay' || a.type === 'repeat' || a.type === 'clarify')
        ? atCounter(r)
        : null;
    const before = c?.patience ?? 0;
    stepRush(r, input, STEP);
    o.each?.(r);
    if (c && a) patienceLog.push({ id: c.def.id, action: a.type, before, after: c.patience });
    for (const e of r.events) {
      events.push({ ...e, at: r.time });
      if (e.type === 'say') said.push(e.line.key);
    }
    r.events.length = 0;
    if (r.phase === 'summary') break;
  }
  return { r, events, said, patienceLog };
}
