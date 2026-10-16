// Local playtest telemetry (ROADMAP 0.8, TODO Phase 5): one record per shift and per Day 1 trial,
// built from what the game already keeps (the rush's customers, serve records and listening
// records; the trial's attempts). Pure: no DOM, no clock, no randomness. Times are game seconds;
// the wall-clock ISO strings in the meta come from src/app. Nothing here ever leaves the device:
// the store is localStorage (core/save/telemetry.ts) and the only way out is "Export log".
//
// The sources are structural (ShiftSource, TrialSource): core's Rush and Trial fit them as they
// are, and sim never imports core.

import type { Band, AttemptResult, Fault, TrialOutcome } from './attempt';
import type { ShiftEventId } from './contracts/events';
import {
  orderTier,
  type Difficulty,
  type ListenRecord,
  type OrderField,
  type OrderLine,
  type Tier,
} from './listening';
import { accuracyByField, type FieldAccuracy } from './listening/stats';
import type { ServeRecord, ShiftGrade, ShiftSummary } from './rush';

export const TELEMETRY_VERSION = 1;
/** Records kept (shifts and trials together); the oldest go first. */
export const TELEMETRY_CAP = 200;

/** How a record closed: the shift report or verdict, a restart, back to the title (or any other
 *  screen), or the page was hidden or closed with it still running. A 'closed' record is written
 *  when the page is hidden and replaced if the player comes back and carries on. */
export type Ending = 'finished' | 'restarted' | 'title' | 'closed';

/** Who, when and how it ended, from src/app (wall-clock ISO strings). */
export interface RecordMeta {
  /** Unique per record: a later close of the same shift replaces the earlier write. */
  id: string;
  /** The page load this happened in (ISO time it booted): one tester's sitting. */
  session: string;
  startedAt: string;
  endedAt: string;
  ending: Ending;
}

// ------------------------------------------------------------------ sources

/** What a shift record reads from a customer's visit (core/rush RushCustomer fits). */
export interface VisitSource {
  key: string;
  def: { id: string };
  line: OrderLine;
  state: string;
  outcome: 'served' | 'walkout' | 'refused' | null;
  registerAt: number | null;
  takenAt: number | null;
  orderedAt: number | null;
  ticket: number | null;
  rejected: number;
  listen: { replays: number; repeats: number; questions: number };
  result: { satisfaction: number; tipCents: number } | null;
}

/** What a shift record reads from the rush (core/rush Rush fits). */
export interface ShiftSource {
  seed: number;
  difficulty: Difficulty;
  week: { week?: number; shiftIndex: number; endless?: boolean } | null;
  phase: string;
  serviceTime: number;
  barista: { phase: string };
  customers: readonly VisitSource[];
  records: readonly ServeRecord[];
  listening: readonly ListenRecord[];
  summary: ShiftSummary | null;
  shiftEvents: { log: { fired: ReadonlyArray<{ id: ShiftEventId; at: number }> } };
}

/** What a trial record reads from Day 1 (core/trial Trial fits). */
export interface TrialSource {
  seed: number;
  /** Game seconds (pauses with the clock). */
  time: number;
  phase: string;
  attempt: number;
  results: readonly AttemptResult[];
  outcome: TrialOutcome | null;
}

// ------------------------------------------------------------------ records

export type ShiftMode = 'day2' | 'week' | 'endless';

/** How far a visit got: still queueing, at the register (order not taken), ordering (taken, not
 *  rung up), or a ticket on the rail. For a walk-out, where they gave up. */
export type Reached = 'queue' | 'register' | 'ordering' | 'ticket';

export interface VisitTelemetry {
  /** 'karen', or 'karen#2' for a regular's second visit in a longer shift. */
  key: string;
  line: string;
  tier: Tier;
  /** Null: still in the café when the shift ended. */
  outcome: 'served' | 'walkout' | 'refused' | null;
  reached: Reached;
  /** Seconds at the register before "Take order" (null if never taken). */
  registerWait: number | null;
  /** Seconds from "Take order" to the ticket printing (hearing it, asking, ringing up). */
  ringUpSeconds: number | null;
  /** Seconds from reaching the register to an accepted drink (served only). */
  serveSeconds: number | null;
  replays: number;
  repeats: number;
  /** Clarifying questions asked. */
  questions: number;
  /** Fields rung up wrong (null: never rung up). */
  wrong: OrderField[] | null;
  /** Drinks handed back (wrong drink or milk). */
  handedBack: number;
  satisfaction: number | null;
  tipCents: number | null;
}

/** n, mean, median and max of a list of seconds (null when empty), rounded to 0.1 s. */
export interface SecondsStat {
  each: number[];
  mean: number | null;
  median: number | null;
  max: number | null;
}

