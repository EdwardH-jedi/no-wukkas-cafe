// Scenario 4: the wrong milk handed over is handed back; the player remakes it and the customer
// takes the right one; what went wrong is recorded. The listening-mistake path (ticket misheard,
// drink matches the ticket) is covered end to end in rush.test.ts and rushListening.test.ts; this
// adds the making-mistake path (ticket right, wrong carton) and pins the record on both.

import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  createRush,
  emptyRushInput,
  stepRush,
  type Rush,
  type RushAction,
  type RushCustomer,
  type RushEvent,
} from '../../src/core/rush';
import type { Utterance } from '../../src/core/speech';
import type { Milk, Order } from '../../src/sim/rush';
import { playRush } from '../helpers/rushBot';
import { drinkFor } from './leftCustomerSilent';

function step(
  r: Rush,
  action: RushAction | null = null,
  out?: { said: string[]; ev: RushEvent[] },
) {
  const i = emptyRushInput();
  i.action = action;
  stepRush(r, i, STEP);
  for (const e of r.events) {
    out?.ev.push(e);
    if (e.type === 'say') out?.said.push((e.line as Utterance).key);
  }
  r.events.length = 0;
}

/** An alt-milk flat-white customer waiting on the rail with a correct ticket. */
function waitingAltMilk(seed: number) {
  for (let s = seed; s < seed + 50; s++) {
    const r = createRush(s);
    const c = r.customers.find(
      (x) => x.order.type === 'flatWhite' && x.order.milk !== null && x.order.milk !== 'full',
    );
    if (!c) continue;
    while (r.phase !== 'service') step(r);
    c.state = 'waiting';
    c.heard = { ...c.order };
    c.ticket = 1;
    c.registerAt = r.time;
    return { r, c };
  }
  throw new Error('no oat/soy/almond customer');
}

const put = (r: Rush, c: RushCustomer, milk: Milk): void => {
  r.barista.ready = { ...drinkFor(c, r.time), milkType: milk };
  r.barista.drink = 'flatWhite';
  r.barista.phase = 'ready';
};

describe('S4: wrong milk, handed back, remade, taken', () => {
  it('a making mistake (ticket right): handed back, ticket kept, remade with their milk, taken', () => {
    const { r, c } = waitingAltMilk(3);
    const right = c.order.milk as Milk;
    const out = { said: [] as string[], ev: [] as RushEvent[] };
    const ticket: Order = { ...(c.heard as Order) };
    put(r, c, right === 'oat' ? 'soy' : 'oat');
    step(r, { type: 'serve', customer: c.key }, out);
    for (let n = 0; n < 12 / STEP; n++) step(r, null, out); // Gaz's remark queues behind theirs
    expect(out.ev).toContainEqual({ type: 'rejected', customer: c.key });
    expect(c.rejected).toBe(1);
    expect(c.state).toBe('waiting');
    expect(out.said).toContain(`${c.def.id}.rejectedMilk`);
    expect(out.said).toContain('rush.wrongMilk');
    expect(out.said).not.toContain('rush.misheard');
    expect(out.ev.some((e) => e.type === 'ticketFixed')).toBe(false);
    expect(c.heard).toEqual(ticket); // the ticket was right: nothing to correct
    // It stays on the pass: binned, remade with their milk, handed over.
    expect(r.barista.ready?.milkType).not.toBe(right);
    step(r, { type: 'bin' }, out);
    expect(r.barista.ready).toBeNull();
    put(r, c, right);
    step(r, { type: 'serve', customer: c.key }, out);
    expect(c.outcome).toBe('served');
    expect(c.result?.accepted).toBe(true);
    expect(c.rejected).toBe(1);
    expect(r.records.find((x) => x.customer === c.def.id)?.accepted).toBe(true);
  });

  it('a listening mistake (milk misheard): the record keeps what was wrong after the fix', () => {
    const probe = createRush(3);
    const t = probe.customers.find((x) => x.order.type === 'flatWhite' && x.def.patience >= 105);
    const id = t?.def.id;
    const { r, said, events } = playRush({
      seed: 3,
      heard: (c) =>
        c.def.id === id ? { ...c.order, milk: c.order.milk === 'oat' ? 'soy' : 'oat' } : c.order,
    });
    const c = r.customers.find((x) => x.def.id === id) as RushCustomer;
    expect(c, 'a flat-white customer patient enough to wait for a remake').toBeDefined();
    expect(c.rejected).toBe(1);
    expect(said).toContain(`${c.def.id}.rejectedMilk`);
    expect(events.some((e) => e.type === 'ticketFixed' && e.customer === c.key)).toBe(true);
    expect(c.heard).toEqual(c.order);
    expect(c.outcome).toBe('served');
    expect(c.result?.correct).toBe(true);
    const rec = r.listening.find((x) => x.customer === c.def.id)!;
    expect(rec.wrong).toEqual(['milk']);
    expect(rec.heard?.milk).not.toBe(rec.truth.milk);
    expect(rec.truth).toEqual(c.order);
  });
});
