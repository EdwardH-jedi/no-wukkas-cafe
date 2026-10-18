// Reviewer-owned acceptance tests for 7192583..eba0ec7. Fix production code, not these oracles.
// Real app/core functions; only HUD construction, audio, world and storage IO are doubles.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRushView } from '../../src/app/rushWiring';
import { createRushFrame } from '../../src/app/rushView';
import { recordScore } from '../../src/app/scores';
import { startShift } from '../../src/app/weekWiring';
import { emptyRushInput, stepRush } from '../../src/core/rush';
import { createScoresStore, SCORES_KEY } from '../../src/core/save/scores';
import { createSaveStore, type KeyValueStorage } from '../../src/core/save/storage';
import {
  bestOf,
  boardKey,
  emptyScores,
  insert,
  parseScores,
  type ScoreEntry,
} from '../../src/sim/scores';
import * as hud from '../../src/ui/rushHud';
import { scoresHtml } from '../../src/ui/screens/scores';
import { playRush } from '../helpers/rushBot';
import { createHarness } from './harness';

const AT = '2026-10-19T01:00:00.000Z';
const entry = (overrides: Partial<ScoreEntry> = {}): ScoreEntry => ({
  mode: 'week',
  week: 1,
  shiftIndex: 0,
  seed: 3,
  difficulty: 'normal',
  grade: 'good',
  served: 5,
  walkouts: 1,
  tipsCents: 500,
  at: AT,
  ...overrides,
});

