// Has the white been laid? The coach's first two steps of a heart (fill to half, then white on
// the surface), shared with the pitcher: the pull-through's thin stream only exists once there is
// white to pull through. Kept apart from coach.ts so the pitcher can read it without a cycle.

import { CELL, GRID } from './field';

/** Step 1 is done once the cup is this full. */
export const FILL_DONE = 0.5;
/** Step 2: this much of the surface is white (foam has been laid down). */
export const LAY_DONE = 0.02;

let discCells: Int32Array | null = null;
/** Grid cells inside the unit disc (the coffee surface). */
function disc(): Int32Array {
  if (discCells) return discCells;
  const cells: number[] = [];
  for (let k = 0; k < GRID * GRID; k++) {
    const x = -1 + ((k % GRID) + 0.5) * CELL;
    const y = -1 + (Math.floor(k / GRID) + 0.5) * CELL;
    if (x * x + y * y <= 1) cells.push(k);
  }
  discCells = Int32Array.from(cells);
  return discCells;
}

/** Share of the surface that is crisp white foam (same threshold the scorer uses). */
export function whiteCoverage(foam: Float32Array): number {
  const d = disc();
  let n = 0;
  for (let i = 0; i < d.length; i++) if ((foam[d[i] as number] as number) > 0.5) n++;
  return n / d.length;
}
