// Shared contract for the week-1 lanes: shift events (difficult and memorable customers). Event
// definitions are data plus two pure functions; the scheduler picks them with the seeded RNG only.

import type { Rng } from '../../core/rng';
import type { CustomerId } from '../../data/customers';

export type ShiftEventId =
  | 'JUST_COFFEE'
  | 'THE_USUAL'
  | 'CHANGE_MIND'
  | 'QUEUE_JUMP'
  | 'WRONG_MILK'
  | 'CALL_MANAGER'
  | 'THE_NAME'
  | 'RARE_BIRD';

export interface EventContext {
  /** 0-based across the week. */
  shiftIndex: number;
  secondsIntoService: number;
  queueLength: number;
  /** Customer at the register, if any. */
  customer: CustomerId | null;
  /** How well each regular knows the player (missing = never met). */
  affinity: Partial<Record<CustomerId, number>>;
  /** The drink this customer is reacting to really was wrong: the player's mistake, so any
   *  complaint about it is legitimate (never scored as a difficult customer). */
  playerMistake: boolean;
  /** The ONLY source of randomness. */
  rng: Rng;
}

export interface EventChoice {
  id: string;
  /** UI copy (English). */
  label: string;
  /** Patience cost, in line with the listening aids (LISTEN_COST in sim/listening.ts). */
  costSeconds: number;
}

export interface EventOutcome {
  /** For the affected customer. */
  patienceDelta: number;
  /** For everyone else waiting. */
  queuePatienceDelta?: number;
  satisfactionDelta: number;
  affinityDelta?: Partial<Record<CustomerId, number>>;
  wasteCents?: number;
  /** Must exist in the Gaz event dialogue table (tests enforce it). */
  gazLineKey?: string;
  reputationDelta?: number;
  /** Counts towards "difficult customers handled". Never true for a legitimate complaint. */
  difficult: boolean;
  /** The customer's service ends here (abuse), without counting as a walkout or a bad drink. */
  endsService?: boolean;
}

export interface ShiftEventDef {
  id: ShiftEventId;
  /** Relative pick weight. */
  weight: number;
  /** First shift index it may appear in. */
  minShift: number;
  cooldownShifts: number;
  canTrigger(ctx: EventContext): boolean;
  choices: EventChoice[];
  resolve(choiceId: string, ctx: EventContext): EventOutcome;
}
