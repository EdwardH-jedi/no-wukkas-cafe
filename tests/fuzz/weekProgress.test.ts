// Seed fuzz for week progression (core/week/progress.ts + session.ts, the save through
// core/save/storage.ts), 500 seeds. Full bot play costs about 3 s per seed-week (the latte pour
// simulation), so 500 seeds of it would take ~25 minutes: here the progression is fed synthetic
// shift reports instead, each built by summariseShift from seeded serve records (so grades, tips
// and walk-outs are as consistent as real ones), 15–25 shifts per seed so every run reaches week 2
// and most see a replayed disaster. tests/fuzz/weekPlay*.test.ts plays real shifts.

import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../../src/core/rng';
import { createSaveStore, type KeyValueStorage } from '../../src/core/save/storage';
import { nextShift, passFail, shiftDef } from '../../src/core/week/progress';
import { finishShift } from '../../src/core/week/session';
import { CUSTOMERS, type CustomerId } from '../../src/data/customers';
import { REGULAR_IDS, type SaveV2 } from '../../src/sim/contracts/save';
import { summariseShift, type ServeRecord, type ShiftSummary } from '../../src/sim/rush';
import { position, progressBroken, summaryBroken } from '../helpers/fuzzRules';

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);

/** A plausible shift: how well it went is drawn once, then each visit is served (whole-10-cent
 *  tips, as evaluateServe rounds them), walks out, or now and then is shown the door. */
function syntheticReport(rng: Rng, customers: number): ShiftSummary {
  const skill = rng.next();
  const refused = rng.next() < 0.1 ? 1 : 0;
  const counted = customers - refused;
  const records: ServeRecord[] = [];
  for (let i = 0; i < counted; i++) {
    if (rng.next() < 0.45 * (1 - skill)) continue; // walked out
    const sat = Math.round(Math.min(100, Math.max(0, skill * 100 + rng.range(-25, 25))));
    records.push({
      customer: (CUSTOMERS[i % CUSTOMERS.length] as (typeof CUSTOMERS)[number]).id,
      accepted: true,
      correct: rng.next() < 0.8,
      waited: Math.round(rng.range(8, 140) * 10) / 10,
      satisfaction: sat,
      tipCents: rng.int(41) * 10,
    });
  }
  return summariseShift(records, counted, rng.int(3));
}

/** What a shift's events taught the regulars (THE_USUAL is the only source today: +1). */
function syntheticAffinity(rng: Rng): Partial<Record<CustomerId, number>> {
  const out: Partial<Record<CustomerId, number>> = {};
  for (const id of REGULAR_IDS) if (rng.next() < 0.15) out[id] = rng.next() < 0.8 ? 1 : -1;
  return out;
}

/** A Web Storage stand-in, so every step really goes through JSON on "disk". */
class MemStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

interface Step {
  report: ShiftSummary;
  save: SaveV2;
}

/** A save played from fresh through 15–25 synthetic shifts. Every broken rule goes in `v`. */
function playSeed(seed: number, v: string[]): Step[] {
  const rng = createRng((seed * 2654435761) >>> 0);
  const store = createSaveStore(new MemStorage(), { seed });
  const steps: Step[] = [];
  const n = 15 + rng.int(11);
  for (let i = 0; i < n; i++) {
    const before = store.load();
    const at = `seed ${seed} step ${i} (week ${before.week} shift ${before.shift})`;
    const report = syntheticReport(rng, shiftDef(before.shift).customers);
    const affinity = syntheticAffinity(rng);
    for (const e of summaryBroken(report)) v.push(`${at}: report ${e}`);
    // nextShift never touches the save it is given; finishShift is nextShift plus the regulars.
    const snapshot = JSON.stringify(before);
    const pure = nextShift(before, report);
    if (JSON.stringify(before) !== snapshot) v.push(`${at}: nextShift changed its input save`);
    const after = finishShift(store, report, affinity);
    for (const k of ['week', 'shift', 'cents', 'reports', 'unlockedDrinks'] as const)
      if (!isDeepStrictEqual(after[k], pure[k]))
        v.push(`${at}: finishShift and nextShift disagree on ${k}`);
    if (passFail(report) !== (report.grade === 'disaster' ? 'fail' : 'pass'))
      v.push(`${at}: passFail(${report.grade})`);
    for (const e of progressBroken(before, after, report, affinity, true)) v.push(`${at}: ${e}`);
    // One write: what is on disk is what was returned.
    if (!isDeepStrictEqual(store.load(), after)) v.push(`${at}: disk ≠ returned save`);
    steps.push({ report, save: after });
  }
  return steps;
}

describe('week progression fuzz (500 seeds, synthetic shift reports)', () => {
  it('every report moves the save on by the rules: one shift per pass, nothing lost', () => {
    const v: string[] = [];
    let weekTwo = 0;
    let replays = 0;
    for (const seed of SEEDS) {
      const steps = playSeed(seed, v);
      const last = steps.at(-1)?.save;
      if (last && last.week > 1) weekTwo++;
      replays += steps.filter((s) => s.report.grade === 'disaster').length;
      // Position never goes back.
      for (let i = 1; i < steps.length; i++)
        if (position(steps[i]?.save as SaveV2) < position(steps[i - 1]?.save as SaveV2))
          v.push(`seed ${seed} step ${i}: went back a shift`);
    }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
    // The fuzz reaches week 2 and replays disasters (it isn't only testing the happy path).
    expect(weekTwo).toBeGreaterThan(SEEDS.length * 0.8);
    expect(replays).toBeGreaterThan(SEEDS.length);
  }, 60_000);

  it('is deterministic: the same seed plays the same saves', () => {
    const v: string[] = [];
    for (const seed of SEEDS) {
      const a = playSeed(seed, []);
      const b = playSeed(seed, []);
      if (JSON.stringify(a) !== JSON.stringify(b)) v.push(`seed ${seed}: two runs differ`);
    }
    expect(v, `${v.length} violations`).toEqual([]);
  }, 60_000);
});
