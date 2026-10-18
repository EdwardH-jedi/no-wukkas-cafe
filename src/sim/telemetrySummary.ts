// Playtest numbers from exported logs (todo.md T3.6): what Settings → Playtest log → "Export log"
// downloads (`{version: 1, records}`, sim/telemetry.ts), one file per tester or device, added up
// into the figures the playtest notes need (docs/playtests/README.md). Pure: no files, no clock;
// scripts/playtest-summary.ts reads the files and prints summaryMarkdown().

import type { Band } from './attempt';
import { ORDER_FIELDS, type OrderField } from './listening';
import type { FieldAccuracy } from './listening/stats';
import {
  secondsStat,
  TELEMETRY_VERSION,
  type Ending,
  type Reached,
  type ShiftMode,
  type ShiftTelemetry,
  type TelemetryLog,
  type TelemetryRecord,
  type TrialTelemetry,
} from './telemetry';

/** An exported file's text: the log, or why it can't be read. Unlike parseLog (which quietly
 *  starts empty), a summary must not count a file it couldn't read as zero, nor a record it can't
 *  read (review 2026-10-19 F2): every field summarise() reads is checked first. */
export type ExportRead = { ok: true; log: TelemetryLog } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCount = (x: unknown): boolean => Number.isInteger(x) && (x as number) >= 0;
const isSeconds = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const ENDINGS: readonly unknown[] = ['finished', 'restarted', 'title', 'closed'];
const MODES: readonly unknown[] = ['day2', 'week', 'endless'];
const STAGES = ['queue', 'register', 'ordering', 'ticket'] as const;
const BANDS: readonly unknown[] = ['hired', 'almost', 'failed', 'disaster'];

/** The first field of a shift record the summary can't read, or null. */
function badShiftField(r: Obj): string | null {
  if (!MODES.includes(r.mode)) return 'mode';
  if (r.shiftIndex !== null && !isCount(r.shiftIndex)) return 'shiftIndex';
  for (const k of ['customers', 'served', 'walkouts', 'refused', 'handedBack'])
    if (!isCount(r[k])) return k;
  const at = r.walkoutsAt;
  if (!isObj(at) || !STAGES.every((k) => isCount(at[k]))) return 'walkoutsAt';
  const acc = r.accuracy;
  if (!isObj(acc)) return 'accuracy';
  for (const f of ORDER_FIELDS) {
    const a = acc[f];
    if (!isObj(a) || !isCount(a.total) || !isCount(a.correct)) return `accuracy.${f}`;
  }
  const p = r.pardons;
  if (!isObj(p) || !['replays', 'repeats', 'questions'].every((k) => isCount(p[k])))
    return 'pardons';
  for (const k of ['registerWait', 'serveSeconds']) {
    const st = r[k];
    if (!isObj(st) || !Array.isArray(st.each) || !st.each.every(isSeconds)) return k;
  }
  const stage = (v: unknown): boolean =>
    isObj(v) && (STAGES as readonly unknown[]).includes(v.reached);
  if (!Array.isArray(r.visits) || !r.visits.every(stage)) return 'visits';
  const q = r.quit;
  const quitOk =
    q === null ||
    (isObj(q) &&
      typeof q.phase === 'string' &&
      isSeconds(q.serviceTime) &&
      isCount(q.served) &&
      isCount(q.inCafe) &&
      typeof q.station === 'string');
  return quitOk ? null : 'quit';
}

/** The first field of a trial record the summary can't read, or null. */
function badTrialField(r: Obj): string | null {
  if (r.verdict !== null && !BANDS.includes(r.verdict)) return 'verdict';
  const q = r.quit;
  const quitOk = q === null || (isObj(q) && typeof q.phase === 'string' && isCount(q.attempt));
  return quitOk ? null : 'quit';
}

/** Why record `i` can't be summed, or null when it can. */
function recordProblem(r: unknown, i: number): string | null {
  if (!isObj(r)) return `record ${i} is not an object`;
  const name = `record ${i}${typeof r.id === 'string' ? ` (${r.id})` : ''}`;
  if (r.kind !== 'shift' && r.kind !== 'trial')
    return `${name}: unknown kind ${JSON.stringify(r.kind)}`;
  const field =
    typeof r.id !== 'string'
      ? 'id'
      : typeof r.session !== 'string'
        ? 'session'
        : typeof r.endedAt !== 'string'
          ? 'endedAt'
          : !ENDINGS.includes(r.ending)
            ? 'ending'
            : r.kind === 'shift'
              ? badShiftField(r)
              : badTrialField(r);
  return field ? `${name}: "${field}" is missing or not what an export holds` : null;
}

