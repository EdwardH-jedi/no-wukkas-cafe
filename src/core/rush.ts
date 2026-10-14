// Day 2, the morning rush: six scripted customers, one espresso station, Gaz watching.
// A DOM-free state machine like core/trial.ts: the view feeds RushInput every fixed step and
// drains `events` each frame. Movement is timed states (no navigation); the view interpolates.
// Listening: each customer says their order once; the player rings up what they heard (asking to
// replay, repeat or clarify if needed), and the ticket, right or wrong, is what gets made.

import { CUSTOMERS, type CustomerDef, type CustomerId } from '../data/customers';
import { RUSH_INTRO } from '../data/ownerLines';
import type { Delivery } from '../data/voice/ids';
import {
  normaliseOrder,
  pickOrder,
  type Difficulty,
  type ListenRecord,
  type OrderField,
  type OrderLine,
} from '../sim/listening';
import { addFrustration, createOwner, type Mood, type OwnerState } from '../sim/owner';
import {
  drainRate,
  evaluateServe,
  REJECT_PENALTY,
  summariseShift,
  type DrinkType,
  type Milk,
  type Order,
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
import { atCounter, fixMisheardTicket, listenAction, ringUp } from './rushListening';
import {
  customerListen,
  customerSay,
  forgetCustomer,
  gaz,
  gazDef,
  startSay,
  varsFor,
} from './rushSpeech';
import {
  channelBusy,
  createChannel,
  pending,
  updateChannel,
  type Channel,
  type Utterance,
} from './speech';
import type { SfxId } from './trial';

export type RushPhase = 'intro' | 'service' | 'wrapup' | 'summary';

/** register: waiting for "Take order"; ordering: saying it; deciding: the player is ringing it up
 *  (and may ask them to replay, repeat or clarify); waiting: ticket on the rail. */
export type CustomerState =
  | 'outside'
  | 'entering'
  | 'queue'
  | 'register'
  | 'ordering'
  | 'deciding'
  | 'waiting'
  | 'leaving'
  | 'gone';

/** Seconds to walk from the door to the queue, to step up to the register, and to leave. */
export const ENTER_TIME = 3.5;
export const STEP_UP_TIME = 1.4;
export const LEAVE_TIME = 4;

export interface RushCustomer {
  def: CustomerDef;
  /** How they order today (picked for the difficulty), and what that means: the answer key. */
  line: OrderLine;
  order: Order;
  /** What the player rang up: the ticket. Null until rung up. */
  heard: Order | null;
  listen: { replays: number; repeats: number; clarified: OrderField[]; questions: number };
  /** The last thing they said for the player to hear (order, repeat or answer), for Replay. */
  lastListen: { text: string; delivery: Delivery; key: string } | null;
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
  nags: { register: number; slow: number; pos: number };
  orderLine: Utterance | null;
}

export type RushAction =
  | { type: 'start' }
  | { type: 'takeOrder' }
  /** Hear the customer's last line again (free but for the time it takes). */
  | { type: 'replay' }
  /** "Sorry, could you repeat that?": they say the order again, slower. */
  | { type: 'repeat' }
  | { type: 'clarify'; field: OrderField }
  /** Print the ticket with what the player heard. */
  | { type: 'ringUp'; order: Order }
  | { type: 'make'; drink: DrinkType; milk?: Milk }
  | { type: 'serve'; customer: CustomerId }
  | { type: 'bin' }
  | { type: 'next' }
  | { type: 'restart' };

export interface RushInput extends Omit<BaristaInput, 'next'> {
  skip: boolean;
  /** The current line's audio is still loading: hold its timer, and the patience of the
   *  customer it belongs to (see core/speech.ts). */
  voiceHold?: boolean;
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
  /** A misheard ticket corrected after the customer handed the drink back. */
  | { type: 'ticketFixed'; customer: CustomerId }
  /** The player asked a customer something (shown as the player's subtitle). */
  | { type: 'ask'; customer: CustomerId; text: string }
  | { type: 'served'; customer: CustomerId; result: ServeResult }
  | { type: 'rejected'; customer: CustomerId }
  | { type: 'walkout'; customer: CustomerId }
  | { type: 'summary'; summary: ShiftSummary };

export interface Rush {
  seed: number;
  difficulty: Difficulty;
  lines: LineOverrides;
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
  /** One per ticket rung up: what was said vs what was heard. */
  listening: ListenRecord[];
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

/** Fix which curated order a customer says (by line id) instead of picking by difficulty. For
 *  tests and debugging; kept across restarts. */
export type LineOverrides = Partial<Record<CustomerId, string>>;

export function createRush(
  seed: number,
  difficulty: Difficulty = 'normal',
  lines: LineOverrides = {},
): Rush {
  const rng = createRng(seed ^ 0x2d2);
  return {
    seed,
    difficulty,
    lines,
    rng,
    time: 0,
    phase: 'intro',
    phaseTime: 0,
    serviceTime: 0,
    owner: createOwner(),
    speech: createChannel(),
    barista: createBarista(),
    customers: CUSTOMERS.map((def) => {
      // Day 2 is the player's first shift.
      const picked = pickOrder(def.orders, difficulty, rng, true);
      const forced = lines[def.id];
      const line = forced ? def.orders.find((o) => o.id === forced) : picked;
      if (!line) throw new Error(`${def.id} has no order line ${forced}`);
      return {
        def,
        line,
        order: normaliseOrder(line.order),
        heard: null,
        listen: { replays: 0, repeats: 0, clarified: [], questions: 0 },
        lastListen: null,
        state: 'outside' as CustomerState,
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
        nags: { register: 0, slow: 0, pos: 0 },
        orderLine: null,
      };
    }),
    records: [],
    listening: [],
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
  Object.assign(r, createRush(r.seed, r.difficulty, r.lines));
  r.rng = rng;
  r.time = time;
  r.owner = { ...owner, frustration: 0, lastAt: {} };
  r.events.push({ type: 'phase', phase: 'intro' });
  r.flags.intro = true;
  beginIntro(r);
}

export { atCounter };

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
  r.customers.some(
    (c) => c.state === 'register' || c.state === 'ordering' || c.state === 'deciding',
  );

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
  forgetCustomer(r, c, true);
  customerSay(r, c, `${c.def.id}.walkout`, c.def.lines.walkout, 'furious', 'react');
  gaz(r, 'rush.walkout', 'react', varsFor(c));
  addFrustration(r.owner, 1.2);
  r.streak.good = 0;
  r.events.push({ type: 'walkout', customer: c.def.id });
}

function stepCustomers(r: Rush, dt: number, voiceHold = false): void {
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
        c.patience -= drainRate(true, r.barista.phase) * dt;
        if (c.stateTime > 7 + c.nags.register * 9 && c.nags.register < 2) {
          if (gaz(r, 'rush.registerNag', 'live', varsFor(c))) c.nags.register++;
        }
        break;
      case 'ordering':
        // Once they've said it, it's over to the player to ring it up. Their own order still
        // loading doesn't count against them.
        if (!(voiceHold && r.speech.current?.speaker === c.def.id))
          c.patience -= drainRate(false) * dt;
        if (!c.orderLine || !pending(r.speech, c.orderLine)) setState(c, 'deciding');
        break;
      case 'deciding':
        c.patience -= drainRate(false) * dt;
        if (c.stateTime > 14 && c.nags.pos < 1 && !channelBusy(r.speech)) {
          if (gaz(r, 'rush.posNag', 'live', varsFor(c))) c.nags.pos++;
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
        if (c.stateTime >= LEAVE_TIME) {
          setState(c, 'gone');
          forgetCustomer(r, c, false); // gone means silent
        }
        break;
      case 'gone':
        break;
    }
    if (
      (c.state === 'queue' ||
        c.state === 'register' ||
        c.state === 'ordering' ||
        c.state === 'deciding' ||
        c.state === 'waiting') &&
      c.patience <= 0
    )
      walkout(r, c);
  }
}

function serve(r: Rush, id: CustomerId): void {
  const b = r.barista;
  const c = r.customers.find((x) => x.def.id === id);
  if (!b.ready || !c || c.state !== 'waiting') return;
  const drink = takeReady(b, []);
  if (!drink) return;
  const result = evaluateServe(c.order, drink, {
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
    const wrongMilk = result.complaints.includes('wrongMilk');
    customerSay(
      r,
      c,
      wrongMilk ? `${c.def.id}.rejectedMilk` : `${c.def.id}.rejected`,
      wrongMilk ? c.def.lines.rejectedMilk : c.def.lines.rejected[c.order.type],
      'annoyed',
      'order',
    );
    // A listening mistake, the wrong milk (drink made for someone else), or the wrong drink.
    if (!fixMisheardTicket(r, c, drink, wrongMilk))
      gaz(r, wrongMilk ? 'rush.wrongMilk' : 'rush.wrongDrink', 'react', varsFor(c, drink.type));
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
  forgetCustomer(r, c, true);
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
      if (a?.type === 'takeOrder') {
        const c = atRegister(r);
        if (c) {
          setState(c, 'ordering');
          c.orderLine = customerListen(r, c, c.line.id, c.line.text);
        }
      } else if (a?.type === 'replay' || a?.type === 'repeat' || a?.type === 'clarify')
        listenAction(r, a);
      else if (a?.type === 'ringUp') ringUp(r, a.order);
      else if (a?.type === 'make') startDrink(r.barista, a.drink, baristaOut, a.milk);
      else if (a?.type === 'serve') serve(r, a.customer);
      else if (a?.type === 'bin') {
        if (binDrink(r.barista, baristaOut)) gaz(r, 'rush.binned', 'react');
      }
      // The station.
      Object.assign(baristaIn, input);
      baristaIn.next = a?.type === 'next';
      stepBarista(r.barista, baristaIn, dt, r.time, baristaOut);
      handleBarista(r, baristaOut);
      stepCustomers(r, dt, input.voiceHold === true);
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
