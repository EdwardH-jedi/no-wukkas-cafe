// Pause, resume and "say that again" for the whole app: the game clock, the three HUDs and the
// audio move together. boot.ts wires these into App; the review harness (tests/review/harness.ts)
// calls the same functions, so what it tests is this code, not a copy. They read `app` only when
// called, so the HUDs (filled in after the app exists, see LateFields) are always there.

import { cancelPress } from '../core/barista';
import { spokenDuration } from '../data/voice';
import type { App } from './context';

export function setPaused(app: App, p: boolean): void {
  if (app.mode === 'trial' && app.trial.phase === 'title' && p) return;
  app.clock.paused = p;
  app.hud.setPaused(p);
  app.rushHud.setPaused(p);
  app.practiceHud.setPaused(p);
  app.audio.setPaused(p);
  if (p) {
    app.held = false;
    app.spaceHeld = false;
    // A button let go while paused must not read as a click on resume (it would stop the shot).
    if (app.rush) cancelPress(app.rush.barista);
  }
}

/** Unpause everything together: game clock, menus and audio (A1: switching days from the pause
 *  menu used to leave the AudioContext suspended). */
export function resumeAll(app: App): void {
  app.clock.paused = false;
  app.hud.setPaused(false);
  app.rushHud.setPaused(false);
  app.practiceHud.setPaused(false);
  app.audio.setPaused(false);
}

/** Say the last line again, with its subtitle once the voice starts (as rushView does). */
export function replayLast(app: App): void {
  const l = app.audio.lastLine;
  if (!l) return;
  const secs = spokenDuration(l.speaker, l.text, l.delivery);
  const mode = app.mode;
  app.audio.replay({
    onStart: () => {
      if (mode === 'rush') app.rushHud.onReplay(l.speaker, l.text, secs);
      else if (mode === 'practice') app.practiceHud.onReplay(l.text, secs);
      else app.hud.onReplay(l.text, secs);
    },
    onStop: () => {
      if (mode === 'rush') app.rushHud.onStop();
      else if (mode === 'practice') app.practiceHud.onStop();
      else app.hud.onStop();
    },
  });
}
