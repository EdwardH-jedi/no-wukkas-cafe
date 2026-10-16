// The recorder's lifecycle (open on start, close once, provisional 'closed' on page hide) with a
// fake store and the real Day 2 / Day 1 state. Node only: watchPageHide and downloadLog need a
// browser and are left to the e2e spec.

import { describe, expect, it } from 'vitest';
import { createRush, type Rush } from '../../src/core/rush';
import type { KeyValueStorage } from '../../src/core/save/storage';
import { createTelemetryStore } from '../../src/core/save/telemetry';
import { createTrial } from '../../src/core/trial';
import { createTelemetry, logFileName } from '../../src/app/telemetry';
import { logCountText } from '../../src/ui/logSection';
import { playRush } from '../helpers/rushBot';

function memStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function setup(rush: Rush | null = createRush(3)) {
  const trial = createTrial(7);
  const src = { rush: rush as Rush | null, trial };
  const store = createTelemetryStore(memStorage());
  const t = createTelemetry({ rush: () => src.rush, trial: () => src.trial }, store);
  return { t, store, src };
}

describe('telemetry recorder', () => {
  it('a finished shift is written once; a second end (the report\'s "again") is a no-op', () => {
    const { r } = playRush({ seed: 3 });
    const { t, store } = setup(r);
    t.startShift();
    t.end('finished');
    t.end('restarted');
    const recs = store.read().records;
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ kind: 'shift', ending: 'finished', quit: null });
    expect(recs[0]?.kind === 'shift' && recs[0].served).toBe(r.summary?.ordersCompleted);
  });

  it('page hidden: written as closed but kept open, then replaced by its real ending', () => {
    const { t, store } = setup();
    t.startShift();
    t.checkpoint();
    expect(store.read().records.map((x) => x.ending)).toEqual(['closed']);
    t.checkpoint();
    t.end('title');
    const recs = store.read().records;
    expect(recs.map((x) => x.ending)).toEqual(['title']);
    expect(recs[0]?.kind === 'shift' && recs[0].quit?.phase).toBe('intro');
    t.checkpoint(); // nothing open: nothing written
    expect(store.read().records).toHaveLength(1);
  });

  it('starting a shift with one still open ends it first; each record has its own id', () => {
    const { t, store } = setup();
    t.startShift();
    t.startShift();
    t.end('finished');
    const recs = store.read().records;
    expect(recs.map((x) => x.ending)).toEqual(['title', 'finished']);
    expect(new Set(recs.map((x) => x.id)).size).toBe(2);
    expect(new Set(recs.map((x) => x.session)).size).toBe(1);
    for (const x of recs) expect(Date.parse(x.startedAt) <= Date.parse(x.endedAt)).toBe(true);
  });

  it('a trial counts its game time from its intro, and a restart records where they were', () => {
    const { t, store, src } = setup(null);
    src.trial.time = 30;
    src.trial.phase = 'intro';
    src.trial.phaseTime = 0.5; // the intro began at 29.5
    t.startTrial();
    src.trial.time = 109.5;
    src.trial.phase = 'steam';
    src.trial.attempt = 1;
    t.end('restarted');
    expect(store.read().records[0]).toMatchObject({
      kind: 'trial',
      ending: 'restarted',
      seconds: 80,
      verdict: null,
      quit: { phase: 'steam', attempt: 2 },
    });
  });

  it('a shift whose rush is already gone writes nothing', () => {
    const { t, store, src } = setup();
    t.startShift();
    src.rush = null;
    t.end('title');
    expect(store.read().records).toEqual([]);
  });
});

describe('export and settings copy', () => {
  it('names the file by the local date', () => {
    expect(logFileName(new Date(2026, 9, 7, 23, 59))).toBe('no-wukkas-log-2026-10-07.json');
  });

  it('says what is in the log', () => {
    expect(logCountText({ shifts: 0, trials: 0 })).toBe('Nothing logged yet.');
    expect(logCountText({ shifts: 1, trials: 0 })).toBe('1 shift logged.');
    expect(logCountText({ shifts: 3, trials: 1 })).toBe('3 shifts and 1 trial logged.');
    expect(logCountText({ shifts: 0, trials: 2 })).toBe('2 trials logged.');
  });
});
