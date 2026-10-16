import { describe, expect, it } from 'vitest';
import type { AttemptResult } from '../../src/sim/attempt';
import type { ListenRecord, OrderLine } from '../../src/sim/listening';
import { accuracyByField } from '../../src/sim/listening/stats';
import type { Order, ServeRecord, ShiftSummary } from '../../src/sim/rush';
import {
  emptyLog,
  parseLog,
  putRecord,
  reached,
  secondsStat,
  shiftTelemetry,
  TELEMETRY_CAP,
  TELEMETRY_VERSION,
  trialTelemetry,
  type RecordMeta,
  type ShiftSource,
  type TelemetryRecord,
  type TrialSource,
  type VisitSource,
} from '../../src/sim/telemetry';
import { BOT_FIRST_TIMER, playRush } from '../helpers/rushBot';

const FW: Order = { type: 'flatWhite', milk: 'full', extraHot: false, heart: false };
const OAT: Order = { type: 'flatWhite', milk: 'oat', extraHot: false, heart: false };
const HOT: Order = { type: 'flatWhite', milk: 'full', extraHot: true, heart: true };
const LB: Order = { type: 'longBlack', milk: null, extraHot: false, heart: false };

const LINE: OrderLine = {
  id: 'test.line',
  text: 'Flat white, thanks.',
  order: FW,
  pace: 'normal',
  connected: 0,
  slang: 0,
  chatter: 0,
  cues: {},
};

function meta(ending: RecordMeta['ending'] = 'finished', id = 'r1'): RecordMeta {
  return {
    id,
    session: '2026-10-17T00:00:00.000Z',
    startedAt: '2026-10-17T00:01:00.000Z',
    endedAt: '2026-10-17T00:06:00.000Z',
    ending,
  };
}

function visit(key: string, o: Partial<VisitSource> = {}): VisitSource {
  return {
    key,
    def: { id: key.split('#')[0] as string },
    line: LINE,
    state: 'gone',
    outcome: null,
    registerAt: null,
    takenAt: null,
    orderedAt: null,
    ticket: null,
    rejected: 0,
    listen: { replays: 0, repeats: 0, questions: 0 },
    result: null,
    ...o,
  };
}

/** A served visit: at the register at `at`, taken `wait` s later, rung up 5 s after that. */
function served(key: string, at: number, wait: number, ticket: number): VisitSource {
  return visit(key, {
    outcome: 'served',
    registerAt: at,
    takenAt: at + wait,
    orderedAt: at + wait + 5,
    ticket,
    result: { satisfaction: 80, tipCents: 100 },
  });
}

const listened = (
  customer: string,
  truth: Order,
  heard: Order,
  wrong: ListenRecord['wrong'] = [],
) =>
  ({
    customer,
    lineId: 'test.line',
    tier: 1,
    truth,
    heard,
    wrong,
    replays: 0,
    repeats: 0,
    clarified: [],
    questions: 0,
  }) satisfies ListenRecord;

const serveRec = (customer: string, waited: number, tipCents = 100): ServeRecord => ({
  customer,
  accepted: true,
  correct: true,
  waited,
  satisfaction: 80,
  tipCents,
});

function shift(o: Partial<ShiftSource> = {}): ShiftSource {
  return {
    seed: 3,
    difficulty: 'normal',
    week: null,
    phase: 'service',
    serviceTime: 120.04,
    barista: { phase: 'idle' },
    customers: [],
    records: [],
    listening: [],
    summary: null,
    shiftEvents: { log: { fired: [] } },
    ...o,
  };
}

