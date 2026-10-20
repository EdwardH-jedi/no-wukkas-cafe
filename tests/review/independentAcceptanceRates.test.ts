// Recompute the exact Phase 6 event-rate claims with the real seeded lifecycle.
import { expect, it } from 'vitest';
import { createSaveStore } from '../../src/core/save/storage';
import { finishShift, weekFor } from '../../src/core/week/session';
import { lifecycleShift } from './independentFuzz';

it('Phase 6 counts are reproducible across 1000 seeds and 5000 saved shifts', () => {
  let usual = 0,
    withoutUsual = 0,
    affinityWrites = 0,
    serves = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const store = createSaveStore(null, { seed });
    for (let shift = 0; shift < 5; shift++) {
      const { r } = lifecycleShift(seed + shift * 1009, weekFor(store.load()));
      const n = r.shiftEvents.log.fired.filter((f) => f.id === 'THE_USUAL').length;
      usual += n;
      if (!n && Object.keys(r.shiftEvents.affinity).length) withoutUsual++;
      affinityWrites += Object.keys(r.shiftEvents.affinity).length;
      serves += r.records.filter((r) => r.accepted).length;
      finishShift(store, r.summary!, r.shiftEvents.affinity, r.shiftEvents.visits);
    }
  }
  console.log(
    JSON.stringify(
      { seeds: 1000, shifts: 5000, serves, usual, withoutUsual, affinityWrites },
      null,
      2,
    ),
  );
  expect({ usual, withoutUsual, affinityWrites, serves }).toEqual({
    usual: 888,
    withoutUsual: 4112,
    affinityWrites: 27371,
    serves: 40000,
  });
}, 300_000);
