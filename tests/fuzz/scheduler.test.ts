// Seed fuzz for the shift-event scheduler (sim/events/scheduler.ts + defs.ts + data/events.ts) and
// the rush's start-of-shift booking (core/rush/events.ts createShiftEvents), 500 seeds each.
// tests/sim/events/scheduler.test.ts already covers determinism, the cap, minShift, cooldowns, the
// order window, the gap, no repeats and THE_USUAL over 1,000 seeds; this file adds what it doesn't:
// each event's own trigger rule at the moment it fires, the log's bookkeeping, the week table's
// caps over two weeks of absolute shifts, the call sites' subsets, and the outcomes it resolves to.
// Violations are collected across all seeds (each names its seed and shift) and asserted empty.

import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { createShiftEvents } from '../../src/core/rush/events';
import type { RushWeek } from '../../src/core/rush';
import { unlocksFor } from '../../src/core/week/progress';
import { CUSTOMERS, type CustomerId } from '../../src/data/customers';
import { GAZ_EVENT_LINES } from '../../src/data/dialogue/gazEvents';
import { USUAL_AFFINITY } from '../../src/data/events';
import { WEEK } from '../../src/data/week';
import type {
  EventContext,
  EventOutcome,
  ShiftEventDef,
  ShiftEventId,
} from '../../src/sim/contracts/events';
import { eventDef, SHIFT_EVENTS } from '../../src/sim/events/defs';
import {
  pickEvents,
  SCHEDULER_DEFAULTS,
  startShiftLog,
  type EventLog,
} from '../../src/sim/events/scheduler';
import { triggerBroken } from '../helpers/fuzzRules';

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);
const IDS: readonly CustomerId[] = CUSTOMERS.map((c) => c.id);
const ALL_IDS = SHIFT_EVENTS.map((e) => e.id);
/** Two weeks of absolute shifts (what the rush passes as ctx.shiftIndex). */
const SHIFTS = 10;

/** The call sites in core/rush/events.ts, plus the whole table (ask() could be given any). */
const SITES: Record<string, readonly ShiftEventDef[]> = {
  register: SHIFT_EVENTS.filter((d) => d.id !== 'RARE_BIRD' && d.id !== 'WRONG_MILK'),
  pushingIn: SHIFT_EVENTS.filter((d) => d.id === 'QUEUE_JUMP'),
  handedBack: SHIFT_EVENTS.filter((d) => d.id === 'WRONG_MILK'),
  bird: SHIFT_EVENTS.filter((d) => d.id === 'RARE_BIRD'),
  any: SHIFT_EVENTS,
};

/** Rules every outcome keeps, whichever choice and context led to it. */
function outcomeBroken(def: ShiftEventDef, choice: string, c: EventContext, o: EventOutcome) {
  const out: string[] = [];
  const nums: Array<[string, number | undefined]> = [
    ['patienceDelta', o.patienceDelta],
    ['queuePatienceDelta', o.queuePatienceDelta],
    ['satisfactionDelta', o.satisfactionDelta],
    ['reputationDelta', o.reputationDelta],
    ['wasteCents', o.wasteCents],
  ];
  for (const [k, x] of nums) if (x !== undefined && !Number.isFinite(x)) out.push(`${k} ${x}`);
  if (o.wasteCents !== undefined && (!Number.isInteger(o.wasteCents) || o.wasteCents < 0))
    out.push(`wasteCents ${o.wasteCents} is not whole, non-negative cents`);
  if (!o.gazLineKey || !GAZ_EVENT_LINES[o.gazLineKey]) out.push(`no Gaz line ${o.gazLineKey}`);
  if (def.id === 'WRONG_MILK' && c.playerMistake && o.difficult)
    out.push('a legitimate complaint scored as a difficult customer');
  if (o.endsService && !(def.id === 'CALL_MANAGER' && choice === 'refuse'))
    out.push('ends service outside CALL_MANAGER/refuse');
  for (const [id, d] of Object.entries(o.affinityDelta ?? {}))
    if (def.id !== 'THE_USUAL' || id !== c.customer || d !== 1)
      out.push(`affinity ${id} ${d} from ${def.id}`);
  const cost = def.choices.find((x) => x.id === choice)?.costSeconds ?? 0;
  if (cost > 0 && o.patienceDelta > -cost)
    out.push(`costs ${cost} s on the button but ${o.patienceDelta} s of patience`);
  return out;
}

