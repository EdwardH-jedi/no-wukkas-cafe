// Writes tests/fixtures/telemetry/sample.json: an export of the playtest log (sim/telemetry.ts,
// version 1) from headless play, as tests/sim/telemetry.test.ts builds records. Two sessions:
// a first-timer bot's Day 2 to its report, an idle Day 2 (everyone walks out), a novice week
// Monday left for the title at 90 s, and two Day 1 trials (one finished, one left mid-steam).
// Deterministic; re-run after a telemetry change:
//
//   node --import ./tests/review/nodeReviewLoader.mjs tests/fixtures/telemetry/makeSample.ts

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AttemptResult } from '../../../src/sim/attempt';
import {
  shiftTelemetry,
  TELEMETRY_VERSION,
  trialTelemetry,
  type RecordMeta,
  type TelemetryLog,
} from '../../../src/sim/telemetry';
import { BOT_FIRST_TIMER, playRush, skillBot, SKILLS } from '../../helpers/rushBot';

const A = '2026-10-18T09:00:00.000Z';
const B = '2026-10-18T10:00:00.000Z';
const meta = (session: string, n: number, ending: RecordMeta['ending']): RecordMeta => ({
  id: `${session}#${n}`,
  session,
  startedAt: session,
  endedAt: session.replace(':00:00', ':05:00'),
  ending,
});
const attempt = (total: number, valid = true): AttemptResult =>
  ({
    total,
    art: total * 0.456,
    cup: 0,
    milk: 0,
    espresso: 0,
    valid,
    invalid: valid ? null : 'halfEmpty',
    faults: valid ? ['lopsided'] : [],
    band: total >= 85 ? 'hired' : total >= 60 ? 'almost' : total >= 25 ? 'failed' : 'disaster',
    pattern: {} as AttemptResult['pattern'],
  }) as AttemptResult;

const monday = { shiftIndex: 0, unlockedDrinks: ['flatWhite', 'longBlack'] as const, affinity: {} };
const log: TelemetryLog = {
  version: TELEMETRY_VERSION,
  records: [
    trialTelemetry(
      {
        seed: 7,
        time: 250,
        phase: 'verdict',
        attempt: 2,
        results: [attempt(40), attempt(20, false), attempt(72)],
        outcome: { band: 'almost', score: 72, bestIndex: 2 },
      },
      10,
      meta(A, 1, 'finished'),
    ),
    shiftTelemetry(playRush({ seed: 3, ...BOT_FIRST_TIMER }).r, meta(A, 2, 'finished')),
    shiftTelemetry(playRush({ seed: 8, idle: true }).r, meta(A, 3, 'finished')),
    trialTelemetry(
      {
        seed: 9,
        time: 120,
        phase: 'steam',
        attempt: 0,
        results: [],
        outcome: null,
      },
      20,
      meta(B, 1, 'title'),
    ),
    shiftTelemetry(
      playRush({
        ...skillBot(SKILLS.novice, 4),
        seed: 4,
        week: { ...monday, unlockedDrinks: [...monday.unlockedDrinks] },
        maxSeconds: 90,
      }).r,
      meta(B, 2, 'title'),
    ),
  ],
};
const out = join(import.meta.dirname, 'sample.json');
writeFileSync(out, `${JSON.stringify(log, null, 2)}\n`);
console.log(`${out}: ${log.records.length} records`);
