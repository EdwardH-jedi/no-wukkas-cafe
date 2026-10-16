// Headless week balance (AGENTS.md §3, docs/TODO.md Phase 2): plays week 1 from a fresh save with
// the novice, average and expert bots (tests/helpers/rushBot.ts SKILLS) over 30 seeds, the way the
// game does it (tests/helpers/pace.ts playWeek), writes every attempt to reports/balance.csv and
// prints first-try pass rates per shift.
//
//   npm run balance                          30 seeds → reports/balance.csv
//   npm run balance -- --seeds 10            fewer seeds (quicker)
//   npm run balance -- --out docs/balance/2026-10-16.csv
//
// Profiles run in parallel worker threads; each is deterministic for its seeds.

import { mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname } from 'node:path';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

// src/ uses bundler-style imports (no extensions, directory index files, plain JSON imports);
// teach Node the same (as scripts/day2-pace.ts does).
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (!spec.startsWith('.') || /\.\w+$/.test(spec)) throw e;
      try {
        return next(`${spec}.ts`, ctx);
      } catch {
        return next(`${spec}/index.ts`, ctx);
      }
    }
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx);
  },
});

const { playWeek, weekCsv, weekTable } = await import('../tests/helpers/pace.ts');
type WeekRow = ReturnType<typeof playWeek>[number];
type SkillName = WeekRow['profile'];

const PROFILES: SkillName[] = ['novice', 'average', 'expert'];

if (!isMainThread) {
  const { profile, seeds } = workerData as { profile: SkillName; seeds: number[] };
  parentPort?.postMessage(seeds.flatMap((seed) => playWeek(profile, seed)));
} else {
  const arg = (name: string): string | undefined => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const count = Number(arg('--seeds') ?? 30);
  const out = arg('--out') ?? 'reports/balance.csv';
  const seeds = Array.from({ length: count }, (_, i) => i + 1);
  const results = await Promise.all(
    PROFILES.map(
      (profile) =>
        new Promise<WeekRow[]>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { profile, seeds } });
          w.once('message', resolve);
          w.once('error', reject);
        }),
    ),
  );
  const rows = results.flat();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, weekCsv(rows));
  console.log(`week 1 · normal · ${count} seeds × ${PROFILES.join(', ')} → ${out}\n`);
  console.log(weekTable(rows));
}
