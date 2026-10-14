// Day 2 pacing report: plays the morning rush headless for seeds 1–10 with a perfect bot and a
// first-timer bot (tests/helpers/rushBot.ts), on Easy and Normal, and prints a Markdown table:
// walk-outs, mean serve time, make time per drink type, and patience left at each serve.
//
//   npm run pace                 summary rows
//   npm run pace -- --detail     plus one row per seed
//
// Patience cells read "worst/mean" seconds left when served; "✗n" = n runs ended in a walk-out.

import { registerHooks } from 'node:module';

// src/ uses bundler-style imports (no extensions, directory index files, plain JSON imports);
// teach Node the same (as scripts/voice-node.ts does for the voice scripts).
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

const { BOT_FIRST_TIMER, BOT_IDEAL } = await import('../tests/helpers/rushBot.ts');
const { PACE_HEADER, paceRow, paceRun } = await import('../tests/helpers/pace.ts');

const detail = process.argv.includes('--detail');
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BOTS = { ideal: BOT_IDEAL, firstTimer: BOT_FIRST_TIMER };

console.log(PACE_HEADER);
for (const [name, bot] of Object.entries(BOTS))
  for (const difficulty of ['easy', 'normal'] as const) {
    const runs = SEEDS.map((seed) => paceRun(bot, seed, difficulty));
    if (detail) for (const x of runs) console.log(paceRow(`${name} · seed ${x.seed}`, [x]));
    console.log(paceRow(`**${name}**`, runs));
  }