export interface ShiftTelemetry extends RecordMeta {
  kind: 'shift';
  mode: ShiftMode;
  /** Week mode: 1-based week and 0-based shift of it (Monday = 0). Null on Day 2 and Endless. */
  week: number | null;
  shiftIndex: number | null;
  seed: number;
  difficulty: Difficulty;
  /** Visits that walked in (Endless lines people up far ahead; only those who came count). */
  arrived: number;
  /** Served + walk-outs, as on the shift report (ShiftSummary.customers). */
  customers: number;
  served: number;
  walkouts: number;
  /** Walk-outs by how far they got (the register count is the QUEUE_JUMP question). */
  walkoutsAt: Record<Reached, number>;
  /** Shown the door by a shift event (not a walk-out, not a drink). */
  refused: number;
  handedBack: number;
  /** Rung up vs ordered, per field (milk, temperature and heart only on flat whites heard as
   *  flat whites; see sim/listening/stats.ts). */
  accuracy: Record<OrderField, FieldAccuracy>;
  /** Listening aids used, over every visit (rung up or not). */
  pardons: { replays: number; repeats: number; questions: number };
  /** Register to accepted drink, per served customer in serve order. */
  serveSeconds: SecondsStat;
  /** Register to "Take order", per order taken. */
  registerWait: SecondsStat;
  /** Shift events in the order they fired (seconds into service). */
  events: Array<{ id: ShiftEventId; at: number }>;
  /** From the shift report: null unless it finished. */
  grade: ShiftGrade | null;
  satisfaction: number | null;
  /** Tips from the drinks served so far, integer cents. */
  tipsCents: number;
  /** Seconds of service when the record closed. */
  serviceSeconds: number;
  /** Where they left off (null when it finished). */
  quit: {
    phase: string;
    serviceTime: number;
    served: number;
    walkouts: number;
    /** People in the café (queueing, at the counter or waiting on a drink). */
    inCafe: number;
    /** The espresso station's step at the time (e.g. 'pour'). */
    station: string;
  } | null;
  visits: VisitTelemetry[];
}

export interface TrialAttemptTelemetry {
  total: number;
  /** Art points (out of the total's share for art). */
  art: number;
  valid: boolean;
  band: Band;
  /** The worst fault, if any. */
  fault: Fault | null;
}

export interface TrialTelemetry extends RecordMeta {
  kind: 'trial';
  seed: number;
  attempts: TrialAttemptTelemetry[];
  /** Gaz's verdict (null unless it finished). */
  verdict: Band | null;
  score: number | null;
  /** Game seconds since the trial began. */
  seconds: number;
  /** Where they left off: the step and the 1-based attempt (null when it finished). */
  quit: { phase: string; attempt: number } | null;
}

export type TelemetryRecord = ShiftTelemetry | TrialTelemetry;

export interface TelemetryLog {
  version: typeof TELEMETRY_VERSION;
  records: TelemetryRecord[];
}

// ------------------------------------------------------------------ helpers

const round1 = (x: number): number => Math.round(x * 10) / 10;

export function secondsStat(values: readonly number[]): SecondsStat {
  const each = values.map(round1);
  if (each.length === 0) return { each, mean: null, median: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    each,
    mean: round1(mean),
    median: round1(median),
    max: round1(sorted[sorted.length - 1] as number),
  };
}

/** How far a visit got, from its timestamps. */
export function reached(v: VisitSource): Reached {
  if (v.registerAt === null) return 'queue';
  if (v.takenAt === null) return 'register';
  if (v.ticket === null) return 'ordering';
  return 'ticket';
}

/** Records name the speaker, not the visit; a regular's visits never overlap, so the k-th served
 *  (or rung-up) visit of a speaker is their k-th record. */
function bySpeaker<T extends { customer: string }>(items: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const list = m.get(it.customer);
    if (list) list.push(it);
    else m.set(it.customer, [it]);
  }
  return m;
}

function modeOf(s: ShiftSource): ShiftMode {
  if (!s.week) return 'day2';
  return s.week.endless ? 'endless' : 'week';
}

const IN_CAFE = new Set(['queue', 'register', 'ordering', 'deciding', 'waiting']);

// ------------------------------------------------------------------ builders

