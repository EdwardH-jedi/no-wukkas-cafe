// Boot: builds the café, wires input → trial → view, and owns the frame loop.

import '@fontsource/bowlby-one/400.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import './ui/styles.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSfx } from './audio/sfx';
import { createVoice } from './audio/voice';
import { consumeFrame, createClock, STEP, tickStep } from './core/clock';
import { parseSeed } from './core/rng';
import { canFinish, createTrial, emptyInput, stepTrial, type TrialAction } from './core/trial';
import { surfacing } from './sim/latte/field';
import { HEIGHT_PRESETS, pitcherFlow } from './sim/latte/pitcher';
import { createHud } from './ui/hud';
import { buildCafe } from './world/cafe';
import { createCameraRig } from './world/camera';
import { buildOwner } from './world/owner';
import { buildStation, RIM } from './world/station';

const params = new URLSearchParams(location.search);
const seed = parseSeed(params.get('seed'));

async function boot(): Promise<void> {
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
  const rig = createCameraRig();
  const camera = rig.camera;

  const trial = createTrial(seed);
  const clock = createClock();
  const sfx = createSfx();
  const voice = createVoice();
  if (params.get('voice') === '0') voice.enabled = false;

  // ---------------------------------------------------------------- input
  const input = emptyInput();
  let held = false; // mouse/touch
  let spaceHeld = false;
  let keyHeight = 0;
  let touchHeight = 0;
  const pointer = { x: 0, y: 0, has: false };
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  const act = (a: TrialAction): void => {
    sfx.unlock();
    if (a === 'start') {
      voice.unlock();
      sfx.play('click');
    }
    input.action = a;
  };
  const setPaused = (p: boolean): void => {
    if (trial.phase === 'title' && p) return;
    clock.paused = p;
    hud.setPaused(p);
    sfx.setPaused(p);
    if (p) voice.pause();
    else voice.resume();
    if (p) {
      held = false;
      spaceHeld = false;
    }
  };

  const hud = createHud(document.getElementById('ui') as HTMLElement, {
    action: act,
    toggleVoice: () => {
      voice.enabled = !voice.enabled;
      if (!voice.enabled) voice.stop();
      return voice.enabled;
    },
    toggleSound: () => {
      sfx.setMuted(!sfx.muted);
      return !sfx.muted;
    },
    pause: setPaused,
    restart: () => {
      setPaused(false);
      act('restart');
    },
    height: (d) => (touchHeight = d),
    skip: () => (input.skip = true),
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    sfx.unlock();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer: capture is a nicety */
    }
    held = true;
    input.pressed = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.has = true;
  });
  const release = (): void => {
    held = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.has = true;
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // A trackpad pinch arrives as ctrl+wheel: block the page zoom, but don't move the jug.
      if (e.ctrlKey) return;
      const unit = e.deltaMode === 1 ? 33 : 1;
      // Clamp single events so a mouse-wheel notch or trackpad momentum can't teleport the jug.
      const dy = Math.max(-150, Math.min(150, e.deltaY * unit));
      input.heightDelta -= dy * 0.012;
    },
    { passive: false },
  );
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      setPaused(!clock.paused);
      return;
    }
    if (clock.paused) return;
    if (k === ' ') {
      e.preventDefault();
      sfx.unlock();
      if (!e.repeat) input.pressed = true;
      spaceHeld = true;
    } else if (k === 'enter') {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return; // let the focused button handle it
      e.preventDefault();
      const ph = trial.phase;
      if (ph === 'title') act('start');
      else if (ph === 'grind' || ph === 'pour') act('next');
      else if (ph === 'feedback') act(canFinish(trial) && trial.attempt >= 2 ? 'finish' : 'next');
      else if (ph === 'verdict') act('restart');
      else input.skip = true;
    } else if (k === '1' || k === '2' || k === '3') {
      input.heightPreset = HEIGHT_PRESETS[Number(k) - 1] ?? null;
    } else if (k === 'w' || k === 'arrowup') keyHeight = 1;
    else if (k === 's' || k === 'arrowdown') keyHeight = -1;
    else if (k === 'm') sfx.setMuted(!sfx.muted);
    else if (k === 'v') voice.enabled = !voice.enabled;
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') spaceHeld = false;
    if ((k === 'w' || k === 'arrowup') && keyHeight > 0) keyHeight = 0;
    if ((k === 's' || k === 'arrowdown') && keyHeight < 0) keyHeight = 0;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && trial.phase !== 'title') setPaused(true);
  });
  window.addEventListener('blur', () => {
    held = false;
    spaceHeld = false;
    keyHeight = 0;
  });

  /** Fill the per-step parts of the input from the latest pointer/keyboard state. */
  const sampleInput = (): void => {
    input.holding = held || spaceHeld;
    input.heightDelta += (keyHeight + touchHeight) * 9 * STEP;
    if (!pointer.has) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (trial.phase === 'pour') {
      ndc.set((pointer.x / w) * 2 - 1, -(pointer.y / h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      // A fixed plane at the rim: if it followed the rising coffee, the jug would drift under a
      // still mouse as the cup fills.
      plane.constant = -station.cupRim.y;
      if (ray.ray.intersectPlane(plane, hit)) {
        input.hasCup = true;
        input.cupX = (hit.x - station.cupRim.x) / RIM;
        input.cupY = -(hit.z - station.cupRim.z) / RIM;
      }
    }
    // Steaming: mouse up = jug up = tip deeper.
    const yN = Math.min(1, Math.max(0, (pointer.y / h - 0.2) / 0.6));
    input.jugDepth = 3.0 - yN * 3.8;
  };
  const clearEdges = (): void => {
    input.pressed = false;
    input.skip = false;
    input.action = null;
    input.heightDelta = 0;
    input.heightPreset = null;
  };

  // ---------------------------------------------------------------- resize
  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    rig.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- debug handle (e2e + console)
  let timeScale = 1;
  const projV = new THREE.Vector3();
  const debug = {
    seed,
    /** Test hook: run game time slower than real time (software-GL e2e runs at ~20 fps). */
    get timeScale() {
      return timeScale;
    },
    set timeScale(v: number) {
      timeScale = Math.min(1, Math.max(0.05, v));
    },
    /** Screen position (CSS px) the pointer must be at to aim the jug at cup-rim coords (cx, cy). */
    project(cx: number, cy: number): { x: number; y: number } {
      projV
        .set(station.cupRim.x + cx * RIM, station.cupRim.y, station.cupRim.z - cy * RIM)
        .project(camera);
      return {
        x: ((projV.x + 1) / 2) * window.innerWidth,
        y: ((1 - projV.y) / 2) * window.innerHeight,
      };
    },
    get phase() {
      return trial.phase;
    },
    /** Cheap per-tick read for test drivers. */
    get tick() {
      return {
        phase: trial.phase,
        phaseTime: trial.phaseTime,
        line: trial.speech.current?.text ?? null,
      };
    },
    get state() {
      return {
        phase: trial.phase,
        attempt: trial.attempt,
        dose: trial.espresso.dose,
        shotTime: trial.espresso.shotTime,
        temp: trial.steam.temp,
        aeration: trial.steam.aeration,
        fill: trial.pour.fill,
        spill: trial.pour.spill,
        poured: trial.pour.poured,
        pitcher: { ...trial.pitcher },
        controls: { ...trial.controls },
        phaseTime: trial.phaseTime,
        demoActive: trial.demoActive,
        results: trial.results.map((r) => ({
          total: r.total,
          valid: r.valid,
          band: r.band,
          faults: r.faults,
          art: r.pattern.art,
        })),
        outcome: trial.outcome,
        line: trial.speech.current?.text ?? null,
        paused: clock.paused,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
  };
  if (import.meta.env.DEV || params.has('debug'))
    (window as unknown as { __trial: typeof debug }).__trial = debug;

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let viewTime = 0;
  const look = new THREE.Vector3();
  const focus = { cupRim: station.cupRim, ownerHead: owner.head };

  const frame = (ts: number): void => {
    requestAnimationFrame(frame);
    const real = Math.min(0.1, Math.max(0, (ts - last) / 1000)) * timeScale;
    last = ts;
    const steps = consumeFrame(clock, real);
    for (let i = 0; i < steps; i++) {
      sampleInput();
      stepTrial(trial, input, STEP);
      clearEdges();
      tickStep(clock);
    }
    for (const ev of trial.events) {
      if (ev.type === 'say') {
        hud.onSay(ev.line);
        owner.onSay(ev.line, viewTime);
        voice.speak(ev.line.text, 'gaz');
      } else if (ev.type === 'phase') {
        hud.onPhase(ev.phase, trial);
        canvas.classList.toggle('aim', ev.phase === 'pour');
        if (ev.phase === 'title' || ev.phase === 'intro') voice.stop();
      } else if (ev.type === 'sfx') sfx.play(ev.id);
    }
    trial.events.length = 0;

    const dt = clock.paused ? 0 : real;
    viewTime += dt;
    station.update(trial, dt, viewTime);
    // Gaz looks at you when talking or judging, at the cup while you work.
    const working =
      trial.phase === 'grind' ||
      trial.phase === 'shot' ||
      trial.phase === 'steam' ||
      trial.phase === 'pour';
    if (working && !trial.speech.current) look.copy(station.cupRim);
    else if (trial.phase === 'inspect' && trial.phaseTime < 2.3) look.copy(station.cupRim);
    else look.copy(camera.position);
    owner.update(trial, dt, viewTime, look);
    const pointerLook = !working && trial.phase !== 'demo';
    const px = pointer.has ? (pointer.x / window.innerWidth) * 2 - 1 : 0;
    const py = pointer.has ? (pointer.y / window.innerHeight) * 2 - 1 : 0;
    rig.update(trial.phase, trial.phaseTime, dt, viewTime, focus, px, py, pointerLook);
    hud.update(trial, dt);

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
    renderer.render(scene, camera);
  };
  hud.onPhase('title', trial);
  requestAnimationFrame(frame);
}

void boot();
