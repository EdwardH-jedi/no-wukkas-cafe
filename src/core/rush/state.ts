// Day 2 rush state: the types every part of the machine shares, and the small helpers that only
// read or set that state. Split out of core/rush.ts with no behaviour change.

import type { CustomerDef, CustomerId } from '../../data/customers';
import type { Delivery } from '../../data/voice/ids';
import type { ShiftEventDef, ShiftEventId } from '../../sim/contracts/events';
import type { DrinkId } from '../../sim/contracts/ticket';
import type { VoiceRef } from '../../sim/contracts/voice';
import type { StationParams } from '../../sim/shop';
import type { EventLog } from '../../sim/events/scheduler';
import type { Difficulty, ListenRecord, OrderField, OrderLine } from '../../sim/listening';
import type { ScoreEntry } from '../../sim/scores';
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

/** An order line as a customer holds it: a generated one (an OrderSpec) also says how it is
 *  voiced. */
export type VoicedLine = OrderLine & { voice?: VoiceRef };

export interface RushCustomer {
  /** Who this visit is: the speaker's id on Day 2 and for a first visit; `${id}#2` and on when a
   *  regular comes back later in a longer shift. Actions and events name customers by it. */
  key: string;
  def: CustomerDef;
  /** Service seconds they walk in (a returning regular waits until their earlier visit has left). */
  arriveAt: number;
  /** Their full patience in seconds (the customer's own, scaled by difficulty in week mode). */
  maxPatience: number;
  /** How they order today (picked for the difficulty), and what that means: the answer key. */
  line: VoicedLine;
  order: Order;
  /** What the player rang up: the ticket. Null until rung up. */
  heard: Order | null;
  listen: { replays: number; repeats: number; clarified: OrderField[]; questions: number };
  /** The last thing they said for the player to hear (order, repeat or answer), for Replay. */
  lastListen: { text: string; delivery: Delivery; key: string; voice?: VoiceRef } | null;
  state: CustomerState;
  stateTime: number;
  /** Seconds of patience left. */
  patience: number;
  registerAt: number | null;
  /** Game time the player pressed "Take order" (telemetry: how long they stood at the register). */
  takenAt: number | null;
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
  /** Make a ticket's drink: its carton, and whether it says extra hot (the milk gauge's target). */
  | { type: 'make'; drink: DrinkType; milk?: Milk; extraHot?: boolean }
  | { type: 'serve'; customer: string }
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
  | { type: 'ticket'; customer: string }
  /** A misheard ticket corrected after the customer handed the drink back. */
  | { type: 'ticketFixed'; customer: string }
  /** The player asked a customer something (shown as the player's subtitle). */
  | { type: 'ask'; customer: string; text: string }
  | { type: 'served'; customer: string; result: ServeResult }
  | { type: 'rejected'; customer: string }
  | { type: 'walkout'; customer: string }
  /** Out the door: nothing of theirs may be heard now, a line still loading or playing included. */
  | { type: 'gone'; customer: string }
  | { type: 'summary'; summary: ShiftSummary }
  /** Week mode only (never on Day 2): a shift event wants the player's choice, it was answered
   *  (or dropped, choice null, when its customer left), and an event ended someone's service. */
  | { type: 'shiftEvent'; event: ShiftEventId; customer: string | null }
  | { type: 'shiftEventEnd'; event: ShiftEventId; choice: string | null }
  | { type: 'refused'; customer: string };

/** Week mode: which shift of the week this is and what's on the menu. Orders come from the
 *  generator (sim/listening/generate.ts) instead of each customer's curated lines. */
export interface RushWeek {
  /** 1-based week of the save (default 1). */
  week?: number;
  /** 0-based within the week: the row of the week table (data/week.ts). */
  shiftIndex: number;
  /** Endless Rush: the same loop with arrivals that keep coming until the third walk-out, no
   *  shift events, and a report that isn't a week shift. */
  endless?: boolean;
  unlockedDrinks: readonly DrinkId[];
  /** Shift each event last fired in, from earlier shifts (cooldowns; absolute shift numbers). */
  eventCooldowns?: Partial<Record<ShiftEventId, number>>;
  /** The event that came last in earlier shifts: never the first one again. */
  lastEvent?: ShiftEventId | null;
  /** How well each regular knows the player (Save.regulars). */
  affinity?: Partial<Record<CustomerId, number>>;
  /** This shift's best on the Scores board before it (app/weekWiring.ts), for Gaz's "new best";
   *  null or absent on a first play (nothing to beat). */
  best?: ScoreEntry | null;
  /** The station the café's upgrades give (Save.upgrades); today's station without. */
  station?: StationParams;
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
  /** Drinks each regular took away this shift, right or not (RegularMemory.visits). */
  visits: Partial<Record<CustomerId, number>>;
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

/** Shifts since the save began (0-based): what orders and event cooldowns count in, so week 2's
 *  Monday doesn't replay week 1's. */
export const absoluteShift = (w: RushWeek, perWeek: number): number =>
  ((w.week ?? 1) - 1) * perWeek + w.shiftIndex;

/** Someone whose visit is under way (walked in, not yet gone). */
export const inCafe = (c: RushCustomer): boolean => c.state !== 'outside' && c.state !== 'gone';

/** The customer with this key, if any. */
export const customerByKey = (r: Rush, key: string): RushCustomer | null =>
  r.customers.find((c) => c.key === key) ?? null;

/** The visit of this speaker that is under way, if any (at most one: see stepCustomers). */
export const presentSpeaker = (r: Rush, id: string): RushCustomer | null =>
  r.customers.find((c) => c.def.id === id && inCafe(c)) ?? null;

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
