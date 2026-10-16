// Day 2 pacing measurements: play a shift with a bot profile and record what a player feels —
// walk-outs, how long people wait, how long each drink takes to make, and how much patience each
// customer has left when their drink arrives. Shared by `npm run pace` and the pacing tests.

import { createSaveStore } from '../../src/core/save/storage';
import { passFail, SHIFTS_PER_WEEK, shiftDef } from '../../src/core/week/progress';
import { finishShift, weekFor, type Cooldowns } from '../../src/core/week/session';
import { CUSTOMERS, type CustomerId } from '../../src/data/customers';
import { UPGRADES } from '../../src/data/upgrades';
import type { ShiftEventId } from '../../src/sim/contracts/events';
import type { SaveV2 } from '../../src/sim/contracts/save';
import { ORDER_FIELDS, type Difficulty, type OrderField } from '../../src/sim/listening';
import type { DrinkType, ShiftGrade } from '../../src/sim/rush';
import { buyUpgrade } from '../../src/sim/shop';
import { playRush, SKILLS, skillBot, type ListenBot, type SkillName } from './rushBot';

export interface PaceRun {
  seed: number;
  difficulty: Difficulty;
  walkouts: CustomerId[];
  /** Mean seconds from reaching the register to an accepted drink. */
  meanServe: number;
  /** Seconds from "make" to the drink on the pass, per drink finished. */
  make: Record<DrinkType, number[]>;
  /** Patience (seconds) left when each customer was served. */
  left: Partial<Record<CustomerId, number>>;
  /** Most people ever in line at once (queueing or at the register, order not yet rung up). */
  maxLine: number;
}

const IN_LINE = new Set(['queue', 'register', 'ordering', 'deciding']);

