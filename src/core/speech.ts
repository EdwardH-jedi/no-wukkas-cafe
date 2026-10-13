// One subtitle channel shared by Gaz and the customers, so lines never overlap.
//   order   a customer's order (or answer to a serve): never dropped, jumps the queue, cuts a Gaz
//           live/ambient line in progress
//   react   reactions to something that happened (serves, walkouts): queued
//   live    Gaz reacting to what the player is doing right now: only if it won't stomp on
//           something unread, and not more than one every 1.4 s
//   ambient nags and asides: only when nobody is talking and nothing is queued

import type { Delivery } from '../data/voice/ids';
import type { Gesture, Mood } from '../sim/owner';

export type Priority = 'order' | 'react' | 'live' | 'ambient';

export interface Utterance {
  /** 'gaz' or a customer id. */
  speaker: string;
  key: string;
  text: string;
  mood: Mood;
  gesture: Gesture;
  duration: number;
  priority: Priority;
  /** Which recording: 'slow' is the "could you repeat that?" take. Default normal. */
  delivery?: Delivery;
  /** An order or a clarifying answer: what the player must hear (subtitle rules apply). */
  listen?: boolean;
}

export interface Channel {
  current: Utterance | null;
  started: number;
  queue: Utterance[];
  lastLiveAt: number;
}

export function createChannel(): Channel {
  return { current: null, started: 0, queue: [], lastLiveAt: -99 };
}

export function channelBusy(ch: Channel): boolean {
  return ch.current !== null || ch.queue.length > 0;
}

/** Is this utterance still to be said (current or queued)? */
export function pending(ch: Channel, u: Utterance): boolean {
  return ch.current === u || ch.queue.includes(u);
}

const MAX_QUEUE = 4;

/** Would a line of this priority be accepted right now? (Check before picking, so a line that
 *  can't be said doesn't use up its no-repeat slot or cooldown.) */
export function canOffer(ch: Channel, priority: Priority, now: number, speaker = 'gaz'): boolean {
  const cur = ch.current;
  switch (priority) {
    case 'order':
      return true;
    case 'react':
      return !cur || ch.queue.length < MAX_QUEUE;
    case 'live': {
      if (now - ch.lastLiveAt < 1.4) return false;
      if (!cur) return true;
      const gazLine =
        cur.speaker === 'gaz' && (cur.priority === 'live' || cur.priority === 'ambient');
      return gazLine && speaker === 'gaz' && now - ch.started >= Math.min(1.1, cur.duration * 0.6);
    }
    case 'ambient':
      return !cur && ch.queue.length === 0;
  }
}

/**
 * Offer a line. Returns true if it will be said. `start` is called when a line begins.
 */
export function offer(
  ch: Channel,
  u: Utterance,
  now: number,
  start: (u: Utterance) => void,
): boolean {
  const cur = ch.current;
  const shown = now - ch.started;
  const begin = (): void => {
    ch.current = u;
    ch.started = now;
    start(u);
  };
  switch (u.priority) {
    case 'order': {
      if (!cur || cur.priority === 'live' || cur.priority === 'ambient') {
        begin();
      } else {
        // After any orders already waiting, ahead of everything else.
        let i = 0;
        while (i < ch.queue.length && ch.queue[i]?.priority === 'order') i++;
        ch.queue.splice(i, 0, u);
      }
      return true;
    }
    case 'react':
      if (!cur) begin();
      else if (ch.queue.length < MAX_QUEUE) ch.queue.push(u);
      else return false;
      return true;
    case 'live': {
      if (now - ch.lastLiveAt < 1.4) return false;
      if (cur) {
        const gazLine =
          cur.speaker === 'gaz' && (cur.priority === 'live' || cur.priority === 'ambient');
        if (!gazLine || shown < Math.min(1.1, cur.duration * 0.6)) return false;
      }
      ch.lastLiveAt = now;
      begin();
      return true;
    }
    case 'ambient':
      if (cur || ch.queue.length > 0) return false;
      begin();
      return true;
  }
}

/** Start a line right now, dropping whatever was being said: the player asked for it (replay,
 *  "could you repeat that?", a clarifying question). Queued lines stay queued. */
export function interrupt(
  ch: Channel,
  u: Utterance,
  now: number,
  start: (u: Utterance) => void,
): void {
  ch.current = u;
  ch.started = now;
  start(u);
}

/** Remove queued (not yet started) lines matching `pred`. */
export function dropQueued(ch: Channel, pred: (u: Utterance) => boolean): void {
  for (let i = ch.queue.length - 1; i >= 0; i--)
    if (pred(ch.queue[i] as Utterance)) ch.queue.splice(i, 1);
}

/** Advance the channel: finish the current line on time (or when skipped), start the next. */
export function updateChannel(
  ch: Channel,
  now: number,
  skip: boolean,
  start: (u: Utterance) => void,
  /** Seconds to hold the current line's clock this step: its audio is still loading, so it
   *  mustn't run out before anyone has heard it. An input, so the sim stays deterministic. */
  hold = 0,
): void {
  const cur = ch.current;
  if (!cur) return;
  if (hold > 0 && !skip) ch.started += hold;
  if (skip || now - ch.started >= cur.duration) {
    ch.current = null;
    const next = ch.queue.shift();
    if (next) {
      ch.current = next;
      ch.started = now;
      start(next);
    }
  }
}
