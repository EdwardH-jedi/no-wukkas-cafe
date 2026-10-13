// Day 2, the morning rush: five scripted customers, one espresso station, Gaz watching.
// A DOM-free state machine like core/trial.ts: the view feeds RushInput every fixed step and
// drains `events` each frame. Movement is timed states (no navigation); the view interpolates.

import { CUSTOMERS, type CustomerDef, type CustomerId } from '../data/customers';
import { OWNER_LINES, RUSH_INTRO } from '../data/ownerLines';
import { spokenDuration } from '../data/voice';
import {
  addFrustration,
  createOwner,
  pickLine,
  type LineDef,
  type Mood,
  type OwnerState,
} from '../sim/owner';
import {
  DRINK_NAME,
  drainRate,
  evaluateServe,
  REJECT_PENALTY,
  summariseShift,
  type DrinkType,
  type ServeRecord,
  type ServeResult,
  type ShiftSummary,
} from '../sim/rush';
import {
  binDrink,
  createBarista,
  returnReady,
  startDrink,
  stepBarista,
  takeReady,
  type Barista,
  type BaristaEvent,
  type BaristaInput,
  type StationPhase,
} from './barista';
import { createRng, type Rng } from './rng';
import {
  canOffer,
  channelBusy,
  createChannel,
  offer,
  pending,
  updateChannel,
  type Channel,
  type Priority,
  type Utterance,
} from './speech';
import type { SfxId } from './trial';

export type RushPhase = 'intro' | 'service' | 'wrapup' | 'summary';

export type CustomerState =
  'outside' | 'entering' | 'queue' | 'register' | 'ordering' | 'waiting' | 'leaving' | 'gone';

/** Seconds to walk from the door to the queue, to step up to the register, and to leave. */
export const ENTER_TIME = 3.5;
export const STEP_UP_TIME = 1.4;
export const LEAVE_TIME = 4;

export interface RushCustomer {
  def: CustomerDef;
  state: CustomerState;
  stateTime: number;
  /** Seconds of patience left. */
  patience: number;
  registerAt: number | null;
  orderedAt: number | null;
  /** Ticket number once the order is taken (1, 2, ...). */
  ticket: number | null;
  rejected: number;
  outcome: 'served' | 'walkout' | null;
  result: ServeResult | null;
  /** Mood shown on their face after a serve or a walkout. */
  reaction: Mood | null;
  said: { impatient: boolean; angry: boolean };
  /** Times Gaz has nagged about this customer (capped so it never becomes a loop). */
  nags: { register: number; slow: number };
  orderLine: Utterance | null;
}

export type RushAction =
  | { type: 'start' }
  | { type: 'takeOrder' }
  | { type: 'make'; drink: DrinkType }
  | { type: 'serve'; customer: CustomerId }
  | { type: 'bin' }
  | { type: 'next' }
  | { type: 'restart' };

export interface RushInput extends Omit<BaristaInput, 'next'> {
  skip: boolean;
  action: RushAction | null;
}

export function emptyRushInput(): RushInput {
  return {
    holding: false,
    pressed: false,
    cupX: 0,
    cupY: -0.2,
    hasCup: false,
    jugDepth: 1.5,
    heightDelta: 0,
    heightPreset: null,
    skip: false,
    action: null,
  };
}

export type RushEvent =
  | { type: 'say'; line: Utterance }
  | { type: 'phase'; phase: RushPhase }
  | { type: 'station'; phase: StationPhase }
  | { type: 'sfx'; id: SfxId }
  | { type: 'ticket'; customer: CustomerId }
  | { type: 'served'; customer: CustomerId; result: ServeResult }
  | { type: 'rejected'; customer: CustomerId }
  | { type: 'walkout'; customer: CustomerId }
  | { type: 'summary'; summary: ShiftSummary };

export interface Rush {
  seed: number;
  rng: Rng;
  time: number;
  phase: RushPhase;
  phaseTime: number;
  /** Seconds since the doors opened. */
  serviceTime: number;
  owner: OwnerState;
  speech: Channel;
  barista: Barista;
  customers: RushCustomer[];
  records: ServeRecord[];
  summary: ShiftSummary | null;
  nextTicket: number;
  streak: { good: number; bad: number };
  /** Excellent serves so far (Gaz only praises every other one). */
  praised: number;
  flags: Record<string, boolean>;
  /** Gaz's last sentence: he never says the same thing twice running. */
  lastGazText: string;
  events: RushEvent[];
}