describe('shift telemetry: accuracy per field', () => {
  it('counts a misheard milk against milk only, from what was rung up', () => {
    const s = shift({
      listening: [
        listened('karen', OAT, FW, ['milk']), // misheard the milk
        listened('jiwoo', LB, LB),
        listened('gaz', HOT, HOT),
      ],
    });
    const t = shiftTelemetry(s, meta());
    expect(t.accuracy.drink).toEqual({ total: 3, correct: 3 });
    expect(t.accuracy.milk).toEqual({ total: 2, correct: 1 });
    expect(t.accuracy.temp).toEqual({ total: 2, correct: 2 });
    expect(t.accuracy.heart).toEqual({ total: 2, correct: 2 });
  });

  it("a wrong drink counts against the drink, and the visit's wrong fields come from its ticket", () => {
    const s = shift({
      customers: [served('karen', 10, 2, 1), served('jiwoo', 20, 1, 2)],
      records: [serveRec('karen', 40), serveRec('jiwoo', 30)],
      listening: [listened('karen', FW, LB, ['drink']), listened('jiwoo', OAT, OAT)],
    });
    const t = shiftTelemetry(s, meta());
    expect(t.accuracy.drink).toEqual({ total: 2, correct: 1 });
    expect(t.accuracy.milk).toEqual({ total: 1, correct: 1 });
    expect(t.visits.map((v) => v.wrong)).toEqual([['drink'], []]);
  });
});

describe('shift telemetry: pardons, times, walk-outs', () => {
  it('sums pardons over every visit, including one who walked out before it was rung up', () => {
    const s = shift({
      customers: [
        visit('karen', {
          ...served('karen', 10, 1, 1),
          listen: { replays: 2, repeats: 1, questions: 1 },
        }),
        visit('jiwoo', {
          outcome: 'walkout',
          registerAt: 30,
          takenAt: 32,
          listen: { replays: 1, repeats: 2, questions: 3 },
        }),
      ],
      records: [serveRec('karen', 50)],
      listening: [listened('karen', FW, FW)],
    });
    const t = shiftTelemetry(s, meta());
    expect(t.pardons).toEqual({ replays: 3, repeats: 3, questions: 4 });
    expect(t.visits[1]).toMatchObject({ reached: 'ordering', wrong: null, questions: 3 });
  });

  it('time-to-serve per served customer with mean and median; register wait per order taken', () => {
    const s = shift({
      customers: [
        served('karen', 10, 2, 1),
        served('jiwoo', 30, 6, 2),
        served('karen#2', 90, 1, 3), // a regular's second visit matches her second record
        visit('mateo', { outcome: 'walkout', registerAt: 100 }), // left standing at the register
      ],
      records: [serveRec('karen', 30), serveRec('jiwoo', 52.04), serveRec('karen', 41)],
    });
    const t = shiftTelemetry(s, meta());
    expect(t.serveSeconds).toEqual({ each: [30, 52, 41], mean: 41, median: 41, max: 52 });
    expect(t.visits.map((v) => v.serveSeconds)).toEqual([30, 52, 41, null]);
    expect(t.registerWait).toEqual({ each: [2, 6, 1], mean: 3, median: 2, max: 6 });
    expect(t.visits.map((v) => v.registerWait)).toEqual([2, 6, 1, null]);
    expect(t.visits.map((v) => v.ringUpSeconds)).toEqual([5, 5, 5, null]);
  });

  it('walk-outs by how far they got; refused and handed-back counted apart', () => {
    const s = shift({
      customers: [
        visit('a', { outcome: 'walkout' }), // in the queue
        visit('b', { outcome: 'walkout', registerAt: 5 }), // at the register
        visit('c', { outcome: 'walkout', registerAt: 5, takenAt: 6 }), // ordering
        visit('d', { outcome: 'walkout', registerAt: 5, takenAt: 6, ticket: 1, rejected: 1 }),
        visit('e', { outcome: 'refused', registerAt: 9 }),
        visit('f', { state: 'outside' }), // never came in
      ],
    });
    const t = shiftTelemetry(s, meta());
    expect(t.walkouts).toBe(4);
    expect(t.walkoutsAt).toEqual({ queue: 1, register: 1, ordering: 1, ticket: 1 });
    expect(t.refused).toBe(1);
    expect(t.handedBack).toBe(1);
    expect(t.arrived).toBe(5);
    expect(t.customers).toBe(4); // served + walk-outs, as on the report
    expect(reached(visit('x', { registerAt: 1, takenAt: 2, ticket: 3 }))).toBe('ticket');
  });
});

