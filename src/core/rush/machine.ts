// Day 2, the morning rush: six scripted customers, one espresso station, Gaz watching.
// A DOM-free state machine like core/trial.ts: the view feeds RushInput every fixed step and
// drains `events` each frame. Movement is timed states (no navigation); the view interpolates.
// Listening: each customer says their order once; the player rings up what they heard (asking to
// replay, repeat or clarify if needed), and the ticket, right or wrong, is what gets made.
// This file is the shift itself (create, restart, phases, the fixed step); the parts it drives are
// in the sibling modules (see index.ts).

import { CUSTOMERS, customerDef, type CustomerDef, type CustomerId } from '../../data/customers';
import { RUSH_INTRO } from '../../data/ownerLines';
import { PATIENCE_SCALE } from '../../data/week';
import { normaliseOrder, pickOrder, type Difficulty, type OrderLine } from '../../sim/listening';
import { generateOrders } from '../../sim/listening/generate';
import { createOwner } from '../../sim/owner';
import { summariseShift } from '../../sim/rush';
import {
  binDrink,
  createBarista,
  startDrink,
  stepBarista,
  type BaristaEvent,
  type BaristaInput,
} from '../barista';
import { createRng, type Rng } from '../rng';
import { channelBusy, createChannel, updateChannel } from '../speech';
import { endlessArrival, endlessOver } from '../week/endless';
import { arrivalTimes, shiftDef, SHIFTS_PER_WEEK } from '../week/progress';
import { stepCustomers } from './customers';
import { chooseEvent, createShiftEvents, endShiftEvents, stepShiftEvents } from './events';
import { listenAction, ringUp, takeOrder } from './register';
import { serve } from './serve';
import { gaz, gazDef, startSay } from './speech';
import {
  absoluteShift,
  type CustomerState,
  type LineOverrides,
  type Rush,
  type RushCustomer,
  type RushInput,
  type RushPhase,
  type RushWeek,
} from './state';

/** Endless Rush lines this many customers up in advance: far more than anyone gets through
 *  before the third walk-out (arrivals reach one every 8 s). */
export const ENDLESS_BATCH = 40;
/** The generator's shift number for Endless orders (well clear of any week's shifts). */
const ENDLESS_ORDERS = 100;

interface Visit {
  key: string;
  def: CustomerDef;
  line: OrderLine;
  arriveAt: number;
  maxPatience: number;
}

function newCustomer(v: Visit): RushCustomer {
  return {
    key: v.key,
    def: v.def,
    arriveAt: v.arriveAt,
    maxPatience: v.maxPatience,
    line: v.line,
    order: normaliseOrder(v.line.order),
    heard: null,
    listen: { replays: 0, repeats: 0, clarified: [], questions: 0 },
    lastListen: null,
    state: 'outside' as CustomerState,
    stateTime: 0,
    patience: v.maxPatience,
    registerAt: null,
    orderedAt: null,
    ticket: null,
    rejected: 0,
    outcome: null,
    result: null,
    reaction: null,
    said: { impatient: false, angry: false },
    nags: { register: 0, slow: 0, pos: 0 },
    orderLine: null,
    eventSatisfaction: 0,
  };
}

/** A curated line fixed for this speaker (tests and debugging), else what was picked. */
function chosen(def: CustomerDef, picked: OrderLine, lines: LineOverrides): OrderLine {
  const forced = lines[def.id];
  const line = forced ? def.orders.find((o) => o.id === forced) : picked;
  if (!line) throw new Error(`${def.id} has no order line ${forced}`);
  return line;
}

/** Day 2: the six regulars, each picking one of their curated lines (in this RNG draw order). */
function day2Visits(difficulty: Difficulty, lines: LineOverrides, rng: Rng): Visit[] {
  return CUSTOMERS.map((def) => ({
    key: def.id,
    def,
    line: chosen(def, pickOrder(def.orders, difficulty, rng), lines),
    arriveAt: def.arriveAt,
    maxPatience: def.patience,
  }));
}

/** A week shift (or Endless): its size and pace from the week table, generated orders, patience
 *  scaled by difficulty. With more customers than regulars, the regulars come back (speakers
 *  cycle), and each later visit gets its own key. */
function weekVisits(
  seed: number,
  difficulty: Difficulty,
  lines: LineOverrides,
  week: RushWeek,
): Visit[] {
  const endless = week.endless === true;
  const d = shiftDef(week.shiftIndex);
  const specs = generateOrders(seed, {
    shiftIndex: endless ? ENDLESS_ORDERS : absoluteShift(week, SHIFTS_PER_WEEK),
    difficulty,
    count: endless ? ENDLESS_BATCH : d.customers,
    unlockedDrinks: week.unlockedDrinks,
    speakers: CUSTOMERS.map((c) => c.id),
  });
  const arrivals = endless ? specs.map((_, n) => endlessArrival(n)) : arrivalTimes(d);
  const scale = PATIENCE_SCALE[difficulty];
  const visits = new Map<CustomerId, number>();
  return specs.map((spec, i) => {
    const def = customerDef(spec.speaker);
    const n = (visits.get(def.id) ?? 0) + 1;
    visits.set(def.id, n);
    return {
      key: n === 1 ? def.id : `${def.id}#${n}`,
      def,
      line: chosen(def, spec, lines),
      arriveAt: arrivals[i] ?? endlessArrival(i),
      maxPatience: def.patience * scale,
    };
  });
}

