// Keyboard handling for the menu screens. The game's window key handler treats Space as "hold to
// pour" (it calls preventDefault, which cancels a focused button's click) and Enter as "next" (on
// the title, that starts the trial). Keys pressed on a control inside a menu belong to that
// control, so they are stopped here, before they bubble up to the window.

const CONTROL = 'button, input, select, textarea, a[href]';

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export interface MenuKeyOptions {
  /** Esc: close the screen (or go back). */
  escape?: () => void;
  /** A screen over everything else: every key pressed inside stays inside, and Tab cycles
   *  through its own controls instead of reaching the screen behind it. */
  modal?: boolean;
}

/** The controls Tab can reach inside `el`, in order (hidden ones left out). */
export function focusables(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length);
}

/** Install the menu key rules on `el` (replacing any earlier ones: safe to call on every draw). */
export function menuKeys(el: HTMLElement, opts: MenuKeyOptions = {}): void {
  el.onkeydown = (e) => {
    if (e.key === 'Escape' && opts.escape) {
      e.preventDefault();
      e.stopPropagation();
      opts.escape();
      return;
    }
    if (opts.modal && e.key === 'Tab') {
      const all = focusables(el);
      const first = all[0];
      const last = all[all.length - 1];
      if (first && last) {
        const at = document.activeElement;
        if (e.shiftKey && (at === first || !el.contains(at))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (at === last || !el.contains(at))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    const onControl = e.target instanceof Element && e.target.closest(CONTROL) !== null;
    if (opts.modal || (onControl && (e.key === ' ' || e.key === 'Enter'))) e.stopPropagation();
  };
}

/** Focus `el` without scrolling the page (a no-op for a missing or hidden element). */
export function focusQuietly(el: Element | null | undefined): void {
  if (el instanceof HTMLElement && el.isConnected) el.focus({ preventScroll: true });
}
