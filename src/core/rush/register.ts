// Day 2 at the register: taking the order, the listening aids (replay, "could you repeat that?",
// clarifying questions) and printing the ticket with what the player heard. Pure state changes on
// the Rush; the rules themselves (answer keys, costs) live in sim/listening.ts.

import type { Delivery } from '../../data/voice/ids';
import {
  answerFor,
  CLARIFY_QUESTION,
  LISTEN_COST,
  MAX_REPEATS,
  normaliseOrder,
  orderTier,
  wrongFields,
  type OrderField,
} from '../../sim/listening';
import type { Order } from '../../sim/rush';
import { customerListen, gaz, listenQueued, varsFor } from './speech';
import { atRegister, setState, type Rush, type RushCustomer } from './state';

/** The customer whose order is being taken (speaking or being rung up), if any. */
export function atCounter(r: Rush): RushCustomer | null {
  return r.customers.find((c) => c.state === 'ordering' || c.state === 'deciding') ?? null;
}

/** "Take order": the customer at the register says it (once any event of theirs is answered). */
export function takeOrder(r: Rush): void {
  const c = atRegister(r);
  if (c && r.shiftEvents.current?.customer !== c) {
    setState(c, 'ordering');
    c.orderLine = customerListen(r, c, c.line.id, c.line.text);
  }
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
