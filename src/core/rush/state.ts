// Day 2 rush state: the types every part of the machine shares, and the small helpers that only
// read or set that state. Split out of core/rush.ts with no behaviour change.

import type { CustomerDef, CustomerId } from '../../data/customers';
import type { Delivery } from '../../data/voice/ids';
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