export function createRush(
  seed: number,
  difficulty: Difficulty = 'normal',
  lines: LineOverrides = {},
  week: RushWeek | null = null,
): Rush {
  const rng = createRng(seed ^ 0x2d2);
  // Day 2 (no week) keeps its RNG draw order; week mode takes the generator's orders.
  const visits = week
    ? weekVisits(seed, difficulty, lines, week)
    : day2Visits(difficulty, lines, rng);
  return {
    seed,
    difficulty,
    lines,
    week,
    rng,
    time: 0,
    phase: 'intro',
    phaseTime: 0,
    serviceTime: 0,
    owner: createOwner(),
    speech: createChannel(),
    barista: createBarista(),
    customers: visits.map(newCustomer),
    records: [],
    listening: [],
    summary: null,
    nextTicket: 1,
    streak: { good: 0, bad: 0 },
    praised: 0,
    flags: {},
    shiftEvents: createShiftEvents(seed, week),
    lastGazText: '',
    events: [],
  };
}

/** Start the shift over. Gaz keeps his memory of what he's said. */
export function restartRush(r: Rush): void {
  const owner = r.owner;
  const rng = r.rng;
  const time = r.time;
  Object.assign(r, createRush(r.seed, r.difficulty, r.lines, r.week));
  r.rng = rng;
  r.time = time;
  r.owner = { ...owner, frustration: 0, lastAt: {} };
  r.events.push({ type: 'phase', phase: 'intro' });
  r.flags.intro = true;
  beginIntro(r);
}

// ---------------------------------------------------------------- flow

/** Everyone has been and gone; Endless Rush also ends at the third walk-out. */
function shiftOver(r: Rush): boolean {
  let gone = 0;
  let walkouts = 0;
  for (const c of r.customers) {
    if (c.state === 'gone') gone++;
    if (c.outcome === 'walkout') walkouts++;
  }
  return gone === r.customers.length || (r.week?.endless === true && endlessOver(walkouts));
}

function setPhase(r: Rush, phase: RushPhase): void {
  r.phase = phase;
  r.phaseTime = 0;
  r.events.push({ type: 'phase', phase });
}

function beginIntro(r: Rush): void {
  for (const [i, d] of RUSH_INTRO.entries()) gazDef(r, `rush.intro.${i}`, d);
}

function handleBarista(r: Rush, out: BaristaEvent[]): void {
  for (const e of out) {
    if (e.type === 'line') gaz(r, e.key, e.priority);
    else if (e.type === 'sfx') r.events.push({ type: 'sfx', id: e.id });
    else if (e.type === 'phase') r.events.push({ type: 'station', phase: e.phase });
  }
  out.length = 0;
}

const baristaOut: BaristaEvent[] = [];
const baristaIn: BaristaInput = {
  holding: false,
  pressed: false,
  cupX: 0,
  cupY: 0,
  hasCup: false,
  jugDepth: 1.5,
  heightDelta: 0,
  heightPreset: null,
  next: false,
};

export function stepRush(r: Rush, input: RushInput, dt: number): void {
  r.time += dt;
  r.phaseTime += dt;
  updateChannel(
    r.speech,
    r.time,
    input.skip || (r.phase === 'intro' && input.pressed),
    startSay(r),
    input.voiceHold ? dt : 0,
  );
  const a = input.action;
  if (a?.type === 'restart') {
    restartRush(r);
    return;
  }

  switch (r.phase) {
    case 'intro':
      if (r.phaseTime < 0.05 && !r.flags.intro) {
        r.flags.intro = true;
        beginIntro(r);
      }
      if (r.phaseTime > 0.3 && !channelBusy(r.speech)) setPhase(r, 'service');
      break;
    case 'service': {
      r.serviceTime += dt;
      // Player actions.
      if (a?.type === 'takeOrder') takeOrder(r);
      else if (a?.type === 'replay' || a?.type === 'repeat' || a?.type === 'clarify')
        listenAction(r, a);
      else if (a?.type === 'ringUp') ringUp(r, a.order);
      else if (a?.type === 'make') startDrink(r.barista, a.drink, baristaOut, a.milk);
      else if (a?.type === 'serve') serve(r, a.customer);
      else if (a?.type === 'bin') {
        if (binDrink(r.barista, baristaOut)) gaz(r, 'rush.binned', 'react');
      } else if (a?.type === 'eventChoice') chooseEvent(r, a.choice);
      // The station.
      Object.assign(baristaIn, input);
      baristaIn.next = a?.type === 'next';
      stepBarista(r.barista, baristaIn, dt, r.time, baristaOut);
      handleBarista(r, baristaOut);
      stepCustomers(r, dt, input.voiceHold === true);
      stepShiftEvents(r);
      if (shiftOver(r)) {
        endShiftEvents(r);
        setPhase(r, 'wrapup');
        const wasted = r.barista.binned + (r.barista.ready || r.barista.phase !== 'idle' ? 1 : 0);
        // Visits that ended in a drink or a walk-out. Anyone an event showed the door isn't held
        // against the shift, and Endless ends with people still waiting or yet to come.
        let counted = 0;
        for (const c of r.customers)
          if (c.outcome === 'served' || c.outcome === 'walkout') counted++;
        r.summary = summariseShift(r.records, counted, wasted);
        gaz(r, `rush.end.${r.summary.grade}`, 'react');
        if (r.barista.ready) gaz(r, 'rush.wasteLeft', 'react');
      }
      break;
    }
    case 'wrapup':
      if (r.phaseTime > 1 && !channelBusy(r.speech) && r.summary) {
        setPhase(r, 'summary');
        r.events.push({ type: 'summary', summary: r.summary });
      }
      break;
    case 'summary':
      break;
  }
}