interface Fired {
  shift: number;
  at: number;
  id: ShiftEventId;
}

interface Run {
  fired: Fired[];
  violations: string[];
}

const strip = (c: EventContext) => ({
  shiftIndex: c.shiftIndex,
  secondsIntoService: c.secondsIntoService,
  queueLength: c.queueLength,
  customer: c.customer,
  affinity: { ...c.affinity },
  playerMistake: c.playerMistake,
});

/** Two weeks of checks with a seeded world, the way the rush asks: the bird at the doors, then
 *  register / pushing-in / handed-back checks (and the whole table now and then). */
function playTwoWeeks(seed: number): Run {
  const rng = createRng(seed);
  const world = createRng((seed ^ 0x5eedf00d) >>> 0);
  const affinity: EventContext['affinity'] = {};
  for (const id of IDS) if (world.next() < 0.5) affinity[id] = world.int(4);
  const fired: Fired[] = [];
  const v: string[] = [];
  let log: EventLog | undefined;
  for (let shift = 0; shift < SHIFTS; shift++) {
    const row = WEEK[shift % WEEK.length];
    if (!row) throw new Error('empty week table');
    const cap = row.eventCap;
    const prevJson = JSON.stringify(log ?? null);
    const prev = log;
    log = startShiftLog(shift, log);
    const at = `seed ${seed} shift ${shift}`;
    let t = 0;
    for (let k = 0; t <= 320; k++) {
      const site =
        k === 0 ? 'bird' : (world.pick(['register', 'pushingIn', 'handedBack', 'any']) as string);
      const customer =
        site === 'bird' ? null : site === 'any' && world.next() < 0.3 ? null : world.pick(IDS);
      const ctx: EventContext = {
        shiftIndex: shift,
        secondsIntoService: t,
        queueLength: world.int(6),
        customer,
        affinity,
        playerMistake: site === 'handedBack' ? true : site === 'any' && world.next() < 0.3,
        rng,
      };
      const orderWindow = site !== 'bird' && world.next() < 0.3;
      const defs = SITES[site] as readonly ShiftEventDef[];
      const before = JSON.stringify(log);
      const ctxBefore = JSON.stringify(strip(ctx));
      const prevFired = log.fired.at(-1);
      const prevLastId = log.lastId;
      const prevLastShift = { ...log.lastShift };
      const firedBefore = log.fired.length;
      const pick = pickEvents(ctx, defs, log, orderWindow, { cap });
      if (JSON.stringify(strip(ctx)) !== ctxBefore) v.push(`${at} t ${t}: pickEvents changed ctx`);
      if (!pick) {
        if (JSON.stringify(log) !== before) v.push(`${at} t ${t}: no event, but the log changed`);
      } else {
        const where = `${at} t ${t} ${pick.id} (${site})`;
        fired.push({ shift, at: t, id: pick.id });
        if (!defs.includes(pick)) v.push(`${where}: not one of the defs asked about`);
        if (orderWindow) v.push(`${where}: fired over an order being said`);
        const rule = triggerBroken(pick.id, ctx);
        if (rule) v.push(`${where}: ${rule}`);
        if (pick.minShift > shift) v.push(`${where}: before its minShift ${pick.minShift}`);
        const last = prevLastShift[pick.id];
        if (last !== undefined && shift - last <= pick.cooldownShifts)
          v.push(`${where}: last fired in shift ${last}, cooldown ${pick.cooldownShifts}`);
        if (pick.id === prevLastId) v.push(`${where}: same event twice in a row`);
        if (prevFired && t - prevFired.at < SCHEDULER_DEFAULTS.minGapSeconds)
          v.push(`${where}: ${t - prevFired.at} s after the last one`);
        // The log records exactly this pick.
        const top = log.fired.at(-1);
        if (log.fired.length !== firedBefore + 1 || top?.id !== pick.id)
          v.push(`${where}: log.fired not appended with the pick`);
        if (top?.at !== t) v.push(`${where}: logged at ${top?.at}, fired at ${t}`);
        if (log.lastShift[pick.id] !== shift) v.push(`${where}: lastShift not this shift`);
        if (log.lastId !== pick.id) v.push(`${where}: lastId ${log.lastId}`);
        if (log.fired.length > cap) v.push(`${where}: ${log.fired.length} events, cap ${cap}`);
        // Every choice resolves to a fair, well-formed outcome, deterministically.
        for (const ch of pick.choices) {
          const a = pick.resolve(ch.id, { ...ctx, rng: createRng(rng.state()) });
          const b = pick.resolve(ch.id, { ...ctx, rng: createRng(rng.state()) });
          if (JSON.stringify(a) !== JSON.stringify(b))
            v.push(`${where} ${ch.id}: not deterministic`);
          for (const e of outcomeBroken(pick, ch.id, ctx, a)) v.push(`${where} ${ch.id}: ${e}`);
        }
      }
      t += 1 + world.int(14);
    }
    if (log.fired.length > cap) v.push(`${at}: ${log.fired.length} events, cap ${cap}`);
    const times = log.fired.map((f) => f.at);
    if (times.some((x, i) => !Number.isFinite(x) || x < 0 || (i > 0 && x < (times[i - 1] ?? 0))))
      v.push(`${at}: event times ${times.join(',')}`);
    // A new shift's log is a copy: picking in it never reaches back into the last one.
    if (JSON.stringify(prev ?? null) !== prevJson)
      v.push(`${at}: the previous shift's log changed`);
  }
  for (let i = 1; i < fired.length; i++) {
    const [a, b] = [fired[i - 1] as Fired, fired[i] as Fired];
    if (a.id === b.id) v.push(`seed ${seed}: ${a.id} in shifts ${a.shift} and ${b.shift} in a row`);
  }
  return { fired, violations: v };
}

