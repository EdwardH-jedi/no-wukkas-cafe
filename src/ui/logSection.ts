// Settings → Playtest log: export the local telemetry (ROADMAP 0.8) as a JSON file, or clear it.
// The panel that hosts it (audioPanel.ts) only inserts the markup and calls sync() when it opens.

export interface LogCallbacks {
  /** Records kept now, by kind. */
  counts(): { shifts: number; trials: number };
  /** Download the log as a JSON file. */
  export(): void;
  clear(): void;
}

export interface LogSection {
  /** Refresh the count and disarm Clear (when the panel opens). */
  sync(): void;
}

export const LOG_SECTION_HTML = `<h4>Playtest log</h4>
    <p class="fine logNote">Saved on this device only; nothing is sent anywhere.</p>
    <p class="fine logCount" data-log-count aria-live="polite"></p>
    <div class="titleBtns">
      <button class="btn small ghost" data-log="export">Export log</button>
      <button class="btn small ghost" data-log="clear">Clear log</button>
    </div>`;

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** "3 shifts and 1 trial logged." / "Nothing logged yet." */
export function logCountText(c: { shifts: number; trials: number }): string {
  if (c.shifts === 0 && c.trials === 0) return 'Nothing logged yet.';
  const parts: string[] = [];
  if (c.shifts > 0) parts.push(plural(c.shifts, 'shift'));
  if (c.trials > 0) parts.push(plural(c.trials, 'trial'));
  return `${parts.join(' and ')} logged.`;
}

export function bindLogSection(panel: HTMLElement, cb: LogCallbacks): LogSection {
  const count = panel.querySelector('[data-log-count]') as HTMLElement;
  const exportBtn = panel.querySelector('[data-log="export"]') as HTMLButtonElement;
  const clearBtn = panel.querySelector('[data-log="clear"]') as HTMLButtonElement;
  /** Clear asks twice: the first press only arms it. */
  let armed = false;
  const disarm = (): void => {
    armed = false;
    clearBtn.textContent = 'Clear log';
  };
  const s: LogSection = {
    sync() {
      count.textContent = logCountText(cb.counts());
      disarm();
    },
  };
  exportBtn.onclick = () => {
    disarm();
    cb.export();
  };
  clearBtn.onclick = () => {
    if (!armed) {
      armed = true;
      clearBtn.textContent = 'Press again to clear';
      return;
    }
    cb.clear();
    disarm();
    count.textContent = 'Log cleared.';
  };
  return s;
}
