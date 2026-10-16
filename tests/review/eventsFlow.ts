// Scenario 6 flows: a whole headless shift (rushBot) with the bin chicken stepped after every rush
// step, as app/rushWiring.ts createRushLoop does, recording everything with its time.

import { STEP } from '../../src/core/clock';
import type { Rush, RushWeek } from '../../src/core/rush';
import { createShiftEvents } from '../../src/core/rush/events';
import { stepRushIbis } from '../../src/core/rushIbis';
import type { Utterance } from '../../src/core/speech';
import { ibisForShift } from '../../src/sim/events/rareBird';
import { createIbis, type Ibis } from '../../src/sim/ibis';
import { playRush } from '../helpers/rushBot';

export const week = (shiftIndex: number): RushWeek => ({
  shiftIndex,
  unlockedDrinks: ['flatWhite', 'longBlack'],
});

/** Seeds whose week shift books the bin chicken (RARE_BIRD). */
export function birdSeeds(shiftIndex: number, n: number): number[] {
  const out: number[] = [];
  for (let s = 1; out.length < n && s < 500; s++)
    if (createShiftEvents(s, week(shiftIndex)).bird) out.push(s);
  return out;
}

export interface Shift {
  r: Rush;
  bird: Ibis;
  trace: string[];
  /** Ibis events while a customer's order/answer line was being said. */
  birdInOrder: Array<{ at: number; event: string; line: string }>;
  /** Shift events asked for while an order was being said or rung up. */
  eventInOrder: Array<{ at: number; event: string; why: string }>;
  /** Order/answer lines that ended before their time, and what replaced them. */
  cutShort: Array<{ at: number; line: string; by: string }>;
}

/** One shift. Day 2: the bird forced in (?ibis=1). Week: the bird only if RARE_BIRD was booked. */
export function shiftWithBird(seed: number, w: RushWeek | null): Shift {
  const bird = w ? ibisForShift(seed, createShiftEvents(seed, w).bird) : createIbis(seed, true);
  const trace: string[] = [];
  const birdInOrder: Shift['birdInOrder'] = [];
  const eventInOrder: Shift['eventInOrder'] = [];
  const cutShort: Shift['cutShort'] = [];
  let shoos = 0;
  let prev: Utterance | null = null;
  let prevStarted = 0;
  const { r } = playRush({
    seed,
    ...(w ? { week: w } : {}),
    maxSeconds: 900,
    each: (r) => {
      // Shoo it a few seconds after it reaches the bin, as a player would.
      const shoo = bird.state === 'foraging' && bird.stateTime > 3 && shoos < 3;
      if (shoo) shoos++;
      const listening = r.speech.current?.listen === true ? r.speech.current : null;
      for (const e of stepRushIbis(r, bird, { shoo, noticed: false }, STEP)) {
        trace.push(`${r.time.toFixed(4)} ibis ${JSON.stringify(e)}`);
        if (listening) birdInOrder.push({ at: r.time, event: e.type, line: listening.key });
      }
      for (const e of r.events) {
        if (e.type === 'say') trace.push(`${r.time.toFixed(4)} say ${e.line.key} ${e.line.text}`);
        else trace.push(`${r.time.toFixed(4)} ${JSON.stringify(e)}`);
        if (e.type === 'shiftEvent') {
          const busy = r.customers.find((c) => c.state === 'ordering' || c.state === 'deciding');
          const why = busy
            ? `${busy.key} ${busy.state}`
            : r.speech.current?.listen
              ? `saying ${r.speech.current.key}`
              : r.speech.queue.some((q) => q.listen)
                ? 'an order line queued'
                : '';
          if (why) eventInOrder.push({ at: r.time, event: e.event, why });
        }
      }
      const cur = r.speech.current;
      if (prev?.listen && cur !== prev && r.time - prevStarted < prev.duration - 2 * STEP) {
        const same = cur?.listen === true && cur.speaker === prev.speaker;
        if (!same) cutShort.push({ at: r.time, line: prev.key, by: cur?.key ?? 'nothing' });
      }
      if (cur !== prev) {
        prev = cur;
        prevStarted = r.speech.started;
      }
    },
  });
  return { r, bird, trace, birdInOrder, eventInOrder, cutShort };
}
