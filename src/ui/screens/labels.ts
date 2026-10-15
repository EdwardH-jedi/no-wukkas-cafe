// What the shell screens say, worked out from the save: pure functions with no DOM, so the unit
// tests can check every label without a browser. The screens next to this file draw them.

import { endlessUnlocked, shiftDef } from '../../core/week/progress';
import type { SaveV2 } from '../../sim/contracts/save';

/** Why Endless Rush is still locked (one line for the title and shift select), or null once it's
 *  open: it opens when the week's first shift has been passed. */
export function endlessReason(save: SaveV2): string | null {
  return endlessUnlocked(save) ? null : `Pass ${shiftDef(0).day} in the week to unlock it.`;
}