export function createRush(seed: number): Rush {
  return {
    seed,
    rng: createRng(seed ^ 0x2d2),
    time: 0,
    phase: 'intro',
    phaseTime: 0,
    serviceTime: 0,
    owner: createOwner(),
    speech: createChannel(),
    barista: createBarista(),
    customers: CUSTOMERS.map((def) => ({
      def,
      state: 'outside',
      stateTime: 0,
      patience: def.patience,
      registerAt: null,
      orderedAt: null,
      ticket: null,
      rejected: 0,
      outcome: null,
      result: null,
      reaction: null,
      said: { impatient: false, angry: false },
      nags: { register: 0, slow: 0 },
      orderLine: null,
    })),
    records: [],
    summary: null,
    nextTicket: 1,
    streak: { good: 0, bad: 0 },
    praised: 0,
    flags: {},
    lastGazText: '',
    events: [],
  };
}

/** Start the shift over. Gaz keeps his memory of what he's said. */
export function restartRush(r: Rush): void {
  const owner = r.owner;
  const rng = r.rng;
  const time = r.time;
  Object.assign(r, createRush(r.seed));
  r.rng = rng;
  r.time = time;
  r.owner = { ...owner, frustration: 0, lastAt: {} };
  r.events.push({ type: 'phase', phase: 'intro' });
  r.flags.intro = true;
  beginIntro(r);
}

// ---------------------------------------------------------------- speech helpers

