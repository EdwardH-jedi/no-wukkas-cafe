// The week: its shifts, Endless Rush, the shop on shift select, and the autosave after a shift.

import type { Rush, RushEvent } from '../core/rush';
import { canPlay, endlessFor, finishShift, weekFor } from '../core/week/session';
import { buyUpgrade } from '../sim/shop';
import { renderShiftSelect } from '../ui/screens/shiftSelect';
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
  app.nav.startRush(endlessFor(save), save.seed);
}

/** The week's shifts and Endless Rush, over the title screen. */
export function openShifts(app: App): void {
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
      back: () => close(),
      buy: (id) => {
        const bought = buyUpgrade(store.load(), id);
        if (!bought.ok) return;
        store.save(bought.save);
        close();
        openShifts(app); // redrawn with the new till
      },
    },
    store.memoryOnly ? SAVE_NOTE : '',
  );
  uiRoot
    .querySelector<HTMLButtonElement>('.shift-select button:not(:disabled)')
    ?.focus({ preventScroll: true });
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
