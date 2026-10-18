// Invariants the seed-fuzz tests (tests/fuzz/) check, written from the code's own rules and
// comments rather than by calling the function under test. Each returns the rules a value breaks
// (empty when it keeps them all), so a fuzz can collect every failing seed before asserting.

import { isDeepStrictEqual } from 'node:util';
import type { Rush } from '../../src/core/rush';
import { absoluteShift } from '../../src/core/rush/state';
import {
  bestGrade,
  endlessUnlocked,
  shiftDef,
  shiftRows,
  SHIFTS_PER_WEEK,
  unlocksFor,
} from '../../src/core/week/progress';
import { canPlay, weekFor } from '../../src/core/week/session';
import { customerDef, type CustomerId } from '../../src/data/customers';
import { DIFFICULT_PERSONALITIES, USUAL_AFFINITY } from '../../src/data/events';
import { PATIENCE_SCALE } from '../../src/data/week';
import type { EventContext, ShiftEventId } from '../../src/sim/contracts/events';
import { migrate, REGULAR_IDS, STARTING_DRINKS, type SaveV2 } from '../../src/sim/contracts/save';
import { DRINK_IDS, isDrinkId } from '../../src/sim/contracts/ticket';
import { eventDef } from '../../src/sim/events/defs';
import { SCHEDULER_DEFAULTS } from '../../src/sim/events/scheduler';
import { gradeShift, type ShiftGrade, type ShiftSummary } from '../../src/sim/rush';

const json = (x: unknown): string => JSON.stringify(x);
/** Deep equality that ignores key order (JSON text doesn't). */
const same = (a: unknown, b: unknown): boolean => isDeepStrictEqual(a, b);
const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === new Set(a).size &&
  new Set(a).size === new Set(b).size &&
  b.every((x) => a.includes(x));

/** Where the save is in its run of shifts: 0 = week 1 Monday. */
export const position = (s: SaveV2): number => (s.week - 1) * SHIFTS_PER_WEEK + s.shift;

const RANK: Record<ShiftGrade, number> = { disaster: 0, poor: 1, okay: 2, good: 3, excellent: 4 };

/** A shift report's own consistency (sim/rush.ts summariseShift + evaluateServe's tips). */
export function summaryBroken(r: ShiftSummary): string[] {
  const v: string[] = [];
  const whole = (k: keyof ShiftSummary, x: unknown): void => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) v.push(`${k} ${String(x)}`);
  };
  whole('customers', r.customers);
  whole('ordersCompleted', r.ordersCompleted);
  whole('correctOrders', r.correctOrders);
  whole('walkouts', r.walkouts);
  whole('wasted', r.wasted);
  whole('tipsCents', r.tipsCents);
  whole('satisfaction', r.satisfaction);
  if (r.satisfaction > 100) v.push(`satisfaction ${r.satisfaction} > 100`);
  if (r.tipsCents % 10 !== 0) v.push(`tips ${r.tipsCents} c not in whole 10 c`);
  if (r.ordersCompleted > r.customers) v.push('more orders completed than customers');
  if (r.correctOrders > r.ordersCompleted) v.push('more correct orders than completed');
  if (r.walkouts !== r.customers - r.ordersCompleted) v.push('walkouts ≠ customers − completed');
  if (!Number.isFinite(r.avgServeSeconds) || r.avgServeSeconds < 0)
    v.push(`avgServeSeconds ${r.avgServeSeconds}`);
  if (r.grade !== gradeShift(r.satisfaction, r.walkouts))
    v.push(`grade ${r.grade}, gradeShift says ${gradeShift(r.satisfaction, r.walkouts)}`);
  return v;
}

/**
 * The save after a shift report, against the save before it. `played` = the save was reached by
 * playing from a fresh one (so earlier shifts of week 1 really were passed).
 */
