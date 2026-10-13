// Runs the bin chicken (sim/ibis.ts) alongside a Day 2 shift: works out when the front door is
// open from the customers coming and going, and turns the bird's events into Gaz lines and
// sounds. Kept out of core/rush.ts; the ibis has its own RNG and state, owned by the caller.
// Gaz's lines here are 'react' (queued) or 'ambient' (only into silence): an order or a
// customer's answer always goes first, so the bird never talks over what the player must hear.

import { ENTER_TIME, type Rush } from './rush';
import { gaz } from './rushSpeech';
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

/** One fixed step. Returns the bird's events (for sounds and the view). */
export function stepRushIbis(r: Rush, b: Ibis, input: IbisControls, dt: number): IbisEvent[] {
  b.events.length = 0;
  if (r.phase !== 'service') return b.events;
  stepIbis(
    b,
    { serviceTime: r.serviceTime, doorOpen: doorOpen(r), shoo: input.shoo, noticed: input.noticed },
    dt,
  );
  for (const e of b.events) {
    if (e.type === 'enter') gaz(r, 'ibis.enter', 'react');
    else if (e.type === 'atBin') gaz(r, 'ibis.bin', 'ambient');
    else if (e.type === 'leave') gaz(r, e.how === 'shooed' ? 'ibis.out' : 'ibis.ignored', 'react');
  }
  return b.events;
}