describe('shift telemetry: endings and modes', () => {
  const summary: ShiftSummary = {
    customers: 1,
    ordersCompleted: 1,
    correctOrders: 1,
    walkouts: 0,
    avgServeSeconds: 40,
    satisfaction: 81,
    tipsCents: 150,
    wasted: 0,
    grade: 'excellent',
  };

  it('a finished shift has its grade and no quit point', () => {
    const s = shift({
      phase: 'summary',
      customers: [served('karen', 10, 1, 1)],
      records: [serveRec('karen', 40, 150)],
      summary,
    });
    const t = shiftTelemetry(s, meta('finished'));
    expect(t).toMatchObject({
      kind: 'shift',
      mode: 'day2',
      week: null,
      shiftIndex: null,
      grade: 'excellent',
      satisfaction: 81,
      tipsCents: 150,
      quit: null,
      ending: 'finished',
    });
  });

  it('a shift left mid-service records where: phase, service time, served so far, the station', () => {
    const s = shift({
      serviceTime: 95.27,
      barista: { phase: 'pour' },
      customers: [
        served('karen', 10, 1, 1),
        visit('jiwoo', { state: 'waiting', registerAt: 50, takenAt: 51, ticket: 2 }),
        visit('mateo', { state: 'queue' }),
        visit('gaz', { state: 'outside' }),
      ],
      records: [serveRec('karen', 40, 120)],
    });
    const t = shiftTelemetry(s, meta('title'));
    expect(t.quit).toEqual({
      phase: 'service',
      serviceTime: 95.3,
      served: 1,
      walkouts: 0,
      inCafe: 2,
      station: 'pour',
    });
    expect(t.grade).toBeNull();
    expect(t.tipsCents).toBe(120);
    expect(t.visits.map((v) => v.outcome)).toEqual(['served', null, null]);
  });

  it('week mode names the week and shift, and lists the events fired', () => {
    const s = shift({
      week: { week: 2, shiftIndex: 3 },
      shiftEvents: {
        log: {
          fired: [
            { id: 'RARE_BIRD', at: 0 },
            { id: 'QUEUE_JUMP', at: 40.04 },
          ],
        },
      },
    });
    const t = shiftTelemetry(s, meta('restarted'));
    expect(t).toMatchObject({ mode: 'week', week: 2, shiftIndex: 3, ending: 'restarted' });
    expect(t.events).toEqual([
      { id: 'RARE_BIRD', at: 0 },
      { id: 'QUEUE_JUMP', at: 40 },
    ]);
  });

  it('Endless is its own mode (no week or shift), counting only who came in', () => {
    const s = shift({
      week: { week: 1, shiftIndex: 4, endless: true },
      customers: [
        visit('karen', { outcome: 'walkout', registerAt: 3 }),
        visit('jiwoo', { state: 'register', registerAt: 20 }),
        ...Array.from({ length: 30 }, (_, i) => visit(`x#${i}`, { state: 'outside' })),
      ],
    });
    const t = shiftTelemetry(s, meta('closed'));
    expect(t).toMatchObject({ mode: 'endless', week: null, shiftIndex: null, arrived: 2 });
    expect(t.walkoutsAt.register).toBe(1);
    expect(t.quit?.inCafe).toBe(1);
  });
});