export function progressBroken(
  before: SaveV2,
  after: SaveV2,
  report: ShiftSummary,
  affinity: Partial<Record<CustomerId, number>>,
  played: boolean,
): string[] {
  const v: string[] = [];
  const pass = report.grade !== 'disaster';
  if (!Number.isInteger(after.week) || after.week < 1) v.push(`week ${after.week}`);
  if (!Number.isInteger(after.shift) || after.shift < 0 || after.shift >= SHIFTS_PER_WEEK)
    v.push(`shift ${after.shift}`);
  // Moves on by exactly one shift on a pass, stays put on a disaster.
  const want = position(before) + (pass ? 1 : 0);
  if (position(after) !== want)
    v.push(
      `${report.grade}: week ${before.week} shift ${before.shift} → week ${after.week} shift ${after.shift}`,
    );
  // The receipt is appended; nothing earlier is lost or changed.
  if (after.reports.length !== before.reports.length + 1)
    v.push(`${before.reports.length} reports → ${after.reports.length}`);
  if (!same(after.reports.slice(0, before.reports.length), before.reports))
    v.push('an earlier report changed');
  if (!same(after.reports.at(-1), { week: before.week, shift: before.shift, summary: report }))
    v.push(`last report ${json(after.reports.at(-1))}`);
  // Tips go in the till as whole cents, pass or fail.
  if (!Number.isInteger(after.cents)) v.push(`cents ${after.cents}`);
  if (after.cents !== before.cents + Math.round(report.tipsCents))
    v.push(`till ${before.cents} + ${report.tipsCents} → ${after.cents}`);
  if (before.cents >= 0 && report.tipsCents >= 0 && after.cents < 0)
    v.push('the till went negative');
  // The menu only grows, and only to what the week table has reached.
  const menu: readonly string[] = after.unlockedDrinks;
  if (!menu.every((d) => isDrinkId(d))) v.push(`unknown drink in ${menu.join(',')}`);
  if (new Set(menu).size !== menu.length) v.push(`duplicate drinks ${menu.join(',')}`);
  for (const d of [...before.unlockedDrinks, ...STARTING_DRINKS, ...unlocksFor(after.shift)])
    if (!menu.includes(d)) v.push(`${d} missing from the menu`);
  if (played && after.week === 1 && !sameSet(menu, unlocksFor(after.shift)))
    v.push(
      `week 1 shift ${after.shift} menu ${menu.join(',')} ≠ ${unlocksFor(after.shift).join(',')}`,
    );
  if (played && after.week > 1 && !sameSet(menu, DRINK_IDS))
    v.push(`week ${after.week} menu ${menu}`);
  // Only the shift the week is on can be played; Endless opens after the first pass.
  const playable = [0, 1, 2, 3, 4].filter((i) => canPlay(after, i));
  if (json(playable) !== json([after.shift])) v.push(`playable ${json(playable)}`);
  if (endlessUnlocked(after) !== position(after) > 0) v.push('Endless lock ⇎ a shift passed');
  // What the rush is handed for the next shift.
  const w = weekFor(after);
  if (
    w.week !== after.week ||
    w.shiftIndex !== after.shift ||
    json(w.unlockedDrinks) !== json(menu)
  )
    v.push(`weekFor ${json({ week: w.week, shift: w.shiftIndex })}`);
  // Regulars keep what the events taught them; nothing else of the save moves.
  for (const id of REGULAR_IDS) {
    const was = before.regulars[id];
    const d = affinity[id] ?? 0;
    const now = after.regulars[id];
    if (d === 0 ? !same(now, was) : now?.affinity !== (was?.affinity ?? 0) + d)
      v.push(`${id} affinity ${was?.affinity} + ${d} → ${now?.affinity}`);
    if (now && (!Number.isInteger(now.visits) || now.visits < 0))
      v.push(`${id} visits ${now.visits}`);
    if (now && (w.affinity?.[id] ?? null) !== now.affinity) v.push(`weekFor lost ${id}'s affinity`);
  }
  for (const k of ['seed', 'difficulty', 'createdAt', 'version', 'upgrades'] as const)
    if (!same(after[k], before[k])) v.push(`${k} changed`);
  // It survives the disk (migrate is the only way back in).
  if (!same(migrate(JSON.stringify(after)), after)) v.push('save changes through migrate');
  // Shift select.
  const rows = shiftRows(after);
  if (json(rows.map((r) => r.index)) !== json([0, 1, 2, 3, 4])) v.push('shift rows out of order');
  for (const r of rows) {
    let best: ShiftGrade | null = null;
    for (const x of after.reports)
      if (x.shift === r.index && (best === null || RANK[x.summary.grade] > RANK[best]))
        best = x.summary.grade;
    if (r.best !== best || bestGrade(after, r.index) !== best)
      v.push(`row ${r.index} best ${r.best}`);
    // Re-issued 2026-10-18 by the review session: in every week, and for any save, the row status
    // follows canPlay (only the shift the week is on: earlier ones done, later ones locked;
    // Edward, 2026-10-15, src/core/week/session.ts). The old week-2+ rule (every row done, none
    // locked) encoded the defect docs/TODO.md Phase 4 called cosmetic. `best` still carries an
    // earlier week's grade. A done row has a recorded pass only in a save reached by play: a
    // positioned save (`played` false) skips the history before its shift.
    const wantStatus = r.index < after.shift ? 'done' : r.index === after.shift ? 'open' : 'locked';
    if (r.status !== wantStatus) v.push(`row ${r.index} ${r.status}, want ${wantStatus}`);
    if (played && r.status === 'done' && (best === null || best === 'disaster'))
      v.push(`row ${r.index} done without a pass`);
  }
  return v;
}

