// The playtest log on disk (ROADMAP 0.8): its own localStorage key, never inside the save, so the
// save format (and its migrations) is untouched. Every read goes through parseLog (empty, corrupt
// or another version's data becomes an empty log); storage that is missing or throws falls back to
// memory for the rest of the session, as the save does. Nothing here talks to the network.

import {
  emptyLog,
  parseLog,
  putRecord,
  type TelemetryLog,
  type TelemetryRecord,
} from '../../sim/telemetry';
import type { KeyValueStorage } from './storage';

export const TELEMETRY_KEY = 'nwc.telemetry.v1';

export interface TelemetryStore {
  read(): TelemetryLog;
  /** Add a record, or replace the one with its id (see putRecord). */
  put(rec: TelemetryRecord): void;
  /** Forget every record ("Clear log"). */
  clear(): void;
  /** Storage is missing or failed: the log lasts only until the page closes. */
  readonly memoryOnly: boolean;
}

export function createTelemetryStore(storage: KeyValueStorage | null): TelemetryStore {
  let mem = emptyLog();
  let broken = storage === null;
  const read = (): TelemetryLog => {
    if (!broken && storage) {
      try {
        // Kept: if storage fails later, the records read so far stay (acceptance audit F2).
        mem = parseLog(storage.getItem(TELEMETRY_KEY));
        return mem;
      } catch {
        broken = true;
      }
    }
    return mem;
  };
  const write = (log: TelemetryLog): void => {
    mem = log;
    if (broken || !storage) return;
    try {
      storage.setItem(TELEMETRY_KEY, JSON.stringify(log));
    } catch {
      broken = true;
    }
  };
  return {
    read,
    put: (rec) => write(putRecord(read(), rec)),
    clear: () => write(emptyLog()),
    get memoryOnly() {
      return broken;
    },
  };
}
