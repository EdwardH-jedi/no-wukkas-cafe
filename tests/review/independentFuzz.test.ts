import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSaveStore } from '../../src/core/save/storage';
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

it('THE_USUAL remains unreachable across 1000 seeds and five consecutive saved shifts', () => {
  let usual = 0;
  let served = 0;
  let affinityWrites = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const store = createSaveStore(null, { seed });
    for (let shift = 0; shift < 5; shift++) {
      const { r } = lifecycleShift(seed + shift * 1009, weekFor(store.load()));
      expect(r.summary, `seed ${seed}, iteration ${shift}`).not.toBeNull();
      usual += r.shiftEvents.log.fired.filter((f) => f.id === 'THE_USUAL').length;
      served += r.records.filter((x) => x.accepted).length;
      affinityWrites += Object.keys(r.shiftEvents.affinity).length;
      finishShift(store, r.summary!, r.shiftEvents.affinity);
    }
    expect(store.load().regulars).toEqual({});
  }
  evidence('the-usual', { seeds: 1000, shifts: 5000, served, usual, affinityWrites });
  expect(served).toBeGreaterThan(0);
  expect(usual).toBe(0);
}, 300_000);

it('PROPOSED RULE awaiting Edward: serving a regular correctly raises affinity by 1', () => {
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
