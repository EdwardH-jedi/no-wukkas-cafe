// Runs the bin chicken (sim/ibis.ts) alongside a Day 2 shift: works out when the front door is
// open from the customers coming and going, and turns the bird's events into Gaz lines and
// sounds. Kept out of core/rush.ts; the ibis has its own RNG and state, owned by the caller.
// Gaz's lines here are 'react' (queued) or 'ambient' (only into silence): an order or a
// customer's answer always goes first, so the bird never talks over what the player must hear.

import { ENTER_TIME, type Rush, type RushCustomer } from './rush';
import { birdLeft } from './rush/events';
import { gaz, orderLineDue } from './rushSpeech';
import { stepIbis, type Ibis, type IbisEvent } from '../sim/ibis';

export interface IbisControls {
  shoo: boolean;
  noticed: boolean;
}

/** The front door is open while someone is walking in (first half of their entrance) or has
 *  just started leaving. */
export function doorOpen(r: Rush): boolean {
  return r.customers.some(
    (c) =>
      (c.state === 'entering' && c.stateTime < ENTER_TIME * 0.6) ||
      (c.state === 'leaving' && c.stateTime > 2.5),
  );
}

/** Someone is ordering or could start to any moment: at the register (the player takes the order
 *  whenever they like) or the counter (an answer, a repeat). */
const atTill = (c: RushCustomer): boolean =>
  c.state === 'register' || c.state === 'ordering' || c.state === 'deciding';

/** An order or answer could start within a honk's tail: someone is walking in or queueing (they
 *  step up to a free register at once), at the register or the counter, or a listening line is
 *  being said or queued. The bird keeps quiet meanwhile. */
export function orderSoon(r: Rush): boolean {
  return (
    orderLineDue(r) ||
    r.customers.some((c) => atTill(c) || c.state === 'entering' || c.state === 'queue')
  );
}

/** One fixed step. Returns the bird's events (for sounds and the view). */
export function stepRushIbis(r: Rush, b: Ibis, input: IbisControls, dt: number): IbisEvent[] {
  b.events.length = 0;
  if (r.phase !== 'service') return b.events;
  stepIbis(
    b,
    {
      serviceTime: r.serviceTime,
      doorOpen: doorOpen(r),
      // RARE_BIRD's rule (sim/events/defs.ts): it never walks in, honking, over an order.
      midOrder: orderLineDue(r),
      holdHonk: orderSoon(r),
      shoo: input.shoo,
      noticed: input.noticed,
    },
    dt,
  );
  for (const e of b.events) {
    if (e.type === 'enter') gaz(r, 'ibis.enter', 'react');
    else if (e.type === 'atBin') gaz(r, 'ibis.bin', 'ambient');
    else if (e.type === 'leave') {
      gaz(r, e.how === 'shooed' ? 'ibis.out' : 'ibis.ignored', 'react');
      birdLeft(r, e.how === 'shooed'); // week mode: RARE_BIRD's outcome (queue, reputation)
    }
  }
  return b.events;
}
