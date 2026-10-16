// Review harness: the real audio stack (audio/manager, music, sfx) on a recording fake
// AudioContext, the real app wiring (startRush, toTitle, act, the rush loop and its per-frame view,
// the trial's frame) with no-op world/HUD objects, and a copy of boot.ts's frame body (boot()
// itself needs WebGL). Network and browser speech are fakes whose timing the test controls in
// harness seconds, so a clip can 404, or arrive 10 s or 25 s late, deterministically.

import * as THREE from 'three';
import { vi } from 'vitest';
import { createAudioManager, type AudioManager } from '../../src/audio/manager';
import { createMusic, type Music } from '../../src/audio/music';
import { moodFor } from '../../src/audio/musicPatterns';
import { createSfx, type Sfx } from '../../src/audio/sfx';
import type { App } from '../../src/app/context';
import { clearEdges } from '../../src/app/input';
import { createRushLoop, startDay2, startRush } from '../../src/app/rushWiring';
import { makeIbis } from '../../src/app/shared';
import { createTelemetry } from '../../src/app/telemetry';
import { toTitle } from '../../src/app/title';
import { trialFrame } from '../../src/app/trialWiring';
import { consumeFrame, createClock, STEP, tickStep } from '../../src/core/clock';
import type { Utterance } from '../../src/core/speech';
import { createTelemetryStore } from '../../src/core/save/telemetry';
import { createTrial, emptyInput, stepTrial } from '../../src/core/trial';
import { VOICE_MANIFEST } from '../../src/data/voice';
import type { VoiceClip } from '../../src/data/voice/manifest';
import type { ListenSettings } from '../../src/ui/settings';

// ---------------------------------------------------------------- fake Web Audio

/** An AudioParam whose automation lands at once (tests read where it is heading). */
export class FakeParam {
  constructor(public value = 1) {}
  setTargetAtTime(v: number): void {
    this.value = v;
  }
  setValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
  }
  exponentialRampToValueAtTime(v: number): void {
    this.value = v;
  }
  cancelScheduledValues(): void {}
}

export class FakeNode {
  readonly outs: unknown[] = [];
  constructor(readonly kind: string) {}
  connect<T>(n: T): T {
    this.outs.push(n);
    return n;
  }
  disconnect(): void {
    this.outs.length = 0;
  }
}

export interface FakeBuffer {
  duration: number;
  length: number;
  sampleRate: number;
  numberOfChannels: number;
  /** The voice file this buffer was decoded from (fetch fake), if any. */
  file: string | null;
  getChannelData(ch: number): Float32Array;
}

function makeBuffer(channels: number, length: number, rate: number, file: string | null) {
  const data: Float32Array[] = [];
  const b: FakeBuffer = {
    duration: length / rate,
    length,
    sampleRate: rate,
    numberOfChannels: channels,
    file,
    getChannelData: (ch) => (data[ch] ??= new Float32Array(length)),
  };
  return b;
}

export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  startedAt = -1;
  stopAt = Infinity;
  ended = false;
  constructor(private readonly ctx: FakeCtx) {
    super('bufferSource');
  }
  start(when?: number): void {
    this.startedAt = when ?? this.ctx.currentTime;
    this.ctx.live.push(this);
    this.ctx.sources.push(this);
    this.ctx.onSourceStart?.(this);
  }
  stop(when?: number): void {
    this.stopAt = when ?? this.ctx.currentTime;
  }
}

class FakeScheduled extends FakeNode {
  onended: (() => void) | null = null;
  start(): void {}
  stop(): void {}
}