export function readExport(text: string): ExportRead {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not JSON (is this an exported playtest log?)' };
  }
  const d = data as { version?: unknown; records?: unknown } | null;
  if (!d || typeof d !== 'object' || !('version' in d))
    return { ok: false, error: 'no "version": not a playtest log export' };
  if (d.version !== TELEMETRY_VERSION)
    return {
      ok: false,
      error: `log version ${JSON.stringify(d.version)}, this summary reads version ${TELEMETRY_VERSION}`,
    };
  if (!Array.isArray(d.records)) return { ok: false, error: '"records" is not a list' };
  for (let i = 0; i < d.records.length; i++) {
    const problem = recordProblem(d.records[i], i);
    if (problem) return { ok: false, error: problem };
  }
  return { ok: true, log: { version: TELEMETRY_VERSION, records: d.records as TelemetryRecord[] } };
}

export type Verdict = Band | 'unfinished';

export interface QuitPoint {
  kind: 'shift' | 'trial';
  id: string;
  ending: Ending;
  /** Where they left off: the phase and station of a shift, the step and attempt of a trial. */
  where: string;
}

export interface PlaytestSummary {
  logs: number;
  /** Distinct page loads (RecordMeta.session) across the logs. */
  sessions: number;
  trials: number;
  verdicts: Record<Verdict, number>;
  shifts: number;
  shiftsByMode: Record<ShiftMode, number>;
  /** Shifts that reached their report. */
  finished: number;
  customers: number;
  served: number;
  walkouts: number;
  walkoutsAt: Record<Reached, number>;
  refused: number;
  handedBack: number;
  accuracy: Record<OrderField, FieldAccuracy>;
  pardons: { replays: number; repeats: number; questions: number };
  /** Visits whose order was said (they reached the order line or the rail). */
  ordersHeard: number;
  /** All pardons over ordersHeard, 2 decimals; null with no orders. */
  pardonsPerOrder: number | null;
  /** Seconds, over every visit in every shift. */
  registerWait: { median: number | null; max: number | null };
  serveSeconds: { median: number | null; max: number | null };
  quits: QuitPoint[];
}

/** The records of every log, a record seen twice counted once: the same run exported again later
 *  (a checkpoint, then its end) keeps the copy that closed last, whatever the file order (review
 *  2026-10-19 F1). On equal times the later file wins. */
function records(logs: readonly TelemetryLog[]): TelemetryRecord[] {
  const byId = new Map<string, TelemetryRecord>();
  for (const l of logs)
    for (const r of l.records) {
      const seen = byId.get(r.id);
      if (!seen || r.endedAt >= seen.endedAt) byId.set(r.id, r);
    }
  return [...byId.values()];
}

