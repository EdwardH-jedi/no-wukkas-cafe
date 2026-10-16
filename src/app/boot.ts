// Boot: builds the café, wires input → the active day (Day 1 trial or Day 2 rush) → view, and owns
// the frame loop. The days themselves are wired in the sibling modules, through one shared App.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAudioManager } from '../audio/manager';
import { createMusic } from '../audio/music';
import { moodFor } from '../audio/musicPatterns';
import { createSfx } from '../audio/sfx';
import { cancelPress } from '../core/barista';
import { consumeFrame, createClock, STEP, tickStep } from '../core/clock';
import { parseSeed } from '../core/rng';
import { atCounter } from '../core/rush';
import { browserStorage, createSaveStore } from '../core/save/storage';
import { createTrial, emptyInput, stepTrial } from '../core/trial';
import { GREETING } from '../data/ownerLines';
import { spokenDuration } from '../data/voice';
import { createAudioPanel } from '../ui/audioPanel';
import { loadListenSettings, saveListenSettings } from '../ui/settings';
import { buildCafe } from '../world/cafe';
import { createCameraRig } from '../world/camera';
import { createCrowd } from '../world/crowd';
import { createIbisView } from '../world/ibis';
import { buildOwner } from '../world/owner';
import { buildStation } from '../world/station';
import type { App, LateFields } from './context';
import { installDebugHandle } from './debug';
import { clearEdges, installInput } from './input';
import { createPracticeLoop, createPracticeView, startPractice } from './practiceWiring';
import { createRushLoop, createRushView, rushAct, startDay2, startRush } from './rushWiring';
import { makeIbis } from './shared';
import { titleCallbacks, toTitle } from './title';
import { createTrialHud, trialFrame } from './trialWiring';
import { openShifts, startEndless, startShift } from './weekWiring';

