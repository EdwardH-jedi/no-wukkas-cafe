// Reviewer-owned acceptance tests for 3aa0828..7192583. Keep assertions when fixing src/.
// In particular, older exports must not undo a later ending of the same recorded run.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry } from '../../src/app/telemetry';
import { createRush } from '../../src/core/rush';
import { createTelemetryStore } from '../../src/core/save/telemetry';
import { createTrial } from '../../src/core/trial';
import type { TelemetryLog } from '../../src/sim/telemetry';
import { readExport, summarise } from '../../src/sim/telemetrySummary';
import { playRush } from '../helpers/rushBot';

const ROOT = join(import.meta.dirname, '../..');
const SAMPLE = join(ROOT, 'tests/fixtures/telemetry/sample.json');
const sample = (): TelemetryLog => JSON.parse(readFileSync(SAMPLE, 'utf8')) as TelemetryLog;
const read = (text: string): TelemetryLog => {
  const r = readExport(text);
  if (!r.ok) throw new Error(r.error);
  return r.log;
};

afterEach(() => vi.useRealTimers());

describe('M3 F1: duplicate exports must retain the newest record, regardless of file order', () => {
  it('an older checkpoint must not erase a completed shift and its served customers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
    let rush = createRush(3);
    const store = createTelemetryStore(null);
    const recorder = createTelemetry({ rush: () => rush, trial: () => createTrial(7) }, store);
    recorder.startShift();
    recorder.checkpoint();
    const old = read(JSON.stringify(store.read()));
    rush = playRush({ seed: 3 }).r;
    expect(rush.phase).toBe('summary');
    vi.setSystemTime(new Date('2026-10-19T00:10:00Z'));
    recorder.end('finished');
    const latest = read(JSON.stringify(store.read()));
    const expected = summarise([latest]);
    expect(expected.finished).toBe(1);
    expect(expected.served).toBeGreaterThan(0);
    expect(latest.records[0]!.id).toBe(old.records[0]!.id);
    for (const logs of [
      [old, latest],
      [latest, old],
    ]) {
      expect(summarise(logs)).toEqual({ ...expected, logs: 2 });
    }
  });

  it('an older trial checkpoint must not replace the later quit point', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T00:00:00Z'));
    const trial = createTrial(7);
    const store = createTelemetryStore(null);
    const recorder = createTelemetry({ rush: () => null, trial: () => trial }, store);
    recorder.startTrial();
    recorder.checkpoint();
    const old = read(JSON.stringify(store.read()));
    vi.setSystemTime(new Date('2026-10-19T00:05:00Z'));
    trial.phase = 'steam';
    trial.time = 100;
    recorder.end('title');
    const latest = read(JSON.stringify(store.read()));
    expect(summarise([latest]).quits[0]).toMatchObject({
      ending: 'title',
      where: 'steam, attempt 1',
    });
    expect(summarise([latest, old])).toEqual({ ...summarise([latest]), logs: 2 });
  });
});

describe('M3 F2: a version-1 envelope must not make invalid records valid exports', () => {
  it.each([
    ['unknown record kind', { id: 'broken#1', session: 'broken', kind: 'typo' }],
    ['null record', null],
    ['incomplete shift', { id: 'broken#1', session: 'broken', kind: 'shift' }],
  ])('rejects %s instead of silently dropping it or crashing in summarise', (_name, record) => {
    const result = readExport(JSON.stringify({ version: 1, records: [record] }));
    expect(result).toMatchObject({ ok: false, error: expect.any(String) });
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects a nonnumeric served count instead of printing a corrupt total', () => {
    const log = sample();
    const shift = log.records.find((r) => r.kind === 'shift')!;
    // Simulate a malformed JSON export, without weakening the production TypeScript types.
    const corrupt: unknown = { ...shift, served: 'not-a-count' };
    expect(readExport(JSON.stringify({ version: 1, records: [corrupt] }))).toMatchObject({
      ok: false,
      error: expect.any(String),
    });
  });

  it('CLI refuses a bad record, names its input file, and emits no partial summary', () => {
    // Retained scratch fixture: this review never explicitly deletes files.
    const dir = mkdtempSync(join(tmpdir(), 'nwc-independent-m3-'));
    const bad = join(dir, 'invalid-record.json');
    writeFileSync(bad, JSON.stringify({ version: 1, records: [{ kind: 'typo', id: 'x' }] }));
    const run = spawnSync(
      process.execPath,
      [join(ROOT, 'scripts/playtest-summary.ts'), SAMPLE, bad],
      {
        encoding: 'utf8',
      },
    );
    expect.soft(run.status).toBe(1);
    expect.soft(run.stderr).toContain(bad);
    expect.soft(run.stdout).toBe('');
  });
});

describe('M3 independent aggregation controls', () => {
  it('pools every register wait, rather than averaging per-shift medians', () => {
    const first = sample().records.find((r) => r.kind === 'shift')!;
    const second = structuredClone(first);
    second.id += '-another-run';
    first.registerWait = { each: [1, 2, 3], median: 2, mean: 2, max: 3 };
    second.registerWait = { each: [100], median: 100, mean: 100, max: 100 };
    expect(summarise([{ version: 1, records: [first, second] }]).registerWait).toEqual({
      median: 2.5,
      max: 100,
    });
  });

  it('deduplicates identical exports without mutating either input', () => {
    const a = sample();
    const b = sample();
    const before = JSON.stringify([a, b]);
    expect(summarise([a, b])).toEqual({ ...summarise([a]), logs: 2 });
    expect(JSON.stringify([a, b])).toBe(before);
  });
});