export function summarise(logs: readonly TelemetryLog[]): PlaytestSummary {
  const all = records(logs);
  const shifts = all.filter((r): r is ShiftTelemetry => r.kind === 'shift');
  const trials = all.filter((r): r is TrialTelemetry => r.kind === 'trial');
  const sum = (f: (s: ShiftTelemetry) => number): number => shifts.reduce((t, s) => t + f(s), 0);
  const accuracy = Object.fromEntries(
    ORDER_FIELDS.map((f) => [
      f,
      { total: sum((s) => s.accuracy[f].total), correct: sum((s) => s.accuracy[f].correct) },
    ]),
  ) as Record<OrderField, FieldAccuracy>;
  const pardons = {
    replays: sum((s) => s.pardons.replays),
    repeats: sum((s) => s.pardons.repeats),
    questions: sum((s) => s.pardons.questions),
  };
  const ordersHeard = sum(
    (s) => s.visits.filter((v) => v.reached === 'ordering' || v.reached === 'ticket').length,
  );
  const all3 = pardons.replays + pardons.repeats + pardons.questions;
  const waits = secondsStat(shifts.flatMap((s) => s.registerWait.each));
  const serves = secondsStat(shifts.flatMap((s) => s.serveSeconds.each));
  const verdicts: Record<Verdict, number> = {
    hired: 0,
    almost: 0,
    failed: 0,
    disaster: 0,
    unfinished: 0,
  };
  for (const t of trials) verdicts[t.verdict ?? 'unfinished']++;
  const quits: QuitPoint[] = [
    ...trials
      .filter((t) => t.quit)
      .map((t) => ({
        kind: 'trial' as const,
        id: t.id,
        ending: t.ending,
        where: `${t.quit!.phase}, attempt ${t.quit!.attempt}`,
      })),
    ...shifts
      .filter((s) => s.quit)
      .map((s) => ({
        kind: 'shift' as const,
        id: s.id,
        ending: s.ending,
        where: `${s.mode}${s.shiftIndex !== null ? ` shift ${s.shiftIndex + 1}` : ''}: ${s.quit!.phase} at ${s.quit!.serviceTime} s, station ${s.quit!.station}, ${s.quit!.served} served, ${s.quit!.inCafe} in the café`,
      })),
  ];
  const walkoutsAt: Record<Reached, number> = { queue: 0, register: 0, ordering: 0, ticket: 0 };
  for (const s of shifts)
    for (const k of Object.keys(walkoutsAt) as Reached[]) walkoutsAt[k] += s.walkoutsAt[k];
  return {
    logs: logs.length,
    sessions: new Set(all.map((r) => r.session)).size,
    trials: trials.length,
    verdicts,
    shifts: shifts.length,
    shiftsByMode: {
      day2: shifts.filter((s) => s.mode === 'day2').length,
      week: shifts.filter((s) => s.mode === 'week').length,
      endless: shifts.filter((s) => s.mode === 'endless').length,
    },
    finished: shifts.filter((s) => s.quit === null).length,
    customers: sum((s) => s.customers),
    served: sum((s) => s.served),
    walkouts: sum((s) => s.walkouts),
    walkoutsAt,
    refused: sum((s) => s.refused),
    handedBack: sum((s) => s.handedBack),
    accuracy,
    pardons,
    ordersHeard,
    pardonsPerOrder: ordersHeard > 0 ? Math.round((all3 / ordersHeard) * 100) / 100 : null,
    registerWait: { median: waits.median, max: waits.max },
    serveSeconds: { median: serves.median, max: serves.max },
    quits,
  };
}

const secs = (x: number | null): string => (x === null ? '–' : `${x} s`);
const pct = (a: FieldAccuracy): string =>
  a.total === 0 ? '–' : `${Math.round((a.correct / a.total) * 100)} %`;

/** The summary as Markdown tables, for docs/playtests/<date>.md. */
export function summaryMarkdown(s: PlaytestSummary): string {
  const v = s.verdicts;
  const lines = [
    '## Playtest summary',
    '',
    '| | |',
    '| --- | --- |',
    `| Logs · sessions | ${s.logs} · ${s.sessions} |`,
    `| Day 1 trials | ${s.trials}: hired ${v.hired}, almost ${v.almost}, failed ${v.failed}, disaster ${v.disaster}, unfinished ${v.unfinished} |`,
    `| Shifts | ${s.shifts} (Day 2 ${s.shiftsByMode.day2}, week ${s.shiftsByMode.week}, Endless ${s.shiftsByMode.endless}), ${s.finished} to the report |`,
    `| Customers · served · walk-outs · shown the door | ${s.customers} · ${s.served} · ${s.walkouts} · ${s.refused} |`,
    `| Walk-outs by stage | queue ${s.walkoutsAt.queue} · register ${s.walkoutsAt.register} · ordering ${s.walkoutsAt.ordering} · ticket ${s.walkoutsAt.ticket} |`,
    `| Drinks handed back | ${s.handedBack} |`,
    `| Pardons (replays · repeats · questions) | ${s.pardons.replays} · ${s.pardons.repeats} · ${s.pardons.questions} |`,
    `| Pardons per order | ${s.pardonsPerOrder ?? '–'} (${s.ordersHeard} orders heard) |`,
    `| Register wait (median · max) | ${secs(s.registerWait.median)} · ${secs(s.registerWait.max)} |`,
    `| Time to serve (median · max) | ${secs(s.serveSeconds.median)} · ${secs(s.serveSeconds.max)} |`,
    '',
    '### Accuracy per field (what was rung up vs. what was said)',
    '',
    '| Field | Right | Heard | |',
    '| --- | --- | --- | --- |',
    ...ORDER_FIELDS.map(
      (f) => `| ${f} | ${s.accuracy[f].correct} | ${s.accuracy[f].total} | ${pct(s.accuracy[f])} |`,
    ),
    '',
    '### Quit points',
    '',
  ];
  if (s.quits.length === 0) lines.push('None: every record ran to its end.');
  else
    lines.push(
      '| Record | Ending | Where |',
      '| --- | --- | --- |',
      ...s.quits.map((q) => `| ${q.kind} ${q.id} | ${q.ending} | ${q.where} |`),
    );
  return `${lines.join('\n')}\n`;
}
