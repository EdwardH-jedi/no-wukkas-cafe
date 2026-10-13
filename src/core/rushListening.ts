// Day 2 listening at the register: the aids (replay, "could you repeat that?", clarifying
// questions), printing the ticket with what the player heard, and setting a misheard ticket
// straight when the drink made from it is handed back. Pure state changes on the Rush; the
// rules themselves (answer keys, costs) live in sim/listening.ts.

import type { Delivery } from '../data/voice/ids';
import {
  answerFor,
  CLARIFY_QUESTION,
  LISTEN_COST,
  MAX_REPEATS,
  normaliseOrder,
  orderTier,
  wrongFields,
  type OrderField,
} from '../sim/listening';
import type { MadeDrink, Order } from '../sim/rush';
import type { Rush, RushCustomer } from './rush';
import { customerListen, customerSay, gaz, listenQueued, varsFor } from './rushSpeech';

/** The customer whose order is being taken (speaking or being rung up), if any. */
export function atCounter(r: Rush): RushCustomer | null {
  return r.customers.find((c) => c.state === 'ordering' || c.state === 'deciding') ?? null;
}

/** Replay, "could you repeat that?" and clarifying questions, for the customer at the counter.
 *  Each costs them a little patience: listening aids are there, but they aren't free. */
export function listenAction(
  r: Rush,
  a: { type: 'replay' } | { type: 'repeat' } | { type: 'clarify'; field: OrderField },
): void {
  const c = atCounter(r);
  if (!c) return;
  if (a.type === 'replay') {
    // Something of theirs is already waiting to be said: that's what they'll hear next, so a
    // replay request adds nothing (no line, no cost, not counted).
    if (listenQueued(r, c)) return;
    const l = c.lastListen ?? { text: c.line.text, delivery: 'normal' as Delivery, key: c.line.id };
    c.listen.replays++;
    c.patience -= LISTEN_COST.replay;
    const u = customerListen(r, c, l.key, l.text, l.delivery);
    if (c.state === 'ordering') c.orderLine = u;
  } else if (a.type === 'repeat') {
    if (c.listen.repeats >= MAX_REPEATS) return;
    c.listen.repeats++;
    c.patience -= LISTEN_COST.repeat;
    r.events.push({ type: 'ask', customer: c.def.id, text: 'Sorry, could you repeat that?' });
    const u = customerListen(r, c, `${c.line.id}.slow`, c.line.text, 'slow');
    if (c.state === 'ordering') c.orderLine = u;
    // Queued after their repeat ('live' would never get a word in while they're talking).
    if (c.listen.repeats === MAX_REPEATS) gaz(r, 'rush.askedTwice', 'react', varsFor(c));
  } else {
    if (!c.listen.clarified.includes(a.field)) c.listen.clarified.push(a.field);
    c.listen.questions++;
    c.patience -= LISTEN_COST.clarify;
    r.events.push({ type: 'ask', customer: c.def.id, text: CLARIFY_QUESTION[a.field] });
    const text = answerFor(c.def.answers, c.order, a.field);
    const u = customerListen(r, c, `${c.def.id}.answer.${a.field}`, text);
    if (c.state === 'ordering') c.orderLine = u;
  }
}

/** Print the ticket with what the player heard. Right or wrong, the ticket is what gets made. */
export function ringUp(r: Rush, heard: Order): void {
  const c = atCounter(r);
  if (!c || c.state !== 'deciding') return;
  c.heard = normaliseOrder(heard);
  const wrong = wrongFields(c.heard, c.order);
  r.listening.push({
    customer: c.def.id,
    lineId: c.line.id,
    tier: orderTier(c.line),
    truth: c.order,
    heard: c.heard,
    wrong,
    replays: c.listen.replays,
    repeats: c.listen.repeats,
    clarified: [...c.listen.clarified],
    questions: c.listen.questions,
  });
  c.state = 'waiting';
  c.stateTime = 0;
  c.orderedAt = r.time;
  c.ticket = r.nextTicket++;
  r.events.push({ type: 'ticket', customer: c.def.id });
  if (c === r.customers[r.customers.length - 1]) gaz(r, 'rush.lastOrder', 'react');
}

/**
 * A handed-back drink that matches its ticket means the ticket was wrong: a listening mistake.
 * They set you straight at the pass (naming the milk if that was it) and the ticket is
 * corrected; the cost was the wasted drink, the time and their patience. Returns false when the
 * drink simply didn't match the ticket (a making mistake, not a listening one).
 */
export function fixMisheardTicket(
  r: Rush,
  c: RushCustomer,
  drink: MadeDrink,
  wrongMilk: boolean,
): boolean {
  const t = c.heard;
  if (!t) return false;
  const matchesTicket =
    drink.type === t.type && (drink.type !== 'flatWhite' || drink.milkType === (t.milk ?? 'full'));
  if (!matchesTicket || wrongFields(t, c.order).length === 0) return false;
  if (wrongMilk) {
    const text = answerFor(c.def.answers, c.order, 'milk');
    customerSay(r, c, `${c.def.id}.answer.milk`, text, 'annoyed', 'order');
  }
  c.heard = { ...c.order };
  r.events.push({ type: 'ticketFixed', customer: c.def.id });
  gaz(r, 'rush.misheard', 'react', varsFor(c, drink.type));
  return true;
}
