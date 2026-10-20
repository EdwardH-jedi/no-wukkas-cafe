// One display frame of the game: the voice hold, the fixed sim steps (input sampled before each),
// then the per-frame view of whichever day is running. boot.ts calls it from requestAnimationFrame
// and renders afterwards; the review harness (tests/review/harness.ts) calls the same function with
// timestamps it controls, so what it tests is this loop, not a copy. Rendering, RAF timestamps and
// Web Audio's own clock stay outside.

import { moodFor } from '../audio/musicPatterns';
import { consumeFrame, STEP, tickStep } from '../core/clock';
import { stepTrial } from '../core/trial';
import type { App } from './context';
import { clearEdges } from './input';
import { soundHeld } from './pause';
import { createPracticeLoop } from './practiceWiring';
import { createRushLoop } from './rushWiring';
import { trialFrame } from './trialWiring';

export interface FrameDriver {
  /** One frame, `elapsed` real seconds after the last: clamped to 0.1 s (a stall isn't
   *  fast-forwarded) and scaled by `app.timeScale`. */
  frame(elapsed: number): void;
}

/** `sampleInput` copies the player's input into `app.input` before every fixed step. */
export function createFrameDriver(app: App, sampleInput: () => void): FrameDriver {
  const { clock, audio, music, input, trial } = app;
  const rushLoop = createRushLoop(app);
  const practiceLoop = createPracticeLoop(app);
  let heldShown = false;

  return {
    frame(elapsed) {
      const real = Math.min(0.1, Math.max(0, elapsed)) * app.timeScale;
      // Q7: while the browser has sound stopped the game holds (no steps, a still view) and its
      // "Sound stopped" card shows. Input given meanwhile is dropped: the click or key that brings
      // sound back is not also a move.
      const held = soundHeld(app);
      if (held !== heldShown) {
        heldShown = held;
        app.soundHint.classList.toggle('hide', !held);
      }
      if (held) clearEdges(app);
      // While the current line's clip is still downloading/decoding, hold that line's clock (A3).
      // One deadline, on the audio clock: the manager gives a clip LOAD_TIMEOUT of AudioContext
      // time (frozen while paused) and then hands the line to the browser voice, so `loading`
      // ends exactly when the line is audible or handed on, and a stuck download still can't
      // freeze the game. No second cap on the (scaled) game clock: one ran out first and let a
      // newer line drop the order.
      input.voiceHold = audio.loading && !clock.paused;
      const steps = held ? 0 : consumeFrame(clock, real);
      for (let i = 0; i < steps; i++) {
        sampleInput();
        if (app.mode === 'rush' && app.rush) rushLoop.step(app.rush);
        else if (app.mode === 'practice' && app.practice) practiceLoop.step(app.practice);
        else stepTrial(trial, input, STEP);
        clearEdges(app);
        tickStep(clock);
      }
      const dt = clock.paused || held ? 0 : real;
      app.viewTime += dt;
      app.voiceLevel = audio.voiceLevel();
      audio.update();
      music.setMood(
        app.mode === 'practice'
          ? moodFor('trial', 'pour')
          : moodFor(app.mode, app.mode === 'rush' && app.rush ? app.rush.phase : trial.phase),
      );
      music.update();
      if (app.mode === 'rush' && app.rush) rushLoop.frame(app.rush, dt);
      else if (app.mode === 'practice' && app.practice) practiceLoop.frame(app.practice, dt);
      else trialFrame(app, dt);
    },
  };
}
