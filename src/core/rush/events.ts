// Shift events in the service loop (week mode only; docs/integration/T4-hook.md). The scheduler
// (sim/events/scheduler.ts) is asked at fixed moments, always with the shift's own event RNG so
// Day 2's order picks never move:
//   - once at the start, for the bin chicken (RARE_BIRD; core/rushIbis.ts runs the visit),
//   - when a customer steps up to the register, for their own events,
//   - every EVENT_POLL seconds of service, for someone pushing in (QUEUE_JUMP),
//   - when a drink is handed back for the wrong milk (WRONG_MILK, always the player's mistake).
// One event at a time. The player's choice applies the outcome to the customers, the shift's
// tallies and Gaz. While a customer's event waits for an answer, their order can't be taken.

import { createRng } from '../rng';
import { shiftDef, SHIFTS_PER_WEEK } from '../week/progress';
import type { EventContext, EventOutcome, ShiftEventDef } from '../../sim/contracts/events';
import { SHIFT_EVENTS } from '../../sim/events/defs';
import { pickEvents, startShiftLog } from '../../sim/events/scheduler';
import { atCounter } from './register';
import { forgetCustomer, gaz, varsFor } from './speech';
import {
  absoluteShift,
  atRegister,
  setState,
  type Rush,
  type RushCustomer,
  type RushWeek,
  type ShiftEvents,
} from './state';

/** Seconds of service between two "someone pushes in" checks. */
export const EVENT_POLL = 20;
const EVENT_SALT = 0x5e7e47;

const AT_REGISTER = SHIFT_EVENTS.filter((d) => d.id !== 'RARE_BIRD' && d.id !== 'WRONG_MILK');
const PUSHING_IN = SHIFT_EVENTS.filter((d) => d.id === 'QUEUE_JUMP');
const HANDED_BACK = SHIFT_EVENTS.filter((d) => d.id === 'WRONG_MILK');
const BIRD = SHIFT_EVENTS.filter((d) => d.id === 'RARE_BIRD');

const capOf = (week: RushWeek): number => shiftDef(week.shiftIndex).eventCap;
/** Events count shifts across the save, so cooldowns carry from one week into the next. */
const shiftNo = (week: RushWeek | null): number =>
  week ? absoluteShift(week, SHIFTS_PER_WEEK) : 0;

/** A shift's event state; with a week, also decides whether the bin chicken comes. */
export function createShiftEvents(seed: number, week: RushWeek | null): ShiftEvents {
  const shiftIndex = shiftNo(week);
  const s: ShiftEvents = {
    log: startShiftLog(shiftIndex, {
      shiftIndex: shiftIndex - 1,
      lastShift: { ...(week?.eventCooldowns ?? {}) },
      fired: [],
    }),
    rng: createRng((seed ^ EVENT_SALT) >>> 0),
    current: null,
    nextPoll: EVENT_POLL,
    bird: false,
    difficultHandled: 0,
    wasteCents: 0,
    reputation: 0,
    affinity: {},
    refused: 0,
  };
  if (week && !week.endless) {
    const ctx: EventContext = {
      shiftIndex,
      secondsIntoService: 0,
      queueLength: 0,
      customer: null,
      affinity: week.affinity ?? {},
      playerMistake: false,
      rng: s.rng,
    };
    s.bird = pickEvents(ctx, BIRD, s.log, false, { cap: capOf(week) }) !== null;
  }
  return s;
}

function context(r: Rush, c: RushCustomer | null, playerMistake: boolean): EventContext {
  return {
    shiftIndex: shiftNo(r.week),
    secondsIntoService: r.serviceTime,
    queueLength: r.customers.filter((q) => q.state === 'queue').length,
    customer: c?.def.id ?? null,
    affinity: r.week?.affinity ?? {},
    playerMistake,
    rng: r.shiftEvents.rng,
  };
}

/** An order is being said or rung up, or a listening line is still to be heard. */
function orderWindow(r: Rush): boolean {
  return (
    atCounter(r) !== null ||
    r.speech.current?.listen === true ||
    r.speech.queue.some((q) => q.listen === true)
  );
}

