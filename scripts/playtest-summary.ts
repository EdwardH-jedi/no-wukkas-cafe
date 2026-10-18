// Playtest numbers from exported logs (todo.md T3.6, docs/playtests/README.md): reads each file
// (Settings → Playtest log → Export log), adds them up (src/sim/telemetrySummary.ts) and prints
// Markdown tables to paste into docs/playtests/<date>.md.
//
//   npm run playtest:summary -- docs/playtests/logs/*.json
//
// A file that isn't a version-1 export stops the run with exit 1: a summary that quietly skipped a
// tester would be wrong.

import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// src/ uses bundler-style extensionless imports; teach Node the same (as scripts/balance.ts does).
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

const { readExport, summarise, summaryMarkdown } = await import('../src/sim/telemetrySummary.ts');
type Log = Parameters<typeof summarise>[0][number];

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: npm run playtest:summary -- <exported-log.json> [more.json …]');
  process.exit(2);
}
const logs: Log[] = [];
for (const f of files) {
  let text: string;
  try {
    text = readFileSync(f, 'utf8');
  } catch (e) {
    console.error(`playtest:summary: ${f}: can't read it (${(e as Error).message})`);
    process.exit(1);
  }
  const r = readExport(text);
  if (!r.ok) {
    console.error(`playtest:summary: ${f}: ${r.error}`);
    process.exit(1);
  }
  logs.push(r.log);
}
process.stdout.write(summaryMarkdown(summarise(logs)));
