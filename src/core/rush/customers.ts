// Day 2 customers through the shift: walking in, queueing, the register, waiting on the drink,
// patience, Gaz's nags, and walking out. Split out of core/rush.ts with no behaviour change.

import { addFrustration } from '../../sim/owner';
import { drainRate } from '../../sim/rush';
import { channelBusy, pending } from '../speech';
import { eventsAtRegister } from './events';
import { customerSay, forgetCustomer, gaz, varsFor } from './speech';
import {
  ENTER_TIME,
  inCafe,
  LEAVE_TIME,
  registerBusy,
  setState,
  type Rush,
  type RushCustomer,
} from './state';

/** Another visit by the same regular is still in the café. */
function visitUnderWay(r: Rush, c: RushCustomer): boolean {
  for (const o of r.customers) if (o !== c && o.def === c.def && inCafe(o)) return true;
  return false;
}

export function walkout(r: Rush, c: RushCustomer): void {
  c.outcome = 'walkout';
  c.reaction = 'furious';
  setState(c, 'leaving');
  forgetCustomer(r, c, true);
  customerSay(r, c, `${c.def.id}.walkout`, c.def.lines.walkout, 'furious', 'react');
  gaz(r, 'rush.walkout', 'react', varsFor(c));
  addFrustration(r.owner, 1.2);
  r.streak.good = 0;
  r.events.push({ type: 'walkout', customer: c.key });
}

export function stepCustomers(r: Rush, dt: number, voiceHold = false): void {
  for (const c of r.customers) {
    c.stateTime += dt;
    const max = c.maxPatience;
    switch (c.state) {
      case 'outside':
        // A regular coming back waits until their earlier visit has left: one of each at a time.
        if (r.serviceTime >= c.arriveAt && !visitUnderWay(r, c)) setState(c, 'entering');
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
          eventsAtRegister(r, c);
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
