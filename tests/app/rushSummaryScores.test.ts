// The production summary path puts a finished shift on its leaderboard board (todo.md T4.3): the
// rush frame (src/app/rushView.ts) gets the summary events of a real headless shift, and exactly one
// entry exists, on the right board, by the time the report is asked to draw. tests/app/scores.test.ts
// covers recordScore itself; this covers the call site, so removing it fails here.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRushFrame } from '../../src/app/rushView';
import { createSaveStore } from '../../src/core/save/storage';
import { boardKey } from '../../src/sim/scores';
import { playRush } from '../helpers/rushBot';
import { createHarness } from '../review/harness';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const WEEK = {
  week: 1,
  shiftIndex: 0,
  unlockedDrinks: ['longBlack' as const],
  affinity: {},
};

describe('the rush frame records the finished shift', () => {
  it.each([
    ['day2', undefined],
    ['week', WEEK],
    ['endless', { ...WEEK, endless: true }],
  ] as const)('%s: exactly one score, on its own board, before the report draws', (mode, week) => {
    const h = createHarness({ seed: 3 });
    Object.assign(h.app, { store: createSaveStore(null, { seed: 3 }) });
    const played = playRush({ seed: 3, idle: true, ...(week ? { week } : {}) });
    const r = played.r;
    h.app.rush = r;
    r.events.push(
      ...played.events.filter(
        (e) => e.type === 'summary' || (e.type === 'phase' && e.phase === 'summary'),
      ),
    );
    expect(h.app.scores.read().boards).toEqual({});

    const atReport: unknown[][] = [];
    const draw = vi.spyOn(h.app.rushHud, 'onPhase').mockImplementation((phase) => {
      if (phase === 'summary') atReport.push(Object.values(h.app.scores.read().boards).flat());
    });
    const frame = createRushFrame(h.app);
    frame(r, 0);

    expect(draw).toHaveBeenCalledWith('summary', r);
    expect(atReport).toHaveLength(1);
    expect(atReport[0]).toEqual([
      expect.objectContaining({ mode, served: r.summary!.ordersCompleted }),
    ]);
    const boards = h.app.scores.read().boards;
    expect(Object.keys(boards)).toEqual([boardKey(atReport[0]![0] as never)]);
    expect(h.app.scoreNote).toMatchObject({ newBest: false });

    // The events are consumed: another frame must not record the same shift twice.
    frame(r, 0);
    expect(Object.values(h.app.scores.read().boards).flat()).toHaveLength(1);
  });
});
