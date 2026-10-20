// Independent task-clause controls. These also expose narrow verify-command blind spots.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRushFrame } from '../../src/app/rushView';
import { createSaveStore } from '../../src/core/save/storage';
import { shiftRows } from '../../src/core/week/progress';
import { newSave } from '../../src/sim/contracts/save';
import type { ScoreEntry } from '../../src/sim/scores';
import { playRush } from '../helpers/rushBot';
import { createHarness } from './harness';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('independent acceptance: shared pause implementation', () => {
  it('boot and the harness import the same three lifecycle implementations', () => {
    for (const name of ['src/app/boot.ts', 'tests/review/harness.ts']) {
      const source = readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
      const imported = source.match(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*\/pause['"]/);
      expect(imported, name).not.toBeNull();
      for (const fn of ['setPaused', 'resumeAll', 'replayLast']) expect(imported![1]).toContain(fn);
      expect(source).not.toContain('copied, not shared');
    }
  });
});

describe('independent acceptance: all week row states', () => {
  it.each([1, 2, 9])('week %i retains every best while locking every future row', (week) => {
    for (let shift = 0; shift < 5; shift++) {
      const save = { ...newSave(), week, shift };
      save.reports = Array.from({ length: 5 }, (_, i) => ({
        week: 1,
        shift: i,
        summary: {
          customers: 6,
          ordersCompleted: 6,
          correctOrders: 6,
          walkouts: 0,
          avgServeSeconds: 30,
          satisfaction: 90,
          tipsCents: 500,
          wasted: 0,
          grade: 'good' as const,
        },
      }));
      const rows = shiftRows(save);
      expect(rows.map((r) => r.status)).toEqual(
        Array.from({ length: 5 }, (_, i) => (i < shift ? 'done' : i === shift ? 'open' : 'locked')),
      );
      expect(rows.map((r) => r.best)).toEqual(Array(5).fill('good'));
    }
  });
});

describe('independent acceptance: production summary dispatch', () => {
  it.each(['day2', 'week', 'endless'] as const)(
    '%s records before the report is called',
    (mode) => {
      const h = createHarness({ seed: 3 });
      Object.assign(h.app, { store: createSaveStore(null, { seed: 3 }) });
      const week = {
        week: 1,
        shiftIndex: 0,
        unlockedDrinks: ['longBlack' as const],
        affinity: {},
        ...(mode === 'endless' ? { endless: true } : {}),
      };
      const played = playRush({ seed: 3, idle: true, ...(mode === 'day2' ? {} : { week }) });
      const r = played.r;
      h.app.rush = r;
      r.events.push(
        ...played.events.filter(
          (e) => e.type === 'summary' || (e.type === 'phase' && e.phase === 'summary'),
        ),
      );
      const draw = vi.spyOn(h.app.rushHud, 'onPhase').mockImplementation((phase) => {
        if (phase === 'summary')
          expect(Object.values(h.app.scores.read().boards).flat()).toEqual([
            expect.objectContaining({ mode, served: r.summary!.ordersCompleted }),
          ]);
      });
      createRushFrame(h.app)(r, 0);
      expect(draw).toHaveBeenCalledWith('summary', r);
    },
  );

  it.each(['day2', 'endless', 'first-week', 'record-week'] as const)(
    'Gaz closing line obeys the %s restriction through the real machine',
    (mode) => {
      const best: ScoreEntry = {
        mode: 'week',
        week: 1,
        shiftIndex: 0,
        seed: 1,
        difficulty: 'normal',
        grade: 'disaster',
        served: 0,
        walkouts: 6,
        tipsCents: 0,
        at: '2026-10-19T00:00:00.000Z',
      };
      const week = {
        week: 1,
        shiftIndex: 0,
        unlockedDrinks: ['longBlack' as const],
        affinity: {},
        ...(mode === 'first-week' ? {} : { best }),
        ...(mode === 'endless' ? { endless: true } : {}),
      };
      const played = playRush({ seed: 3, ...(mode === 'day2' ? {} : { week }) });
      const lines = played.events.filter(
        (e) => e.type === 'say' && e.line.key === 'rush.end.newBest',
      );
      expect(lines).toHaveLength(mode === 'record-week' ? 1 : 0);
    },
  );
});