export class FakeCtx {
  static last: FakeCtx | null = null;
  currentTime = 0;
  state: 'suspended' | 'running' = 'suspended';
  sampleRate = 48000;
  baseLatency = 0;
  outputLatency = 0;
  destination = Object.assign(new FakeNode('destination'), { maxChannelCount: 2 });
  onstatechange: (() => void) | null = null;
  /** Every node created, in order. */
  readonly nodes: FakeNode[] = [];
  /** Every buffer source ever started; `live` drops the ones that have ended. */
  readonly sources: FakeSource[] = [];
  live: FakeSource[] = [];
  onSourceStart: ((s: FakeSource) => void) | null = null;
  constructor() {
    FakeCtx.last = this;
  }
  private add<T extends FakeNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.add(Object.assign(new FakeNode('gain'), { gain: new FakeParam(1) }));
  }
  createAnalyser() {
    return this.add(
      Object.assign(new FakeNode('analyser'), {
        fftSize: 512,
        getFloatTimeDomainData: (a: Float32Array) => a.fill(0),
      }),
    );
  }
  createBiquadFilter() {
    return this.add(
      Object.assign(new FakeNode('biquad'), {
        type: 'lowpass',
        frequency: new FakeParam(350),
        Q: new FakeParam(1),
        gain: new FakeParam(0),
      }),
    );
  }
  createOscillator() {
    return this.add(
      Object.assign(new FakeScheduled('oscillator'), {
        type: 'sine',
        frequency: new FakeParam(440),
        detune: new FakeParam(0),
      }),
    );
  }
  createConvolver() {
    return this.add(Object.assign(new FakeNode('convolver'), { buffer: null as unknown }));
  }
  createConstantSource() {
    return this.add(Object.assign(new FakeScheduled('constant'), { offset: new FakeParam(1) }));
  }
  createBufferSource(): FakeSource {
    return this.add(new FakeSource(this));
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    return makeBuffer(channels, length, rate, null);
  }
  /** The fetch fake encodes [duration, file index] into the bytes. */
  decodeAudioData(bytes: ArrayBuffer): Promise<FakeBuffer> {
    const [duration, index] = new Float64Array(bytes);
    const file = FILES[index as number] ?? null;
    return Promise.resolve(makeBuffer(1, Math.round((duration as number) * 48000), 48000, file));
  }
  resume(): Promise<void> {
    this.state = 'running';
    this.onstatechange?.();
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    this.onstatechange?.();
    return Promise.resolve();
  }
  /** Run the audio clock by exactly `dt` (only while running), ending sources that are over. */
  advance(dt: number): void {
    if (this.state !== 'running') return;
    this.currentTime += dt;
    for (let i = 0; i < this.live.length; i++) {
      const s = this.live[i] as FakeSource;
      if (s.ended) continue;
      const len = s.loop ? Infinity : (s.buffer?.duration ?? 0) / (s.playbackRate.value || 1);
      const end = Math.min(s.startedAt + len, s.stopAt);
      if (this.currentTime >= end - 1e-9) {
        s.ended = true;
        s.onended?.();
      }
    }
    this.live = this.live.filter((s) => !s.ended);
  }
}

// ---------------------------------------------------------------- fake network and speech

const FILES: string[] = [];
const fileIndex = new Map<string, number>();
const indexOf = (file: string): number => {
  let i = fileIndex.get(file);
  if (i === undefined) {
    i = FILES.length;
    FILES.push(file);
    fileIndex.set(file, i);
  }
  return i;
};

export const CLIP_BY_FILE = new Map<string, VoiceClip>(
  VOICE_MANIFEST.clips.map((c) => [c.file, c]),
);

/** How the fake server answers one request: an HTTP status, `delay` harness seconds later. */
export interface Reply {
  status: number;
  delay: number;
}
export type Plan = (file: string, nth: number) => Reply;
export const FAST: Reply = { status: 200, delay: 0 };

export interface Spoken {
  text: string;
  at: number;
}

// ---------------------------------------------------------------- the harness

/** A voice that became audible: a clip's first sample, or a browser-speech utterance. */
export interface VoiceStart {
  speaker: string;
  text: string;
  via: 'clip' | 'tts';
  at: number;
  /** The speaker's rush customer state at that moment (null: not a customer, or no rush). */
  customerState: string | null;
}

export interface Harness {
  app: App;
  audio: AudioManager;
  music: Music;
  sfx: Sfx;
  ctx(): FakeCtx;
  /** Harness seconds (wall time: runs while paused too). */
  readonly now: number;
  starts: VoiceStart[];
  spoken: Spoken[];
  /** Every line the rush started (its `say` events, via the HUD), with when. */
  said: Array<{ line: Utterance; at: number }>;
  /** Largest number of voice sources audible at once seen at the end of any frame. */
  maxAudible: number;
  /** Called before every fixed step (the input sampling boot.ts does). */
  beforeStep: ((app: App) => void) | null;
  frame(dt?: number): Promise<void>;
  run(seconds: number): Promise<void>;
  until(pred: () => boolean, maxSeconds: number): Promise<boolean>;
  /** boot.ts's replay(): say the last line again. */
  replay(): void;
}

/** boot.ts: `MAX_VOICE_HOLD` (private there). */
export const MAX_VOICE_HOLD = 6;

const classList = () => ({
  add: (): void => undefined,
  remove: (): void => undefined,
  toggle: (): void => undefined,
  contains: (): boolean => false,
});
const el = () => ({
  classList: classList(),
  querySelector: (): null => null,
  querySelectorAll: (): never[] => [],
});
const noop = (): void => undefined;

export interface HarnessOptions {
  seed?: number;
  query?: string;
  listen?: Partial<ListenSettings>;
  plan?: Plan;
}