const fill = (text: string, vars: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

function startSay(r: Rush): (u: Utterance) => void {
  return (u) => r.events.push({ type: 'say', line: u });
}

/** Gaz says a line for `key`, if the channel will take it. */
function gaz(r: Rush, key: string, priority: Priority, vars: Record<string, string> = {}): boolean {
  if (!canOffer(r.speech, priority, r.time)) return false;
  const picked = pickLine(r.owner, OWNER_LINES, key, r.rng, r.time, priority === 'live');
  if (!picked) return false;
  const text = fill(picked.text, vars);
  if (text === r.lastGazText) return false;
  r.lastGazText = text;
  const u: Utterance = {
    ...picked,
    text,
    duration: spokenDuration('gaz', text),
    speaker: 'gaz',
    priority,
  };
  return offer(r.speech, u, r.time, startSay(r));
}

function gazDef(r: Rush, key: string, def: LineDef): void {
  const u: Utterance = {
    speaker: 'gaz',
    key,
    text: def.text,
    mood: def.mood ?? 'neutral',
    gesture: def.gesture ?? 'none',
    duration: spokenDuration('gaz', def.text),
    priority: 'react',
  };
  offer(r.speech, u, r.time, startSay(r));
}

/** A customer speaks. Their lines are fixed (no randomness), so nothing repeats by chance. */
function customerSay(
  r: Rush,
  c: RushCustomer,
  key: string,
  text: string,
  mood: Mood,
  priority: Priority,
): Utterance | null {
  const u: Utterance = {
    speaker: c.def.id,
    key,
    text,
    mood,
    gesture: 'none',
    duration: spokenDuration(c.def.id, text),
    priority,
  };
  if (!canOffer(r.speech, priority, r.time, c.def.id)) return null;
  return offer(r.speech, u, r.time, startSay(r)) ? u : null;
}

const varsFor = (c: RushCustomer, drink?: DrinkType): Record<string, string> => ({
  name: c.def.callName,
  ordered: DRINK_NAME[c.def.order.type],
  drink: drink ? DRINK_NAME[drink] : '',
});

// ---------------------------------------------------------------- flow

function setPhase(r: Rush, phase: RushPhase): void {
  r.phase = phase;
  r.phaseTime = 0;
  r.events.push({ type: 'phase', phase });
}

function beginIntro(r: Rush): void {
  for (const [i, d] of RUSH_INTRO.entries()) gazDef(r, `rush.intro.${i}`, d);
}

function setState(c: RushCustomer, s: CustomerState): void {
  c.state = s;
  c.stateTime = 0;
}

const registerBusy = (r: Rush): boolean =>
  r.customers.some((c) => c.state === 'register' || c.state === 'ordering');

/** The customer at the register, if any (waiting for their order to be taken). */
export function atRegister(r: Rush): RushCustomer | null {
  return r.customers.find((c) => c.state === 'register') ?? null;
}

export function waitingCustomers(r: Rush): RushCustomer[] {
  return r.customers.filter((c) => c.state === 'waiting');
}

function walkout(r: Rush, c: RushCustomer): void {
  c.outcome = 'walkout';
  c.reaction = 'furious';
  setState(c, 'leaving');
  customerSay(r, c, `${c.def.id}.walkout`, c.def.lines.walkout, 'furious', 'react');
  gaz(r, 'rush.walkout', 'react', varsFor(c));
  addFrustration(r.owner, 1.2);
  r.streak.good = 0;
  r.events.push({ type: 'walkout', customer: c.def.id });
}

function stepCustomers(r: Rush, dt: number): void {
  for (const c of r.customers) {
    c.stateTime += dt;
    const max = c.def.patience;
    switch (c.state) {
      case 'outside':
        if (r.serviceTime >= c.def.arriveAt) setState(c, 'entering');
        break;
      case 'entering':
        if (c.stateTime >= ENTER_TIME) setState(c, 'queue');
        break;
      case 'queue': {
        c.patience -= 0.4 * dt;
        const first = r.customers.find((o) => o.state === 'queue');
        if (first === c && !registerBusy(r)) {
          setState(c, 'register');
          c.registerAt = r.time;
          if (!r.flags.firstCustomer) {
            r.flags.firstCustomer = true;
            gaz(r, 'rush.firstCustomer', 'react', varsFor(c));
          }
        }
        break;
      }
      case 'register':
        c.patience -= drainRate(true) * dt;
        if (c.stateTime > 7 + c.nags.register * 9 && c.nags.register < 2) {
          if (gaz(r, 'rush.registerNag', 'live', varsFor(c))) c.nags.register++;
        }
        break;
      case 'ordering':
        // Their order line carries the order: the ticket prints when they finish saying it.
        if (!c.orderLine || !pending(r.speech, c.orderLine)) {
          setState(c, 'waiting');
          c.orderedAt = r.time;
          c.ticket = r.nextTicket++;
          r.events.push({ type: 'ticket', customer: c.def.id });
          if (c === r.customers[r.customers.length - 1]) gaz(r, 'rush.lastOrder', 'react');
        }
        break;
      case 'waiting':
        c.patience -= drainRate(false) * dt;
        if (!c.said.impatient && c.patience < max * 0.5) {
          c.said.impatient = true;
          customerSay(r, c, `${c.def.id}.impatient`, c.def.lines.impatient, 'annoyed', 'react');
        }
        if (!c.said.angry && c.patience < max * 0.22) {
          c.said.angry = true;
          customerSay(r, c, `${c.def.id}.angry`, c.def.lines.angry, 'furious', 'react');
          if (c.def.id === 'karen') gaz(r, 'rush.karenManager', 'react');
        }
        if (c.patience < max * 0.45 && c.nags.slow < 1) {
          if (gaz(r, 'rush.slow', 'live', varsFor(c))) c.nags.slow++;
        }
        break;
      case 'leaving':
        if (c.stateTime >= LEAVE_TIME) setState(c, 'gone');
        break;
      case 'gone':
        break;
    }
    if ((c.state === 'queue' || c.state === 'register' || c.state === 'waiting') && c.patience <= 0)
      walkout(r, c);
  }
}

function serve(r: Rush, id: CustomerId): void {
  const b = r.barista;
  const c = r.customers.find((x) => x.def.id === id);
  if (!b.ready || !c || c.state !== 'waiting') return;
  const drink = takeReady(b, []);
  if (!drink) return;
  const result = evaluateServe(c.def.order, drink, {
    waited: r.time - (c.registerAt ?? r.time),
    patience: c.def.patience,
    tolerance: c.def.tolerance,
    tipCents: c.def.tipCents,
  });
  if (!result.accepted) {
    // They hand it back: it stays on the pass, still cooling, and their patience takes a hit.
    returnReady(b, drink);
    c.rejected++;
    c.patience = Math.max(1, c.patience - c.def.patience * REJECT_PENALTY);
    c.reaction = 'annoyed';
    customerSay(r, c, `${c.def.id}.rejected`, c.def.lines.rejected, 'annoyed', 'order');
    gaz(r, 'rush.wrongDrink', 'react', varsFor(c, drink.type));
    addFrustration(r.owner, 0.8);
    r.streak.good = 0;
    r.streak.bad++;
    if (r.streak.bad === 2) gaz(r, 'rush.streakBad', 'react');
    r.events.push({ type: 'rejected', customer: c.def.id });
    return;
  }
  c.outcome = 'served';
  c.result = result;
  setState(c, 'leaving');
  r.records.push({
    customer: c.def.id,
    accepted: true,
    correct: result.correct,
    waited: r.time - (c.registerAt ?? r.time),
    satisfaction: result.satisfaction,
    tipCents: result.tipCents,
  });
  r.events.push({ type: 'served', customer: c.def.id, result });
  r.events.push({ type: 'sfx', id: result.satisfaction >= 60 ? 'good' : 'bad' });

  // What the customer says: delighted, a specific grumble, or a shrug.
  const lines = c.def.lines;
  const grumble = result.complaints.map((k) => lines.complaint[k]).find((t) => t !== undefined);
  const good = result.satisfaction >= 75 && result.correct;
  c.reaction = good ? 'pleased' : result.satisfaction < 45 ? 'annoyed' : 'neutral';
  if (good) customerSay(r, c, `${c.def.id}.happy`, lines.happy, 'pleased', 'order');
  else if (grumble) customerSay(r, c, `${c.def.id}.complaint`, grumble, 'annoyed', 'order');
  else customerSay(r, c, `${c.def.id}.okay`, lines.okay, 'neutral', 'order');

  // Gaz: the specific miss first, then quality, then the occasional compliment.
  const v = varsFor(c, drink.type);
  if (result.complaints.includes('notHotEnough')) gaz(r, 'rush.notHotEnough', 'react', v);
  else if (result.complaints.includes('noHeart')) gaz(r, 'rush.noHeart', 'react', v);
  else if (result.complaints.includes('lukewarm')) gaz(r, 'rush.coldDrink', 'react', v);
  else if (result.satisfaction < 45) gaz(r, 'rush.poorServe', 'react', v);
  else if (result.satisfaction >= 85 && r.praised++ % 2 === 0) gaz(r, 'rush.goodServe', 'react', v);

  if (good) {
    r.streak.good++;
    r.streak.bad = 0;
    addFrustration(r.owner, -0.5);
    if (r.streak.good === 3) gaz(r, 'rush.streakGood', 'react');
  } else if (result.satisfaction < 50) {
    r.streak.good = 0;
    r.streak.bad++;
    addFrustration(r.owner, 0.6);
    if (r.streak.bad === 2) gaz(r, 'rush.streakBad', 'react');
  }
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
      if (a?.type === 'takeOrder') {
        const c = atRegister(r);
        if (c) {
          setState(c, 'ordering');
          c.orderLine = customerSay(
            r,
            c,
            `${c.def.id}.order`,
            c.def.lines.order,
            'neutral',
            'order',
          );
        }
      } else if (a?.type === 'make') startDrink(r.barista, a.drink, baristaOut);
      else if (a?.type === 'serve') serve(r, a.customer);
      else if (a?.type === 'bin') {
        if (binDrink(r.barista, baristaOut)) gaz(r, 'rush.binned', 'react');
      }
      // The station.
      Object.assign(baristaIn, input);
      baristaIn.next = a?.type === 'next';
      stepBarista(r.barista, baristaIn, dt, r.time, baristaOut);
      handleBarista(r, baristaOut);
      stepCustomers(r, dt);
      if (r.customers.every((c) => c.state === 'gone')) {
        setPhase(r, 'wrapup');
        const wasted = r.barista.binned + (r.barista.ready || r.barista.phase !== 'idle' ? 1 : 0);
        r.summary = summariseShift(r.records, r.customers.length, wasted);
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
