// Seed fuzz for real week shifts, cheap path 1 of 2: 500 seeds × all five shifts (weeks 1 and 2,
// the three difficulties, random regulars, cooldowns and last event), played by a player who never
// takes an order (playRush idle: ~6 ms a shift, against ~0.6 s for a bot that pours). Everyone
// walks out, so this is the walk-out / disaster / replay path, the events that get dropped when
// their customer leaves, and the progression's "replay, keep the tips" rule on real reports.
// Endless Rush runs for every fifth seed. Every question the rush puts to the event scheduler is
// recorded (vi.mock wraps pickEvents) and checked at the moment it was asked.

import { describe, expect, it, vi } from 'vitest';
import { createRng, type Rng } from '../../src/core/rng';
import type { RushWeek } from '../../src/core/rush';
import { createSaveStore } from '../../src/core/save/storage';
import { shiftDef, unlocksFor } from '../../src/core/week/progress';
import { endlessFor, finishShift, weekFor } from '../../src/core/week/session';
import { ENDLESS, WEEK } from '../../src/data/week';
import type { ShiftEventId } from '../../src/sim/contracts/events';
import { newSave, REGULAR_IDS, type SaveV2 } from '../../src/sim/contracts/save';
import { DRINK_IDS } from '../../src/sim/contracts/ticket';
import { SHIFT_EVENTS } from '../../src/sim/events/defs';
import type { Difficulty } from '../../src/sim/listening';
import { picksBroken, progressBroken, shiftBroken, type PickCall } from '../helpers/fuzzRules';
import { playRush, type Played } from '../helpers/rushBot';

const spy = vi.hoisted(() => ({ calls: [] as PickCall[] }));
vi.mock('../../src/sim/events/scheduler', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/sim/events/scheduler')>();
  return {
    ...real,
    pickEvents: (...a: Parameters<typeof real.pickEvents>) => {
      const [ctx, defs, , orderWindow, options] = a;
      const asked = {
        shiftIndex: ctx.shiftIndex,
        secondsIntoService: ctx.secondsIntoService,
        queueLength: ctx.queueLength,
        customer: ctx.customer,
        affinity: { ...ctx.affinity },
        playerMistake: ctx.playerMistake,
        defs: defs.map((d) => d.id),
        orderWindow,
        cap: options?.cap,
      };
      const picked = real.pickEvents(...a);
      spy.calls.push({ ...asked, picked: picked?.id ?? null });
      return picked;
    },
  };
});

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);
const DIFFS: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const EVENT_IDS = SHIFT_EVENTS.map((e) => e.id);

/** A save on this shift, as if the week before it had been played, with some regulars known. */
function positioned(seed: number, rng: Rng, week: number, shift: number): SaveV2 {
  const s = newSave({ seed, difficulty: DIFFS[seed % 3] as Difficulty });
  s.week = week;
  s.shift = shift;
  s.unlockedDrinks = week > 1 ? [...DRINK_IDS] : [...unlocksFor(shift)];
  s.cents = rng.int(20_000);
  for (const id of REGULAR_IDS)
    if (rng.next() < 0.5) s.regulars[id] = { visits: rng.int(6), affinity: rng.int(4) };
  return s;
}

/** Cooldowns and the last event from "earlier shifts", in absolute shift numbers. */
function history(
  rng: Rng,
  abs: number,
): { cooldowns: RushWeek['eventCooldowns']; last: ShiftEventId | null } {
  const cooldowns: Partial<Record<ShiftEventId, number>> = {};
  for (const id of EVENT_IDS)
    if (abs > 0 && rng.next() < 0.3) cooldowns[id] = Math.max(0, abs - 1 - rng.int(3));
  return {
    cooldowns,
    last: abs > 0 && rng.next() < 0.4 ? (rng.pick(EVENT_IDS) as ShiftEventId) : null,
  };
}

const fingerprint = (p: Played): string =>
  JSON.stringify({
    summary: p.r.summary,
    customers: p.r.customers.map((c) => [c.key, c.line.text, c.outcome, c.patience, c.ticket]),
    fired: p.r.shiftEvents.log.fired,
    events: p.events.map((e) => [e.type, e.at]),
    time: p.r.time,
  });

function play(save: SaveV2, week: RushWeek): { p: Played; calls: PickCall[] } {
  spy.calls.length = 0;
  const p = playRush({
    idle: true,
    seed: save.seed,
    difficulty: save.difficulty,
    week,
    maxSeconds: 1500,
  });
  return { p, calls: [...spy.calls] };
}

describe('real week shifts, nobody served (500 seeds × 5 shifts, idle player)', () => {
  it('every customer is accounted for, the report and events agree, a disaster is replayed', () => {
    const v: string[] = [];
    let fired = 0;
    for (const seed of SEEDS) {
      const rng = createRng((seed * 0x9e3779b1) >>> 0);
      const weekNo = 1 + (seed % 2);
      for (let shift = 0; shift < WEEK.length; shift++) {
        const save = positioned(seed, rng, weekNo, shift);
        const abs = (weekNo - 1) * WEEK.length + shift;
        const h = history(rng, abs);
        const week = weekFor(save, h.cooldowns, h.last);
        const at = `seed ${seed} week ${weekNo} shift ${shift} ${save.difficulty}`;
        const { p, calls } = play(save, week);
        const r = p.r;
        const errs = [...shiftBroken(r), ...picksBroken(calls, r, p.events)];
        fired += r.shiftEvents.log.fired.length;
        if (r.summary) {
          // Nobody served: everyone walked out, nobody was shown the door, and it's a disaster.
          const n = shiftDef(shift).customers;
          if (r.summary.walkouts !== n || r.summary.ordersCompleted !== 0)
            errs.push(`idle: ${r.summary.walkouts} walk-outs of ${n}`);
          if (r.summary.grade !== 'disaster') errs.push(`idle graded ${r.summary.grade}`);
          // The save: the receipt and tips are kept, the same shift is played again.
          const store = createSaveStore(null, { seed });
          store.save(save);
          const after = finishShift(store, r.summary, r.shiftEvents.affinity);
          errs.push(...progressBroken(save, after, r.summary, r.shiftEvents.affinity, false));
        }
        // Same seed, same shift (one shift per seed, so the file stays quick).
        if (shift === seed % WEEK.length && fingerprint(play(save, week).p) !== fingerprint(p))
          errs.push('two runs differ');
        for (const e of errs) v.push(`${at}: ${e}`);
      }
    }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
    expect(fired).toBeGreaterThan(0);
  }, 300_000);

  it('Endless Rush ends at the third walk-out with no events, every fifth seed', () => {
    const v: string[] = [];
    const over: number[] = [];
    for (const seed of SEEDS.filter((s) => s % 5 === 0)) {
      const save = positioned(seed, createRng(seed), 1 + (seed % 3), seed % WEEK.length);
      const { p, calls } = play(save, endlessFor(save));
      const r = p.r;
      const errs = [...shiftBroken(r), ...picksBroken(calls, r, p.events)];
      if (r.summary && r.summary.walkouts < ENDLESS.maxWalkouts)
        errs.push(`ended after ${r.summary.walkouts} walk-outs`);
      if (r.summary && r.summary.walkouts > ENDLESS.maxWalkouts) over.push(seed);
      for (const e of errs) v.push(`seed ${seed} endless: ${e}`);
    }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
    // Observation, not a rule: walk-outs landing on the same step can take the count past three.
    if (over.length > 0)
      console.info(
        `endless: more than ${ENDLESS.maxWalkouts} walk-outs for seeds ${over.join(', ')}`,
      );
  }, 180_000);
});
