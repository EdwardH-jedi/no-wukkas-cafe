// The leaderboard on disk: its own localStorage key, never inside the save, so the save format
// (and its migrations) is untouched. Every read goes through parseScores (empty, corrupt or another
// version's data becomes empty scores); storage that is missing or throws falls back to memory for
// the rest of the session, as the save does. Nothing here talks to the network.

import { emptyScores, insert, parseScores, type ScoreEntry, type Scores } from '../../sim/scores';
import type { KeyValueStorage } from './storage';

export const SCORES_KEY = 'nwc.scores.v1';

export interface ScoresStore {
  read(): Scores;
  /** Add a finished shift to its board; its place there (0 = best) or null if it didn't make the top ten. */
  put(entry: ScoreEntry): number | null;
  /** Forget every score ("Clear scores"). */
  clear(): void;
  /** Storage is missing or failed: scores last only until the page closes. */
  readonly memoryOnly: boolean;
}

export function createScoresStore(storage: KeyValueStorage | null): ScoresStore {
  let mem = emptyScores();
  let broken = storage === null;
  const read = (): Scores => {
    if (!broken && storage) {
      try {
        return parseScores(storage.getItem(SCORES_KEY));
      } catch {
        broken = true;
      }
    }
    return mem;
  };
  const write = (scores: Scores): void => {
    mem = scores;
    if (broken || !storage) return;
    try {
      storage.setItem(SCORES_KEY, JSON.stringify(scores));
    } catch {
      broken = true;
    }
  };
  return {
    read,
    put: (entry) => {
      const result = insert(read(), entry);
      write(result.scores);
      return result.rank;
    },
    clear: () => write(emptyScores()),
    get memoryOnly() {
      return broken;
    },
  };
}
