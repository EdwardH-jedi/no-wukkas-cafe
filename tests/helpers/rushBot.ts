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
} from '../../src/core/rush';
import type { CustomerId } from '../../src/data/customers';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';
import type { Difficulty } from '../../src/sim/listening';
import type { Order } from '../../src/sim/rush';

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
  seed?: number;
  maxSeconds?: number;
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
  step: number;
  aidsLeft: Map<string, RushAction[]>;
}

/** Register work: take the order, use aids, ring up. Null when there's nothing to do. */
function registerAction(r: Rush, o: ListenBot, m: Mem, i: RushInput): RushAction | null {
  if (atRegister(r)) return { type: 'takeOrder' };
  const c = atCounter(r);
  if (!c) return null;
  if (c.state === 'ordering') {
    if (o.hurry) i.skip = true; // click the subtitle: they've said enough
    return null;
  }
  let left = m.aidsLeft.get(c.def.id);
  if (!left) {
    left = [...(o.aids?.(c) ?? [])];
    m.aidsLeft.set(c.def.id, left);
  }
  return left.shift() ?? { type: 'ringUp', order: o.heard ? o.heard(c) : c.order };
}

/** Station work, like a player's hands: holding/aiming plus at most one action. */
function stationInput(r: Rush, m: Mem, i: RushInput): RushAction | null {
  const b = r.barista;
  switch (b.phase) {
    case 'idle': {
      const queue = waitingCustomers(r).sort((a, z) => (a.ticket ?? 0) - (z.ticket ?? 0));
      const next = queue[0];
      if (!next?.heard) return null;
      m.target = next;
      return { type: 'make', drink: next.heard.type, milk: next.heard.milk ?? 'full' };
    }
    case 'grind':
      if (b.espresso.dose < 19) i.holding = true;
      else return { type: 'next' };
      return null;
    case 'water':
      i.holding = b.water < 0.65;
      return null;
    case 'shot':
      if (!b.espresso.extracting && !b.espresso.done) i.pressed = m.step % 10 === 0;
      if (b.espresso.extracting && b.espresso.shotTime >= 27) i.pressed = true;
      return null;
    case 'steam': {
      const hot = m.target?.heard?.extraHot ? 71 : 60;
      i.holding = !b.steam.done && b.steam.temp < hot;
      i.jugDepth = b.steam.aeration < 0.4 ? 0.2 : 2.5;
      return null;
    }
    case 'pour': {
      const k = controlsAt(OWNER_DEMO, b.phaseTime);
      i.hasCup = true;
      i.cupX = k.targetX;
      i.cupY = k.targetY;
      i.holding = k.holding;
      i.heightDelta = k.targetHeight - b.controls.targetHeight;
      return null;
    }
    case 'ready': {
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
      return stale ? { type: 'bin' } : { type: 'serve', customer: t.def.id };
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
  const station = stationInput(r, m, i);
  const busyHands = r.barista.phase === 'steam' || r.barista.phase === 'pour';
  const reg = busyHands && station ? null : registerAction(r, o, m, i);
  i.action = reg ?? station;
  return i;
}

export function playRush(o: ListenBot = {}): Played {
  const r = createRush(o.seed ?? 3, o.difficulty ?? 'normal', o.lines ?? {});
  const m: Mem = { target: null, step: 0, aidsLeft: new Map() };
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
