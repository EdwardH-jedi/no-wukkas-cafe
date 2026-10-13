// Who says what on Day 2, through the one speech channel: Gaz's lines (picked, filled in,
// never twice running), customers' fixed lines, and the lines the player must listen to
// (orders, slow repeats, answers), which may interrupt Gaz or the same customer only.

import { OWNER_LINES } from '../data/ownerLines';
import { spokenDuration } from '../data/voice';
import type { Delivery } from '../data/voice/ids';
import { pickLine, type LineDef, type Mood } from '../sim/owner';
import { DRINK_NAME, type DrinkType } from '../sim/rush';
import type { Rush, RushCustomer } from './rush';
import { canOffer, dropQueued, interrupt, offer, type Priority, type Utterance } from './speech';

const fill = (text: string, vars: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

export function startSay(r: Rush): (u: Utterance) => void {
  return (u) => r.events.push({ type: 'say', line: u });
}

/** Gaz says a line for `key`, if the channel will take it. */
export function gaz(
  r: Rush,
  key: string,
  priority: Priority,
  vars: Record<string, string> = {},
): boolean {
  if (!canOffer(r.speech, priority, r.time)) return false;
  const picked = pickLine(r.owner, OWNER_LINES, key, r.rng, r.time, priority === 'live');
  if (!picked) return false;
  const text = fill(picked.text, vars);
  if (text === r.lastGazText) return false;
  r.lastGazText = text;
  const u: Utterance = {
    ...picked,
    text,
    duration: spokenDuration('gaz', text),
    speaker: 'gaz',
    priority,
  };
  return offer(r.speech, u, r.time, startSay(r));
}

export function gazDef(r: Rush, key: string, def: LineDef): void {
  const u: Utterance = {
    speaker: 'gaz',
    key,
    text: def.text,
    mood: def.mood ?? 'neutral',
    gesture: def.gesture ?? 'none',
    duration: spokenDuration('gaz', def.text),
    priority: 'react',
  };
  offer(r.speech, u, r.time, startSay(r));
}

/** A customer speaks. Their lines are fixed (no randomness), so nothing repeats by chance. */
export function customerSay(
  r: Rush,
  c: RushCustomer,
  key: string,
  text: string,
  mood: Mood,
  priority: Priority,
): Utterance | null {
  const u: Utterance = {
    speaker: c.def.id,
    key,
    text,
    mood,
    gesture: 'none',
    duration: spokenDuration(c.def.id, text),
    priority,
  };
  if (!canOffer(r.speech, priority, r.time, c.def.id)) return null;
  return offer(r.speech, u, r.time, startSay(r)) ? u : null;
}

/** Something the player must hear: the order, a slower repeat, or an answer. Starts at once (the
 *  player asked for it) and becomes what Replay plays. */
export function customerListen(
  r: Rush,
  c: RushCustomer,
  key: string,
  text: string,
  delivery: Delivery = 'normal',
): Utterance {
  const u: Utterance = {
    speaker: c.def.id,
    key,
    text,
    mood: 'neutral',
    gesture: 'none',
    duration: spokenDuration(c.def.id, text, delivery),
    priority: 'order',
    delivery,
    listen: true,
  };
  c.lastListen = { text, delivery, key };
  // The same request asked again while it's still waiting replaces it instead of piling up
  // (a customer has at most six distinct listening lines, so the queue stays bounded).
  dropQueued(
    r.speech,
    (q) => q.listen === true && q.speaker === c.def.id && q.key === key && q.delivery === delivery,
  );
  // Cut Gaz or themselves off, but never another customer mid-sentence.
  const cur = r.speech.current;
  if (!cur || cur.speaker === c.def.id || cur.speaker === 'gaz')
    interrupt(r.speech, u, r.time, startSay(r));
  else offer(r.speech, u, r.time, startSay(r));
  return u;
}

/** This customer has a listening line queued that hasn't started yet. */
export function listenQueued(r: Rush, c: RushCustomer): boolean {
  return r.speech.queue.some((q) => q.listen === true && q.speaker === c.def.id);
}

/** They've gone (or are going): nothing they queued should still be said. */
export function forgetCustomer(r: Rush, c: RushCustomer, keepReactions: boolean): void {
  dropQueued(r.speech, (q) => q.speaker === c.def.id && (q.listen === true || !keepReactions));
}

export const varsFor = (c: RushCustomer, drink?: DrinkType): Record<string, string> => ({
  name: c.def.callName,
  ordered: DRINK_NAME[c.order.type],
  drink: drink ? DRINK_NAME[drink] : '',
});
