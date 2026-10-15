// Picks shift events at the moments the service loop asks (e.g. each time a customer reaches the
// register): by weight, from the shift each event unlocks in, with cooldowns across shifts, a
// per-shift cap (none on the first shift), a minimum gap between events, and never while a
// customer's order is being said. Deterministic: ctx.rng is the only randomness.

import type { EventContext, ShiftEventDef, ShiftEventId } from '../contracts/events';

export interface SchedulerOptions {
  /** Most events in one shift (always 0 on shift 0). The week table may set it per shift. */
  cap: number;
  /** Seconds of service between two events at least. */
  minGapSeconds: number;
  /** Chance a check fires an event when one is eligible. */
  chance: number;
}

export const SCHEDULER_DEFAULTS: SchedulerOptions = { cap: 2, minGapSeconds: 45, chance: 0.35 };

export interface EventLog {
  shiftIndex: number;
  /** Shift each event last fired in. Carried from shift to shift (and across saves). */
  lastShift: Partial<Record<ShiftEventId, number>>;
  /** This shift's events so far, in order. */
  fired: Array<{ id: ShiftEventId; at: number }>;
}

/** A fresh log for a shift, keeping the cooldown memory of the previous one. */
export function startShiftLog(shiftIndex: number, prev?: EventLog): EventLog {
  return { shiftIndex, lastShift: { ...(prev?.lastShift ?? {}) }, fired: [] };
}

export function capFor(shiftIndex: number, cap = SCHEDULER_DEFAULTS.cap): number {
  return shiftIndex === 0 ? 0 : cap;
}

/** Allowed this shift and right now (ignoring the cap, gap and order line). */
export function eligible(def: ShiftEventDef, ctx: EventContext, log: EventLog): boolean {
  if (def.minShift > ctx.shiftIndex) return false;
  const last = log.lastShift[def.id];
  if (last !== undefined && ctx.shiftIndex - last <= def.cooldownShifts) return false;
  return def.canTrigger(ctx);
}

/**
 * One check. `orderWindow` is true while a customer's order is being said or rung up: an event
 * never talks over it. Returns the event to start now (recorded in the log), or null.
 */
export function pickEvents(
  ctx: EventContext,
  defs: readonly ShiftEventDef[],
  log: EventLog,
  orderWindow: boolean,
  options: Partial<SchedulerOptions> = {},
): ShiftEventDef | null {
  const o = { ...SCHEDULER_DEFAULTS, ...options };
  if (orderWindow) return null;
  if (log.fired.length >= capFor(ctx.shiftIndex, o.cap)) return null;
  const lastAt = log.fired[log.fired.length - 1]?.at;
  if (lastAt !== undefined && ctx.secondsIntoService - lastAt < o.minGapSeconds) return null;
  const pool = defs.filter((d) => eligible(d, ctx, log));
  if (pool.length === 0 || ctx.rng.next() >= o.chance) return null;
  let roll = ctx.rng.next() * pool.reduce((s, d) => s + d.weight, 0);
  let pick = pool[pool.length - 1] as ShiftEventDef;
  for (const d of pool) {
    roll -= d.weight;
    if (roll < 0) {
      pick = d;
      break;
    }
  }
  log.fired.push({ id: pick.id, at: ctx.secondsIntoService });
  log.lastShift[pick.id] = ctx.shiftIndex;
  return pick;
}
