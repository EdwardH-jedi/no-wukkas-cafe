// The title screen: its buttons (Day 2, the week, Endless Rush, practice, settings) and the way
// back to it.

import { DEFAULT_NOISE } from '../audio/sfx';
import { createTrial } from '../core/trial';
import { focusQuietly } from '../ui/screens/keys';
import { endlessReason } from '../ui/screens/labels';
import { renderTitle, type TitleCallbacks } from '../ui/screens/title';
import type { App } from './context';
import { makeIbis } from './shared';
import { act } from './trialWiring';

/** The title screen's buttons (Start is the trial's own), for the Day 1 HUD that draws them. */
export function titleCallbacks(app: App): Omit<TitleCallbacks, 'start'> {
  return {
    day2: () => app.nav.startDay2(),
    shifts: () => app.nav.openShifts(),
    endless: () => app.nav.startEndless(),
    endlessLock: () => endlessReason(app.store.load()),
    practice: () => app.nav.startPractice(),
    settings: () => {
      app.audio.unlock();
      app.audioPanel.open();
    },
  };
}

/** Back to the title screen (fresh Day 1 trial). */
export function toTitle(app: App): void {
  // Replay (R, "Replay last line") on the title must not say the quit game's last line.
  app.audio.stopVoice({ forget: true });
  // Nor keep a shift's crowd (a Hard shift's packed café) through the title and the next Day 1.
  app.sfx.setNoise(DEFAULT_NOISE);
  app.resumeAll();
  app.crowd.clear();
  app.rush = null;
  app.practice = null;
  app.mode = 'trial';
  Object.assign(app.trial, createTrial(app.seed));
  app.ibis = makeIbis(app);
  app.hud2Root.classList.add('hide');
  app.hud3Root.classList.add('hide');
  app.hud1Root.classList.remove('hide');
  app.canvas.classList.remove('aim');
  app.hud.onPhase('title', app.trial);
  // Redrawn: a shift may have changed the save since (Endless Rush opens after Monday). The button
  // that brought the player here is hidden now, so keyboard focus starts on the menu again.
  const title = app.hud1Root.querySelector<HTMLElement>('#title');
  if (title) {
    renderTitle(title, app.hud.touch, { ...titleCallbacks(app), start: () => act(app, 'start') });
    focusQuietly(title.querySelector('button:not(:disabled)'));
  }
}
