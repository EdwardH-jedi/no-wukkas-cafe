// Day 2, in service: starting a rush, its keys and HUD, and the fixed step (with the bin chicken).
// The per-frame view is in rushView.ts.

import { STEP } from '../core/clock';
import {
  atCounter,
  atRegister,
  createRush,
  emptyRushInput,
  stepRush,
  type Rush,
  type RushAction,
  type RushWeek,
} from '../core/rush';
import { stepRushIbis } from '../core/rushIbis';
import { clipFor } from '../data/voice';
import { ibisPresent } from '../sim/ibis';
import { HEIGHT_PRESETS } from '../sim/latte/pitcher';
import { DIFFICULTY } from '../sim/listening';
import { eventChoiceForKey, eventOwnsKey } from '../ui/eventCard';
import { createRushHud, nextTicket, railOrder, type RushHud } from '../ui/rushHud';
import type { App } from './context';
import { createRushFrame } from './rushView';
import { makeIbis, prefetchDay } from './shared';
import { reportCallbacks } from './weekWiring';
import { weekBest } from './scores';

export function rushAct(app: App, a: RushAction): void {
  app.sfx.unlock();
  app.rushAction = a;
}

/** Start a rush: Day 2 (no week), a week shift or Endless. Called inside a click (iOS audio). */
export function startRush(app: App, week: RushWeek | null, rushSeed: number): void {
  const { audio, sfx } = app;
  audio.unlock();
  sfx.unlock();
  audio.stopVoice();
  sfx.play('click');
  prefetchDay(audio, 2);
  app.resumeAll();
  app.crowd.clear();
  const rush = createRush(rushSeed, app.listen.difficulty, {}, week);
  app.rush = rush;
  app.telemetry.startShift();
  app.ibis = makeIbis(app);
  sfx.setNoise(DIFFICULTY[app.listen.difficulty].noise);
  app.mode = 'rush';
  app.practice = null;
  app.hud1Root.classList.add('hide');
  app.hud3Root.classList.add('hide');
  app.hud2Root.classList.remove('hide');
  app.canvas.classList.remove('aim');
  app.rushHud.onPhase('intro', rush);
}
/** Start the morning rush (from the title or the trial verdict). */
export const startDay2 = (app: App): void => startRush(app, null, app.seed);

export function createRushView(app: App): RushHud {
  const { audio, input } = app;
  const restart = (): void => {
    app.setPaused(false);
    app.crowd.clear();
    // A restart picks up a difficulty changed mid-shift, and that difficulty's best for Gaz.
    if (app.rush) app.rush.difficulty = app.listen.difficulty;
    if (app.rush?.week)
      app.rush.week.best = weekBest(app.scores, app.rush.week, app.listen.difficulty);
    app.sfx.setNoise(DIFFICULTY[app.listen.difficulty].noise);
    // Logged before the restart wipes the shift (a finished one is already closed).
    app.telemetry.end('restarted');
    app.telemetry.startShift();
    rushAct(app, { type: 'restart' });
  };
  return createRushHud(app.hud2Root, {
    action: (a) => rushAct(app, a),
    pause: (p) => app.setPaused(p),
    restart,
    title: () => app.nav.toTitle(),
    report: reportCallbacks(app, restart),
    height: (d) => (app.touchHeight = d),
    skip: () => (input.skip = true),
    audioButtonsHtml: app.audioPanel.buttonsHtml,
    bindAudio: (el) => app.audioPanel.bind(el),
    settings: () => app.listen,
    // Heard if voices are on and there's a recording, or a browser voice to stand in.
    audible: (u) =>
      audio.voiceEnabled &&
      (clipFor(u.speaker, u.text, u.delivery) !== null || typeof speechSynthesis !== 'undefined'),
  });
}

/** Day 2 keys: T take order, R replay, Enter ring up / lock in / hand over, F/L make, B bin,
 *  1–3 answer the event card while it's up, else 1–6 serve or jug height. */
