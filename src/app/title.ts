// The title screen: its buttons (Day 2, the week, practice, sound) and the way back to it.

import { createTrial } from '../core/trial';
import type { HudCallbacks } from '../ui/hud';
import type { App } from './context';
import { makeIbis } from './shared';

/** The title screen's buttons, for the Day 1 HUD that draws them. */
export type TitleCallbacks = Pick<HudCallbacks, 'day2' | 'shifts' | 'practice' | 'sound'>;

export function titleCallbacks(app: App): TitleCallbacks {
  return {
    day2: () => app.nav.startDay2(),
    shifts: () => app.nav.openShifts(),
    practice: () => app.nav.startPractice(),
    sound: () => {
      app.audio.unlock();
      app.audioPanel.open();
    },
  };
}

/** Back to the title screen (fresh Day 1 trial). */
export function toTitle(app: App): void {
  app.audio.stopVoice();
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
}