describe('trial telemetry', () => {
  const attempt = (total: number, valid = true): AttemptResult =>
    ({
      total,
      art: total * 0.456,
      cup: 0,
      milk: 0,
      espresso: 0,
      valid,
      invalid: valid ? null : 'halfEmpty',
      faults: valid ? ['lopsided', 'offCentre'] : [],
      band: total >= 85 ? 'hired' : total >= 60 ? 'almost' : total >= 25 ? 'failed' : 'disaster',
      pattern: {} as AttemptResult['pattern'],
    }) as AttemptResult;

  const trial = (o: Partial<TrialSource> = {}): TrialSource => ({
    seed: 7,
    time: 250,
    phase: 'verdict',
    attempt: 2,
    results: [attempt(40), attempt(20, false), attempt(72)],
    outcome: { band: 'almost', score: 72, bestIndex: 2 },
    ...o,
  });

  it('a finished trial: every attempt, the verdict band, no quit point', () => {
    const t = trialTelemetry(trial(), 10, meta('finished'));
    expect(t).toMatchObject({
      kind: 'trial',
      verdict: 'almost',
      score: 72,
      seconds: 240,
      quit: null,
    });
    expect(t.attempts).toEqual([
      { total: 40, art: 18.2, valid: true, band: 'failed', fault: 'lopsided' },
      { total: 20, art: 9.1, valid: false, band: 'disaster', fault: null },
      { total: 72, art: 32.8, valid: true, band: 'almost', fault: 'lopsided' },
    ]);
  });

  it('a trial left mid-way records the step and the attempt they were on', () => {
    const t = trialTelemetry(
      trial({ phase: 'steam', attempt: 1, results: [attempt(30)], outcome: null }),
      100,
      meta('restarted'),
    );
    expect(t).toMatchObject({ verdict: null, score: null, seconds: 150 });
    expect(t.quit).toEqual({ phase: 'steam', attempt: 2 });
  });
});

describe('secondsStat', () => {
  it('median of an even count is the mean of the middle two; empty is all null', () => {
    expect(secondsStat([4, 1, 3, 2])).toEqual({
      each: [4, 1, 3, 2],
      mean: 2.5,
      median: 2.5,
      max: 4,
    });
    expect(secondsStat([])).toEqual({ each: [], mean: null, median: null, max: null });
  });
});

describe('the log', () => {
  const rec = (id: string): TelemetryRecord => shiftTelemetry(shift(), meta('finished', id));

  it('parses what it wrote, and anything else is an empty log (never throws)', () => {
    const log = putRecord(emptyLog(), rec('a'));
    expect(parseLog(JSON.stringify(log))).toEqual(log);
    expect(parseLog(null)).toEqual(emptyLog());
    expect(parseLog('')).toEqual(emptyLog());
    expect(parseLog('{not json')).toEqual(emptyLog());
    expect(parseLog('null')).toEqual(emptyLog());
    expect(parseLog('[1,2]')).toEqual(emptyLog());
    expect(parseLog(JSON.stringify({ version: 2, records: [rec('a')] }))).toEqual(emptyLog());
    expect(parseLog(JSON.stringify({ version: TELEMETRY_VERSION, records: 'x' }))).toEqual(
      emptyLog(),
    );
    // Junk entries are dropped, good ones kept.
    const mixed = { version: TELEMETRY_VERSION, records: [1, null, { kind: 'shift' }, rec('b')] };
    expect(parseLog(JSON.stringify(mixed)).records.map((r) => r.id)).toEqual(['b']);
  });

  it('a record with the same id replaces the earlier one in place (a page hidden, then back)', () => {
    let log = putRecord(emptyLog(), rec('a'));
    log = putRecord(log, rec('b'));
    const closed = shiftTelemetry(shift(), meta('closed', 'a'));
    log = putRecord(log, closed);
    expect(log.records.map((r) => [r.id, r.ending])).toEqual([
      ['a', 'closed'],
      ['b', 'finished'],
    ]);
  });

  it(`keeps the last ${TELEMETRY_CAP} records`, () => {
    let log = emptyLog();
    for (let i = 0; i < TELEMETRY_CAP + 5; i++) log = putRecord(log, rec(`r${i}`));
    expect(log.records).toHaveLength(TELEMETRY_CAP);
    expect(log.records[0]?.id).toBe('r5');
    expect(log.records[TELEMETRY_CAP - 1]?.id).toBe(`r${TELEMETRY_CAP + 4}`);
    expect(putRecord(log, rec('new'), 3).records.map((r) => r.id)).toEqual([
      `r${TELEMETRY_CAP + 3}`,
      `r${TELEMETRY_CAP + 4}`,
      'new',
    ]);
  });
});