/** A shift's record as it stands now: at the report, or wherever the player left it. */
export function shiftTelemetry(s: ShiftSource, meta: RecordMeta): ShiftTelemetry {
  const serves = bySpeaker(s.records);
  const tickets = bySpeaker(s.listening);
  const visits: VisitTelemetry[] = [];
  const walkoutsAt: Record<Reached, number> = { queue: 0, register: 0, ordering: 0, ticket: 0 };
  const waits: number[] = [];
  const pardons = { replays: 0, repeats: 0, questions: 0 };
  let served = 0;
  let walkouts = 0;
  let refused = 0;
  let handedBack = 0;
  let inCafe = 0;
  for (const c of s.customers) {
    if (c.state === 'outside') continue;
    if (IN_CAFE.has(c.state)) inCafe++;
    const r = reached(c);
    const rec = c.outcome === 'served' ? (serves.get(c.def.id)?.shift() ?? null) : null;
    const heard = c.ticket !== null ? (tickets.get(c.def.id)?.shift() ?? null) : null;
    const wait = c.registerAt !== null && c.takenAt !== null ? c.takenAt - c.registerAt : null;
    if (wait !== null) waits.push(wait);
    if (c.outcome === 'served') served++;
    else if (c.outcome === 'walkout') {
      walkouts++;
      walkoutsAt[r]++;
    } else if (c.outcome === 'refused') refused++;
    handedBack += c.rejected;
    pardons.replays += c.listen.replays;
    pardons.repeats += c.listen.repeats;
    pardons.questions += c.listen.questions;
    visits.push({
      key: c.key,
      line: c.line.id,
      tier: orderTier(c.line),
      outcome: c.outcome,
      reached: r,
      registerWait: wait === null ? null : round1(wait),
      ringUpSeconds:
        c.takenAt !== null && c.orderedAt !== null ? round1(c.orderedAt - c.takenAt) : null,
      serveSeconds: rec ? round1(rec.waited) : null,
      replays: c.listen.replays,
      repeats: c.listen.repeats,
      questions: c.listen.questions,
      wrong: heard ? [...heard.wrong] : null,
      handedBack: c.rejected,
      satisfaction: c.result && c.outcome === 'served' ? c.result.satisfaction : null,
      tipCents: c.result && c.outcome === 'served' ? c.result.tipCents : null,
    });
  }
  const done = s.records.filter((x) => x.accepted);
  const finished = meta.ending === 'finished';
  const w = s.week && !s.week.endless ? s.week : null;
  return {
    kind: 'shift',
    ...meta,
    mode: modeOf(s),
    week: w ? (w.week ?? 1) : null,
    shiftIndex: w ? w.shiftIndex : null,
    seed: s.seed,
    difficulty: s.difficulty,
    arrived: visits.length,
    customers: served + walkouts,
    served,
    walkouts,
    walkoutsAt,
    refused,
    handedBack,
    accuracy: accuracyByField(s.listening),
    pardons,
    serveSeconds: secondsStat(done.map((x) => x.waited)),
    registerWait: secondsStat(waits),
    events: s.shiftEvents.log.fired.map((e) => ({ id: e.id, at: round1(e.at) })),
    grade: s.summary?.grade ?? null,
    satisfaction: s.summary?.satisfaction ?? null,
    tipsCents: done.reduce((t, x) => t + x.tipCents, 0),
    serviceSeconds: round1(s.serviceTime),
    quit: finished
      ? null
      : {
          phase: s.phase,
          serviceTime: round1(s.serviceTime),
          served,
          walkouts,
          inCafe,
          station: s.barista.phase,
        },
    visits,
  };
}

/** A Day 1 trial's record. `startTime` is the trial's game time when it began. */
export function trialTelemetry(
  t: TrialSource,
  startTime: number,
  meta: RecordMeta,
): TrialTelemetry {
  const finished = meta.ending === 'finished';
  return {
    kind: 'trial',
    ...meta,
    seed: t.seed,
    attempts: t.results.map((a) => ({
      total: a.total,
      art: round1(a.art),
      valid: a.valid,
      band: a.band,
      fault: a.faults[0] ?? null,
    })),
    verdict: t.outcome?.band ?? null,
    score: t.outcome?.score ?? null,
    seconds: round1(Math.max(0, t.time - startTime)),
    quit: finished ? null : { phase: t.phase, attempt: t.attempt + 1 },
  };
}

// ------------------------------------------------------------------ the log

export const emptyLog = (): TelemetryLog => ({ version: TELEMETRY_VERSION, records: [] });

const isRecord = (x: unknown): x is TelemetryRecord =>
  typeof x === 'object' &&
  x !== null &&
  ((x as { kind?: unknown }).kind === 'shift' || (x as { kind?: unknown }).kind === 'trial') &&
  typeof (x as { id?: unknown }).id === 'string';

/** The stored log, or an empty one for anything missing, corrupt or from another version. Never
 *  throws. */
export function parseLog(raw: string | null | undefined): TelemetryLog {
  if (!raw) return emptyLog();
  try {
    const data = JSON.parse(raw) as { version?: unknown; records?: unknown };
    if (!data || data.version !== TELEMETRY_VERSION || !Array.isArray(data.records))
      return emptyLog();
    return { version: TELEMETRY_VERSION, records: data.records.filter(isRecord) };
  } catch {
    return emptyLog();
  }
}

/** The log with this record added, or put in place of the one with its id; the oldest records
 *  drop off past `cap`. */
export function putRecord(
  log: TelemetryLog,
  rec: TelemetryRecord,
  cap = TELEMETRY_CAP,
): TelemetryLog {
  const i = log.records.findIndex((x) => x.id === rec.id);
  const records = i >= 0 ? log.records.map((x, n) => (n === i ? rec : x)) : [...log.records, rec];
  return {
    version: TELEMETRY_VERSION,
    records: records.length > cap ? records.slice(records.length - cap) : records,
  };
}