export function createHarness(o: HarnessOptions = {}): Harness {
  const seed = o.seed ?? 7;
  let now = 0;
  const plan = o.plan ?? (() => FAST);
  const asked = new Map<string, number>();
  const pending: Array<{ due: number; go: () => void }> = [];
  let activity = false;

  vi.stubGlobal('window', { AudioContext: FakeCtx, innerWidth: 1280, innerHeight: 720 });
  vi.stubGlobal('fetch', (url: string) => {
    const file = url.replace(/^\//, '');
    const nth = (asked.get(file) ?? 0) + 1;
    asked.set(file, nth);
    const r = plan(file, nth);
    const clip = CLIP_BY_FILE.get(file);
    const ok = r.status >= 200 && r.status < 300 && clip !== undefined;
    const response = {
      ok,
      status: clip ? r.status : 404,
      headers: { get: () => 'audio/mpeg' },
      arrayBuffer: () =>
        Promise.resolve(new Float64Array([clip?.duration ?? 0, indexOf(file)]).buffer),
    };
    activity = true;
    return new Promise((resolve) => {
      if (r.delay <= 0) resolve(response);
      else pending.push({ due: now + r.delay, go: () => resolve(response) });
    });
  });

  const spoken: Spoken[] = [];
  const talking: Array<{ end: number; u: { onend: (() => void) | null } }> = [];
  class Utt {
    voice: unknown = null;
    lang = '';
    pitch = 1;
    rate = 1;
    volume = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(public text: string) {}
  }
  const starts: VoiceStart[] = [];
  const customerState = (speaker: string): string | null =>
    app.rush?.customers.find((c) => c.def.id === speaker)?.state ?? null;
  vi.stubGlobal('SpeechSynthesisUtterance', Utt);
  vi.stubGlobal('speechSynthesis', {
    speaking: false,
    pending: false,
    getVoices: () => [{ name: 'Karen', lang: 'en-AU' }],
    addEventListener: noop,
    speak(u: Utt) {
      if (!u.text.trim()) return;
      spoken.push({ text: u.text, at: now });
      const rec = audio.history[audio.history.length - 1];
      const speaker = rec && rec.via === 'tts' ? rec.speaker : '?';
      starts.push({
        speaker,
        text: u.text,
        via: 'tts',
        at: now,
        customerState: customerState(speaker),
      });
      u.onstart?.();
      talking.push({ end: now + 0.4 * u.text.split(/\s+/).length, u });
    },
    cancel: noop,
    pause: noop,
    resume: noop,
  });

  const audio = createAudioManager('/', { persist: false });
  const sfx = createSfx(audio);
  const music = createMusic(audio);
  const camera = { position: new THREE.Vector3(0, 1.6, 1) };
  const said: Harness['said'] = [];
  const listen: ListenSettings = {
    version: 2,
    difficulty: 'normal',
    subtitles: 'auto',
    learning: false,
    pourSensitivity: 1,
    ...o.listen,
  };
  const clock = createClock();
  const trial = createTrial(seed);
  const station = {
    update: noop,
    cupRim: new THREE.Vector3(0, 1.1, 0),
    jugTip: new THREE.Vector3(),
  };
  const owner = { onSay: noop, update: noop, head: new THREE.Vector3(0, 1.7, -1) };

  // boot.ts: setPaused / resumeAll / replay, as written there.
  const setPaused = (p: boolean): void => {
    if (app.mode === 'trial' && trial.phase === 'title' && p) return;
    clock.paused = p;
    audio.setPaused(p);
    if (p) {
      app.held = false;
      app.spaceHeld = false;
    }
  };
  const resumeAll = (): void => {
    clock.paused = false;
    audio.setPaused(false);
  };

  let appRef: App | null = null;
  const partial = {
    params: new URLSearchParams(o.query ?? 'ibis=0'),
    seed,
    canvas: el(),
    renderer: { info: { render: { calls: 0, triangles: 0 } } },
    camera,
    rig: { camera, update: noop, resize: noop },
    station,
    owner,
    crowd: { clear: noop, react: noop, update: noop, registerPos: () => false, count: 0 },
    ibisView: { update: noop, position: new THREE.Vector3() },
    look: new THREE.Vector3(),
    focus: { cupRim: station.cupRim, ownerHead: owner.head },
    trial,
    clock,
    mode: 'trial',
    practice: null,
    practiceAction: null,
    rush: null,
    rushAction: null,
    ibisShoo: false,
    ibisNoticed: false,
    listen,
    store: {},
    cooldowns: {},
    lastEvent: null,
    // As boot.ts, with the log kept in memory (no localStorage in node).
    telemetry: createTelemetry(
      { rush: (): App['rush'] => appRef?.rush ?? null, trial: () => trial },
      createTelemetryStore(null),
    ),
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
    uiRoot: el(),
    ibisHint: el(),
    hud1Root: el(),
    hud2Root: el(),
    hud3Root: el(),
    audioPanel: { buttonsHtml: '', bind: noop, open: noop, close: noop },
    hud: {
      onPhase: noop,
      onSay: noop,
      onReplay: noop,
      setPaused: noop,
      update: noop,
      touch: false,
    },
    rushHud: {
      onPhase: noop,
      onSay: (line: Utterance) => said.push({ line, at: now }),
      onTicket: noop,
      onTicketFixed: noop,
      onAsk: noop,
      onReplay: noop,
      update: noop,
      setPaused: noop,
      ringUp: noop,
      show: noop,
    },
    practiceHud: { setPaused: noop, onReplay: noop },
    nav: {
      toTitle: () => toTitle(app),
      startRush: (w: Parameters<typeof startRush>[1], s: number) => startRush(app, w, s),
      startDay2: () => startDay2(app),
      startShift: noop,
      startEndless: noop,
      openShifts: noop,
      startPractice: noop,
    },
    setPaused,
    resumeAll,
    replay: () => void audio.replay(),
  };
  const app = partial as unknown as App;
  appRef = app;
  app.ibis = makeIbis(app);
  const rushLoop = createRushLoop(app);

  let voiceHoldFor = 0;
  let maxAudible = 0;
  let lastRecord: unknown = null;

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };

  const h: Harness = {
    app,
    audio,
    music,
    sfx,
    ctx: () => FakeCtx.last as FakeCtx,
    get now() {
      return now;
    },
    starts,
    spoken,
    said,
    get maxAudible() {
      return maxAudible;
    },
    beforeStep: null,
    async frame(dt = 1 / 60) {
      now += dt;
      // The network: replies that are due now.
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i] as (typeof pending)[number];
        if (p.due <= now + 1e-9) {
          pending.splice(i, 1);
          p.go();
          activity = true;
        }
      }
      for (let i = talking.length - 1; i >= 0; i--) {
        const t = talking[i] as (typeof talking)[number];
        if (t.end <= now) {
          talking.splice(i, 1);
          t.u.onend?.();
        }
      }
      if (activity) {
        activity = false;
        await settle();
      }
      // ---- boot.ts frame(), minus rendering and practice.
      const real = Math.min(0.1, Math.max(0, dt)) * app.timeScale;
      const loading = audio.loading && !clock.paused;
      voiceHoldFor = loading ? voiceHoldFor + real : 0;
      app.input.voiceHold = loading && voiceHoldFor < MAX_VOICE_HOLD;
      const steps = consumeFrame(clock, real);
      for (let i = 0; i < steps; i++) {
        h.beforeStep?.(app);
        if (app.mode === 'rush' && app.rush) rushLoop.step(app.rush);
        else stepTrial(trial, app.input, STEP);
        clearEdges(app);
        tickStep(clock);
      }
      const vdt = clock.paused ? 0 : real;
      app.viewTime += vdt;
      app.voiceLevel = audio.voiceLevel();
      audio.update();
      music.setMood(
        app.mode === 'practice'
          ? moodFor('trial', 'pour')
          : moodFor(app.mode, app.mode === 'rush' && app.rush ? app.rush.phase : trial.phase),
      );
      music.update();
      if (app.mode === 'rush' && app.rush) rushLoop.frame(app.rush, vdt);
      else trialFrame(app, vdt);
      // ---- the audio clock runs on its own (frozen while suspended).
      FakeCtx.last?.advance(real);
      await settle();
      const last = audio.history[audio.history.length - 1] ?? null;
      if (last !== lastRecord) {
        lastRecord = last;
        // Browser speech starts on the next task (audio/voice.ts): let it.
        if (last?.via === 'tts') await new Promise((ok) => setTimeout(ok, 40));
      }
      maxAudible = Math.max(maxAudible, audio.voices.live - audio.voices.fading);
    },
    async run(seconds) {
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) await h.frame();
    },
    async until(pred, maxSeconds) {
      const n = Math.round(maxSeconds * 60);
      for (let i = 0; i < n; i++) {
        if (pred()) return true;
        await h.frame();
      }
      return pred();
    },
    replay: () => app.replay(),
  };

  // A clip's first sample: who, what, and where that customer was.
  const hook = (): void => {
    const c = FakeCtx.last;
    if (!c || c.onSourceStart) return;
    c.onSourceStart = (s) => {
      const clip = s.buffer?.file ? CLIP_BY_FILE.get(s.buffer.file) : undefined;
      if (!clip) return;
      starts.push({
        speaker: clip.characterId,
        text: clip.transcript,
        via: 'clip',
        at: now,
        customerState: customerState(clip.characterId),
      });
    };
  };
  const unlock = audio.unlock.bind(audio);
  audio.unlock = () => {
    unlock();
    hook();
  };
  return h;
}

/** The player clicks through Gaz's intro (as the e2e specs and the headless bots do). */
export function clickThroughIntro(app: App, step: { n: number }): void {
  step.n++;
  if (app.mode === 'rush' && app.rush?.phase === 'intro' && step.n % 20 === 0)
    app.input.pressed = true;
}
