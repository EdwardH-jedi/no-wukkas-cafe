// Seed fuzz for real week shifts, cheap path 2 of 2: 500 seeds, one shift each (shift = seed % 5,
// weeks 1 and 2, the three difficulties), played by the expert bot (tests/helpers/rushBot.ts)
// answering every shift event with a seeded random choice, so "That's enough" really shows Karen
// the door. The menu is long blacks only (the week's unlocks overridden): a flat white's pour
// simulation is ~70 ms, a long-black shift ~25 ms, and 500 seeds × full pours would be minutes.
// The rules checked don't depend on the drink. A last test plays real flat-white shifts (novice
// bot, real menu, 12 seeds) so real pours and milk are played too. A wrong-milk hand-back is rare
// for the bots (one in those 12 shifts, no WRONG_MILK event): the scheduler fuzz covers that rule.
// Every question the rush puts to the event scheduler is recorded (vi.mock wraps pickEvents).

import { describe, expect, it, vi } from 'vitest';
import { createRng, type Rng } from '../../src/core/rng';
import type { Rush, RushWeek } from '../../src/core/rush';
import { createSaveStore } from '../../src/core/save/storage';
import { unlocksFor } from '../../src/core/week/progress';
import { finishShift, weekFor } from '../../src/core/week/session';
import { WEEK } from '../../src/data/week';
import type { ShiftEventId } from '../../src/sim/contracts/events';
import { newSave, REGULAR_IDS, type SaveV2 } from '../../src/sim/contracts/save';
import { DRINK_IDS } from '../../src/sim/contracts/ticket';
import { SHIFT_EVENTS } from '../../src/sim/events/defs';
import type { Difficulty } from '../../src/sim/listening';
import { picksBroken, progressBroken, shiftBroken, type PickCall } from '../helpers/fuzzRules';
import { playRush, SKILLS, skillBot, type Played, type SkillName } from '../helpers/rushBot';

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
    if (rng.next() < 0.6) s.regulars[id] = { visits: rng.int(6), affinity: rng.int(4) };
  return s;
}

/** Cooldowns and the last event from "earlier shifts", in absolute shift numbers. */
function history(rng: Rng, abs: number): Pick<RushWeek, 'eventCooldowns' | 'lastEvent'> {
  const cooldowns: Partial<Record<ShiftEventId, number>> = {};
  for (const id of EVENT_IDS)
    if (abs > 0 && rng.next() < 0.3) cooldowns[id] = Math.max(0, abs - 1 - rng.int(3));
  const lastEvent = abs > 0 && rng.next() < 0.4 ? (rng.pick(EVENT_IDS) as ShiftEventId) : null;
  return { eventCooldowns: cooldowns, lastEvent };
}

const fingerprint = (p: Played): string =>
  JSON.stringify({
    summary: p.r.summary,
    customers: p.r.customers.map((c) => [c.key, c.line.text, c.outcome, c.patience, c.heard]),
    fired: p.r.shiftEvents.log.fired,
    events: p.events.map((e) => [e.type, e.at]),
    listening: p.r.listening,
    time: p.r.time,
  });

/** One shift by a skill profile that answers events at random (seeded). */
function play(
  seed: number,
  save: SaveV2,
  week: RushWeek,
  profile: SkillName,
): { p: Played; calls: PickCall[] } {
  spy.calls.length = 0;
  const choices = createRng((seed ^ 0xc401ce) >>> 0);
  const p = playRush({
    ...skillBot(SKILLS[profile], (Math.imul(seed, 0x85ebca6b) ^ week.shiftIndex) >>> 0),
    eventChoice: (r: Rush) => {
      const ids = (r.shiftEvents.current?.def.choices ?? []).map((c) => c.id);
      return ids.length > 0 ? choices.pick(ids) : '';
    },
    seed: save.seed,
    difficulty: save.difficulty,
    week,
    maxSeconds: 1500,
  });
  return { p, calls: [...spy.calls] };
}

/** Play, check the shift and the events, write it to the save and check the progression. */
function checkOne(
  seed: number,
  save: SaveV2,
  week: RushWeek,
  profile: SkillName,
): { errs: string[]; r: Rush } {
  const { p, calls } = play(seed, save, week, profile);
  const r = p.r;
  const errs = [...shiftBroken(r), ...picksBroken(calls, r, p.events)];
  if (r.summary) {
    const store = createSaveStore(null, { seed });
    store.save(save);
    const after = finishShift(store, r.summary, r.shiftEvents.affinity);
    errs.push(...progressBroken(save, after, r.summary, r.shiftEvents.affinity, false));
  }
  if (seed % 5 === 0 && fingerprint(play(seed, save, week, profile).p) !== fingerprint(p))
    errs.push('two runs differ');
  return { errs, r };
}

describe('real week shifts, served (500 seeds, expert bot, long-black menu)', () => {
  it('every customer is accounted for (served + walked out + shown the door), events fair', () => {
    const v: string[] = [];
    const tally = { served: 0, walkout: 0, refused: 0, events: 0 };
    for (const seed of SEEDS) {
      const rng = createRng((seed * 0x2545f491) >>> 0);
      const weekNo = 1 + (Math.floor(seed / WEEK.length) % 2);
      const shift = seed % WEEK.length;
      const save = positioned(seed, rng, weekNo, shift);
      const h = history(rng, (weekNo - 1) * WEEK.length + shift);
      const week: RushWeek = {
        ...weekFor(save, h.eventCooldowns, h.lastEvent),
        unlockedDrinks: ['longBlack'],
      };
      const at = `seed ${seed} week ${weekNo} shift ${shift} ${save.difficulty}`;
      const { errs, r } = checkOne(seed, save, week, 'expert');
      for (const e of errs) v.push(`${at}: ${e}`);
      for (const c of r.customers) if (c.outcome) tally[c.outcome]++;
      tally.events += r.shiftEvents.log.fired.length;
    }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
    // The fuzz reaches every outcome and fires events (it isn't only testing the happy path).
    expect(tally.served).toBeGreaterThan(0);
    expect(tally.walkout).toBeGreaterThan(0);
    expect(tally.events).toBeGreaterThan(0);
  }, 300_000);

  it('Karen shown the door is "refused", not a walk-out, and the counts still add up', () => {
    // CALL_MANAGER needs Karen at the register from shift 3: look for seeds where she was refused.
    const v: string[] = [];
    let refused = 0;
    for (const seed of SEEDS.slice(0, 160)) {
      const rng = createRng((seed * 0x2545f491) >>> 0);
      const shift = 3 + (seed % 2);
      const save = positioned(seed, rng, 1, shift);
      const week: RushWeek = { ...weekFor(save), unlockedDrinks: ['longBlack'] };
      const { p, calls } = play(seed, save, week, 'expert');
      const errs = [...shiftBroken(p.r), ...picksBroken(calls, p.r, p.events)];
      refused += p.r.shiftEvents.refused;
      for (const e of errs) v.push(`seed ${seed} shift ${shift}: ${e}`);
    }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
    expect(refused).toBeGreaterThan(0);
  }, 300_000);

  it('real flat-white shifts (novice bot, real menu, 12 seeds): the same rules hold', () => {
    const v: string[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const rng = createRng((seed * 0x2545f491) >>> 0);
      const shift = 2 + (seed % 3);
      const save = positioned(seed, rng, 1, shift);
      const h = history(rng, shift);
      const week = weekFor(save, h.eventCooldowns, h.lastEvent);
      for (const e of checkOne(seed, save, week, 'novice').errs)
        v.push(`seed ${seed} shift ${shift} ${save.difficulty}: ${e}`);
    }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
  }, 300_000);
});