export async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const seed = parseSeed(params.get('seed'));
  // Canvas text needs the bundled fonts first (AGENTS.md §8: no Impact fallback on signs).
  await Promise.race([
    Promise.all([
      document.fonts.load('400 40px "Bowlby One"'),
      document.fonts.load('600 20px Figtree'),
    ]),
    new Promise((r) => setTimeout(r, 1500)), // cosmetic only: never block boot on fonts
  ]).catch(() => undefined);

  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1d1611');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.42;
  envScene.dispose();
  pmrem.dispose();

  const cafe = buildCafe(scene);
  void document.fonts.ready.then(() => cafe.refreshText());
  const station = buildStation(scene);
  const owner = buildOwner(scene);
  const crowd = createCrowd(scene);
  const ibisView = createIbisView(scene);
  const rig = createCameraRig();
  const camera = rig.camera;

  const trial = createTrial(seed);
  const clock = createClock();
  const listen = loadListenSettings();
  // The week's save (shift, menu, receipts, tips). src/app may read the clock; core/ and sim/ don't.
  const store = createSaveStore(browserStorage(), {
    seed,
    difficulty: listen.difficulty,
    createdAt: new Date().toISOString(),
  });
  const audio = createAudioManager(import.meta.env.BASE_URL, {
    voiceOff: params.get('voice') === '0',
  });
  const sfx = createSfx(audio);
  const music = createMusic(audio);
  // Any click or key can bring back sound the browser blocked (autoplay policy, iOS).
  window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  window.addEventListener('keydown', () => audio.unlock(), { capture: true });

  // These read `app` only when called (from DOM events, after boot() returns).
  const setPaused = (p: boolean): void => {
    if (app.mode === 'trial' && trial.phase === 'title' && p) return;
    clock.paused = p;
    app.hud.setPaused(p);
    app.rushHud.setPaused(p);
    app.practiceHud.setPaused(p);
    audio.setPaused(p);
    if (p) {
      app.held = false;
      app.spaceHeld = false;
      // A button let go while paused must not read as a click on resume (it would stop the shot).
      if (app.rush) cancelPress(app.rush.barista);
    }
  };
  /** Unpause everything together: game clock, menus and audio (A1: switching days from the
   *  pause menu used to leave the AudioContext suspended). */
  const resumeAll = (): void => {
    clock.paused = false;
    app.hud.setPaused(false);
    app.rushHud.setPaused(false);
    app.practiceHud.setPaused(false);
    audio.setPaused(false);
  };
  /** Say the last line again, with its subtitle. */
  const replay = (): void => {
    const l = audio.replay();
    if (!l) return;
    const secs = spokenDuration(l.speaker, l.text, l.delivery);
    if (app.mode === 'rush') app.rushHud.onReplay(l.speaker, l.text, secs);
    else if (app.mode === 'practice') app.practiceHud.onReplay(l.text, secs);
    else app.hud.onReplay(l.text, secs);
  };

  const uiRoot = document.getElementById('ui') as HTMLElement;
  const ibisHint = document.createElement('div');
  ibisHint.id = 'ibisHint';
  ibisHint.className = 'hide';
  ibisHint.setAttribute('role', 'status');
  ibisHint.innerHTML = '<b>Bin chicken!</b> Shoo it out gently: click it, or press <kbd>I</kbd>.';
  const hud1Root = document.createElement('div');
  const hud2Root = document.createElement('div');
  const hud3Root = document.createElement('div');
  hud2Root.classList.add('hide');
  hud3Root.classList.add('hide');
  uiRoot.append(hud1Root, hud2Root, hud3Root, ibisHint);

  const core: Omit<App, LateFields> = {
    params,
    seed,
    canvas,
    renderer,
    camera,
    rig,
    station,
    owner,
    crowd,
    ibisView,
    look: new THREE.Vector3(),
    focus: { cupRim: station.cupRim, ownerHead: owner.head },
    trial,
    clock,
    mode: 'trial',
    practice: null,
    practiceAction: null,
    rush: null,
    rushAction: null,
    ibis: makeIbis({ params, seed, rush: null }),
    ibisShoo: false,
    ibisNoticed: false,
    listen,
    store,
    cooldowns: {},
    lastEvent: null,
    audio,
    sfx,
    music,
    input: emptyInput(),
    held: false,
    spaceHeld: false,
    keyHeight: 0,
    touchHeight: 0,
    pointer: { x: 0, y: 0, has: false },
    timeScale: 1,
    viewTime: 0,
    voiceLevel: 0,
    uiRoot,
    ibisHint,
    hud1Root,
    hud2Root,
    hud3Root,
    nav: {
      toTitle: () => toTitle(app),
      startRush: (week, rushSeed) => startRush(app, week, rushSeed),
      startDay2: () => startDay2(app),
      startShift: () => startShift(app),
      startEndless: () => startEndless(app),
      openShifts: () => openShifts(app),
      startPractice: () => startPractice(app),
    },
    setPaused,
    resumeAll,
    replay,
  };
  // The HUDs (LateFields) are assigned right below: their callbacks need `app` to exist first, and
  // none of them can run (they're DOM events) before boot() returns.
  const app = core as App;
  const { input } = app;

  app.audioPanel = createAudioPanel(uiRoot, audio, {
    replay: () => {
      if (app.mode === 'rush' && app.rush && atCounter(app.rush)) rushAct(app, { type: 'replay' });
      else replay();
    },
    test: () => audio.say({ speaker: 'gaz', text: (GREETING[0] as { text: string }).text }),
    listen: {
      get: () => app.listen,
      set: (s) => {
        app.listen = s;
        saveListenSettings(s);
      },
    },
  });
  app.rushHud = createRushView(app);
  app.practiceHud = createPracticeView(app);
  app.hud = createTrialHud(app, titleCallbacks(app));

  const sampleInput = installInput(app);

  // ---------------------------------------------------------------- resize
  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    rig.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  installDebugHandle(app);

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  /** Seconds the current line has been held waiting for its audio (see frame()). */
  let voiceHoldFor = 0;
  const MAX_VOICE_HOLD = 6;
  const rushLoop = createRushLoop(app);
  const practiceLoop = createPracticeLoop(app);

  const frame = (ts: number): void => {
    requestAnimationFrame(frame);
    const real = Math.min(0.1, Math.max(0, (ts - last) / 1000)) * app.timeScale;
    last = ts;
    // While the current line's clip is still downloading/decoding, hold that line's clock (A3),
    // but never for long: a stuck download mustn't freeze the game.
    const loading = audio.loading && !clock.paused;
    voiceHoldFor = loading ? voiceHoldFor + real : 0;
    input.voiceHold = loading && voiceHoldFor < MAX_VOICE_HOLD;
    const steps = consumeFrame(clock, real);
    for (let i = 0; i < steps; i++) {
      sampleInput();
      if (app.mode === 'rush' && app.rush) rushLoop.step(app.rush);
      else if (app.mode === 'practice' && app.practice) practiceLoop.step(app.practice);
      else stepTrial(trial, input, STEP);
      clearEdges(app);
      tickStep(clock);
    }
    const dt = clock.paused ? 0 : real;
    app.viewTime += dt;
    app.voiceLevel = audio.voiceLevel();
    audio.update();
    music.setMood(
      app.mode === 'practice'
        ? moodFor('trial', 'pour')
        : moodFor(app.mode, app.mode === 'rush' && app.rush ? app.rush.phase : trial.phase),
    );
    music.update();
    if (app.mode === 'rush' && app.rush) {
      rushLoop.frame(app.rush, dt);
      renderer.render(scene, camera);
      return;
    }
    if (app.mode === 'practice' && app.practice) {
      practiceLoop.frame(app.practice, dt);
      renderer.render(scene, camera);
      return;
    }
    trialFrame(app, dt);
    renderer.render(scene, camera);
  };
  app.hud.onPhase('title', trial);
  requestAnimationFrame(frame);
}