describe('event scheduler fuzz (500 seeds, two weeks of absolute shifts)', () => {
  it('each event fires only when its own rule allows, and the log records exactly that', () => {
    const v: string[] = [];
    const seen = new Set<ShiftEventId>();
    for (const seed of SEEDS) {
      const run = playTwoWeeks(seed);
      v.push(...run.violations);
      for (const f of run.fired) seen.add(f.id);
      // Same seed, same two weeks.
      if (JSON.stringify(playTwoWeeks(seed).fired) !== JSON.stringify(run.fired))
        v.push(`seed ${seed}: two runs differ`);
    }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
    expect([...seen].sort()).toEqual([...ALL_IDS].sort());
  }, 60_000);

  it('the trigger rules above reject what they should (so the fuzz is not vacuous)', () => {
    const c = (o: Partial<EventContext>): EventContext => ({
      shiftIndex: 4,
      secondsIntoService: 100,
      queueLength: 0,
      customer: 'dazza',
      affinity: {},
      playerMistake: false,
      rng: createRng(1),
      ...o,
    });
    expect(triggerBroken('CALL_MANAGER', c({}))).not.toBeNull();
    expect(triggerBroken('CALL_MANAGER', c({ customer: 'karen' }))).toBeNull();
    expect(triggerBroken('WRONG_MILK', c({}))).not.toBeNull();
    expect(triggerBroken('WRONG_MILK', c({ playerMistake: true }))).toBeNull();
    expect(triggerBroken('QUEUE_JUMP', c({ queueLength: 1 }))).not.toBeNull();
    expect(triggerBroken('RARE_BIRD', c({}))).not.toBeNull();
    expect(
      triggerBroken('THE_USUAL', c({ affinity: { dazza: USUAL_AFFINITY - 1 } })),
    ).not.toBeNull();
    expect(triggerBroken('THE_NAME', c({ customer: null }))).not.toBeNull();
    // And every event's real canTrigger agrees with them on a spread of contexts.
    for (let seed = 1; seed <= 200; seed++) {
      const w = createRng(seed);
      const ctx = c({
        customer: w.next() < 0.2 ? null : (w.pick(IDS) as CustomerId),
        queueLength: w.int(5),
        playerMistake: w.next() < 0.5,
        affinity: { [w.pick(IDS) as CustomerId]: w.int(4) },
      });
      for (const d of SHIFT_EVENTS)
        expect(d.canTrigger(ctx), `seed ${seed} ${d.id}`).toBe(triggerBroken(d.id, ctx) === null);
    }
  });

  it("the week table's cap holds: none on either Monday, never more than the row allows", () => {
    const v: string[] = [];
    for (const seed of SEEDS) {
      const per = new Map<number, number>();
      for (const f of playTwoWeeks(seed).fired) per.set(f.shift, (per.get(f.shift) ?? 0) + 1);
      for (const [shift, n] of per) {
        const cap = WEEK[shift % WEEK.length]?.eventCap ?? 0;
        if (n > cap) v.push(`seed ${seed} shift ${shift}: ${n} events, cap ${cap}`);
      }
      for (const monday of [0, WEEK.length])
        if (per.has(monday)) v.push(`seed ${seed}: events on the Monday at shift ${monday}`);
    }
    expect(v, `${v.length} violations`).toEqual([]);
  }, 60_000);
});

