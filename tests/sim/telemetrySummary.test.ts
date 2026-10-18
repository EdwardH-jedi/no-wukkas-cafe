// Playtest summary over exported logs (todo.md T3.6): totals that equal the records they came
// from, a record exported twice counted once, other versions and broken files refused with a
// reason (never counted as zero), and the CLI's exit codes.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ShiftTelemetry, TelemetryLog, TrialTelemetry } from '../../src/sim/telemetry';
import { readExport, summarise, summaryMarkdown } from '../../src/sim/telemetrySummary';

const ROOT = join(import.meta.dirname, '../..');
const SAMPLE = join(ROOT, 'tests/fixtures/telemetry/sample.json');
const text = readFileSync(SAMPLE, 'utf8');
const sample = (): TelemetryLog => {
  const r = readExport(text);
  if (!r.ok) throw new Error(r.error);
  return r.log;
};

describe('readExport', () => {
  it('reads a version-1 export', () => {
    expect(sample().records).toHaveLength(5);
  });

  it('refuses other versions, other JSON and broken files, saying why', () => {
    expect(readExport(JSON.stringify({ version: 2, records: [] }))).toEqual({
      ok: false,
      error: 'log version 2, this summary reads version 1',
    });
    expect(readExport('{"version":1}')).toMatchObject({ ok: false, error: /records/ });
    expect(readExport('{"cents": 5}')).toMatchObject({ ok: false, error: /version/ });
    expect(readExport('{oops')).toMatchObject({ ok: false, error: /not JSON/ });
  });
});

describe('summarise', () => {
  it('adds up every shift and trial record', () => {
    const log = sample();
    const shifts = log.records.filter((r): r is ShiftTelemetry => r.kind === 'shift');
    const trials = log.records.filter((r): r is TrialTelemetry => r.kind === 'trial');
    const s = summarise([log]);
    expect(s).toMatchObject({ logs: 1, sessions: 2, trials: 2, shifts: 3 });
    expect(s.shiftsByMode).toEqual({ day2: 2, week: 1, endless: 0 });
    expect(s.finished).toBe(2);
    expect(s.served).toBe(shifts.reduce((t, x) => t + x.served, 0));
    expect(s.walkouts).toBe(shifts.reduce((t, x) => t + x.walkouts, 0));
    expect(Object.values(s.walkoutsAt).reduce((a, b) => a + b, 0)).toBe(s.walkouts);
    expect(s.customers).toBe(shifts.reduce((t, x) => t + x.customers, 0));
    expect(s.accuracy.drink.total).toBe(shifts.reduce((t, x) => t + x.accuracy.drink.total, 0));
    expect(s.pardons.questions).toBe(shifts.reduce((t, x) => t + x.pardons.questions, 0));
    expect(s.verdicts).toEqual({ hired: 0, almost: 1, failed: 0, disaster: 0, unfinished: 1 });
    expect(s.quits.map((q) => [q.kind, q.ending])).toEqual([
      ['trial', 'title'],
      ['shift', 'title'],
    ]);
    expect(s.quits[0]?.where).toBe(`steam, attempt ${trials[1]!.quit!.attempt}`);
    expect(s.quits[1]?.where).toMatch(/^week shift 1: /);
    const serves = shifts.flatMap((x) => x.serveSeconds.each);
    expect(s.serveSeconds.max).toBe(Math.max(...serves));
    expect(s.pardonsPerOrder).toBe(
      Math.round(
        ((s.pardons.replays + s.pardons.repeats + s.pardons.questions) / s.ordersHeard) * 100,
      ) / 100,
    );
  });

  it('counts a record once when the same log is exported twice', () => {
    expect(summarise([sample(), sample()])).toMatchObject({ logs: 2, shifts: 3, trials: 2 });
  });

  it('no records: zeros and dashes, not NaN', () => {
    const s = summarise([{ version: 1, records: [] }]);
    expect(s.pardonsPerOrder).toBeNull();
    expect(s.registerWait).toEqual({ median: null, max: null });
    const md = summaryMarkdown(s);
    expect(md).not.toMatch(/NaN|undefined|null/);
    expect(md).toMatch(/None: every record ran to its end/);
  });
});

describe('summaryMarkdown', () => {
  it('a table per part, with the numbers from the summary', () => {
    const s = summarise([sample()]);
    const md = summaryMarkdown(s);
    expect(md).toMatch(/^## Playtest summary$/m);
    expect(md).toContain(
      `| Customers · served · walk-outs · shown the door | ${s.customers} · ${s.served} · ${s.walkouts} · ${s.refused} |`,
    );
    expect(md).toMatch(/^### Accuracy per field/m);
    expect(md).toMatch(/^\| drink \| \d+ \| \d+ \| \d+ % \|$/m);
    expect(md).toMatch(/^### Quit points$/m);
    expect(md).not.toMatch(/NaN|undefined/);
  });
});

describe('npm run playtest:summary', () => {
  const run = (...files: string[]) =>
    spawnSync(process.execPath, [join(ROOT, 'scripts/playtest-summary.ts'), ...files], {
      encoding: 'utf8',
    });

  it('prints the summary of the files given', () => {
    const r = run(SAMPLE);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(summaryMarkdown(summarise([sample()])));
  });

  it('stops on a file of another version, naming it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nwc-summary-test-'));
    try {
      const bad = join(dir, 'v2.json');
      writeFileSync(bad, JSON.stringify({ version: 2, records: [] }));
      const r = run(SAMPLE, bad);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`${bad}: log version 2, this summary reads version 1`);
      expect(r.stdout).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