class Storage implements KeyValueStorage {
  data = new Map<string, string>();
  failRead = false;
  getItem(key: string): string | null {
    if (this.failRead) throw new Error('SecurityError');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('M4 F1: restarting after a difficulty change must use the new board for Gaz', () => {
  it.each([
    ['first Hard run must not be congratulated for beating a Normal score', false],
    ['a Hard record must not be suppressed by a stronger Normal best', true],
  ] as const)('%s', (_name, hasHardBest) => {
    const h = createHarness({ seed: 3 });
    // The audio/world harness intentionally leaves saves unspecified. Supply the real store.
    Object.assign(h.app, { store: createSaveStore(null, { seed: 3 }) });
    h.app.scores.put(
      entry({
        grade: hasHardBest ? 'excellent' : 'disaster',
        served: hasHardBest ? 6 : 0,
        tipsCents: hasHardBest ? 100_000 : 0,
        walkouts: hasHardBest ? 0 : 6,
      }),
    );
    if (hasHardBest)
      h.app.scores.put(
        entry({ difficulty: 'hard', grade: 'disaster', served: 0, tipsCents: 0, walkouts: 6 }),
      );
    startShift(h.app);
    expect(h.app.rush?.difficulty).toBe('normal');
    // Capture and invoke the actual pause menu callback, without constructing browser DOM.
    const factory = vi.spyOn(hud, 'createRushHud').mockReturnValue(h.app.rushHud);
    createRushView(h.app);
    h.app.listen = { ...h.app.listen, difficulty: 'hard' };
    factory.mock.calls[0]![1].restart();
    const input = emptyRushInput();
    input.action = h.app.rushAction;
    stepRush(h.app.rush!, input, 1 / 60);
    expect(h.app.rush?.difficulty).toBe('hard');
    // Complete a real headless run using the restart's actual seed, difficulty and week context.
    const restarted = h.app.rush!;
    const played = playRush({
      seed: restarted.seed,
      difficulty: restarted.difficulty,
      week: restarted.week!,
    });
    expect(played.r.phase).toBe('summary');
    const note = recordScore(h.app.scores, played.r, AT)!;
    expect(note.newBest).toBe(hasHardBest);
    const congratulations = played.events.filter(
      (e) => e.type === 'say' && e.line.key === 'rush.end.newBest',
    );
    expect(
      congratulations,
      'Gaz and the report must agree on the current difficulty board',
    ).toHaveLength(hasHardBest ? 1 : 0);
  });
});

describe('M4 F2: corrupt stored entries must not become leaderboard bests', () => {
  it('an inherited Object property is not a grade and must not poison future best comparisons', () => {
    const candidate = entry({ grade: 'excellent', served: 6 });
    const corrupt = { ...entry(), grade: 'constructor' };
    const parsed = parseScores(
      JSON.stringify({ version: 1, boards: { [boardKey(candidate)]: [corrupt] } }),
    );
    expect.soft(bestOf(parsed, candidate)).toBeNull();
    const repaired = insert(parsed, candidate).scores;
    expect(bestOf(repaired, candidate)).toEqual(candidate);
    expect(scoresHtml(repaired)).toContain('Excellent · 6 served');
  });

  it('an Easy entry stored under a Hard board must not appear as its best or block a real Hard result', () => {
    const hard = entry({ difficulty: 'hard', grade: 'good' });
    const easy = entry({ difficulty: 'easy', grade: 'excellent', served: 6 });
    const parsed = parseScores(
      JSON.stringify({ version: 1, boards: { [boardKey(hard)]: [easy] } }),
    );
    // Either discard the corrupt board or re-home its entry; never credit it to Hard.
    expect.soft(bestOf(parsed, hard)).toBeNull();
    expect(bestOf(insert(parsed, hard).scores, hard)).toEqual(hard);
  });
});

describe('M4 F3: storage fallback must retain scores already read during this session', () => {
  it('a later getItem failure must not erase the previously loaded best before recording a worse run', () => {
    const disk = new Storage();
    const best = entry({ grade: 'excellent', served: 6 });
    createScoresStore(disk).put(best);
    const reloaded = createScoresStore(disk);
    expect(bestOf(reloaded.read(), best)).toEqual(best);
    disk.failRead = true;
    expect
      .soft(bestOf(reloaded.read(), best), 'the last successful read must survive in memory')
      .toEqual(best);
    expect(reloaded.memoryOnly).toBe(true);
    reloaded.put(entry({ grade: 'poor', served: 1 }));
    expect(bestOf(reloaded.read(), best)).toEqual(best);
    // The failed backend must not be overwritten by the memory-only run.
    expect(bestOf(parseScores(disk.data.get(SCORES_KEY)), best)).toEqual(best);
  });
});

describe('M4 independent integration controls', () => {
  it.each(['day2', 'week', 'endless'] as const)(
    '%s writes exactly once before the report callback, and clears the note on restart',
    (mode) => {
      const h = createHarness({ seed: 3 });
      Object.assign(h.app, { store: createSaveStore(null, { seed: 3 }) });
      const week = {
        week: 1,
        shiftIndex: 0,
        unlockedDrinks: ['flatWhite' as const, 'longBlack' as const],
        affinity: {},
        ...(mode === 'endless' ? { endless: true } : {}),
      };
      const played = playRush({ seed: 3, idle: true, ...(mode === 'day2' ? {} : { week }) });
      const r = played.r;
      h.app.rush = r;
      // Feed the real emitted report transition into the real per-frame wiring. The bot has
      // already drained r.events into its event log; retain precisely these emitted events.
      r.events.push(
        ...played.events.filter(
          (e) => e.type === 'summary' || (e.type === 'phase' && e.phase === 'summary'),
        ),
      );
      const draw = vi.spyOn(h.app.rushHud, 'onPhase').mockImplementation((phase) => {
        if (phase !== 'summary') return;
        expect(Object.values(h.app.scores.read().boards).flat()).toHaveLength(1);
        expect(h.app.scoreNote?.best).toMatchObject({ mode, served: r.summary!.ordersCompleted });
      });
      const frame = createRushFrame(h.app);
      frame(r, 0);
      expect(draw).toHaveBeenCalledWith('summary', r);
      frame(r, 0);
      expect(Object.values(h.app.scores.read().boards).flat()).toHaveLength(1);
      const input = emptyRushInput();
      input.action = { type: 'restart' };
      stepRush(r, input, 1 / 60);
      frame(r, 0);
      expect(h.app.scoreNote).toBeNull();
      expect(Object.values(h.app.scores.read().boards).flat()).toHaveLength(1);
    },
  );

  it('valid scores round-trip and a tie remains behind the earlier entry after reloading', () => {
    const first = entry();
    const tied = entry({ seed: 4, at: '2026-10-19T02:00:00.000Z' });
    const original = insert(emptyScores(), first).scores;
    const parsed = parseScores(JSON.stringify(original));
    const result = insert(parsed, tied);
    expect(result.rank).toBe(1);
    expect(result.scores.boards[boardKey(first)]).toEqual([first, tied]);
    expect(parsed).toEqual(original);
  });
});
