// Day 2, in service: starting a rush, its keys and HUD, the fixed step (with the bin chicken) and
// the per-frame view.

import { STEP } from '../core/clock';
import {
  atCounter,
  atRegister,
  createRush,
  customerByKey,
  emptyRushInput,
  stepRush,
  type Rush,
  type RushAction,
  type RushWeek,
} from '../core/rush';
import { stepRushIbis } from '../core/rushIbis';
import { clipFor } from '../data/voice';
import { ibisPresent } from '../sim/ibis';
import { surfacing } from '../sim/latte/field';
import { HEIGHT_PRESETS, pitcherFlow } from '../sim/latte/pitcher';
import { DIFFICULTY } from '../sim/listening';
import { createRushHud, nextTicket, railOrder, type RushHud } from '../ui/rushHud';
import type { StationView } from '../world/station';
import type { App } from './context';
import { makeIbis, prefetchDay } from './shared';
import { onShiftSummary, reportCallbacks } from './weekWiring';

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
    // A restart picks up a difficulty changed mid-shift.
    if (app.rush) app.rush.difficulty = app.listen.difficulty;
    app.sfx.setNoise(DIFFICULTY[app.listen.difficulty].noise);
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
 *  1–6 serve or jug height. */
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
  else if (/^[1-6]$/.test(k)) {
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
  const { input, trial, station, owner, crowd, ibisView, camera, rig, audio, sfx, canvas } = app;
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

  // ---------------------------------------------------------------- Day 2 view
  const sv: StationView = {
    phase: 'idle',
    phaseTime: 0,
    attempt: 0,
    espresso: trial.espresso,
    steam: trial.steam,
    pour: trial.pour,
    pitcher: trial.pitcher,
    demoActive: false,
    demoEndedAt: -1,
    drink: null,
    water: 0,
    dispensing: false,
  };
  const ownerScene = {
    phase: 'service',
    speech: { current: null as unknown },
    owner: { frustration: 0 },
  };
  const WORKING = new Set(['grind', 'lock', 'shot', 'shotSteam', 'water', 'steam', 'pour']);
  const { look, focus, pointer } = app;

  function rushFrame(r: Rush, dt: number): void {
    const { rushHud, viewTime, voiceLevel } = app;
    for (const ev of r.events) {
      if (ev.type === 'say') {
        const u = ev.line;
        rushHud.onSay(u);
        if (u.speaker === 'gaz') owner.onSay(u, viewTime);
        audio.say({
          speaker: u.speaker,
          text: u.text,
          delivery: u.delivery ?? 'normal',
          listen: u.listen === true,
          ...(u.voice?.kind === 'segments' ? { segments: u.voice.ids } : {}),
        });
      } else if (ev.type === 'phase') {
        rushHud.onPhase(ev.phase, r);
        if (ev.phase === 'intro') {
          crowd.clear();
          app.ibis = makeIbis(app); // a restarted shift gets its bird (or not) afresh
          canvas.classList.remove('aim'); // a restart mid-pour must give the cursor back
        }
      } else if (ev.type === 'station') canvas.classList.toggle('aim', ev.phase === 'pour');
      else if (ev.type === 'sfx') sfx.play(ev.id);
      else if (ev.type === 'ticket') {
        sfx.play('tick');
        const c = customerByKey(r, ev.customer);
        if (c) rushHud.onTicket(c);
      } else if (ev.type === 'ask') rushHud.onAsk(ev.text);
      else if (ev.type === 'served')
        crowd.react(
          ev.customer,
          ev.result.satisfaction >= 75 ? 'cheer' : ev.result.satisfaction >= 45 ? 'nod' : 'huff',
        );
      else if (ev.type === 'rejected') crowd.react(ev.customer, 'shake');
      else if (ev.type === 'walkout' || ev.type === 'refused') crowd.react(ev.customer, 'huff');
      else if (ev.type === 'summary') onShiftSummary(app, r, ev);
    }
    r.events.length = 0;

    const b = r.barista;
    // Two hands (shot running + steaming) has its own view: the shot and the jug side by side.
    const shown = b.phase;
    sv.phase = r.phase === 'service' ? shown : 'idle';
    sv.phaseTime = b.phaseTime;
    sv.espresso = b.espresso;
    sv.steam = b.steam;
    sv.pour = b.pour;
    sv.pitcher = b.pitcher;
    sv.drink = b.drink;
    sv.water = b.water;
    sv.dispensing = b.dispensing;
    station.update(sv, dt, viewTime);
    const customerTalking = r.speech.current !== null && r.speech.current.speaker !== 'gaz';
    ibisView.update(app.ibis, dt, viewTime);
    app.ibisHint.classList.toggle(
      'hide',
      !(r.phase === 'service' && ibisPresent(app.ibis) && app.ibis.state !== 'leaving'),
    );
    crowd.update(
      r,
      dt,
      viewTime,
      camera.position,
      customerTalking && audio.clipPlaying ? voiceLevel : -1,
    );

    const working = r.phase === 'service' && WORKING.has(b.phase);
    const gazTalking = r.speech.current?.speaker === 'gaz';
    ownerScene.phase =
      r.phase === 'service'
        ? b.phase === 'pour'
          ? 'pour'
          : 'service'
        : r.phase === 'wrapup'
          ? 'summary'
          : r.phase;
    ownerScene.speech.current = gazTalking ? r.speech.current : null;
    ownerScene.owner = r.owner;
    // Gaz watches whoever is ordering, the cup while you work, and you when he talks; when he's
    // talking about the bin chicken, he looks at it.
    if (gazTalking && r.speech.current?.key.startsWith('ibis.') && ibisPresent(app.ibis))
      look.copy(ibisView.position).setY(0.5);
    else if (!gazTalking && crowd.registerPos(look)) {
      /* looking at the customer at the register */
    } else if (working && !gazTalking) look.copy(station.cupRim);
    else look.copy(camera.position);
    owner.update(ownerScene, dt, viewTime, look, gazTalking && audio.clipPlaying ? voiceLevel : -1);

    const camPhase =
      r.phase === 'intro'
        ? 'intro'
        : r.phase === 'service'
          ? working
            ? shown
            : 'service'
          : 'summary';
    const px = pointer.has ? (pointer.x / window.innerWidth) * 2 - 1 : 0;
    const py = pointer.has ? (pointer.y / window.innerHeight) * 2 - 1 : 0;
    rig.update(camPhase, b.phaseTime, dt, viewTime, focus, px, py, !working);
    rushHud.update(r, dt);

    sfx.update({
      grind: b.phase === 'grind' && b.espresso.grinding ? 1 : 0,
      pump: (b.phase === 'shot' || b.phase === 'shotSteam') && b.espresso.extracting ? 1 : 0,
      steam: (shown === 'steam' || shown === 'shotSteam') && b.steam.valveOpen ? 1 : 0,
      steamZone: shown === 'steam' || shown === 'shotSteam' ? b.steam.zone : 'off',
      pour:
        b.phase === 'pour' ? pitcherFlow(b.pitcher) : b.phase === 'water' && b.dispensing ? 0.7 : 0,
      pourHigh: b.phase === 'water' ? 0.8 : 1 - surfacing(b.pitcher.height),
    });
  }

  return { step, frame: rushFrame };
}
