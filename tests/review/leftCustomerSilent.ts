// Scenario 3 flows: Day 2's first customer rung up correctly, then served (or walking out), with
// their reaction/walk-out clip answered as the test says. Every voice start is recorded with the
// speaker's customer state at that moment (harness.ts), so a start after they've gone shows up.

import { expect } from 'vitest';
import { createRush, type RushCustomer } from '../../src/core/rush';
import { clipFor } from '../../src/data/voice';
import { createEspresso, scoreEspresso } from '../../src/sim/espresso';
import { SILKY_MILK } from '../../src/sim/milk';
import type { MadeDrink } from '../../src/sim/rush';
import { scoreMilk } from '../../src/sim/steam';
import {
  CLIP_BY_FILE,
  clickThroughIntro,
  createHarness,
  FAST,
  type Harness,
  type Reply,
} from './harness';

/** A drink of the type they ordered, with their milk: one they will take. */
export function drinkFor(c: RushCustomer, now: number): MadeDrink {
  const flat = c.order.type === 'flatWhite';
  return {
    type: c.order.type,
    milkType: flat ? (c.order.milk ?? 'full') : null,
    espresso: scoreEspresso({ ...createEspresso(), dose: 19, shotTime: 28, done: true }),
    milk: flat ? scoreMilk(SILKY_MILK) : null,
    pattern: null,
    fill: 0.95,
    spill: 0,
    water: flat ? 0 : 0.7,
    temp: c.order.extraHot ? 72 : flat ? 62 : 70,
    madeAt: now,
  };
}

/** Day 2 to the moment the first customer's ticket is on the rail. Their lines other than the
 *  order are answered `reply` once armed (and miss the start-of-shift prefetch, so nothing is
 *  cached). */
export async function firstOnTheRail(reply: Reply, seed = 7) {
  const first = [...createRush(seed).customers].sort((a, b) => a.arriveAt - b.arriveAt)[0]!;
  const id = first.def.id;
  const orderFile = clipFor(id, first.line.text)!.file;
  let armed = false;
  const h = createHarness({
    seed,
    plan: (file) => {
      const clip = CLIP_BY_FILE.get(file);
      if (clip?.characterId !== id || file === orderFile) return FAST;
      return armed ? reply : { status: 503, delay: 0 };
    },
  });
  await h.run(0.5);
  h.app.nav.startDay2();
  const step = { n: 0 };
  h.beforeStep = (app) => clickThroughIntro(app, step);
  const cust = () => h.app.rush!.customers.find((c) => c.def.id === id)!;
  expect(await h.until(() => cust().state === 'register', 120)).toBe(true);
  h.app.rushAction = { type: 'takeOrder' };
  expect(await h.until(() => cust().state === 'deciding', 20)).toBe(true);
  h.app.rushAction = { type: 'ringUp', order: cust().order };
  await h.run(0.2);
  expect(cust().state).toBe('waiting');
  return { h, id, cust, arm: () => (armed = true) };
}

/** Hand them a drink they'll take (put on the pass as the station would leave it). */
export function serveNow(h: Harness, c: RushCustomer): void {
  const r = h.app.rush!;
  r.barista.ready = drinkFor(c, r.time);
  r.barista.drink = c.order.type;
  r.barista.phase = 'ready';
  h.app.rushAction = { type: 'serve', customer: c.key };
}

/** They run out of patience on the next step: only their walk-out line, not the impatient and
 *  angry ones a slow drain would have said earlier. */
export function walkOutNow(c: RushCustomer): void {
  c.said.impatient = true;
  c.said.angry = true;
  c.patience = 0.001;
}

/** Voice starts by this speaker once they had gone. */
export const afterGone = (h: Harness, id: string) =>
  h.starts.filter((s) => s.speaker === id && s.customerState === 'gone');