/** Each shift event's trigger rule, from data/events.ts and the defs' comments (not canTrigger),
 *  so a rule quietly changed in sim/events/defs.ts shows up. Null when the context allows it. */
export function triggerBroken(id: ShiftEventId, c: Omit<EventContext, 'rng'>): string | null {
  const karen = c.customer !== null && DIFFICULT_PERSONALITIES.includes(c.customer);
  switch (id) {
    case 'RARE_BIRD':
      return c.customer === null
        ? null
        : `the bird came in while ${c.customer} was at the register`;
    case 'CALL_MANAGER':
      return karen ? null : `${c.customer ?? 'nobody'} called the manager (not a difficult sort)`;
    case 'WRONG_MILK':
      return c.customer !== null && (c.playerMistake || karen)
        ? null
        : `${c.customer ?? 'nobody'} claimed a wrong milk that was right`;
    case 'QUEUE_JUMP':
      return c.queueLength >= 2 ? null : `pushed in with ${c.queueLength} in the queue`;
    case 'THE_USUAL':
      return c.customer !== null && (c.affinity[c.customer] ?? 0) >= USUAL_AFFINITY
        ? null
        : `"the usual" from ${c.customer ?? 'nobody'} at affinity ${c.customer ? (c.affinity[c.customer] ?? 0) : '-'}`;
    case 'JUST_COFFEE':
    case 'CHANGE_MIND':
    case 'THE_NAME':
      return c.customer !== null ? null : `${id} with nobody at the register`;
  }
}

/** A week shift played to its report: every customer accounted for, the report and the event
 *  tallies agreeing with what happened, nothing left waiting. */
