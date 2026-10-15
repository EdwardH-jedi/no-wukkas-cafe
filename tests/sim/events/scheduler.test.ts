import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';
import { CUSTOMERS } from '../../../src/data/customers';
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
  id: ShiftEventId | null;
}

/** Five shifts of checks every 10 s, with a seeded world (who's at the register, the queue). */
function playWeek(seed: number, options: Partial<SchedulerOptions> = {}): Check[] {
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
        affinity: { dazza: 3, beryl: 3 },
        playerMistake: world.next() < 0.3,
        rng,
      };
      const e = pickEvents(ctx, SHIFT_EVENTS, log, orderWindow, options);
      out.push({ shift, t, orderWindow, id: e?.id ?? null });
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
