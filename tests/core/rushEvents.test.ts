// Shift events in the service loop (week mode; docs/integration/T4-hook.md): when they're asked
// for, that the order waits for the answer, what an answer does, and that Day 2 never sees one.

import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  atRegister,
  createRush,
  emptyRushInput,
  stepRush,
  type Rush,
  type RushAction,
  type RushCustomer,
  type RushEvent,
  type RushWeek,
} from '../../src/core/rush';
import { birdLeft, createShiftEvents } from '../../src/core/rush/events';
import type { ShiftEventId } from '../../src/sim/contracts/events';
import { eventDef } from '../../src/sim/events/defs';
import { playRush } from '../helpers/rushBot';

const week = (shiftIndex: number, extra: Partial<RushWeek> = {}): RushWeek => ({
  shiftIndex,
  unlockedDrinks: ['flatWhite', 'longBlack'],
  ...extra,
});

/** Step with an optional action; returns the events of that step. */
function step(r: Rush, action: RushAction | null = null): RushEvent[] {
  const i = emptyRushInput();
  i.action = action;
  stepRush(r, i, STEP);
  const out = [...r.events];
  r.events.length = 0;
  return out;
}

/** Run until someone is at the register (in service). */
function untilRegister(r: Rush): RushCustomer {
  for (let n = 0; n < 4000; n++) {
    step(r);
    const c = atRegister(r);
    if (c && r.phase === 'service') return c;
  }
  throw new Error('nobody reached the register');
}

const force = (r: Rush, id: ShiftEventId, c: RushCustomer | null): void => {
  r.shiftEvents.current = { def: eventDef(id), customer: c, playerMistake: false };
};

