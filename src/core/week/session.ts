// Week mode between the save and the rush: which shift may be played (only the one the week is on:
// earlier ones are done, later ones locked; Edward, 2026-10-15), the rush's week context for it, and
// what a finished shift writes back. Event cooldowns are not saved (same decision): the caller keeps
// them for the page's lifetime and passes them in.

import type { CustomerId } from '../../data/customers';
import type { ShiftEventId } from '../../sim/contracts/events';
import { REGULAR_IDS, type Save } from '../../sim/contracts/save';
import type { ShiftSummary } from '../../sim/rush';
import { stationParams } from '../../sim/shop';
import type { RushWeek } from '../rush';
import type { SaveStore } from '../save/storage';
import { nextShift, SHIFTS_PER_WEEK } from './progress';

export type Cooldowns = Partial<Record<ShiftEventId, number>>;

/** Only the shift the week is on can be played; a passed shift isn't replayed. */
export const canPlay = (save: Save, shift: number): boolean => shift === save.shift;

function affinityOf(save: Save): Partial<Record<CustomerId, number>> {
  const out: Partial<Record<CustomerId, number>> = {};
  for (const id of REGULAR_IDS) {
    const m = save.regulars[id];
    if (m) out[id] = m.affinity;
  }
  return out;
}

/** The rush's week context for the shift the save is on. `cooldowns` and `lastEvent` come from
 *  the shifts played since the page opened. */
export function weekFor(
  save: Save,
  cooldowns: Cooldowns = {},
  lastEvent: ShiftEventId | null = null,
): RushWeek {
  return {
    week: save.week,
    shiftIndex: save.shift,
    unlockedDrinks: [...save.unlockedDrinks],
    eventCooldowns: { ...cooldowns },
    lastEvent,
    affinity: affinityOf(save),
    station: stationParams(save.upgrades),
  };
}

/** Endless Rush: everything on the menu so far, the last shift's table row, no events. */
export function endlessFor(save: Save): RushWeek {
  return {
    week: save.week,
    shiftIndex: SHIFTS_PER_WEEK - 1,
    unlockedDrinks: [...save.unlockedDrinks],
    endless: true,
    station: stationParams(save.upgrades),
  };
}

/** Autosave after a week shift: the receipt and tips, the next shift on a pass (nextShift), and
 *  what the shift changed in how the regulars feel about the player and how often they came.
 *  One write. */
export function finishShift(
  store: SaveStore,
  report: ShiftSummary,
  affinity: Partial<Record<CustomerId, number>> = {},
  visits: Partial<Record<CustomerId, number>> = {},
): Save {
  const s = nextShift(store.load(), report);
  for (const id of REGULAR_IDS) {
    const d = affinity[id] ?? 0;
    const v = visits[id] ?? 0;
    if (!d && !v) continue;
    const m = s.regulars[id] ?? { visits: 0, affinity: 0 };
    s.regulars[id] = { visits: m.visits + v, affinity: m.affinity + d };
  }
  store.save(s);
  return s;
}
