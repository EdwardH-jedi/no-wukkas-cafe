// The week: its shifts, Endless Rush, the café upgrade shop (from shift select), and the autosave
// after a shift.

import type { Rush, RushEvent } from '../core/rush';
import { endlessUnlocked } from '../core/week/progress';
import { canPlay, endlessFor, finishShift, weekFor } from '../core/week/session';
import { buyUpgrade } from '../sim/shop';
import { focusQuietly } from '../ui/screens/keys';
import { buyMessage } from '../ui/screens/labels';
import type { ShiftReportCallbacks } from '../ui/screens/shiftReport';
import { renderShiftSelect } from '../ui/screens/shiftSelect';
import { renderShop } from '../ui/screens/shop';
import type { App } from './context';

const SAVE_NOTE = "Progress won't be saved in this browser.";

/** The shift the week is on. The save keeps the difficulty it was last played at. */
export function startShift(app: App): void {
  const { store, listen } = app;
  let save = store.load();
  if (save.difficulty !== listen.difficulty) {
    save = { ...save, difficulty: listen.difficulty };
    store.save(save);
  }
  app.nav.startRush(weekFor(save, app.cooldowns), save.seed);
}

export function startEndless(app: App): void {
  const save = app.store.load();
  if (!endlessUnlocked(save)) return;
  app.nav.startRush(endlessFor(save), save.seed);
}

const note = (app: App): string => (app.store.memoryOnly ? SAVE_NOTE : '');

/** The week's shifts, Endless Rush and the shop's door, over the title screen. `focus: 'shop'`
 *  puts keyboard focus back on the shop button (on the way back from the shop). */
export function openShifts(app: App, focus: 'next' | 'shop' = 'next'): void {
  const { audio, sfx, store, uiRoot } = app;
  audio.unlock();
  sfx.unlock();
  sfx.play('click');
  if (uiRoot.querySelector('.shift-select')) return;
  const close = renderShiftSelect(
    uiRoot,
    store.load(),
    {
      play: (i) => {
        if (!canPlay(store.load(), i)) return;
        close();
        startShift(app);
      },
      endless: () => {
        close();
        startEndless(app);
      },
      shop: () => {
        close();
        openShop(app);
      },
      back: () => {
        close();
        // Shift select only opens from the title: back to the button that opened it.
        focusQuietly(app.hud1Root.querySelector('#title button[data-act="shifts"]'));
      },
    },
    note(app),
  );
  if (focus === 'shop') focusQuietly(uiRoot.querySelector('.shift-select .shift-select-shop'));
}

/** The café upgrade shop: buys come out of the save's till; a refused one says why. */
export function openShop(app: App): void {
  const { sfx, store, uiRoot } = app;
  if (uiRoot.querySelector('.shop')) return;
  const close = renderShop(
    uiRoot,
    store.load(),
    {
      buy: (id) => {
        const before = store.load();
        const result = buyUpgrade(before, id);
        if (result.ok) store.save(result.save);
        sfx.play('click');
        return { save: result.ok ? result.save : before, message: buyMessage(result, id, before) };
      },
      back: () => {
        close();
        openShifts(app, 'shop');
      },
    },
    note(app),
  );
}

/** A rush shift ended (its summary event). Endless isn't a week shift, so it isn't saved. */
export function onShiftSummary(
  app: App,
  r: Rush,
  ev: Extract<RushEvent, { type: 'summary' }>,
): void {
  if (!r.week || r.week.endless) return;
  // Autosave: the receipt and tips, the next shift on a pass. Endless isn't a week shift.
  finishShift(app.store, ev.summary, r.shiftEvents.affinity);
  app.cooldowns = { ...r.shiftEvents.log.lastShift };
}

/** The shift report's buttons: `again` replays Day 2 or Endless, `next` moves the week on. */
export function reportCallbacks(app: App, again: () => void): ShiftReportCallbacks {
  return {
    again,
    next: () => startShift(app),
    title: () => app.nav.toTitle(),
    memoryOnly: () => app.store.memoryOnly,
  };
}
