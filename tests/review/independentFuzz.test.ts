import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USUAL_AFFINITY } from '../../src/data/events';
import { createSaveStore } from '../../src/core/save/storage';
import { REGULAR_IDS } from '../../src/sim/contracts/save';
import { createRush } from '../../src/core/rush';
import { serve } from '../../src/core/rush/serve';
import { finishShift, weekFor } from '../../src/core/week/session';
import { lifecycleShift } from './independentFuzz';
import { drinkFor } from './leftCustomerSilent';

function evidence(name: string, value: unknown): void {
  const compact =
    value && typeof value === 'object' && 'overlaps' in value && Array.isArray(value.overlaps)
      ? { ...value, overlapCount: value.overlaps.length, overlaps: value.overlaps.slice(0, 5) }
      : value;
  console.log(`${name}: ${JSON.stringify(compact)}`);
  const dir = process.env.REVIEW_EVIDENCE_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
  }
}

describe('independent ibis fuzz: 500 seeds per mode', () => {
  for (const mode of ['day2', 'week-shift-3', 'week-index-3'] as const) {
    it(`${mode}: no honk overlaps orders/answers and 25-35% of shifts get a bird`, () => {
      const bad: Array<{ seed: number; at: number; event: string; line: string }> = [];
      let scheduled = 0;
      let appeared = 0;
      let honks = 0;
      let orders = 0;
      let answers = 0;
      for (let seed = 1; seed <= 500; seed++) {
        // Cover both readings of "shift 3": Wednesday, and the source's zero-based index 3.
        const run = lifecycleShift(
          seed,
          mode === 'day2'
            ? null
            : {
                shiftIndex: mode === 'week-index-3' ? 3 : 2,
                unlockedDrinks: ['flatWhite', 'longBlack'],
              },
        );
        expect(run.r.phase, `${mode} seed ${seed} did not finish`).toBe('summary');
        scheduled += Number(run.bird.scheduledAt !== null);
        appeared += Number(run.appearances > 0);
        honks += run.honks;
        orders += run.orders;
        answers += run.answers;
        bad.push(...run.overlaps.map((o) => ({ seed, ...o })));
      }
      evidence(`ibis-${mode}`, {
        seeds: 500,
        scheduled,
        appeared,
        honks,
        orders,
        answers,
        overlaps: bad,
      });
      expect.soft(orders).toBeGreaterThan(0);
      expect.soft(answers).toBeGreaterThan(0);
      expect.soft(bad.slice(0, 20), `${bad.length} overlaps`).toEqual([]);
      expect.soft(appeared / 500).toBeGreaterThanOrEqual(0.25);
      expect.soft(appeared / 500).toBeLessThanOrEqual(0.35);
    }, 180_000);
  }
});

// Re-issued 2026-10-18 by the review session (DECISIONS Q1, AFFINITY_RULE = yes), replacing the
// implementer's inversion in 7586668. Every affinity point a shift writes is accounted for: one per
// correct serve to a regular, plus THE_USUAL's own +1 (the bot answers "make", so a THE_USUAL that
// fires is always "remembered"). THE_USUAL may add only for a regular the save already knew to
// USUAL_AFFINITY at the start of the shift, and the save carries the running total forward.
it('AFFINITY_RULE: a correct serve to a regular adds +1, the save keeps it, and THE_USUAL becomes reachable', () => {
  const regulars = REGULAR_IDS as readonly string[];
  let usual = 0;
  let correctServes = 0;
  let points = 0;
  const bad: string[] = [];
  for (let seed = 1; seed <= 1000; seed++) {
    const store = createSaveStore(null, { seed });
    const running: Partial<Record<(typeof REGULAR_IDS)[number], number>> = {};
    for (let shift = 0; shift < 5; shift++) {
      const week = weekFor(store.load());
      const known = week.affinity ?? {};
      const { r } = lifecycleShift(seed + shift * 1009, week);
      const at = `seed ${seed}, iteration ${shift}`;
      expect(r.summary, at).not.toBeNull();
      const fired = r.shiftEvents.log.fired.filter((f) => f.id === 'THE_USUAL').length;
      const delta = r.shiftEvents.affinity;
      for (const id of Object.keys(delta))
        if (!regulars.includes(id)) bad.push(`${at}: affinity written for non-regular ${id}`);
      let extra = 0;
      for (const id of REGULAR_IDS) {
        const correct = r.records.filter(
          (x) => x.customer === id && x.accepted && x.correct,
        ).length;
        const d = delta[id] ?? 0;
        correctServes += correct;
        points += d;
        if (d < correct) bad.push(`${at}: ${id} served correctly ${correct}x but affinity +${d}`);
        if (d > correct) {
          extra += d - correct;
          if ((known[id] ?? 0) < USUAL_AFFINITY)
            bad.push(`${at}: ${id} +${d - correct} beyond serves while known at ${known[id] ?? 0}`);
        }
        running[id] = (running[id] ?? 0) + d;
      }
      if (extra !== fired)
        bad.push(`${at}: THE_USUAL fired ${fired}x, affinity beyond serves ${extra}`);
      usual += fired;
      finishShift(store, r.summary!, delta);
      const saved = store.load().regulars;
      for (const id of REGULAR_IDS)
        if ((saved[id]?.affinity ?? 0) !== (running[id] ?? 0))
          bad.push(`${at}: ${id} saved ${saved[id]?.affinity ?? 0}, expected ${running[id] ?? 0}`);
    }
  }
  evidence('the-usual', {
    seeds: 1000,
    shifts: 5000,
    correctServes,
    points,
    usual,
    bad: bad.length,
  });
  expect(bad.slice(0, 20), `${bad.length} mismatches`).toEqual([]);
  expect(correctServes).toBeGreaterThan(0);
  expect(usual).toBeGreaterThan(0);
}, 300_000);

it('AFFINITY_RULE (decided 2026-10-17): serving a regular correctly raises affinity by 1', () => {
  const r = createRush(
    7,
    'normal',
    {},
    { shiftIndex: 0, unlockedDrinks: ['longBlack'], affinity: {} },
  );
  const dazza = r.customers.find((c) => c.def.id === 'dazza')!;
  dazza.state = 'waiting';
  dazza.heard = { ...dazza.order };
  dazza.ticket = 1;
  dazza.registerAt = r.time;
  r.barista.ready = drinkFor(dazza, r.time);
  r.barista.phase = 'ready';
  serve(r, dazza.key);
  expect(dazza.outcome).toBe('served');
  expect(dazza.result?.correct).toBe(true); // Non-vacuous: a genuinely correct serve.
  // This is the delta finishShift receives, not a mock of the proposed implementation.
  expect(r.shiftEvents.affinity.dazza ?? 0).toBe(1);
});
