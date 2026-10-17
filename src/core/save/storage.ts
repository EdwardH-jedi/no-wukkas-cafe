// The save on disk: Save behind a small interface. Every read goes through migrate(), which never
// throws (empty, corrupt or old data becomes a valid save). Browser storage can be missing, blocked
// or full (private mode, quota), so each access is wrapped and the store falls back to memory for
// the rest of the session.

import { migrate, type SaveDefaults, type Save } from '../../sim/contracts/save';
import type { ShiftSummary } from '../../sim/rush';
import { nextShift } from '../week/progress';

export const SAVE_KEY = 'nwc.save.v2';

/** The part of Web Storage the save needs (localStorage, or a fake in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveStore {
  load(): Save;
  save(s: Save): void;
  /** Storage is missing or failed: saves last only until the page closes. */
  readonly memoryOnly: boolean;
}

export function createSaveStore(
  storage: KeyValueStorage | null,
  defaults: SaveDefaults = {},
): SaveStore {
  let mem: Save | null = null;
  let broken = storage === null;
  return {
    load() {
      if (!broken && storage) {
        try {
          const raw = storage.getItem(SAVE_KEY);
          if (raw !== null) return migrate(raw, defaults);
        } catch {
          broken = true;
        }
      }
      return migrate(mem ?? undefined, defaults);
    },
    save(s) {
      mem = migrate(s, defaults);
      if (broken || !storage) return;
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(s));
      } catch {
        broken = true;
      }
    },
    get memoryOnly() {
      return broken;
    },
  };
}

/** The browser's localStorage, or null where it's missing or blocked (touching it can throw). */
export function browserStorage(): KeyValueStorage | null {
  try {
    return (globalThis as { localStorage?: KeyValueStorage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** Autosave after a shift report: the receipt is appended and the week moves on (or not). */
export function recordShift(store: SaveStore, report: ShiftSummary): Save {
  const next = nextShift(store.load(), report);
  store.save(next);
  return next;
}
