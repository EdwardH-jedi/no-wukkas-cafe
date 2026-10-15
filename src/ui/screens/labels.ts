// What the shell screens say, worked out from the save: pure functions with no DOM, so the unit
// tests can check every label without a browser. The screens next to this file draw them.

import {
  endlessUnlocked,
  passFail,
  shiftDef,
  shiftRows,
  type ShiftStatus,
} from '../../core/week/progress';
import { canPlay } from '../../core/week/session';
import { UPGRADES } from '../../data/upgrades';
import type { SaveV2 } from '../../sim/contracts/save';
import { DRINKS } from '../../sim/contracts/ticket';
import { formatCents, type ShiftGrade, type ShiftSummary } from '../../sim/rush';
import type { BuyResult } from '../../sim/shop';

/** Why Endless Rush is still locked (one line for the title and shift select), or null once it's
 *  open: it opens when the week's first shift has been passed. */
export function endlessReason(save: SaveV2): string | null {
  return endlessUnlocked(save) ? null : `Pass ${shiftDef(0).day} in the week to unlock it.`;
}

// ---------------------------------------------------------------- shift select

export const GRADE_NAME: Record<ShiftGrade, string> = {
  excellent: 'Excellent',
  good: 'Good',
  okay: 'Okay',
  poor: 'Poor',
  disaster: 'Disaster',
};

export interface ShiftCell {
  index: number;
  day: string;
  /** locked / open / done (shiftRows), for styling and tests. */
  status: ShiftStatus;
  /** Only the shift the week is on can be played. */
  playable: boolean;
  /** "Play now", "Play again" (after a disaster), "Done" or "Locked". */
  state: string;
  /** "6 customers · new: flat white, long black" */
  detail: string;
  /** "Best: Good", or null before the shift has been played. */
  best: string | null;
}

/** The Monday–Friday grid on shift select. */
export function shiftCells(save: SaveV2): ShiftCell[] {
  return shiftRows(save).map((row) => {
    const playable = canPlay(save, row.index);
    const detail = [`${row.customers} customers`];
    if (row.unlocks.length > 0)
      detail.push(`new: ${row.unlocks.map((d) => DRINKS[d].name).join(', ')}`);
    return {
      index: row.index,
      day: row.day,
      status: row.status,
      playable,
      state: playable
        ? row.best === null
          ? 'Play now'
          : 'Play again'
        : row.status === 'done'
          ? 'Done'
          : 'Locked',
      detail: detail.join(' · '),
      best: row.best ? `Best: ${GRADE_NAME[row.best]}` : null,
    };
  });
}

/** A shift button's name for screen readers: its lines as one sentence each. */
export const shiftLabel = (c: ShiftCell): string =>
  [`${c.day}: ${c.state}`, c.detail, c.best].filter((x) => x !== null).join('. ') + '.';

/** The line under the shop button on shift select: the till, and how much is already bought. */
export function shopEntryLine(save: SaveV2): string {
  const owned = UPGRADES.filter((u) => save.upgrades.includes(u.id)).length;
  return `${tillLine(save)} · ${owned} of ${UPGRADES.length} owned`;
}

// ---------------------------------------------------------------- the shop

/** owned: already bought · buy: the till covers it · short: it doesn't (a buy is refused). */
export type ShopState = 'owned' | 'buy' | 'short';

export interface ShopLine {
  id: string;
  name: string;
  /** The price, formatted (AUD). */
  price: string;
  /** What it does, in one line. */
  effect: string;
  state: ShopState;
}

/** Every upgrade on sale, in catalogue order, with what the till says about it. */
export function shopLines(save: SaveV2): ShopLine[] {
  return UPGRADES.map((u) => ({
    id: u.id,
    name: u.name,
    price: formatCents(u.costCents),
    effect: u.description,
    state: save.upgrades.includes(u.id) ? 'owned' : save.cents < u.costCents ? 'short' : 'buy',
  }));
}

/** The till line over the shop. */
export const tillLine = (save: SaveV2): string => `In the till: ${formatCents(save.cents)}`;

/** One line on what a buy did: bought, or why it was refused (never silent). `before` is the save
 *  the buy was tried on. */
export function buyMessage(result: BuyResult, id: string, before: SaveV2): string {
  if (result.ok)
    return `${result.upgrade.name} bought. ${formatCents(result.save.cents)} left in the till.`;
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || result.reason === 'unknown') return "That upgrade isn't for sale.";
  if (result.reason === 'owned') return `${u.name} is already yours.`;
  return `Not enough in the till: ${u.name} costs ${formatCents(u.costCents)}, you have ${formatCents(before.cents)}.`;
}

// ---------------------------------------------------------------- the shift report

/** Which run a report is for: Day 2 has no week; Endless Rush is flagged on its week. */
export type ReportRun = { endless?: boolean } | null | undefined;

export interface ReportButton {
  /** again: run Day 2 or Endless again · next: the week's current shift (the next one after a
   *  pass, the same one after a disaster, since the save only moves on after a pass). */
  act: 'again' | 'next';
  label: string;
}

/** The report's main button: "Next shift" after a passed week shift, "Try again" otherwise. */
export function reportButton(run: ReportRun, s: ShiftSummary): ReportButton {
  if (!run || run.endless) return { act: 'again', label: 'Try again' };
  return passFail(s) === 'pass'
    ? { act: 'next', label: 'Next shift' }
    : { act: 'next', label: 'Try again' };
}

const GRADE_TEXT: Record<ShiftGrade, string> = {
  excellent: 'Cracker of a shift',
  good: 'Solid first shift',
  okay: 'Survived it',
  poor: 'Rough morning',
  disaster: 'Total disaster',
};

const GRADE_BAND: Record<ShiftGrade, 'hired' | 'almost' | 'failed' | 'disaster'> = {
  excellent: 'hired',
  good: 'hired',
  okay: 'almost',
  poor: 'failed',
  disaster: 'disaster',
};

/** The big stamp on the report: the grade, or for Endless Rush (which always ends at the third
 *  walk-out) how many were served. `band` is its colour. */
export function reportStamp(run: ReportRun, s: ShiftSummary): { text: string; band: string } {
  return run?.endless
    ? { text: `Served ${s.ordersCompleted}`, band: 'hired' }
    : { text: GRADE_TEXT[s.grade], band: GRADE_BAND[s.grade] };
}