function ask(
  r: Rush,
  defs: readonly ShiftEventDef[],
  c: RushCustomer | null,
  playerMistake = false,
): void {
  const s = r.shiftEvents;
  // Endless Rush has no shift events: it's the rush and nothing else.
  if (!r.week || r.week.endless || s.current || r.phase !== 'service') return;
  const def = pickEvents(context(r, c, playerMistake), defs, s.log, orderWindow(r), {
    cap: capOf(r.week),
  });
  if (!def) return;
  s.current = { def, customer: c, playerMistake };
  r.events.push({ type: 'shiftEvent', event: def.id, customer: c?.key ?? null });
}

/** A customer has just stepped up to the register. */
export function eventsAtRegister(r: Rush, c: RushCustomer): void {
  ask(r, AT_REGISTER, c);
}

/** A drink was handed back for the wrong milk: a real miss, so any complaint is fair. */
export function eventHandedBack(r: Rush, c: RushCustomer): void {
  ask(r, HANDED_BACK, c, true);
}

/** Their order is held while their own event waits for an answer. */
export const eventHolds = (r: Rush, c: RushCustomer): boolean =>
  r.shiftEvents.current?.customer === c;

function drop(r: Rush): void {
  const cur = r.shiftEvents.current;
  if (!cur) return;
  r.shiftEvents.current = null;
  r.events.push({ type: 'shiftEventEnd', event: cur.def.id, choice: null });
}

/** One service step: drop an event whose customer has gone, and check for someone pushing in. */
export function stepShiftEvents(r: Rush): void {
  if (!r.week) return;
  const c = r.shiftEvents.current?.customer;
  if (c && (c.state === 'leaving' || c.state === 'gone')) drop(r);
  if (r.serviceTime >= r.shiftEvents.nextPoll) {
    r.shiftEvents.nextPoll += EVENT_POLL;
    ask(r, PUSHING_IN, atRegister(r));
  }
}

/** The shift is over: nothing is waiting for an answer any more. */
export const endShiftEvents = (r: Rush): void => drop(r);

function apply(r: Rush, c: RushCustomer | null, o: EventOutcome, gazLine: boolean): void {
  const s = r.shiftEvents;
  if (c) {
    c.patience = Math.min(c.maxPatience, c.patience + o.patienceDelta);
    c.eventSatisfaction += o.satisfactionDelta;
  }
  if (o.queuePatienceDelta)
    for (const q of r.customers)
      if (q !== c && q.state === 'queue')
        q.patience = Math.min(q.maxPatience, q.patience + o.queuePatienceDelta);
  s.wasteCents += o.wasteCents ?? 0;
  s.reputation += o.reputationDelta ?? 0;
  for (const [id, d] of Object.entries(o.affinityDelta ?? {}) as Array<
    [keyof ShiftEvents['affinity'], number]
  >)
    s.affinity[id] = (s.affinity[id] ?? 0) + d;
  if (o.difficult) s.difficultHandled++;
  if (gazLine && o.gazLineKey) gaz(r, o.gazLineKey, 'react', c ? varsFor(c) : {});
  if (o.endsService && c && c.state !== 'leaving' && c.state !== 'gone') {
    // Shown the door: they leave without a drink, and it isn't held against the shift.
    c.outcome = 'refused';
    c.reaction = 'annoyed';
    setState(c, 'leaving');
    forgetCustomer(r, c, false);
    s.refused++;
    r.events.push({ type: 'refused', customer: c.key });
  }
}

/** The player answered the event on screen. */
export function chooseEvent(r: Rush, choice: string): void {
  const cur = r.shiftEvents.current;
  if (!cur || !cur.def.choices.some((x) => x.id === choice)) return;
  const o = cur.def.resolve(choice, context(r, cur.customer, cur.playerMistake));
  r.shiftEvents.current = null;
  r.events.push({ type: 'shiftEventEnd', event: cur.def.id, choice });
  apply(r, cur.customer, o, true);
}

/** The bin chicken has gone (core/rushIbis.ts): shooed out or left to it. Gaz already has his
 *  own (recorded) bird lines, so the event's line isn't said as well. */
export function birdLeft(r: Rush, shooed: boolean): void {
  if (!r.week || !r.shiftEvents.bird) return;
  const def = BIRD[0];
  if (!def) return;
  apply(r, null, def.resolve(shooed ? 'shoo' : 'ignore', context(r, null, false)), false);
}
