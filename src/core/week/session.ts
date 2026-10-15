// Week mode between the save and the rush: which shift may be played (only the one the week is on:
// earlier ones are done, later ones locked; Edward, 2026-10-15), the rush's week context for it, and
// what a finished shift writes back. Event cooldowns are not saved (same decision): the caller keeps
// them for the page's lifetime and passes them in.

import type { CustomerId } from '../../data/customers';
import type { ShiftEventId } from '../../sim/contracts/events';
import { REGULAR_IDS, type SaveV2 } from '../../sim/contracts/save';
import type { ShiftSummary } from '../../sim/rush';
import { stationParams } from '../../sim/shop';
import type { RushWeek } from '../rush';
import type { SaveStore } from '../save/storage';
import { nextShift, SHIFTS_PER_WEEK } from './progress';

export type Cooldowns = Partial<Record<ShiftEventId, number>>;

/** Only the shift the week is on can be played; a passed shift isn't replayed. */
export const canPlay = (save: SaveV2, shift: number): boolean => shift === save.shift;

function affinityOf(save: SaveV2): Partial<Record<CustomerId, number>> {
  const out: Partial<Record<CustomerId, number>> = {};
  for (const id of REGULAR_IDS) {
    const m = save.regulars[id];
    if (m) out[id] = m.affinity;
  }
  return out;
}

/** The rush's week context for the shift the save is on. */
export function weekFor(save: SaveV2, cooldowns: Cooldowns = {}): RushWeek {
  return {
    week: save.week,
    shiftIndex: save.shift,
    unlockedDrinks: [...save.unlockedDrinks],
    eventCooldowns: { ...cooldowns },
    affinity: affinityOf(save),
    station: stationParams(save.upgrades),
  };
}

/** Endless Rush: everything on the menu so far, the last shift's table row, no events. */
export function endlessFor(save: SaveV2): RushWeek {
  return {
    week: save.week,
    shiftIndex: SHIFTS_PER_WEEK - 1,
    unlockedDrinks: [...save.unlockedDrinks],
    endless: true,
    station: stationParams(save.upgrades),
  };
}

/** Autosave after a week shift: the receipt and tips, the next shift on a pass (nextShift), and
 *  what the shift's events changed in how the regulars feel about the player. One write. */
export function finishShift(
  store: SaveStore,
  report: ShiftSummary,
  affinity: Partial<Record<CustomerId, number>> = {},
): SaveV2 {
  const s = nextShift(store.load(), report);
  for (const id of REGULAR_IDS) {
    const d = affinity[id];
    if (!d) continue;
    const m = s.regulars[id] ?? { visits: 0, affinity: 0 };
    s.regulars[id] = { ...m, affinity: m.affinity + d };
  }
  store.save(s);
  return s;
}
