// Boot: builds the café, wires input → the active day (Day 1 trial or Day 2 rush) → view, and owns
// the frame loop.

import '@fontsource/bowlby-one/400.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import './ui/styles.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAudioManager, type VoiceRequest } from './audio/manager';
import { createMusic } from './audio/music';
import { moodFor } from './audio/musicPatterns';
import { createSfx } from './audio/sfx';
import { consumeFrame, createClock, STEP, tickStep } from './core/clock';
import { parseSeed } from './core/rng';
import {
  atCounter,
  atRegister,
  createRush,
  emptyRushInput,
  stepRush,
  type Rush,
  type RushAction,
} from './core/rush';
import { canFinish, createTrial, emptyInput, stepTrial, type TrialAction } from './core/trial';
import { GREETING, GREETING_OPENERS } from './data/ownerLines';
import { spokenDuration, VOICE_MANIFEST } from './data/voice';
import { DIFFICULTY } from './sim/listening';
import { surfacing } from './sim/latte/field';
import { HEIGHT_PRESETS, pitcherFlow } from './sim/latte/pitcher';
import { createAudioPanel } from './ui/audioPanel';
import { createHud } from './ui/hud';
import { stepRushIbis } from './core/rushIbis';
import { ibisForShift } from './sim/events/rareBird';
import { createIbis, ibisPresent, type Ibis } from './sim/ibis';
import { createIbisView } from './world/ibis';
import { createRushHud, nextTicket, railOrder } from './ui/rushHud';
import { loadListenSettings, saveListenSettings, type ListenSettings } from './ui/settings';
import { buildCafe } from './world/cafe';
import { createCameraRig } from './world/camera';
import { createCrowd } from './world/crowd';
import { buildOwner } from './world/owner';
import { buildStation, RIM, type StationView } from './world/station';

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
  const crowd = createCrowd(scene);
  const ibisView = createIbisView(scene);
  const rig = createCameraRig();
  const camera = rig.camera;

  const trial = createTrial(seed);
  const clock = createClock();
  let listen: ListenSettings = loadListenSettings();
  const audio = createAudioManager(import.meta.env.BASE_URL, {
    voiceOff: params.get('voice') === '0',
  });
  const sfx = createSfx(audio);
  const music = createMusic(audio);
  // Any click or key can bring back sound the browser blocked (autoplay policy, iOS).
  window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  window.addEventListener('keydown', () => audio.unlock(), { capture: true });

  /** Download a day's clips up front (decoded only when played). Greeting first. */
  const prefetchDay = (day: 1 | 2): void => {
    const asReq = (text: string): VoiceRequest => ({ speaker: 'gaz', text });
    if (day === 1) audio.prefetch([...GREETING_OPENERS, ...GREETING].map((d) => asReq(d.text)));
    audio.prefetch(
      VOICE_MANIFEST.clips
        .filter((c) =>
          day === 1
            ? c.characterId === 'gaz' && !c.key.startsWith('rush.')
            : c.characterId !== 'gaz' || c.key.startsWith('rush.'),
        )
        .map((c) => ({ speaker: c.characterId, text: c.transcript, delivery: c.delivery })),
    );
  };

  // Which day is running. Day 1's trial owns the title screen.
  let mode: 'trial' | 'rush' = 'trial';
  let rush: Rush | null = null;
  const rushIn = emptyRushInput();
  // The bin chicken: ?ibis=0 never, ?ibis=1 every shift (30 s in); otherwise seeded and rare. On a
  // week shift the event scheduler books it (RARE_BIRD), unless ?ibis= says otherwise.
  const makeIbis = (): Ibis => {
    const force = params.get('ibis');
    if (rush?.week && force === null) return ibisForShift(seed, rush.shiftEvents.bird);
    const b = createIbis(seed, force === '1');
    if (force === '0') b.scheduledAt = null;
    return b;
  };
  let ibis = makeIbis();
  let ibisShoo = false;
  let ibisNoticed = false;
  let rushAction: RushAction | null = null;

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
    // Inside the click: this is what lets the browser play the owner's first line.
    audio.unlock();
    sfx.unlock();
    if (a === 'start') {
      sfx.play('click');
      prefetchDay(1);
    }
    input.action = a;
  };
  const setPaused = (p: boolean): void => {
    if (mode === 'trial' && trial.phase === 'title' && p) return;
    clock.paused = p;
    hud.setPaused(p);
    rushHud.setPaused(p);
    audio.setPaused(p);
    if (p) {
      held = false;
      spaceHeld = false;
    }
  };

  const uiRoot = document.getElementById('ui') as HTMLElement;
  const ibisHint = document.createElement('div');
  ibisHint.id = 'ibisHint';
  ibisHint.className = 'hide';
  ibisHint.setAttribute('role', 'status');
  ibisHint.innerHTML = '<b>Bin chicken!</b> Shoo it out gently: click it, or press <kbd>I</kbd>.';
  const hud1Root = document.createElement('div');
  const hud2Root = document.createElement('div');
  hud2Root.classList.add('hide');
  uiRoot.append(hud1Root, hud2Root, ibisHint);

  const rushAct = (a: RushAction): void => {
    sfx.unlock();
    rushAction = a;
  };

  /** Unpause everything together: game clock, menus and audio (A1: switching days from the
   *  pause menu used to leave the AudioContext suspended). */
  const resumeAll = (): void => {
    clock.paused = false;
    hud.setPaused(false);
    rushHud.setPaused(false);
    audio.setPaused(false);
  };

  /** Start the morning rush (from the title or the trial verdict). */
  const startDay2 = (): void => {
    audio.unlock();
    sfx.unlock();
    audio.stopVoice();
    sfx.play('click');
    prefetchDay(2);
    resumeAll();
    crowd.clear();
    rush = createRush(seed, listen.difficulty);
    ibis = makeIbis();
    sfx.setNoise(DIFFICULTY[listen.difficulty].noise);
    mode = 'rush';
    hud1Root.classList.add('hide');
    hud2Root.classList.remove('hide');
    canvas.classList.remove('aim');
    rushHud.onPhase('intro', rush);
  };

  /** Back to the title screen (fresh Day 1 trial). */
  const toTitle = (): void => {
    audio.stopVoice();
    resumeAll();
    crowd.clear();
    rush = null;
    mode = 'trial';
    Object.assign(trial, createTrial(seed));
    ibis = makeIbis();
    hud2Root.classList.add('hide');
    hud1Root.classList.remove('hide');
    canvas.classList.remove('aim');
    hud.onPhase('title', trial);
  };

  /** Say the last line again, with its subtitle. */
  const replay = (): void => {
    const l = audio.replay();
    if (!l) return;
    const secs = spokenDuration(l.speaker, l.text, l.delivery);
    if (mode === 'rush') rushHud.onReplay(l.speaker, l.text, secs);
    else hud.onReplay(l.text, secs);
  };
  const audioPanel = createAudioPanel(uiRoot, audio, {
    replay: () => {
      if (mode === 'rush' && rush && atCounter(rush)) rushAct({ type: 'replay' });
      else replay();
    },
    test: () => audio.say({ speaker: 'gaz', text: (GREETING[0] as { text: string }).text }),
    listen: {
      get: () => listen,
      set: (s) => {
        listen = s;
        saveListenSettings(s);
      },
    },
  });

  const rushHud = createRushHud(hud2Root, {
    action: rushAct,
    pause: setPaused,
    restart: () => {
      setPaused(false);
      crowd.clear();
      // A restart picks up a difficulty changed mid-shift.
      if (rush) rush.difficulty = listen.difficulty;
      sfx.setNoise(DIFFICULTY[listen.difficulty].noise);
      rushAct({ type: 'restart' });
    },
    title: toTitle,
    height: (d) => (touchHeight = d),
    skip: () => (input.skip = true),
    audioButtonsHtml: audioPanel.buttonsHtml,
    bindAudio: (el) => audioPanel.bind(el),
    settings: () => listen,
  });

  const hud = createHud(hud1Root, {
    action: act,
    day2: startDay2,
    sound: () => {
      audio.unlock();
      audioPanel.open();
    },
    audioButtonsHtml: audioPanel.buttonsHtml,
    bindAudio: (el) => audioPanel.bind(el),
    pause: setPaused,
    restart: () => {
      setPaused(false);
      act('restart');
    },
    height: (d) => (touchHeight = d),
    skip: () => (input.skip = true),
  });

  /** Is the pointer on the bin chicken? (Clicking it shoos it; hovering is "noticing" it.) */
  const onIbis = (e: PointerEvent): boolean => {
    if (mode !== 'rush' || !ibisPresent(ibis)) return false;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ibisView.hit(ray);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    sfx.unlock();
    if (onIbis(e)) {
      ibisShoo = true;
      return;
    }
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
    ibisNoticed = onIbis(e);
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
    } else if (mode === 'rush' && rush) {
      rushKey(rush, k, e);
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
    else if (k === 'v') audio.voiceEnabled = !audio.voiceEnabled;
    else if (k === 'r') replay();
  });
  /** Day 2 keys: T take order, R replay, Enter ring up / lock in / hand over, F/L make, B bin,
   *  1–6 serve or jug height. */
  function rushKey(r: Rush, k: string, e: KeyboardEvent): void {
    const b = r.barista;
    if (k === 'enter') {
      const t = e.target as HTMLElement;
      // Enter rings up even with a register option focused (it would just re-press it).
      if (t.tagName === 'BUTTON' && !(t.closest('#pos') && atCounter(r))) return;
      e.preventDefault();
      if (b.phase === 'grind' || b.phase === 'pour') rushAct({ type: 'next' });
      else if (atCounter(r)) rushHud.ringUp();
      else if (atRegister(r)) rushAct({ type: 'takeOrder' });
      else input.skip = true;
    } else if (k === 't') rushAct({ type: 'takeOrder' });
    else if (k === 'f' || k === 'l') {
      // Make the oldest ticket (F) or the oldest long black (L), with the milk it says.
      const c = nextTicket(r, k === 'l' ? 'longBlack' : undefined);
      if (c?.heard) rushAct({ type: 'make', drink: c.heard.type, milk: c.heard.milk ?? 'full' });
    } else if (k === 'b') rushAct({ type: 'bin' });
    else if (k === 'i' && ibisPresent(ibis)) ibisShoo = true;
    else if (/^[1-6]$/.test(k)) {
      if (b.phase === 'pour') input.heightPreset = HEIGHT_PRESETS[Number(k) - 1] ?? null;
      else if (b.ready) {
        const c = railOrder(r)[Number(k) - 1];
        if (c) rushAct({ type: 'serve', customer: c.def.id });
      }
    } else if (k === 'w' || k === 'arrowup') keyHeight = 1;
    else if (k === 's' || k === 'arrowdown') keyHeight = -1;
    else if (k === 'm') sfx.setMuted(!sfx.muted);
    else if (k === 'v') audio.voiceEnabled = !audio.voiceEnabled;
    else if (k === 'r') {
      // At the register, Replay is part of listening (counted, costs patience): the sim does it.
      if (atCounter(r)) rushAct({ type: 'replay' });
      else replay();
    }
  }

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') spaceHeld = false;
    if ((k === 'w' || k === 'arrowup') && keyHeight > 0) keyHeight = 0;
    if ((k === 's' || k === 'arrowdown') && keyHeight < 0) keyHeight = 0;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (mode === 'rush' || trial.phase !== 'title')) setPaused(true);
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
    const pouring = mode === 'rush' ? rush?.barista.phase === 'pour' : trial.phase === 'pour';
    if (pouring) {
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
    rushAction = null;
  };

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
    rushIn.action = rushAction;
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
    /** Test hook: run game time slower (precise input at ~20 fps software GL) or up to 4×
     *  faster (waiting out timers). Each frame still advances at most 0.1 s of game time. */
    get timeScale() {
      return timeScale;
    },
    set timeScale(v: number) {
      timeScale = Math.min(4, Math.max(0.05, v));
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
    get mode() {
      return mode;
    },
    get phase() {
      return trial.phase;
    },
    /** Audio evidence for tests: what played, how long the decoded buffer was, peak loudness. */
    get audio() {
      return {
        status: audio.status,
        message: audio.message,
        contextState: audio.context?.state ?? 'none',
        currentTime: audio.context?.currentTime ?? 0,
        voiceEnabled: audio.voiceEnabled,
        speaking: audio.speaking,
        clipCount: audio.clipCount,
        history: audio.history.map((h) => ({ ...h })),
        voices: audio.voices,
        output: audio.outputInfo,
        music: { mood: music.mood, duck: audio.musicDuck, scheduled: music.scheduled },
        masterRms: audio.masterRms(),
      };
    },
    /** The bin chicken, with where it is on screen (CSS px) for tests that click it. */
    get ibis() {
      projV.copy(ibisView.position).setY(0.5).project(camera);
      return {
        state: ibis.state,
        scheduledAt: ibis.scheduledAt,
        shoos: ibis.shoos,
        binRaided: ibis.binRaided,
        screen: {
          x: ((projV.x + 1) / 2) * window.innerWidth,
          y: ((1 - projV.y) / 2) * window.innerHeight,
        },
      };
    },
    /** Cheap per-frame snapshot for audio/subtitle sync tests (Day 1 or Day 2). */
    get audioTick() {
      const last = audio.history[audio.history.length - 1];
      const line = mode === 'rush' ? (rush?.speech.current ?? null) : trial.speech.current;
      const c = rush?.customers.find((x) => x.state === 'ordering' || x.state === 'deciding');
      return {
        t: audio.context?.currentTime ?? 0,
        sim: mode === 'rush' ? (rush?.time ?? 0) : trial.time,
        clip: last ? { text: last.text, endedAt: last.endedAt, via: last.via } : null,
        playing: audio.clipPlaying,
        line: line ? line.text : null,
        subs:
          (
            document.querySelector(
              mode === 'rush' ? '#rsubs .text' : '#subs .text',
            ) as HTMLElement | null
          )?.textContent ?? '',
        counter: c ? { id: c.def.id, state: c.state } : null,
        live: audio.voices.live - audio.voices.fading,
      };
    },
    /** Day 2 state for tests (null on Day 1). */
    get rush() {
      const r = rush;
      if (!r) return null;
      const b = r.barista;
      return {
        phase: r.phase,
        serviceTime: r.serviceTime,
        station: b.phase,
        stationTime: b.phaseTime,
        drink: b.drink,
        dose: b.espresso.dose,
        shotTime: b.espresso.shotTime,
        extracting: b.espresso.extracting,
        shotDone: b.espresso.done,
        temp: b.steam.temp,
        aeration: b.steam.aeration,
        steamDone: b.steam.done,
        water: b.water,
        ready: b.ready
          ? { type: b.ready.type, temp: b.ready.temp, milkType: b.ready.milkType }
          : null,
        fill: b.pour.fill,
        controls: { ...b.controls },
        customers: r.customers.map((c) => ({
          id: c.def.id,
          state: c.state,
          patience: c.patience,
          max: c.def.patience,
          ticket: c.ticket,
          outcome: c.outcome,
          rejected: c.rejected,
          satisfaction: c.result?.satisfaction ?? null,
          lineId: c.line.id,
          order: { ...c.order },
          heard: c.heard ? { ...c.heard } : null,
          listen: { ...c.listen, clarified: [...c.listen.clarified] },
        })),
        difficulty: r.difficulty,
        week: r.week ? { shiftIndex: r.week.shiftIndex } : null,
        event: r.shiftEvents.current
          ? {
              id: r.shiftEvents.current.def.id,
              customer: r.shiftEvents.current.customer?.def.id ?? null,
              choices: r.shiftEvents.current.def.choices.map((c) => c.id),
            }
          : null,
        eventsFired: r.shiftEvents.log.fired.map((f) => f.id),
        listening: r.listening.map((x) => ({ ...x, wrong: [...x.wrong] })),
        records: r.records.map((x) => ({ ...x })),
        summary: r.summary,
        line: r.speech.current
          ? {
              speaker: r.speech.current.speaker,
              key: r.speech.current.key,
              text: r.speech.current.text,
              delivery: r.speech.current.delivery ?? 'normal',
            }
          : null,
        crowd: crowd.count,
        drawCalls: renderer.info.render.calls,
        paused: clock.paused,
      };
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
  /** Seconds the current line has been held waiting for its audio (see frame()). */
  let voiceHoldFor = 0;
  const MAX_VOICE_HOLD = 6;
  let viewTime = 0;
  /** Loudness of the line being spoken (0..1), for mouths. */
  let voiceLevel = 0;
  const look = new THREE.Vector3();
  const focus = { cupRim: station.cupRim, ownerHead: owner.head };

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
  const WORKING = new Set(['grind', 'lock', 'shot', 'water', 'steam', 'pour']);

  function rushFrame(r: Rush, dt: number): void {
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
        });
      } else if (ev.type === 'phase') {
        rushHud.onPhase(ev.phase, r);
        if (ev.phase === 'intro') {
          crowd.clear();
          ibis = makeIbis(); // a restarted shift gets its bird (or not) afresh
          canvas.classList.remove('aim'); // a restart mid-pour must give the cursor back
        }
      } else if (ev.type === 'station') canvas.classList.toggle('aim', ev.phase === 'pour');
      else if (ev.type === 'sfx') sfx.play(ev.id);
      else if (ev.type === 'ticket') {
        sfx.play('tick');
        const c = r.customers.find((x) => x.def.id === ev.customer);
        if (c) rushHud.onTicket(c);
      } else if (ev.type === 'ask') rushHud.onAsk(ev.text);
      else if (ev.type === 'served')
        crowd.react(
          ev.customer,
          ev.result.satisfaction >= 75 ? 'cheer' : ev.result.satisfaction >= 45 ? 'nod' : 'huff',
        );
      else if (ev.type === 'rejected') crowd.react(ev.customer, 'shake');
      else if (ev.type === 'walkout' || ev.type === 'refused') crowd.react(ev.customer, 'huff');
    }
    r.events.length = 0;

    const b = r.barista;
    sv.phase = r.phase === 'service' ? b.phase : 'idle';
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
    ibisView.update(ibis, dt, viewTime);
    ibisHint.classList.toggle(
      'hide',
      !(r.phase === 'service' && ibisPresent(ibis) && ibis.state !== 'leaving'),
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
    if (gazTalking && r.speech.current?.key.startsWith('ibis.') && ibisPresent(ibis))
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
            ? b.phase
            : 'service'
          : 'summary';
    const px = pointer.has ? (pointer.x / window.innerWidth) * 2 - 1 : 0;
    const py = pointer.has ? (pointer.y / window.innerHeight) * 2 - 1 : 0;
    rig.update(camPhase, b.phaseTime, dt, viewTime, focus, px, py, !working);
    rushHud.update(r, dt);

    sfx.update({
      grind: b.phase === 'grind' && b.espresso.grinding ? 1 : 0,
      pump: b.phase === 'shot' && b.espresso.extracting ? 1 : 0,
      steam: b.phase === 'steam' && b.steam.valveOpen ? 1 : 0,
      steamZone: b.phase === 'steam' ? b.steam.zone : 'off',
      pour:
        b.phase === 'pour' ? pitcherFlow(b.pitcher) : b.phase === 'water' && b.dispensing ? 0.7 : 0,
      pourHigh: b.phase === 'water' ? 0.8 : 1 - surfacing(b.pitcher.height),
    });
  }

  const frame = (ts: number): void => {
    requestAnimationFrame(frame);
    const real = Math.min(0.1, Math.max(0, (ts - last) / 1000)) * timeScale;
    last = ts;
    // While the current line's clip is still downloading/decoding, hold that line's clock (A3),
    // but never for long: a stuck download mustn't freeze the game.
    const loading = audio.loading && !clock.paused;
    voiceHoldFor = loading ? voiceHoldFor + real : 0;
    input.voiceHold = loading && voiceHoldFor < MAX_VOICE_HOLD;
    const steps = consumeFrame(clock, real);
    for (let i = 0; i < steps; i++) {
      sampleInput();
      if (mode === 'rush' && rush) {
        sampleRushInput();
        stepRush(rush, rushIn, STEP);
        for (const e of stepRushIbis(rush, ibis, { shoo: ibisShoo, noticed: ibisNoticed }, STEP))
          if (e.type === 'enter' || e.type === 'honk' || e.type === 'alert') sfx.play('honk');
          else if (e.type === 'atBin') sfx.play('binRattle');
          else if (e.type === 'shooed') sfx.play('clap');
        ibisShoo = false;
      } else stepTrial(trial, input, STEP);
      clearEdges();
      tickStep(clock);
    }
    const dt = clock.paused ? 0 : real;
    viewTime += dt;
    voiceLevel = audio.voiceLevel();
    audio.update();
    music.setMood(moodFor(mode, mode === 'rush' && rush ? rush.phase : trial.phase));
    music.update();
    if (mode === 'rush' && rush) {
      rushFrame(rush, dt);
      renderer.render(scene, camera);
      return;
    }
    for (const ev of trial.events) {
      if (ev.type === 'say') {
        hud.onSay(ev.line);
        owner.onSay(ev.line, viewTime);
        audio.say({ speaker: 'gaz', text: ev.line.text });
      } else if (ev.type === 'phase') {
        hud.onPhase(ev.phase, trial);
        canvas.classList.toggle('aim', ev.phase === 'pour');
        if (ev.phase === 'title') audio.stopVoice();
      } else if (ev.type === 'sfx') sfx.play(ev.id);
    }
    trial.events.length = 0;

    station.update(trial, dt, viewTime);
    ibisView.update(ibis, dt, viewTime);
    ibisHint.classList.add('hide');
    // Gaz looks at you when talking or judging, at the cup while you work.
    const working =
      trial.phase === 'grind' ||
      trial.phase === 'shot' ||
      trial.phase === 'steam' ||
      trial.phase === 'pour';
    if (working && !trial.speech.current) look.copy(station.cupRim);
    else if (trial.phase === 'inspect' && trial.phaseTime < 2.3) look.copy(station.cupRim);
    else look.copy(camera.position);
    owner.update(trial, dt, viewTime, look, audio.clipPlaying ? voiceLevel : -1);
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