export function shiftBroken(r: Rush): string[] {
  const v: string[] = [];
  const w = r.week;
  if (!w) return ['not a week shift'];
  if (r.phase !== 'summary' || !r.summary) return [`never reached the report (phase ${r.phase})`];
  const s = r.summary;
  const def = shiftDef(w.shiftIndex);
  const n = r.customers.length;
  if (!w.endless && n !== def.customers)
    v.push(`${n} customers, the week table says ${def.customers}`);
  if (new Set(r.customers.map((c) => c.key)).size !== n) v.push('duplicate customer keys');
  const tally = { served: 0, walkout: 0, refused: 0, none: 0 };
  let lastArrival = -Infinity;
  for (const c of r.customers) {
    tally[c.outcome ?? 'none']++;
    if (!w.endless && c.state !== 'gone') v.push(`${c.key} still ${c.state} at the report`);
    if (!Number.isFinite(c.patience)) v.push(`${c.key} patience ${c.patience}`);
    if (!Number.isFinite(c.arriveAt) || c.arriveAt < 0 || c.arriveAt < lastArrival)
      v.push(`${c.key} arrives at ${c.arriveAt}`);
    lastArrival = c.arriveAt;
    const want = customerDef(c.def.id).patience * PATIENCE_SCALE[r.difficulty];
    if (c.maxPatience !== want) v.push(`${c.key} max patience ${c.maxPatience}, want ${want}`);
  }
  // Everyone is accounted for: served + walked out + shown the door (+ never got in, Endless).
  if (!w.endless && tally.none > 0) v.push(`${tally.none} customers with no outcome`);
  if (tally.served + tally.walkout + tally.refused + tally.none !== n)
    v.push('outcomes ≠ customers');
  if (s.customers !== tally.served + tally.walkout)
    v.push(`report counts ${s.customers}, served + walked out = ${tally.served + tally.walkout}`);
  if (s.walkouts !== tally.walkout)
    v.push(`report walkouts ${s.walkouts}, really ${tally.walkout}`);
  if (s.ordersCompleted !== tally.served)
    v.push(`report served ${s.ordersCompleted}, really ${tally.served}`);
  if (r.records.length !== tally.served) v.push(`${r.records.length} serve records`);
  if (s.tipsCents !== r.records.reduce((t, x) => t + x.tipCents, 0)) v.push('tips ≠ the serves');
  if (r.shiftEvents.refused !== tally.refused)
    v.push(`events refused ${r.shiftEvents.refused}, really ${tally.refused}`);
  v.push(...summaryBroken(s));
  // Tickets: one per order rung up, numbered 1..n, each listening record about its customer.
  const ticketed = r.customers
    .filter((c) => c.ticket !== null)
    .sort((a, b) => (a.ticket ?? 0) - (b.ticket ?? 0));
  if (json(ticketed.map((c) => c.ticket)) !== json(ticketed.map((_, i) => i + 1)))
    v.push(`tickets ${ticketed.map((c) => c.ticket).join(',')}`);
  if (r.listening.length !== ticketed.length) v.push(`${r.listening.length} listening records`);
  r.listening.forEach((l, i) => {
    const c = ticketed[i];
    if (!c || l.customer !== c.def.id || json(l.truth) !== json(c.order))
      v.push(`listening record ${i} is not ticket ${i + 1}'s order`);
  });
  // The events: tallies sane, nothing left on screen, inside the cap and the gap.
  const e = r.shiftEvents;
  if (e.current !== null) v.push(`event ${e.current.def.id} still waiting at the report`);
  if (!Number.isInteger(e.wasteCents) || e.wasteCents < 0) v.push(`event waste ${e.wasteCents} c`);
  for (const [id, d] of Object.entries(e.affinity))
    if (!(REGULAR_IDS as readonly string[]).includes(id) || !Number.isInteger(d))
      v.push(`affinity ${id} ${d}`);
  const fired = e.log.fired;
  if (w.endless && fired.length > 0) v.push(`${fired.length} events in Endless Rush`);
  if (fired.length > def.eventCap) v.push(`${fired.length} events, cap ${def.eventCap}`);
  const abs = absoluteShift(w, SHIFTS_PER_WEEK);
  fired.forEach((f, i) => {
    if (!Number.isFinite(f.at) || f.at < 0 || f.at > r.serviceTime) v.push(`${f.id} at ${f.at}`);
    const prev = fired[i - 1];
    if (prev && f.at - prev.at < SCHEDULER_DEFAULTS.minGapSeconds)
      v.push(`${f.id} ${f.at - prev.at} s after ${prev.id}`);
    const d = eventDef(f.id);
    if (d.minShift > abs) v.push(`${f.id} in shift ${abs}, before its minShift ${d.minShift}`);
    const last = w.eventCooldowns?.[f.id];
    if (last !== undefined && abs - last <= d.cooldownShifts)
      v.push(`${f.id} in shift ${abs}, last in ${last}, cooldown ${d.cooldownShifts}`);
  });
  if (fired[0] && fired[0].id === w.lastEvent) v.push(`${fired[0].id} opens again after itself`);
  return v;
}

/** One question the rush put to the scheduler (recorded by a vi.mock wrapper round pickEvents):
 *  the context it asked with, which events, and what came back. */
export interface PickCall extends Omit<EventContext, 'rng'> {
  defs: ShiftEventId[];
  orderWindow: boolean;
  cap: number | undefined;
  picked: ShiftEventId | null;
}

