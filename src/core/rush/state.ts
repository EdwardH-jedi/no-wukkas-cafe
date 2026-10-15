// Day 2 rush state: the types every part of the machine shares, and the small helpers that only
// read or set that state. Split out of core/rush.ts with no behaviour change.

import type { CustomerDef, CustomerId } from '../../data/customers';
import type { Delivery } from '../../data/voice/ids';
import type { ShiftEventDef, ShiftEventId } from '../../sim/contracts/events';
import type { DrinkId } from '../../sim/contracts/ticket';
import type { EventLog } from '../../sim/events/scheduler';
import type { Difficulty, ListenRecord, OrderField, OrderLine } from '../../sim/listening';
import type { Mood, OwnerState } from '../../sim/owner';
import type {
  DrinkType,
  Milk,
  Order,
  ServeRecord,
  ServeResult,
  ShiftSummary,
} from '../../sim/rush';
import type { Barista, BaristaInput, StationPhase } from '../barista';
import type { Rng } from '../rng';
import type { Channel, Utterance } from '../speech';
import type { SfxId } from '../trial';

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
  /** 'refused': an event ended their service (not a walk-out, not a drink). */
  outcome: 'served' | 'walkout' | 'refused' | null;
  result: ServeResult | null;
  /** Mood shown on their face after a serve or a walkout. */
  reaction: Mood | null;
  said: { impatient: boolean; angry: boolean };
  /** Times Gaz has nagged about this customer (capped so it never becomes a loop). */
  nags: { register: number; slow: number; pos: number };
  orderLine: Utterance | null;
  /** Satisfaction from shift events, added to their serve (week mode; 0 on Day 2). */
  eventSatisfaction: number;
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
  | { type: 'restart' }
  /** The player's answer to the shift event on screen (an EventChoice id). */
  | { type: 'eventChoice'; choice: string };

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
  | { type: 'summary'; summary: ShiftSummary }
  /** Week mode only (never on Day 2): a shift event wants the player's choice, it was answered
   *  (or dropped, choice null, when its customer left), and an event ended someone's service. */
  | { type: 'shiftEvent'; event: ShiftEventId; customer: CustomerId | null }
  | { type: 'shiftEventEnd'; event: ShiftEventId; choice: string | null }
  | { type: 'refused'; customer: CustomerId };

/** Week mode: which shift of the week this is and what's on the menu. Orders come from the
 *  generator (sim/listening/generate.ts) instead of each customer's curated lines. */
export interface RushWeek {
  /** 0-based across the week. */
  shiftIndex: number;
  unlockedDrinks: readonly DrinkId[];
  /** Shift each event last fired in, from earlier shifts (cooldowns). */
  eventCooldowns?: Partial<Record<ShiftEventId, number>>;
  /** How well each regular knows the player (SaveV2.regulars). */
  affinity?: Partial<Record<CustomerId, number>>;
}

/** Shift events through one shift (core/rush/events.ts). Inert on Day 2. */
export interface ShiftEvents {
  /** Cooldown memory across shifts and this shift's picks. */
  log: EventLog;
  /** Its own RNG: drawing from Rush.rng would move every later Day 2 pick. */
  rng: Rng;
  /** The event waiting for the player's choice, and whose it is. */
  current: { def: ShiftEventDef; customer: RushCustomer | null; playerMistake: boolean } | null;
  /** Service time of the next "someone pushes in" check. */
  nextPoll: number;
  /** RARE_BIRD was booked for this shift: the bin chicken comes (core/rushIbis.ts runs it). */
  bird: boolean;
  /** Tallies from the outcomes, for the report and the save. */
  difficultHandled: number;
  wasteCents: number;
  reputation: number;
  affinity: Partial<Record<CustomerId, number>>;
  refused: number;
}

export interface Rush {
  seed: number;
  difficulty: Difficulty;
  lines: LineOverrides;
  /** Null = Day 2 exactly as it has always played (the trace test guards it). */
  week: RushWeek | null;
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
  shiftEvents: ShiftEvents;
  /** Gaz's last sentence: he never says the same thing twice running. */
  lastGazText: string;
  events: RushEvent[];
}

/** Fix which curated order a customer says (by line id) instead of picking by difficulty. For
 *  tests and debugging; kept across restarts. */
export type LineOverrides = Partial<Record<CustomerId, string>>;

export function setState(c: RushCustomer, s: CustomerState): void {
  c.state = s;
  c.stateTime = 0;
}

export const registerBusy = (r: Rush): boolean =>
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