describe('start-of-shift bird booking fuzz (createShiftEvents, 500 seeds)', () => {
  const week = (
    seed: number,
    w: number,
    shift: number,
    extra: Partial<RushWeek> = {},
  ): RushWeek => ({
    week: w,
    shiftIndex: shift,
    unlockedDrinks: unlocksFor(shift),
    ...extra,
    ...(seed % 7 === 0 ? { endless: true } : {}),
  });

  it('books the bin chicken only when RARE_BIRD may fire: shift, cap, cooldown, last event', () => {
    const v: string[] = [];
    const bird = eventDef('RARE_BIRD');
    let booked = 0;
    for (const seed of SEEDS) {
      const r = createRng((seed ^ 0xb12d) >>> 0);
      for (let w = 1; w <= 3; w++)
        for (let shift = 0; shift < WEEK.length; shift++) {
          const abs = (w - 1) * WEEK.length + shift;
          const cooldowns: Partial<Record<ShiftEventId, number>> = {};
          for (const id of ALL_IDS) if (r.next() < 0.3) cooldowns[id] = abs - 1 - r.int(3);
          const lastEvent = r.next() < 0.3 ? (r.pick(ALL_IDS) as ShiftEventId) : null;
          const wk = week(seed, w, shift, { eventCooldowns: cooldowns, lastEvent });
          const coolJson = JSON.stringify(cooldowns);
          const s = createShiftEvents(seed, wk);
          const at = `seed ${seed} week ${w} shift ${shift}`;
          if (JSON.stringify(createShiftEvents(seed, wk)) !== JSON.stringify(s))
            v.push(`${at}: two bookings differ`);
          if (JSON.stringify(cooldowns) !== coolJson) v.push(`${at}: the week's cooldowns changed`);
          if (s.log.shiftIndex !== abs) v.push(`${at}: log shift ${s.log.shiftIndex}, want ${abs}`);
          if (s.log.lastId !== (s.bird ? 'RARE_BIRD' : lastEvent))
            v.push(`${at}: lastId ${s.log.lastId}`);
          const wantFired = s.bird ? [{ id: 'RARE_BIRD', at: 0 }] : [];
          if (JSON.stringify(s.log.fired) !== JSON.stringify(wantFired))
            v.push(`${at}: fired ${JSON.stringify(s.log.fired)} with bird ${s.bird}`);
          if (s.current !== null || s.refused !== 0 || s.wasteCents !== 0)
            v.push(`${at}: a fresh shift's tallies are not empty`);
          if (!s.bird) continue;
          booked++;
          const last = cooldowns.RARE_BIRD;
          if (wk.endless) v.push(`${at}: the bird booked for Endless Rush`);
          if ((WEEK[shift]?.eventCap ?? 0) === 0) v.push(`${at}: the bird on a no-event shift`);
          if (abs < bird.minShift) v.push(`${at}: the bird before its minShift`);
          if (lastEvent === 'RARE_BIRD') v.push(`${at}: the bird twice in a row`);
          if (last !== undefined && abs - last <= bird.cooldownShifts)
            v.push(`${at}: the bird in its cooldown (last ${last})`);
        }
    }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
    expect(booked).toBeGreaterThan(0);
  }, 60_000);
});