export function paceRun(bot: ListenBot, seed: number, difficulty: Difficulty): PaceRun {
  const make: PaceRun['make'] = { flatWhite: [], longBlack: [] };
  const left: PaceRun['left'] = {};
  let started: { at: number; drink: DrinkType } | null = null;
  let phase = 'idle';
  let maxLine = 0;
  const { r } = playRush({
    ...bot,
    seed,
    difficulty,
    each: (s) => {
      const b = s.barista;
      if (b.phase !== phase) {
        if (phase === 'idle' && b.phase === 'grind' && b.drink)
          started = { at: s.time, drink: b.drink };
        if (b.phase === 'ready' && started) make[started.drink].push(s.time - started.at);
        if (b.phase === 'ready' || b.phase === 'idle') started = null;
        phase = b.phase;
      }
      let line = 0;
      for (const c of s.customers) {
        if (c.outcome === 'served' && left[c.def.id] === undefined) left[c.def.id] = c.patience;
        if (IN_LINE.has(c.state)) line++;
      }
      maxLine = Math.max(maxLine, line);
    },
  });
  return {
    seed,
    difficulty,
    walkouts: r.customers.filter((c) => c.outcome === 'walkout').map((c) => c.def.id),
    meanServe: r.summary?.avgServeSeconds ?? 0,
    make,
    left,
    maxLine,
  };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f0 = (x: number): string => x.toFixed(0);

/** One Markdown row summarising runs of a profile at one difficulty. Patience cells read
 *  "worst/mean" seconds left at serve, with "✗n" when n of the runs ended in a walk-out. */
export function paceRow(profile: string, runs: PaceRun[]): string {
  const walk = runs.map((x) => x.walkouts.length);
  const early = runs.map(
    (x) => x.walkouts.filter((id) => CUSTOMERS.findIndex((c) => c.id === id) < 3).length,
  );
  const fw = runs.flatMap((x) => x.make.flatWhite);
  const lb = runs.flatMap((x) => x.make.longBlack);
  const cells = CUSTOMERS.map((c) => {
    const got = runs.map((x) => x.left[c.id]).filter((v): v is number => v !== undefined);
    const gone = runs.length - got.length;
    const s = got.length ? `${f0(Math.min(...got))}/${f0(mean(got))}` : '–';
    return gone ? `${s} ✗${gone}` : s;
  });
  return `| ${profile} | ${runs[0]?.difficulty ?? ''} | ${walk.reduce((a, b) => a + b, 0)} / ${Math.max(...walk)} / ${Math.max(...early)} | ${mean(runs.map((x) => x.meanServe)).toFixed(1)} | ${fw.length ? mean(fw).toFixed(1) : '–'} | ${lb.length ? mean(lb).toFixed(1) : '–'} | ${cells.join(' | ')} |`;
}

export const PACE_HEADER = `| bot | difficulty | walk-outs (total / worst seed / worst in 1–3) | mean serve s | make FW s | make LB s | ${CUSTOMERS.map((c) => c.callName).join(' | ')} |
|---|---|---|---|---|---|${CUSTOMERS.map(() => '---|').join('')}`;

// ------------------------------------------------------------------ the week (npm run balance)

/** One attempt at one shift of the week by one skill profile: a row of reports/balance.csv. */
export interface WeekRow {
  profile: SkillName;
  seed: number;
  shift: number;
  day: string;
  /** 1 = first try. */
  attempt: number;
  /** Visits that ended in a drink or a walk-out (the report's count). */
  customers: number;
  served: number;
  walkouts: number;
  /** Shown the door by an event (not a walk-out). */
  refused: number;
  grade: ShiftGrade;
  pass: boolean;
  satisfaction: number;
  tipsCents: number;
  avgServeSeconds: number;
  wasted: number;
  events: ShiftEventId[];
  /** Tickets rung up, and how many got each field wrong. */
  orders: number;
  misheard: Record<OrderField, number>;
  /** The till after this attempt's tips and any upgrades bought with them. */
  centsAfter: number;
  upgrades: string[];
}

/** Tries at a shift before the run moves on anyway (so the later shifts are still measured). */
export const WEEK_TRIES = 3;

/** The bot's own seed for one attempt: its mistakes differ from try to try (the orders don't:
 *  a replayed shift is the same save seed). */
const botSeed = (seed: number, shift: number, attempt: number): number =>
  (Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(shift * 8 + attempt, 0x85ebca6b)) >>> 0;

/** Between shifts: buy the cheapest upgrade the till covers, until none is affordable. */
function shop(save: SaveV2): SaveV2 {
  let s = save;
  for (const u of [...UPGRADES].sort((a, z) => a.costCents - z.costCents)) {
    const got = buyUpgrade(s, u.id);
    if (got.ok) s = got.save;
  }
  return s;
}

/** Week 1 from a fresh save, the way the game plays it: weekFor → the rush → finishShift, event
 *  cooldowns kept from shift to shift, a failed shift replayed (up to `tries`), upgrades bought
 *  between shifts. */
export function playWeek(
  profile: SkillName,
  seed: number,
  { difficulty = 'normal', tries = WEEK_TRIES }: { difficulty?: Difficulty; tries?: number } = {},
): WeekRow[] {
  const store = createSaveStore(null, { seed });
  let cooldowns: Cooldowns = {};
  const rows: WeekRow[] = [];
  for (let shift = 0; shift < SHIFTS_PER_WEEK; shift++)
    for (let attempt = 1; attempt <= tries; attempt++) {
      const save = store.load();
      const bot = skillBot(SKILLS[profile], botSeed(seed, shift, attempt));
      const { r } = playRush({
        ...bot,
        seed: save.seed,
        difficulty,
        week: weekFor(save, cooldowns),
      });
      const report = r.summary;
      if (!report) throw new Error(`${profile} seed ${seed} shift ${shift}: no report`);
      cooldowns = { ...r.shiftEvents.log.lastShift };
      const pass = passFail(report) === 'pass';
      // After the last try the run moves on as if it had scraped through (tips counted once).
      const last = !pass && attempt === tries;
      const after = finishShift(
        store,
        last ? { ...report, grade: 'poor' } : report,
        r.shiftEvents.affinity,
      );
      const bought = shop(after);
      store.save(bought);
      const misheard = Object.fromEntries(ORDER_FIELDS.map((f) => [f, 0])) as WeekRow['misheard'];
      for (const l of r.listening) for (const f of l.wrong) misheard[f]++;
      rows.push({
        profile,
        seed,
        shift,
        day: shiftDef(shift).day,
        attempt,
        customers: report.customers,
        served: report.ordersCompleted,
        walkouts: report.walkouts,
        refused: r.shiftEvents.refused,
        grade: report.grade,
        pass,
        satisfaction: report.satisfaction,
        tipsCents: report.tipsCents,
        avgServeSeconds: report.avgServeSeconds,
        wasted: report.wasted,
        events: r.shiftEvents.log.fired.map((e) => e.id),
        orders: r.listening.length,
        misheard,
        centsAfter: bought.cents,
        upgrades: [...bought.upgrades],
      });
      if (pass) break;
    }
  return rows;
}

const CSV_HEADER =
  'profile,seed,shift,day,attempt,customers,served,walkouts,refused,grade,pass,satisfaction,' +
  'tips_cents,avg_serve_s,wasted,events,orders,misheard_drink,misheard_milk,misheard_temp,' +
  'misheard_heart,cents_after,upgrades';

/** reports/balance.csv: one row per attempt; lists inside a cell are joined with ";". */
export function weekCsv(rows: readonly WeekRow[]): string {
  const line = (x: WeekRow): string =>
    [
      x.profile,
      x.seed,
      x.shift,
      x.day,
      x.attempt,
      x.customers,
      x.served,
      x.walkouts,
      x.refused,
      x.grade,
      x.pass ? 1 : 0,
      x.satisfaction,
      x.tipsCents,
      x.avgServeSeconds,
      x.wasted,
      x.events.join(';'),
      x.orders,
      ...ORDER_FIELDS.map((f) => x.misheard[f]),
      x.centsAfter,
      x.upgrades.join(';'),
    ].join(',');
  return [CSV_HEADER, ...rows.map(line)].join('\n') + '\n';
}

/** First tries of one profile at one shift. */
export const firstTries = (
  rows: readonly WeekRow[],
  profile: SkillName,
  shift: number,
): WeekRow[] => rows.filter((x) => x.profile === profile && x.shift === shift && x.attempt === 1);

/** Share of runs that passed this shift on the first try (0–1). */
export function passRate(rows: readonly WeekRow[], profile: SkillName, shift: number): number {
  const xs = firstTries(rows, profile, shift);
  return xs.length ? xs.filter((x) => x.pass).length / xs.length : 0;
}

/** First-try pass rate per shift (Monday first) for a profile over these seeds: the week played
 *  once through, a failed shift moving straight on. */
export function firstTryRates(profile: SkillName, seeds: readonly number[]): number[] {
  const rows = seeds.flatMap((seed) => playWeek(profile, seed, { tries: 1 }));
  return Array.from({ length: SHIFTS_PER_WEEK }, (_, s) => passRate(rows, profile, s));
}

const pct = (x: number): string => `${Math.round(x * 100)} %`;
const avg = (xs: number[]): number => mean(xs);

/** The Markdown summary `npm run balance` prints: first tries per profile and shift. */
export function weekTable(rows: readonly WeekRow[]): string {
  const out = [
    '| profile | shift | first-try pass | walk-outs (mean / worst) | satisfaction | tips | serve s | events / shift | misheard drink · milk · temp · heart | tries to pass (mean) |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  const profiles = [...new Set(rows.map((x) => x.profile))];
  for (const p of profiles)
    for (let s = 0; s < SHIFTS_PER_WEEK; s++) {
      const xs = firstTries(rows, p, s);
      if (xs.length === 0) continue;
      const orders = xs.reduce((n, x) => n + x.orders, 0);
      const miss = ORDER_FIELDS.map((f) =>
        pct(orders ? xs.reduce((n, x) => n + x.misheard[f], 0) / orders : 0),
      ).join(' · ');
      const seeds = [...new Set(xs.map((x) => x.seed))];
      const tries = seeds.map((seed) => {
        const all = rows.filter((x) => x.profile === p && x.shift === s && x.seed === seed);
        const won = all.find((x) => x.pass);
        return won ? won.attempt : WEEK_TRIES + 1;
      });
      out.push(
        `| ${p} | ${shiftDef(s).day} | ${pct(passRate(rows, p, s))} | ${avg(xs.map((x) => x.walkouts)).toFixed(1)} / ${Math.max(...xs.map((x) => x.walkouts))} | ${f0(avg(xs.map((x) => x.satisfaction)))} | $${(avg(xs.map((x) => x.tipsCents)) / 100).toFixed(2)} | ${avg(xs.map((x) => x.avgServeSeconds)).toFixed(1)} | ${avg(xs.map((x) => x.events.length)).toFixed(1)} | ${miss} | ${avg(tries).toFixed(1)} |`,
      );
    }
  return out.join('\n');
}
