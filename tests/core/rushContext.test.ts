// Register vs production (playtest 2026-11-02): confirm A's ticket → B steps up to the register →
// Make A. One context at a time: making A's drink is production (the register panel waits), and
// once the drink is on the pass or binned it's the register again, with B exactly as they were.
// rushContext only reads the state: nothing here may change what the sim does (the trace test and
// the balance bots rely on that).

import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  atCounter,
  atRegister,
  createRush,
  emptyRushInput,
  rushContext,
  stepRush,
  type Rush,
  type RushAction,
  type RushCustomer,
} from '../../src/core/rush';

function step(r: Rush, action: RushAction | null = null, holding = false): void {
  const i = emptyRushInput();
  i.action = action;
  i.holding = holding;
  i.skip = r.phase === 'intro';
  stepRush(r, i, STEP);
}

function until(r: Rush, pred: () => boolean, maxSeconds = 180): void {
  for (let n = 0; n < maxSeconds / STEP && !pred(); n++) step(r);
  expect(pred(), 'reached in time').toBe(true);
}

/** A's ticket rung up (exactly as said), then B at the register: the playtest's starting point. */
function confirmAThenBAtRegister(seed = 7): { r: Rush; a: RushCustomer; b: RushCustomer } {
  const r = createRush(seed);
  until(r, () => atRegister(r) !== null);
  const a = atRegister(r) as RushCustomer;
  step(r, { type: 'takeOrder' });
  until(r, () => a.state === 'deciding');
  step(r, { type: 'ringUp', order: a.order });
  expect(a.state).toBe('waiting');
  until(r, () => atRegister(r) !== null);
  const b = atRegister(r) as RushCustomer;
  expect(b).not.toBe(a);
  return { r, a, b };
}

const orderSays = (c: RushCustomer, said: string[]): number =>
  said.filter((k) => k === c.line.id).length;

describe('register vs production (rushContext)', () => {
  it('is the register outside service and while the station is idle or the drink is on the pass', () => {
    const r = createRush(7);
    expect(r.phase).toBe('intro');
    expect(rushContext(r)).toBe('register');
    until(r, () => r.phase === 'service');
    expect(r.barista.phase).toBe('idle');
    expect(rushContext(r)).toBe('register');
  });

  it('confirm A → B at the register → Make A: production, then the register again with B intact', () => {
    const { r, a, b } = confirmAThenBAtRegister();
    expect(rushContext(r)).toBe('register');

    // B starts ordering (Take order stays open mid-drink, as it always has) and A's drink starts.
    step(r, { type: 'takeOrder' });
    expect(b.state).toBe('ordering');
    const said: string[] = [];
    for (const e of r.events) if (e.type === 'say') said.push(e.line.key);
    r.events.length = 0;
    const ticketsBefore = r.nextTicket;
    step(r, { type: 'make', drink: a.heard!.type, milk: a.heard!.milk ?? 'full' });
    expect(r.barista.phase).toBe('grind');
    expect(rushContext(r)).toBe('production');

    // Production runs on normal time: B finishes speaking and waits at the register, patience
    // draining as it always does. Nothing is rung up for them and A's ticket stays on the rail.
    const patience0 = b.patience;
    for (let n = 0; n < 8 / STEP; n++) {
      const grinding = r.barista.phase === 'grind' && r.barista.espresso.dose < 19;
      step(r, r.barista.phase === 'grind' && !grinding ? { type: 'next' } : null, grinding);
      for (const e of r.events) if (e.type === 'say') said.push(e.line.key);
      r.events.length = 0;
    }
    expect(rushContext(r)).toBe('production');
    expect(atCounter(r)).toBe(b);
    expect(b.state).toBe('deciding');
    expect(b.heard).toBeNull();
    expect(b.patience).toBeLessThan(patience0);
    expect(a.state).toBe('waiting');
    expect(a.heard).toEqual(a.order);
    expect(r.nextTicket).toBe(ticketsBefore);
    expect(r.listening).toHaveLength(1);
    expect(orderSays(b, said)).toBeLessThanOrEqual(1); // the order is asked for once, never twice

    // Binned (or finished): the register again, B still deciding, and their ticket rings up once.
    step(r, { type: 'bin' });
    expect(r.barista.phase).toBe('idle');
    expect(rushContext(r)).toBe('register');
    expect(atCounter(r)).toBe(b);
    step(r, { type: 'ringUp', order: b.order });
    expect(b.state).toBe('waiting');
    expect(r.listening).toHaveLength(2);
    expect([a.ticket, b.ticket]).toEqual([1, 2]);
    step(r, { type: 'ringUp', order: b.order }); // a second press prints nothing
    expect(r.listening).toHaveLength(2);
  });

  it('every making phase is production; idle and ready are the register', () => {
    const r = createRush(7);
    until(r, () => r.phase === 'service');
    const seen = new Map<string, string>();
    step(r, { type: 'make', drink: 'longBlack' });
    for (let n = 0; n < 120 / STEP && r.barista.phase !== 'ready'; n++) {
      const b = r.barista;
      seen.set(b.phase, rushContext(r));
      const i = emptyRushInput();
      i.holding =
        (b.phase === 'grind' && b.espresso.dose < 19) || (b.phase === 'water' && b.water < 0.6);
      if (b.phase === 'grind' && b.espresso.dose >= 19) i.action = { type: 'next' };
      if (b.phase === 'shot' && !b.espresso.extracting && !b.espresso.done) i.pressed = true;
      if (b.phase === 'shot' && b.espresso.shotTime >= 27) i.pressed = true;
      stepRush(r, i, STEP);
    }
    expect(r.barista.phase).toBe('ready');
    expect(rushContext(r)).toBe('register');
    expect(Object.fromEntries(seen)).toEqual({
      grind: 'production',
      lock: 'production',
      water: 'production',
      shot: 'production',
    });
  });
});
