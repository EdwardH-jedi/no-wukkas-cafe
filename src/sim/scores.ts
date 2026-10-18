// The local leaderboard (todo.md M4): every finished shift as an entry on its board, ranked, ten
// kept per board. Week shifts and Day 2 rank by grade, then drinks served, then tips, then fewer
// walk-outs; Endless Rush by served, then tips (it always ends in walk-outs). A tie keeps the
// earlier entry. One device, one player: no names. Pure: the time stamp comes in from src/app, and
// the copy on disk lives under its own key (core/save/scores.ts), outside the save.

import type { Difficulty } from './listening';
import type { ShiftGrade, ShiftSummary } from './rush';

export const SCORES_VERSION = 1;
export const SCORES_CAP = 10;

export type ScoreMode = 'day2' | 'week' | 'endless';

export interface ScoreEntry {
  mode: ScoreMode;
  /** The save's week (week mode), else null. */
  week: number | null;
  /** 0-based shift of the week (week mode), else null. */
  shiftIndex: number | null;
  seed: number;
  difficulty: Difficulty;
  grade: ShiftGrade;
  served: number;
  walkouts: number;
  /** Integer cents. */
  tipsCents: number;
  /** ISO time the shift ended (passed in). */
  at: string;
}

export interface Scores {
  version: typeof SCORES_VERSION;
  /** boardKey → entries, best first. */
  boards: Record<string, ScoreEntry[]>;
}

const GRADE_RANK: Record<ShiftGrade, number> = {
  disaster: 0,
  poor: 1,
  okay: 2,
  good: 3,
  excellent: 4,
};

export const emptyScores = (): Scores => ({ version: SCORES_VERSION, boards: {} });

/** One board per week shift and difficulty (any week), per Endless difficulty, per Day 2
 *  difficulty. */
export function boardKey(e: Pick<ScoreEntry, 'mode' | 'shiftIndex' | 'difficulty'>): string {
  return e.mode === 'week'
    ? `week:${e.shiftIndex ?? 0}:${e.difficulty}`
    : `${e.mode}:${e.difficulty}`;
}

/** Negative when `a` ranks above `b`, 0 on a tie. */
function compare(a: ScoreEntry, b: ScoreEntry): number {
  if (a.mode !== 'endless') {
    const g = GRADE_RANK[b.grade] - GRADE_RANK[a.grade];
    if (g !== 0) return g;
  }
  if (a.served !== b.served) return b.served - a.served;
  if (a.tipsCents !== b.tipsCents) return b.tipsCents - a.tipsCents;
  return a.mode === 'endless' ? 0 : a.walkouts - b.walkouts;
}

/** The scores with `e` on its board, and its place there (0 = best), or null if it didn't make
 *  the top `cap`. Never changes `s`. */
export function insert(
  s: Scores,
  e: ScoreEntry,
  cap = SCORES_CAP,
): { scores: Scores; rank: number | null } {
  const key = boardKey(e);
  const old = s.boards[key] ?? [];
  // After every entry it doesn't beat: a tie keeps the earlier one first.
  let at = old.findIndex((x) => compare(e, x) < 0);
  if (at < 0) at = old.length;
  const next = [...old.slice(0, at), e, ...old.slice(at)].slice(0, cap);
  return {
    scores: { version: SCORES_VERSION, boards: { ...s.boards, [key]: next } },
    rank: at < cap ? at : null,
  };
}

/** The best entry on `e`'s board, or null when it's empty. */
export const bestOf = (s: Scores, e: Pick<ScoreEntry, 'mode' | 'shiftIndex' | 'difficulty'>) =>
  s.boards[boardKey(e)]?.[0] ?? null;

/** `e` beats a best that is already there (a first score on a board has nothing to beat). */
export function isNewBest(s: Scores, e: ScoreEntry): boolean {
  const best = bestOf(s, e);
  return best !== null && compare(e, best) < 0;
}

/** What a report says about its board: whether the shift beat a best already there, and the
 *  board's best now (the shift's own entry when it is the first). */
export interface ScoreNote {
  newBest: boolean;
  best: ScoreEntry;
}

export interface ScoreContext {
  mode: ScoreMode;
  week: number | null;
  shiftIndex: number | null;
  seed: number;
  difficulty: Difficulty;
  at: string;
}

export function fromSummary(summary: ShiftSummary, ctx: ScoreContext): ScoreEntry {
  return {
    mode: ctx.mode,
    week: ctx.week,
    shiftIndex: ctx.shiftIndex,
    seed: ctx.seed,
    difficulty: ctx.difficulty,
    grade: summary.grade,
    served: summary.ordersCompleted,
    walkouts: summary.walkouts,
    tipsCents: summary.tipsCents,
    at: ctx.at,
  };
}

const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const MODES: readonly unknown[] = ['day2', 'week', 'endless'];
const DIFFICULTIES: readonly unknown[] = ['easy', 'normal', 'hard'];

function isEntry(x: unknown): x is ScoreEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    MODES.includes(e.mode) &&
    (e.week === null || isCount(e.week)) &&
    (e.shiftIndex === null || isCount(e.shiftIndex)) &&
    Number.isInteger(e.seed) &&
    DIFFICULTIES.includes(e.difficulty) &&
    typeof e.grade === 'string' &&
    e.grade in GRADE_RANK &&
    isCount(e.served) &&
    isCount(e.walkouts) &&
    isCount(e.tipsCents) &&
    typeof e.at === 'string'
  );
}

/** The stored scores, or empty ones for anything missing, corrupt or of another version; entries
 *  that aren't scores are dropped. Never throws. */
export function parseScores(raw: string | null | undefined): Scores {
  if (!raw) return emptyScores();
  try {
    const d = JSON.parse(raw) as { version?: unknown; boards?: unknown };
    if (!d || d.version !== SCORES_VERSION || typeof d.boards !== 'object' || d.boards === null)
      return emptyScores();
    const boards: Record<string, ScoreEntry[]> = {};
    for (const [k, v] of Object.entries(d.boards as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      const kept = v.filter(isEntry).slice(0, SCORES_CAP);
      if (kept.length > 0) boards[k] = kept;
    }
    return { version: SCORES_VERSION, boards };
  } catch {
    return emptyScores();
  }
}
