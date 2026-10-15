// Day 1, the barista trial: its actions, keys and HUD, and the per-frame view.

import { canFinish, type TrialAction } from '../core/trial';
import { surfacing } from '../sim/latte/field';
import { HEIGHT_PRESETS, pitcherFlow } from '../sim/latte/pitcher';
import { createHud, type Hud } from '../ui/hud';
import type { App } from './context';
import { prefetchDay } from './shared';
import type { TitleCallbacks } from './title';

export function act(app: App, a: TrialAction): void {
  // Inside the click: this is what lets the browser play the owner's first line.
  app.audio.unlock();
  app.sfx.unlock();
  if (a === 'start') {
    app.sfx.play('click');
    prefetchDay(app.audio, 1);
  }
  app.input.action = a;
}

/** The Day 1 HUD, which also draws the title screen (its buttons come from title.ts). */
export function createTrialHud(app: App, title: TitleCallbacks): Hud {
  return createHud(app.hud1Root, {
    action: (a) => act(app, a),
    day2: title.day2,
    shifts: title.shifts,
    practice: title.practice,
    sound: title.sound,
    audioButtonsHtml: app.audioPanel.buttonsHtml,
    bindAudio: (el) => app.audioPanel.bind(el),
    pause: (p) => app.setPaused(p),
    restart: () => {
      app.setPaused(false);
      act(app, 'restart');
    },
    height: (d) => (app.touchHeight = d),
    skip: () => (app.input.skip = true),
  });
}

/** Day 1 keys (and the title screen's): Enter moves on, 1–3 jug height, W/S nudge it, M mute,
 *  V voices, R replay. */
export function trialKey(app: App, k: string, e: KeyboardEvent): void {
  const { trial, input } = app;
  if (k === 'enter') {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return; // let the focused button handle it
    e.preventDefault();
    const ph = trial.phase;
    if (ph === 'title') act(app, 'start');
    else if (ph === 'grind' || ph === 'pour') act(app, 'next');
    else if (ph === 'feedback')
      act(app, canFinish(trial) && trial.attempt >= 2 ? 'finish' : 'next');
    else if (ph === 'verdict') act(app, 'restart');
    else input.skip = true;
  } else if (k === '1' || k === '2' || k === '3') {
    input.heightPreset = HEIGHT_PRESETS[Number(k) - 1] ?? null;
  } else if (k === 'w' || k === 'arrowup') app.keyHeight = 1;
  else if (k === 's' || k === 'arrowdown') app.keyHeight = -1;
  else if (k === 'm') app.sfx.setMuted(!app.sfx.muted);
  else if (k === 'v') app.audio.voiceEnabled = !app.audio.voiceEnabled;
  else if (k === 'r') app.replay();
}

/** The trial's events and view for one frame (title screen included). */
export function trialFrame(app: App, dt: number): void {
  const { trial, hud, owner, station, ibisView, camera, rig, audio, sfx, look, focus } = app;
  const { viewTime, pointer } = app;
  for (const ev of trial.events) {
    if (ev.type === 'say') {
      hud.onSay(ev.line);
      owner.onSay(ev.line, viewTime);
      audio.say({ speaker: 'gaz', text: ev.line.text });
    } else if (ev.type === 'phase') {
      hud.onPhase(ev.phase, trial);
      app.canvas.classList.toggle('aim', ev.phase === 'pour');
      if (ev.phase === 'title') audio.stopVoice();
    } else if (ev.type === 'sfx') sfx.play(ev.id);
  }
  trial.events.length = 0;

  station.update(trial, dt, viewTime);
  ibisView.update(app.ibis, dt, viewTime);
  app.ibisHint.classList.add('hide');
  // Gaz looks at you when talking or judging, at the cup while you work.
  const working =
    trial.phase === 'grind' ||
    trial.phase === 'shot' ||
    trial.phase === 'steam' ||
    trial.phase === 'pour';
  if (working && !trial.speech.current) look.copy(station.cupRim);
  else if (trial.phase === 'inspect' && trial.phaseTime < 2.3) look.copy(station.cupRim);
  else look.copy(camera.position);
  owner.update(trial, dt, viewTime, look, audio.clipPlaying ? app.voiceLevel : -1);
  const pointerLook = !working && trial.phase !== 'demo';
  const px = pointer.has ? (pointer.x / window.innerWidth) * 2 - 1 : 0;
  const py = pointer.has ? (pointer.y / window.innerHeight) * 2 - 1 : 0;
  rig.update(trial.phase, trial.phaseTime, dt, viewTime, focus, px, py, pointerLook);
  hud.update(trial, dt, app.held || app.spaceHeld);

  const pouringNow = trial.phase === 'pour' || (trial.phase === 'demo' && trial.demoActive);
  const flow = pouringNow ? pitcherFlow(trial.pitcher) : 0;
  sfx.update({
    grind: trial.phase === 'grind' && trial.espresso.grinding ? 1 : 0,
    pump: trial.phase === 'shot' && trial.espresso.extracting ? 1 : 0,
    steam: trial.phase === 'steam' && trial.steam.valveOpen ? 1 : 0,
    steamZone: trial.phase === 'steam' ? trial.steam.zone : 'off',
    pour: flow,
    pourHigh: 1 - surfacing(trial.pitcher.height),
  });
}
