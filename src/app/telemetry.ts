// Playtest telemetry, wired (ROADMAP 0.8). A record opens when a shift or the Day 1 trial starts and
// closes on its report or verdict, a restart, or the way back to the title. When the page is hidden
// or closed, the open record is written as 'closed' and stays open: if the player comes back and
// carries on, its real ending replaces it (same id). Records are built from the live state only at
// those moments, never per frame. Wall-clock ISO times are read here; sim/ and core/ only see game
// seconds. Saved on this device only: nothing is sent anywhere.

import type { Rush } from '../core/rush';
import { browserStorage } from '../core/save/storage';
import { createTelemetryStore, type TelemetryStore } from '../core/save/telemetry';
import type { Trial } from '../core/trial';
import {
  shiftTelemetry,
  trialTelemetry,
  type Ending,
  type RecordMeta,
  type TelemetryRecord,
} from '../sim/telemetry';

export interface Telemetry {
  readonly store: TelemetryStore;
  /** A shift has started (call once the new rush is in place); anything still open ends first. */
  startShift(): void;
  /** The Day 1 trial has begun (its intro); anything still open ends first. */
  startTrial(): void;
  /** Close the open record, if any, as it stands now. */
  end(ending: Ending): void;
  /** The page is being hidden or closed: write the open record as 'closed', keep it open. */
  checkpoint(): void;
}

interface OpenRecord {
  kind: 'shift' | 'trial';
  id: string;
  startedAt: string;
  /** The trial's game time when it began (its time keeps running across restarts). */
  trialStart: number;
}

export interface TelemetrySources {
  rush(): Rush | null;
  trial(): Trial;
}

export function createTelemetry(
  src: TelemetrySources,
  store: TelemetryStore = createTelemetryStore(browserStorage()),
): Telemetry {
  const session = new Date().toISOString();
  let seq = 0;
  let open: OpenRecord | null = null;

  const build = (o: OpenRecord, ending: Ending): TelemetryRecord | null => {
    const meta: RecordMeta = {
      id: o.id,
      session,
      startedAt: o.startedAt,
      endedAt: new Date().toISOString(),
      ending,
    };
    if (o.kind === 'trial') return trialTelemetry(src.trial(), o.trialStart, meta);
    const r = src.rush();
    return r ? shiftTelemetry(r, meta) : null;
  };
  const begin = (kind: OpenRecord['kind'], trialStart = 0): void => {
    if (open) t.end(open.kind === 'trial' ? 'restarted' : 'title');
    seq++;
    open = { kind, id: `${session}#${seq}`, startedAt: new Date().toISOString(), trialStart };
  };

  const t: Telemetry = {
    store,
    startShift: () => begin('shift'),
    startTrial: () => {
      const tr = src.trial();
      begin('trial', tr.time - tr.phaseTime);
    },
    end(ending) {
      if (!open) return;
      const rec = build(open, ending);
      open = null;
      if (rec) store.put(rec);
    },
    checkpoint() {
      if (!open) return;
      const rec = build(open, 'closed');
      if (rec) store.put(rec);
    },
  };
  return t;
}

/** Write the open record when the page goes away. iOS Safari doesn't always fire pagehide when a
 *  tab is closed from the switcher, so being hidden counts too. */
export function watchPageHide(t: Telemetry): void {
  window.addEventListener('pagehide', () => t.checkpoint());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') t.checkpoint();
  });
}

/** "no-wukkas-log-2026-10-17.json", in the player's local date. */
export function logFileName(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `no-wukkas-log-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Hand the log to the browser as a JSON download (Blob + object URL + a temporary link). No
 *  network: the file is made here and saved by the browser. */
export function downloadLog(store: TelemetryStore, now = new Date()): void {
  const json = JSON.stringify({ ...store.read(), exportedAt: now.toISOString() }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = logFileName(now);
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Revoked on the next task: some browsers start the download only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
