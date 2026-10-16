import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';
import { CUSTOMERS, type CustomerId } from '../../../src/data/customers';
import { USUAL_AFFINITY } from '../../../src/data/events';
import type { EventContext, ShiftEventId } from '../../../src/sim/contracts/events';
import { eventDef, SHIFT_EVENTS } from '../../../src/sim/events/defs';
import {
  capFor,
  pickEvents,
  SCHEDULER_DEFAULTS,
  startShiftLog,
  type EventLog,
  type SchedulerOptions,
} from '../../../src/sim/events/scheduler';

const IDS = CUSTOMERS.map((c) => c.id);

interface Check {
  shift: number;
  t: number;
  orderWindow: boolean;
  customer: CustomerId | null;
  id: ShiftEventId | null;
}

/** Five shifts of checks every 10 s, with a seeded world (who's at the register, the queue). */
function playWeek(
  seed: number,
  options: Partial<SchedulerOptions> = {},
  affinity: EventContext['affinity'] = { dazza: 3, beryl: 3 },
): Check[] {
  const rng = createRng(seed);
  const world = createRng(seed ^ 0x5eed);
  const out: Check[] = [];
  let log: EventLog | undefined;
  for (let shift = 0; shift < 5; shift++) {
    log = startShiftLog(shift, log);
    for (let t = 0; t <= 300; t += 10) {
      const orderWindow = world.next() < 0.35;
      const ctx: EventContext = {
        shiftIndex: shift,
        secondsIntoService: t,
        queueLength: world.int(5),
        customer: world.next() < 0.7 ? world.pick(IDS) : null,
        affinity,
        playerMistake: world.next() < 0.3,
        rng,
      };
      const e = pickEvents(ctx, SHIFT_EVENTS, log, orderWindow, options);
      out.push({ shift, t, orderWindow, customer: ctx.customer, id: e?.id ?? null });
    }
  }
  return out;
}

const SEEDS = Array.from({ length: 1000 }, (_, i) => i + 1);

describe('event scheduler', () => {
  it('is deterministic over 1000 seeds', () => {
    for (const s of SEEDS) expect(playWeek(s)).toEqual(playWeek(s));
  });

  it('honours the cap (none on the first shift), minShift and cooldowns', () => {
    expect(capFor(0)).toBe(0);
    expect(capFor(1)).toBe(2);
    expect(capFor(3, 5)).toBe(5);
    for (const s of SEEDS) {
      const fired = playWeek(s).filter((c) => c.id !== null);
      for (let shift = 0; shift < 5; shift++)
        expect(fired.filter((c) => c.shift === shift).length).toBeLessThanOrEqual(capFor(shift));
      fired.forEach((c, i) => {
        const def = eventDef(c.id as ShiftEventId);
        expect(c.shift).toBeGreaterThanOrEqual(def.minShift);
        const last = fired
          .slice(0, i)
          .filter((e) => e.id === c.id)
          .at(-1);
        if (last) expect(c.shift - last.shift).toBeGreaterThan(def.cooldownShifts);
      });
    }
  });

  it('never fires while an order is being said, and keeps events apart', () => {
    for (const s of SEEDS) {
      const week = playWeek(s);
      for (const c of week) if (c.orderWindow) expect(c.id).toBeNull();
      for (let shift = 0; shift < 5; shift++) {
        const at = week.filter((c) => c.shift === shift && c.id).map((c) => c.t);
        for (let i = 1; i < at.length; i++)
          expect((at[i] as number) - (at[i - 1] as number)).toBeGreaterThanOrEqual(
            SCHEDULER_DEFAULTS.minGapSeconds,
          );
      }
    }
  });

  // Cooldowns (every one at least a shift) keep an event out of the same shift and the next; the
  // log's last event keeps it from coming straight back after a shift with no events at all
  // (seed 275 did: QUEUE_JUMP, a quiet shift, QUEUE_JUMP).
  it('never fires the same event twice in a row, even across a quiet shift (1000 seeds)', () => {
    for (const s of SEEDS) {
      const fired = playWeek(s).filter((c) => c.id !== null);
      for (let i = 1; i < fired.length; i++) {
        const [a, b] = [fired[i - 1] as Check, fired[i] as Check];
        expect(b.id, `seed ${s}: ${b.id} in shifts ${a.shift} and ${b.shift}`).not.toBe(a.id);
      }
    }
    for (const e of SHIFT_EVENTS) expect(e.cooldownShifts, e.id).toBeGreaterThanOrEqual(1);
  });

  it('the last event carries into the next shift, and is left out of the next pick', () => {
    const log = startShiftLog(3, { shiftIndex: 2, lastShift: {}, fired: [], lastId: 'THE_NAME' });
    expect(log.lastId).toBe('THE_NAME');
    const ctx: EventContext = {
      shiftIndex: 3,
      secondsIntoService: 100,
      queueLength: 0,
      customer: 'dazza',
      affinity: {},
      playerMistake: false,
      rng: createRng(1),
    };
    const name = [eventDef('THE_NAME')];
    expect(pickEvents(ctx, name, log, false, { chance: 1 })).toBeNull();
    const both = [eventDef('THE_NAME'), eventDef('JUST_COFFEE')];
    expect(pickEvents(ctx, both, log, false, { chance: 1 })?.id).toBe('JUST_COFFEE');
    expect(log.lastId).toBe('JUST_COFFEE');
    expect(startShiftLog(4, log).lastId).toBe('JUST_COFFEE');
    expect(startShiftLog(0).lastId).toBeNull();
  });

  it('THE_USUAL only for a regular who knows the player (1000 seeds)', () => {
    for (const s of SEEDS) {
      expect(playWeek(s, {}, {}).some((c) => c.id === 'THE_USUAL')).toBe(false);
      for (const c of playWeek(s, {}, { beryl: USUAL_AFFINITY }))
        if (c.id === 'THE_USUAL') expect(c.customer).toBe('beryl');
    }
    expect(
      SEEDS.some((s) =>
        playWeek(s, {}, { beryl: USUAL_AFFINITY }).some((c) => c.id === 'THE_USUAL'),
      ),
    ).toBe(true);
  });

  it('every event can turn up, and options change the cap', () => {
    const seen = new Set<ShiftEventId>();
    for (const s of SEEDS) for (const c of playWeek(s)) if (c.id) seen.add(c.id);
    expect(seen.size).toBe(8);
    for (const s of SEEDS.slice(0, 200)) {
      const one = playWeek(s, { cap: 1 });
      for (let shift = 0; shift < 5; shift++)
        expect(one.filter((c) => c.shift === shift && c.id).length).toBeLessThanOrEqual(1);
    }
  });
});