export function rushKey(app: App, r: Rush, k: string, e: KeyboardEvent): void {
  const { input } = app;
  const b = r.barista;
  if (k === 'enter') {
    const t = e.target as HTMLElement;
    // Enter rings up even with a register option focused (it would just re-press it).
    if (t.tagName === 'BUTTON' && !(t.closest('#pos') && atCounter(r))) return;
    e.preventDefault();
    // While steaming during the shot, Enter stops the shot (a click would just grab the jug).
    const stopShot = b.phase === 'shotSteam' && b.espresso.extracting;
    if (b.phase === 'grind' || b.phase === 'pour' || stopShot) rushAct(app, { type: 'next' });
    else if (atCounter(r)) app.rushHud.ringUp();
    else if (atRegister(r)) rushAct(app, { type: 'takeOrder' });
    else input.skip = true;
  } else if (k === 't') rushAct(app, { type: 'takeOrder' });
  else if (k === 'f' || k === 'l') {
    // Make the oldest ticket (F) or the oldest long black (L), with the milk it says.
    const c = nextTicket(r, k === 'l' ? 'longBlack' : undefined);
    if (c?.heard) rushAct(app, { type: 'make', drink: c.heard.type, milk: c.heard.milk ?? 'full' });
  } else if (k === 'b') rushAct(app, { type: 'bin' });
  else if (k === 'i' && ibisPresent(app.ibis)) app.ibisShoo = true;
  else if (eventOwnsKey(r, k)) {
    // While an event card is up, 1–3 answer it (before serving a ticket or setting the jug).
    const choice = eventChoiceForKey(r, k);
    if (choice) rushAct(app, { type: 'eventChoice', choice });
  } else if (/^[1-6]$/.test(k)) {
    if (b.phase === 'pour') input.heightPreset = HEIGHT_PRESETS[Number(k) - 1] ?? null;
    else if (b.ready) {
      const c = railOrder(r)[Number(k) - 1];
      if (c) rushAct(app, { type: 'serve', customer: c.key });
    }
  } else if (k === 'w' || k === 'arrowup') app.keyHeight = 1;
  else if (k === 's' || k === 'arrowdown') app.keyHeight = -1;
  else if (k === 'm') app.sfx.setMuted(!app.sfx.muted);
  else if (k === 'v') app.audio.voiceEnabled = !app.audio.voiceEnabled;
  else if (k === 'r') {
    // At the register, Replay is part of listening (counted, costs patience): the sim does it.
    if (atCounter(r)) rushAct(app, { type: 'replay' });
    else app.replay();
  }
}

export interface RushLoop {
  /** One fixed step: the shared input into the rush, the sim, then the bin chicken. */
  step(r: Rush): void;
  /** The rush's events and view for one frame. */
  frame(r: Rush, dt: number): void;
}

export function createRushLoop(app: App): RushLoop {
  const { input, sfx } = app;
  const rushIn = emptyRushInput();

  /** Copy the shared input into the rush's input for one step. */
  const sampleRushInput = (): void => {
    rushIn.holding = input.holding;
    rushIn.pressed = input.pressed;
    rushIn.cupX = input.cupX;
    rushIn.cupY = input.cupY;
    rushIn.hasCup = input.hasCup;
    rushIn.jugDepth = input.jugDepth;
    rushIn.heightDelta = input.heightDelta;
    rushIn.heightPreset = input.heightPreset;
    rushIn.skip = input.skip;
    rushIn.voiceHold = input.voiceHold === true;
    rushIn.action = app.rushAction;
  };

  const step = (r: Rush): void => {
    sampleRushInput();
    stepRush(r, rushIn, STEP);
    const shooing = { shoo: app.ibisShoo, noticed: app.ibisNoticed };
    for (const e of stepRushIbis(r, app.ibis, shooing, STEP))
      if (e.type === 'enter' || e.type === 'honk' || e.type === 'alert') sfx.play('honk');
      else if (e.type === 'atBin') sfx.play('binRattle');
      else if (e.type === 'shooed') sfx.play('clap');
    app.ibisShoo = false;
  };

  return { step, frame: createRushFrame(app) };
}
