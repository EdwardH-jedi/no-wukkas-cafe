// Latte-art practice: starting it, its keys and HUD, the fixed step and the per-frame view.

import { STEP } from '../core/clock';
import {
  createPractice,
  emptyPracticeInput,
  stepPractice,
  type Practice,
  type PracticeAction,
} from '../core/practice';
import { createEspresso } from '../sim/espresso';
import { surfacing } from '../sim/latte/field';
import { HEIGHT_PRESETS, pitcherFlow } from '../sim/latte/pitcher';
import { createSteam } from '../sim/steam';
import { createPracticeHud, type PracticeHud } from '../ui/practiceHud';
import type { StationView } from '../world/station';
import type { App } from './context';
import { prefetchDay } from './shared';

/** Latte-art practice (from the title screen): straight to a cup and a jug of silky milk. */
export function startPractice(app: App): void {
  const { audio, sfx } = app;
  audio.unlock();
  sfx.unlock();
  audio.stopVoice();
  sfx.play('click');
  prefetchDay(audio, 1); // Gaz's demo lines
  app.resumeAll();
  app.crowd.clear();
  app.rush = null;
  const practice = createPractice(app.seed);
  app.practice = practice;
  app.mode = 'practice';
  app.hud1Root.classList.add('hide');
  app.hud2Root.classList.add('hide');
  app.hud3Root.classList.remove('hide');
  app.canvas.classList.add('aim');
  app.practiceHud.onPhase(practice);
}
export function practiceAct(app: App, a: PracticeAction): void {
  app.audio.unlock();
  app.sfx.unlock();
  app.practiceAction = a;
}

export function createPracticeView(app: App): PracticeHud {
  return createPracticeHud(app.hud3Root, {
    action: (a) => practiceAct(app, a),
    title: () => app.nav.toTitle(),
    pause: (p) => app.setPaused(p),
    height: (d) => (app.touchHeight = d),
    skip: () => (app.input.skip = true),
    audioButtonsHtml: app.audioPanel.buttonsHtml,
    bindAudio: (el) => app.audioPanel.bind(el),
  });
}

/** Practice keys: Enter done / again / skip, R reset, G guide, D watch Gaz, 1–3 jug height. */
export function practiceKey(app: App, p: Practice, k: string, e: KeyboardEvent): void {
  if (k === 'enter') {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    if (p.phase === 'pour') practiceAct(app, 'done');
    else if (p.phase === 'review') practiceAct(app, 'again');
    else practiceAct(app, 'skip');
  } else if (k === 'r') practiceAct(app, p.phase === 'review' ? 'again' : 'reset');
  else if (k === 'g') practiceAct(app, 'guide');
  else if (k === 'd' && p.phase !== 'demo') practiceAct(app, 'demo');
  else if (k === '1' || k === '2' || k === '3')
    app.input.heightPreset = HEIGHT_PRESETS[Number(k) - 1] ?? null;
  else if (k === 'w' || k === 'arrowup') app.keyHeight = 1;
  else if (k === 's' || k === 'arrowdown') app.keyHeight = -1;
  else if (k === 'm') app.sfx.setMuted(!app.sfx.muted);
  else if (k === 'v') app.audio.voiceEnabled = !app.audio.voiceEnabled;
}

export interface PracticeLoop {
  /** One fixed step: the shared input into practice, then the sim. */
  step(p: Practice): void;
  /** Practice's events and view for one frame. */
  frame(p: Practice, dt: number): void;
}

export function createPracticeLoop(app: App): PracticeLoop {
  const { input, trial, station, owner, ibisView, camera, rig, audio, sfx, canvas } = app;
  const { look, focus } = app;
  const pIn = emptyPracticeInput();

  /** Copy the shared input into practice's input for one step. */
  const samplePracticeInput = (): void => {
    pIn.holding = input.holding;
    pIn.cupX = input.cupX;
    pIn.cupY = input.cupY;
    pIn.hasCup = input.hasCup;
    pIn.heightDelta = input.heightDelta;
    pIn.heightPreset = input.heightPreset;
    // As on Day 1, a click (or Space) during Gaz's demo hurries his narration along.
    pIn.skip = input.skip || (app.practice?.phase === 'demo' && input.pressed);
    pIn.voiceHold = input.voiceHold === true;
    pIn.action = app.practiceAction;
  };

  const step = (p: Practice): void => {
    samplePracticeInput();
    stepPractice(p, pIn, STEP);
  };

  // ---------------------------------------------------------------- practice view
  const pv: StationView = {
    phase: 'pour',
    phaseTime: 0,
    attempt: 0,
    espresso: createEspresso(),
    steam: createSteam(),
    pour: trial.pour,
    pitcher: trial.pitcher,
    demoActive: false,
    demoEndedAt: -1,
    guide: 0,
  };

  function practiceFrame(p: Practice, dt: number): void {
    const { practiceHud, viewTime } = app;
    for (const ev of p.events) {
      if (ev.type === 'say') {
        practiceHud.onSay(ev.line);
        owner.onSay(ev.line, viewTime);
        audio.say({ speaker: 'gaz', text: ev.line.text });
      } else if (ev.type === 'phase') {
        practiceHud.onPhase(p);
        canvas.classList.toggle('aim', ev.phase === 'pour');
      } else if (ev.type === 'sfx') sfx.play(ev.id);
      else if (ev.type === 'reset') sfx.play('clink');
    }
    p.events.length = 0;

    pv.phase = p.phase;
    pv.phaseTime = p.phaseTime;
    pv.pour = p.pour;
    pv.pitcher = p.pitcher;
    pv.demoActive = p.demoActive;
    pv.demoEndedAt = p.demoEndedAt;
    pv.guide = p.guide ? 1 : 0;
    station.update(pv, dt, viewTime);
    ibisView.update(app.ibis, dt, viewTime);
    app.ibisHint.classList.add('hide');
    if (p.phase !== 'review' && !p.speech.current) look.copy(station.cupRim);
    else look.copy(camera.position);
    owner.update(p, dt, viewTime, look, audio.clipPlaying ? app.voiceLevel : -1);
    rig.update(p.phase, p.phaseTime, dt, viewTime, focus, 0, 0, false);
    practiceHud.update(p, dt, app.held || app.spaceHeld);
    const flow =
      p.phase === 'pour' || (p.phase === 'demo' && p.demoActive) ? pitcherFlow(p.pitcher) : 0;
    sfx.update({
      grind: 0,
      pump: 0,
      steam: 0,
      steamZone: 'off',
      pour: flow,
      pourHigh: 1 - surfacing(p.pitcher.height),
    });
  }

  return { step, frame: practiceFrame };
}