describe('a headless shift (rush bot)', () => {
  it("Day 2 with a first-timer's hands: the record's totals match the shift report", () => {
    const { r } = playRush({ seed: 3, ...BOT_FIRST_TIMER });
    expect(r.phase).toBe('summary');
    const s = r.summary as ShiftSummary;
    const t = shiftTelemetry(r, meta('finished'));
    expect(t.customers).toBe(s.customers);
    expect(t.served).toBe(s.ordersCompleted);
    expect(t.walkouts).toBe(s.walkouts);
    expect(t.tipsCents).toBe(s.tipsCents);
    expect(t.grade).toBe(s.grade);
    expect(t.satisfaction).toBe(s.satisfaction);
    expect(t.serveSeconds.each).toHaveLength(s.ordersCompleted);
    expect(t.serveSeconds.mean ?? 0).toBeCloseTo(s.avgServeSeconds, 0);
    expect(t.accuracy).toEqual(accuracyByField(r.listening));
    // The first two customers were asked "what was the drink?" once each.
    expect(t.pardons.questions).toBe(2);
    expect(t.registerWait.each).toHaveLength(r.customers.filter((c) => c.takenAt !== null).length);
    expect(t.registerWait.each.every((w) => w >= 0)).toBe(true);
    expect(t.quit).toBeNull();
    expect(JSON.parse(JSON.stringify(t))).toEqual(t); // plain JSON, as stored
  });

  it('nobody served: every walk-out is in the queue or at the register', () => {
    const { r } = playRush({ seed: 8, idle: true });
    const t = shiftTelemetry(r, meta('finished'));
    expect(t.walkouts).toBe(r.summary?.walkouts);
    expect(t.served).toBe(0);
    expect(t.walkoutsAt.queue + t.walkoutsAt.register).toBe(t.walkouts);
    expect(t.walkoutsAt.register).toBeGreaterThan(0);
    expect(t.registerWait.each).toEqual([]);
  });

  it('a week Friday (returning regulars, events): totals still match the report', () => {
    const { r } = playRush({
      seed: 2,
      week: { shiftIndex: 4, unlockedDrinks: ['flatWhite', 'longBlack'] },
    });
    const s = r.summary as ShiftSummary;
    const t = shiftTelemetry(r, meta('finished'));
    expect(t).toMatchObject({ mode: 'week', week: 1, shiftIndex: 4 });
    expect(t.customers).toBe(s.customers);
    expect(t.served).toBe(s.ordersCompleted);
    expect(t.tipsCents).toBe(s.tipsCents);
    expect(t.events).toEqual(
      r.shiftEvents.log.fired.map((e) => ({ id: e.id, at: Math.round(e.at * 10) / 10 })),
    );
    // Returning regulars: every serve record lands on exactly one visit.
    expect(r.customers.some((c) => c.key.includes('#') && c.outcome === 'served')).toBe(true);
    const perVisit = t.visits.filter((v) => v.outcome === 'served').map((v) => v.serveSeconds);
    const sort = (xs: Array<number | null>) => [...xs].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(sort(perVisit)).toEqual(sort(t.serveSeconds.each));
  });

  it('Endless: ends at the third walk-out, counted the same way as the report', () => {
    const { r } = playRush({
      seed: 5,
      idle: true,
      week: { shiftIndex: 4, endless: true, unlockedDrinks: ['flatWhite', 'longBlack'] },
    });
    const t = shiftTelemetry(r, meta('finished'));
    expect(t.mode).toBe('endless');
    expect(t.walkouts).toBe(3);
    expect(t.customers).toBe(r.summary?.customers);
    expect(t.arrived).toBeLessThan(r.customers.length);
  });
});