/** The rush's questions to the scheduler (core/rush/events.ts), checked at the moment each was
 *  asked: the right shift and cap, one of the four call sites, never over an order being said,
 *  and each event's own trigger rule. `events` is everything the shift emitted. */
export function picksBroken(
  calls: readonly PickCall[],
  r: Rush,
  events: ReadonlyArray<{ type: string }>,
): string[] {
  const v: string[] = [];
  const w = r.week;
  if (!w) return ['not a week shift'];
  if (w.endless) return calls.length > 0 ? [`${calls.length} event checks in Endless Rush`] : [];
  const abs = absoluteShift(w, SHIFTS_PER_WEEK);
  const cap = shiftDef(w.shiftIndex).eventCap;
  const site = (c: PickCall): string => {
    const ids = c.defs.join(',');
    if (ids === 'RARE_BIRD') return 'bird';
    if (ids === 'WRONG_MILK') return 'handedBack';
    if (ids === 'QUEUE_JUMP') return 'pushingIn';
    if (ids === 'JUST_COFFEE,THE_USUAL,CHANGE_MIND,QUEUE_JUMP,CALL_MANAGER,THE_NAME')
      return 'register';
    return `unknown (${ids})`;
  };
  calls.forEach((c, i) => {
    const at = `check ${i} at ${c.secondsIntoService.toFixed(2)} s (${site(c)})`;
    if (c.shiftIndex !== abs) v.push(`${at}: asked for shift ${c.shiftIndex}, playing ${abs}`);
    if (c.cap !== cap) v.push(`${at}: cap ${c.cap}, the week table says ${cap}`);
    const s = site(c);
    if (s.startsWith('unknown')) v.push(`${at}: an unknown call site`);
    if (s === 'bird' && (i !== 0 || c.secondsIntoService !== 0 || c.customer !== null))
      v.push(`${at}: the bird is asked about only once, at the doors`);
    if (s === 'handedBack' && (!c.playerMistake || c.customer === null))
      v.push(`${at}: a hand-back that isn't the player's mistake`);
    if (s === 'register' && (c.customer === null || c.playerMistake))
      v.push(`${at}: a register check with nobody there, or a mistake`);
    if (!c.picked) return;
    if (!c.defs.includes(c.picked)) v.push(`${at}: picked ${c.picked}, not asked about`);
    if (c.orderWindow) v.push(`${at}: ${c.picked} over an order being said`);
    const rule = triggerBroken(c.picked, c);
    if (rule) v.push(`${at}: ${c.picked}: ${rule}`);
  });
  const picked = calls.flatMap((c) => (c.picked ? [c.picked] : []));
  const logged = r.shiftEvents.log.fired.map((f) => f.id);
  if (json(picked) !== json(logged))
    v.push(`picked ${picked.join(',')} but logged ${logged.join(',')}`);
  if (r.shiftEvents.bird !== (picked[0] === 'RARE_BIRD')) v.push(`bird ${r.shiftEvents.bird}`);
  if (picked.slice(1).includes('RARE_BIRD')) v.push('the bird picked mid-shift');
  // Every event shown is answered or dropped exactly once; the tallies match what was emitted.
  const count = (t: string): number => events.filter((e) => e.type === t).length;
  const shown = picked.filter((id) => id !== 'RARE_BIRD').length;
  if (count('shiftEvent') !== shown) v.push(`${count('shiftEvent')} events shown, ${shown} picked`);
  if (count('shiftEventEnd') !== count('shiftEvent'))
    v.push(`${count('shiftEvent')} events shown, ${count('shiftEventEnd')} ended`);
  const outcome = (o: string): number => r.customers.filter((c) => c.outcome === o).length;
  if (count('refused') !== outcome('refused')) v.push(`${count('refused')} refused events`);
  if (count('walkout') !== outcome('walkout')) v.push(`${count('walkout')} walkout events`);
  if (count('served') !== outcome('served')) v.push(`${count('served')} served events`);
  if (count('summary') !== 1) v.push(`${count('summary')} summary events`);
  return v;
}
