// Week progression: pure functions over the save. A shift graded 'disaster' is replayed, never a
// game over; anything else moves on and puts the next shift's new drinks on the menu. The receipt
// and the tips are kept either way.

import { FIRST_ARRIVAL, WEEK, type ShiftDef } from '../../data/week';
import { migrate, type Save } from '../../sim/contracts/save';
import type { DrinkId } from '../../sim/contracts/ticket';
import type { ShiftGrade, ShiftSummary } from '../../sim/rush';

export const SHIFTS_PER_WEEK = WEEK.length;

export function shiftDef(shift: number): ShiftDef {
  const d = WEEK[Math.min(Math.max(0, Math.floor(shift)), SHIFTS_PER_WEEK - 1)];
  if (!d) throw new Error('the week table is empty');
  return d;
}

/** Every drink on the menu by this shift. */
export function unlocksFor(shift: number): DrinkId[] {
  return WEEK.filter((s) => s.index <= shift).flatMap((s) => s.unlocks);
}

export type ShiftResult = 'pass' | 'fail';

export function passFail(report: ShiftSummary): ShiftResult {
  return report.grade === 'disaster' ? 'fail' : 'pass';
}

/** The save after a shift report. Never changes `save`. */
export function nextShift(save: Save, report: ShiftSummary): Save {
  const s = migrate(save);
  s.reports.push({ week: s.week, shift: s.shift, summary: { ...report } });
  s.cents += Math.round(report.tipsCents);
  if (passFail(report) === 'fail') return s;
  if (s.shift + 1 >= SHIFTS_PER_WEEK) {
    s.week += 1;
    s.shift = 0;
  } else s.shift += 1;
  s.unlockedDrinks = [...new Set([...s.unlockedDrinks, ...unlocksFor(s.shift)])];
  return s;
}

const GRADE_RANK: Record<ShiftGrade, number> = {
  disaster: 0,
  poor: 1,
  okay: 2,
  good: 3,
  excellent: 4,
};

/** Best grade ever reported for this shift of the week, or null if never played. */
export function bestGrade(save: Save, shift: number): ShiftGrade | null {
  let best: ShiftGrade | null = null;
  for (const r of save.reports)
    if (r.shift === shift && (best === null || GRADE_RANK[r.summary.grade] > GRADE_RANK[best]))
      best = r.summary.grade;
  return best;
}

export type ShiftStatus = 'locked' | 'open' | 'done';

export interface ShiftRow {
  index: number;
  day: string;
  customers: number;
  unlocks: DrinkId[];
  status: ShiftStatus;
  best: ShiftGrade | null;
}

/** What the shift-select screen lists. In every week the save's shift is the open one (only it is
 *  playable, see canPlay), the ones before it are done (the week moves on only on a pass) and the
 *  ones after it are locked; `best` still carries an earlier week's grade. */
export function shiftRows(save: Save): ShiftRow[] {
  return WEEK.map((d) => ({
    index: d.index,
    day: d.day,
    customers: d.customers,
    unlocks: [...d.unlocks],
    status: d.index < save.shift ? 'done' : d.index === save.shift ? 'open' : 'locked',
    best: bestGrade(save, d.index),
  }));
}

/** Endless Rush opens once the first shift has been passed. */
export const endlessUnlocked = (save: Save): boolean => save.week > 1 || save.shift > 0;

/** When each customer walks in (service seconds); the gap shrinks from gap.first to gap.last. */
export function arrivalTimes(d: ShiftDef): number[] {
  const out: number[] = [];
  let t = FIRST_ARRIVAL;
  for (let i = 0; i < d.customers; i++) {
    out.push(Math.round(t * 10) / 10);
    const k = d.customers > 2 ? Math.min(1, i / (d.customers - 2)) : 0;
    t += d.gap.first + (d.gap.last - d.gap.first) * k;
  }
  return out;
}