describe('shift events in the service loop', () => {
  it('Day 2 (no week) never asks for one', () => {
    for (const seed of [3, 4]) {
      const { r, events } = playRush({ seed });
      expect(events.some((e) => e.type === 'shiftEvent')).toBe(false);
      expect(r.shiftEvents.log.fired).toEqual([]);
      expect(r.shiftEvents.bird).toBe(false);
    }
  }, 20000);

  it('the first shift of the week has none (cap 0)', () => {
    for (const seed of [1, 2]) {
      const { r } = playRush({ seed, week: week(0) });
      expect(r.shiftEvents.log.fired).toEqual([]);
    }
  }, 20000);

  it('later shifts fire some, never past the cap, the same for the same seed', () => {
    let total = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const a = playRush({ seed, week: week(3) });
      expect(a.r.phase).toBe('summary');
      expect(a.r.shiftEvents.log.fired.length).toBeLessThanOrEqual(2);
      if (seed === 1) {
        const b = playRush({ seed, week: week(3) });
        expect(b.r.shiftEvents.log.fired).toEqual(a.r.shiftEvents.log.fired);
        expect(b.r.summary).toEqual(a.r.summary);
      }
      total += a.r.shiftEvents.log.fired.length;
      // Asked, then answered (or dropped): nothing left hanging at the end.
      expect(a.r.shiftEvents.current).toBeNull();
      const asked = a.events.filter((e) => e.type === 'shiftEvent').length;
      const ended = a.events.filter((e) => e.type === 'shiftEventEnd').length;
      expect(ended).toBe(asked);
    }
    expect(total).toBeGreaterThanOrEqual(5);
  }, 30000);

  it('their order waits for the answer, which costs and pleases as the outcome says', () => {
    const r = createRush(5, 'normal', {}, week(0));
    const c = untilRegister(r);
    force(r, 'THE_NAME', c);
    step(r, { type: 'takeOrder' });
    expect(c.state).toBe('register');
    const before = c.patience;
    const out = step(r, { type: 'eventChoice', choice: 'spell' });
    expect(out).toContainEqual({ type: 'shiftEventEnd', event: 'THE_NAME', choice: 'spell' });
    expect(r.shiftEvents.current).toBeNull();
    expect(c.patience).toBeLessThan(before - 1.9); // −2 s for spelling it, plus the step's drain
    expect(c.eventSatisfaction).toBe(2);
    step(r, { type: 'takeOrder' });
    expect(c.state).toBe('ordering');
  });

  it("Gaz says the event's line", () => {
    const r = createRush(5, 'normal', {}, week(0));
    const c = untilRegister(r);
    force(r, 'JUST_COFFEE', c);
    const said: string[] = [];
    for (const e of step(r, { type: 'eventChoice', choice: 'ask' }))
      if (e.type === 'say') said.push(e.line.key);
    for (let n = 0; n < 2000 && !said.some((k) => k.startsWith('event.')); n++)
      for (const e of step(r)) if (e.type === 'say') said.push(e.line.key);
    expect(said).toContain('event.justCoffee.asked');
  });

  it('a wrong answer is ignored and the event stays', () => {
    const r = createRush(5, 'normal', {}, week(0));
    const c = untilRegister(r);
    force(r, 'THE_NAME', c);
    step(r, { type: 'eventChoice', choice: 'nope' });
    expect(r.shiftEvents.current?.def.id).toBe('THE_NAME');
  });

  it('an event is dropped when its customer walks out', () => {
    const r = createRush(5, 'normal', {}, week(0));
    const c = untilRegister(r);
    force(r, 'THE_NAME', c);
    c.patience = 0;
    const out = step(r);
    expect(out).toContainEqual({ type: 'walkout', customer: c.def.id });
    expect(out).toContainEqual({ type: 'shiftEventEnd', event: 'THE_NAME', choice: null });
    expect(r.shiftEvents.current).toBeNull();
  });

  it('showing someone the door is not a walk-out and leaves them out of the report', () => {
    let forced = false;
    const { r, events } = playRush({
      seed: 3,
      week: week(0),
      eventChoice: () => 'refuse',
      each: (x) => {
        const k = atRegister(x);
        if (!forced && k?.def.id === 'karen') {
          force(x, 'CALL_MANAGER', k);
          forced = true;
        }
      },
    });
    const karen = r.customers.find((c) => c.def.id === 'karen');
    expect(karen?.outcome).toBe('refused');
    expect(events.some((e) => e.type === 'refused' && e.customer === 'karen')).toBe(true);
    expect(events.some((e) => e.type === 'walkout' && e.customer === 'karen')).toBe(false);
    expect(r.records.some((x) => x.customer === 'karen')).toBe(false);
    expect(r.summary?.customers).toBe(r.customers.length - 1);
    expect(r.shiftEvents.refused).toBe(1);
    expect(r.shiftEvents.difficultHandled).toBe(1);
  }, 20000);

  it("an event's satisfaction lands on their serve", () => {
    const base = playRush({ seed: 3, week: week(0) }).r;
    let set = false;
    const moved = playRush({
      seed: 3,
      week: week(0),
      each: (x) => {
        const dazza = x.customers.find((c) => c.def.id === 'dazza');
        if (!set && dazza) {
          dazza.eventSatisfaction = -10;
          set = true;
        }
      },
    }).r;
    const sat = (r: Rush): number | undefined =>
      r.records.find((x) => x.customer === 'dazza')?.satisfaction;
    expect(sat(base)).toBeDefined();
    expect(sat(moved)).toBe(Math.max(0, (sat(base) ?? 0) - 10));
  }, 20000);

  it('the bin chicken is booked at the start, and cooldowns from earlier shifts hold', () => {
    const booked = Array.from({ length: 40 }, (_, i) => createShiftEvents(i + 1, week(1)).bird);
    expect(booked.some(Boolean)).toBe(true);
    expect(booked.every(Boolean)).toBe(false);
    for (let seed = 1; seed <= 40; seed++)
      expect(createShiftEvents(seed, week(1, { eventCooldowns: { RARE_BIRD: 0 } })).bird).toBe(
        false,
      );
    expect(createShiftEvents(1, null).bird).toBe(false);
  });

  it("the bird's visit applies RARE_BIRD's outcome", () => {
    const r = createRush(1, 'normal', {}, week(1));
    r.shiftEvents.bird = true;
    const [a, b] = r.customers as [RushCustomer, RushCustomer];
    a.state = 'queue';
    b.state = 'queue';
    a.patience = 50;
    b.patience = 50;
    birdLeft(r, true);
    expect([a.patience, b.patience]).toEqual([48, 48]);
    birdLeft(r, false);
    expect(r.shiftEvents.reputation).toBe(-1);
  });
});
