// RARE_BIRD is the bin chicken. The event picker only decides whether a shift has one; the ibis
// state machine (sim/ibis.ts) still picks when it walks in (its own window and RNG) and runs the
// whole visit. Nothing about the bird is reimplemented here.

import { createIbis, type Ibis } from '../ibis';

/** The shift's ibis: scheduled when RARE_BIRD was picked, never turning up otherwise. */
export function ibisForShift(seed: number, picked: boolean): Ibis {
  const b = createIbis(seed, true);
  if (!picked) b.scheduledAt = null;
  return b;
}
