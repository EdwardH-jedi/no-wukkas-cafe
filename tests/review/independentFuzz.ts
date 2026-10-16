// Fast lifecycle fuzz: real fixed-step rush and ibis; a correct prepared drink is injected at
// the pass. This deliberately does NOT claim station physics, real audio, or browser coverage.
import { STEP } from '../../src/core/clock';
import {
  atCounter,
  atRegister,
  createRush,
  emptyRushInput,
  stepRush,
  type RushWeek,
} from '../../src/core/rush';
import { stepRushIbis } from '../../src/core/rushIbis';
import { createIbis } from '../../src/sim/ibis';
import { ibisForShift } from '../../src/sim/events/rareBird';
import { drinkFor } from './leftCustomerSilent';

export function lifecycleShift(seed: number, week: RushWeek | null) {
  const r = createRush(seed, 'normal', {}, week);
  const bird = week ? ibisForShift(seed, r.shiftEvents.bird) : createIbis(seed);
  const overlaps: Array<{ at: number; event: string; line: string }> = [];
  let appearances = 0;
  let honks = 0;
  let orders = 0;
  let answers = 0;
  let honkUntil = -1;
  let honkKind = '';
  const clarified = new Set<string>();
  for (let n = 0; n < 600 / STEP && r.phase !== 'summary'; n++) {
    const input = emptyRushInput();
    if (r.phase === 'intro') input.pressed = n % 20 === 0;
    if (r.phase === 'service') {
      const event = r.shiftEvents.current;
      const register = atRegister(r);
      const counter = atCounter(r);
      const waiting = r.customers.find((c) => c.state === 'waiting');
      const listening = r.speech.current?.listen || r.speech.queue.some((q) => q.listen);
      if (event) input.action = { type: 'eventChoice', choice: event.def.choices[0]!.id };
      else if (register) input.action = { type: 'takeOrder' };
      else if (counter?.state === 'deciding' && !listening) {
        if (!clarified.has(counter.key)) {
          clarified.add(counter.key);
          input.action = { type: 'clarify', field: 'milk' };
        } else input.action = { type: 'ringUp', order: counter.order };
      } else if (waiting && !listening) {
        r.barista.ready = drinkFor(waiting, r.time);
        r.barista.drink = waiting.order.type;
        r.barista.phase = 'ready';
        input.action = { type: 'serve', customer: waiting.key };
      }
    }
    stepRush(r, input, STEP);
    const line = r.speech.current?.listen ? r.speech.current : null;
    const events = stepRushIbis(r, bird, { shoo: false, noticed: false }, STEP);
    for (const e of events) {
      if (e.type === 'enter') appearances++;
      if (e.type === 'honk') honks++;
      if (e.type === 'enter' || e.type === 'honk' || e.type === 'alert') {
        honkUntil = r.time + 0.46; // sfx.ts: second tone starts at .24 and lasts .22.
        honkKind = e.type;
      }
    }
    // Include the audible tail: an order can begin just after the entrance/honk step.
    if (
      line &&
      r.time < honkUntil &&
      !overlaps.some((o) => o.line === line.key && r.time - o.at < 0.5)
    )
      overlaps.push({ at: Number(r.time.toFixed(4)), event: honkKind, line: line.key });
    for (const e of r.events) {
      if (e.type === 'say' && e.line.listen) {
        if (e.line.key.includes('.answer.')) answers++;
        else orders++;
      }
    }
    r.events.length = 0;
  }
  return { r, bird, overlaps, appearances, honks, orders, answers };
}
