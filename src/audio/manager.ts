// One AudioContext for every sound: recorded voice lines, café SFX and room tone, each on its own
// bus with its own volume. Created and resumed inside the Start click (Chrome's autoplay policy and
// iOS Safari both need a user gesture) and suspended on pause, so audio freezes with the game clock.
//
// Voice lines are pre-rendered clips (see src/data/voice). Only one line plays at a time: a new line
// fades the old one out. When a clip is missing or fails to load, the line falls back to browser
// speech (audio/voice.ts) and the status says so instead of failing silently.

import { clipFor, RELEASE_SEGMENTS, VOICE_MANIFEST } from '../data/voice';
import type { Delivery } from '../data/voice/ids';
import { segmentFile, type VoiceClip } from '../data/voice/manifest';
import { VOICE_PROFILES } from '../data/voice/profiles';
import { duckLevel } from './musicPatterns';
import { createTts, type TtsStyle } from './voice';

export type Bus = 'voice' | 'music' | 'ambience' | 'sfx';

/** ok: clips playing; fallback: browser voice standing in; blocked: browser refused to start
 *  audio; error: something failed; off: voice turned off; locked: before the first click. */
export type AudioStatus = 'locked' | 'ok' | 'fallback' | 'blocked' | 'error' | 'off';

export interface VoiceRequest {
  speaker: string;
  text: string;
  delivery?: Delivery;
  /** An order or answer the player must hear: the music ducks deeper under it. */
  listen?: boolean;
  /** A generated line: the segment ids that voice `text`, played back to back. */
  segments?: readonly string[];
}

/** What the caller (the subtitles) hears about one line. */
export interface VoiceHooks {
  /** The line is audible now: a clip's first sample, or the browser voice's start event. Also
   *  when it never will be (voice off, no browser speech, the browser voice failed to start), so
   *  its words still show. At most once per line, and never for a line already stopped. */
  onStart?(): void;
  /** The line was stopped: replaced by a newer line, or by stopVoice/stopSpeaker, whether it was
   *  still loading, playing or already over. Its subtitle goes with it. */
  onStop?(): void;
}

export interface PlayRecord {
  id: string;
  speaker: string;
  text: string;
  via: 'clip' | 'tts';
  file: string;
  manifestDuration: number;
  bufferDuration: number;
  /** AudioContext time the clip started, s. */
  startedAt: number;
  endedAt: number | null;
  /** Loudest RMS seen on the voice bus while it played (sampled once per frame). */
  maxRms: number;
  /** Loudest RMS seen after the master gain, the last node before the output device. */
  maxMasterRms: number;
  /** Cut off by a newer line (or stopVoice) instead of playing to its end. */
  interrupted: boolean;
  /** ms from request to the first sample. */
  latencyMs: number;
  error: string | null;
  /** A segmented line: how many of its segment clips have started. Absent for a single clip. */
  segments?: number;
}

export interface AudioManager {
  readonly context: AudioContext | null;
  /** Where SFX and room tone connect. Null before unlock. */
  /** Where SFX, room tone and music connect. Null before unlock. Music goes through the duck. */
  output(bus: 'sfx' | 'ambience' | 'music'): AudioNode | null;
  /** Call every frame: ducks the music under speech, and hands a clip still loading after
   *  LOAD_TIMEOUT to the browser voice. */
  update(): void;
  /** Current music duck gain (1 = full), for tests. */
  readonly musicDuck: number;
  /** RMS after the master gain right now (everything audible), for tests. */
  masterRms(): number;
  /** Largest |sample| after the master gain over the last ~43 ms (2048 samples at 48 kHz): 1 or
   *  more means the output clips. Read-only probe for the listening lab (dev/listening.html). */
  masterPeak(): number;
  /** Call from inside a user gesture. Safe to call often. */
  unlock(): void;
  say(req: VoiceRequest, hooks?: VoiceHooks): void;
  /** Say the last line again. Returns it, or null if nothing has been said. */
  replay(hooks?: VoiceHooks): VoiceRequest | null;
  readonly lastLine: VoiceRequest | null;
  /** Stop the line loading or playing. `forget`: forget it as well, so Replay has nothing to say
   *  (back to the title: nothing from the quit game). */
  stopVoice(opts?: { forget?: boolean }): void;
  /** `speaker` has left: if the current line is theirs (still loading, or playing) it stops, so a
   *  late clip or browser-voice stand-in never starts. Anyone else's line plays on. */
  stopSpeaker(speaker: string): void;
  setPaused(p: boolean): void;
  readonly paused: boolean;
  /** Download clips ahead of time (not decoded until played). */
  prefetch(reqs: readonly VoiceRequest[]): void;
  volume(bus: Bus): number;
  setVolume(bus: Bus, v: number): void;
  voiceEnabled: boolean;
  readonly status: AudioStatus;
  readonly message: string;
  /** Called whenever status/message/volumes change. */
  onChange(cb: () => void): void;
  /** 0..1 loudness of the voice right now, for mouth movement. Call once per frame. */
  voiceLevel(): number;
  /** True while a line is audibly playing (clip or browser speech). */
  readonly speaking: boolean;
  /** True while a recorded clip is playing (voiceLevel() is meaningful). */
  readonly clipPlaying: boolean;
  /** True while the latest line's clip is still being fetched/decoded (nothing audible yet).
   *  The game holds that line's timer meanwhile so it never moves on before the line is heard. */
  readonly loading: boolean;
  readonly history: readonly PlayRecord[];
  readonly clipCount: number;
  /** Test evidence: voice sources playing now / at most at once (fading ones counted apart). */
  readonly voices: { live: number; fading: number; maxLive: number; maxAudible: number };
  /** Test evidence: what the context reports about the output path. */
  readonly outputInfo: {
    state: string;
    sampleRate: number;
    baseLatency: number;
    outputLatency: number;
    destinationChannels: number;
    sinkId: string;
  } | null;
}

const STORE = 'nwc.audio.v1';

/** Placeholder clips are development-only (docs/VOICE_ASSETS.md): production builds don't contain
 *  them, so don't even ask the server for them there. */
const shipped = (c: VoiceClip): boolean => import.meta.env.DEV || c.source.placeholder === false;
const NOT_SHIPPED = 'Recorded voices are development-only placeholders and are not in this build.';
const DECODED_CACHE = 16;
/** A clip still loading after this long (s, on the audio clock, which stops while paused) is given
 *  up and the browser voice says the line instead, as for a missing clip. The game holds a line
 *  for at most 6 s (boot.ts MAX_VOICE_HOLD) and then moves on; a clip landing a few seconds after
 *  that still plays, but past this a newer line (Gaz's nag) would drop it and the order would never
 *  be heard. */
export const LOAD_TIMEOUT = 12;
/** Which segment clips to ask the server for. Development: every one (placeholders from
 *  voice-cache/segments/, served by the dev server). Production: only release clips the committed
 *  segment manifest lists (data/voice/segments.manifest.json), the ones the build gate keeps; a line
 *  with any other segment goes to the browser voice whole. None are listed yet. */
const segmentServed = (id: string): boolean => import.meta.env.DEV || RELEASE_SEGMENTS.has(id);

interface Saved {
  voice: number;
  music: number;
  ambience: number;
  sfx: number;
  voiceOn: boolean;
}

/** Bus volumes a new player starts with. */
export const DEFAULT_VOLUMES: Readonly<Record<Bus, number>> = {
  voice: 1,
  music: 0.45,
  ambience: 0.7,
  sfx: 0.8,
};

const loadSaved = (read: boolean): Saved => {
  const d: Saved = { ...DEFAULT_VOLUMES, voiceOn: true };
  if (!read) return d;
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Saved>;
    const v = (x: unknown, f: number): number =>
      typeof x === 'number' && x >= 0 && x <= 1 ? x : f;
    return {
      voice: v(s.voice, d.voice),
      music: v(s.music, d.music),
      ambience: v(s.ambience, d.ambience),
      sfx: v(s.sfx, d.sfx),
      voiceOn: typeof s.voiceOn === 'boolean' ? s.voiceOn : true,
    };
  } catch {
    return d;
  }
};

/** `voiceOff`: start with voices off for this page only (the ?voice=0 test switch), without
 *  touching the player's saved setting. `persist: false`: start from the defaults and never save
 *  volumes (the dev listening lab, so tuning there doesn't change the player's game settings). */
export function createAudioManager(
  base: string,
  opts: { voiceOff?: boolean; persist?: boolean } = {},
): AudioManager {
  const persist = opts.persist !== false;
  const saved = loadSaved(persist);
  const vol: Record<Bus, number> = {
    voice: saved.voice,
    music: saved.music,
    ambience: saved.ambience,
    sfx: saved.sfx,
  };
  /** Music → duck → music volume. Ducking is separate from the player's volume. */
  let duck: GainNode | null = null;
  let duckTarget = 1;
  let currentListen = false;
  let voiceEnabled = saved.voiceOn && !opts.voiceOff;
  let voicePref = saved.voiceOn; // what gets saved
  let ctx: AudioContext | null = null;
  const bus: Partial<Record<Bus, GainNode>> = {};
  let analyser: AnalyserNode | null = null;
  let scope: Float32Array<ArrayBuffer> | null = null;
  let masterTap: AnalyserNode | null = null;
  let masterScope: Float32Array<ArrayBuffer> | null = null;
  let peakTap: AnalyserNode | null = null;
  let peakScope: Float32Array<ArrayBuffer> | null = null;
  // Voice sources started and not yet ended; `fading` = being faded out by a newer line.
  const live = new Set<AudioBufferSourceNode>();
  const fading = new Set<AudioBufferSourceNode>();
  let maxLive = 0;
  let maxAudible = 0;
  let status: AudioStatus = 'locked';
  let message = 'Click Start to turn on sound.';
  const listeners: Array<() => void> = [];
  const tts = createTts();

  const encoded = new Map<string, Promise<ArrayBuffer>>();
  /** Segment files that failed to load: a line needing one goes to the browser voice at once. */
  const missingSegments = new Set<string>();
  const decoded = new Map<string, AudioBuffer>(); // insertion order = LRU
  let source: AudioBufferSourceNode | null = null;
  let sourceGain: GainNode | null = null;
  let gen = 0;
  let paused = false;
  let lastLine: VoiceRequest | null = null;
  /** Generation whose clip is loading, or -1; the line and when it was asked for (audio clock). */
  let loadingGen = -1;
  let loadingReq: VoiceRequest | null = null;
  let loadingAt = 0;
  /** A browser-voice fallback that became due while paused: spoken on resume if still current. */
  let pendingTts: { req: VoiceRequest; why: string | null; my: number } | null = null;
  let current: PlayRecord | null = null;
  const history: PlayRecord[] = [];
  /** The current line's hooks, and whether its onStart has fired. A load timeout moves the line
   *  to a new generation (the browser voice); it is still the same line with the same hooks. */
  let hooks: VoiceHooks | null = null;
  let hooksStarted = false;

  const emit = (): void => {
    for (const l of listeners) l();
  };
  const setStatus = (s: AudioStatus, m: string): void => {
    if (s === status && m === message) return;
    status = s;
    message = m;
    emit();
  };
  const save = (): void => {
    if (!persist) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...vol, voiceOn: voicePref }));
    } catch {
      /* private mode: settings just won't persist */
    }
  };
  const okMessage = (): string =>
    VOICE_MANIFEST.clips.length
      ? `Voice on: ${VOICE_MANIFEST.clips.length} recorded lines (placeholder voices).`
      : 'Voice on (browser speech).';

  const init = (): void => {
    const C =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) {
      setStatus('error', 'This browser has no Web Audio. Subtitles only.');
      return;
    }
    ctx = new C({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.connect(ctx.destination);
    // Side tap after the master gain: proves signal reaches the node feeding the output device.
    masterTap = ctx.createAnalyser();
    masterTap.fftSize = 512;
    masterScope = new Float32Array(masterTap.fftSize);
    master.connect(masterTap);
    peakTap = ctx.createAnalyser();
    peakTap.fftSize = 2048;
    peakScope = new Float32Array(peakTap.fftSize);
    master.connect(peakTap);
    for (const b of ['voice', 'music', 'ambience', 'sfx'] as const) {
      const g = ctx.createGain();
      g.gain.value = b === 'voice' && !voiceEnabled ? 0 : vol[b];
      g.connect(master);
      bus[b] = g;
    }
    duck = ctx.createGain();
    duck.connect(bus.music as GainNode);
    // Voice → analyser → voice volume. The analyser sits before the volume so mouths still move
    // when the player turns voices down.
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    scope = new Float32Array(analyser.fftSize);
    analyser.connect(bus.voice as GainNode);
    ctx.onstatechange = () => checkRunning();
  };

  const checkRunning = (): void => {
    if (!ctx) return;
    if (ctx.state === 'running') {
      if (status === 'locked' || status === 'blocked')
        setStatus(voiceEnabled ? 'ok' : 'off', voiceEnabled ? okMessage() : 'Voice is off.');
    } else if (!paused && ctx.state === 'suspended' && status !== 'locked') {
      setStatus('blocked', 'The browser blocked sound. Click anywhere to turn it on.');
    }
  };

  const fetchClip = (file: string): Promise<ArrayBuffer> => {
    let p = encoded.get(file);
    if (!p) {
      p = fetch(base + file).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`);
        // The dev server answers a missing file with its HTML page, not a 404.
        if (r.headers.get('content-type')?.includes('text/html'))
          throw new Error(`no audio at ${file}`);
        return r.arrayBuffer();
      });
      p.catch(() => encoded.delete(file)); // allow a retry later
      encoded.set(file, p);
    }
    return p;
  };

  const bufferFor = async (file: string): Promise<AudioBuffer> => {
    const hit = decoded.get(file);
    if (hit) {
      decoded.delete(file);
      decoded.set(file, hit);
      return hit;
    }
    const bytes = await fetchClip(file);
    const c = ctx as AudioContext;
    // decodeAudioData detaches its input: hand it a copy so the cached bytes survive.
    const buf = await c.decodeAudioData(bytes.slice(0));
    decoded.set(file, buf);
    while (decoded.size > DECODED_CACHE) {
      const oldest = decoded.keys().next().value as string;
      decoded.delete(oldest);
    }
    return buf;
  };

  const stopSource = (): void => {
    if (source && sourceGain && ctx) {
      fading.add(source);
      const r = current;
      if (r && r.via === 'clip' && r.endedAt === null) r.interrupted = true;
      const t = ctx.currentTime;
      sourceGain.gain.cancelScheduledValues(t);
      sourceGain.gain.setValueAtTime(sourceGain.gain.value, t);
      sourceGain.gain.linearRampToValueAtTime(0, t + 0.06);
      try {
        source.stop(t + 0.07);
      } catch {
        /* already stopped */
      }
    }
    source = null;
    sourceGain = null;
  };

  const record = (r: PlayRecord): void => {
    history.push(r);
    if (history.length > 40) history.shift();
    current = r;
  };

  /** Generation `my` of the current line is audible (or never will be): tell the caller, once. */
  const started = (my: number): void => {
    if (my !== gen || hooksStarted) return;
    hooksStarted = true;
    hooks?.onStart?.();
  };
  /** The current line stops (a newer line, stopVoice): tell the caller, and forget its hooks. */
  const dropHooks = (): void => {
    const h = hooks;
    hooks = null;
    hooksStarted = false;
    h?.onStop?.();
  };

  const ttsStyle = (speaker: string): TtsStyle => {
    const p = VOICE_PROFILES[speaker];
    return p
      ? { ...p.tts, locale: p.locale, prefer: p.prefer }
      : { pitch: 0.85, rate: 1.05, female: false, locale: 'en-AU' };
  };

  const viaTts = (req: VoiceRequest, why: string | null, my: number): void => {
    const r: PlayRecord = {
      id: '',
      speaker: req.speaker,
      text: req.text,
      via: 'tts',
      file: '',
      manifestDuration: 0,
      bufferDuration: 0,
      startedAt: ctx?.currentTime ?? 0,
      endedAt: null,
      maxRms: 0,
      latencyMs: 0,
      error: why,
      maxMasterRms: 0,
      interrupted: false,
    };
    record(r);
    if (!tts.available) {
      setStatus(
        'error',
        `${why ?? 'No recording'}, and this browser has no speech. Subtitles only.`,
      );
      started(my);
      return;
    }
    if (why) setStatus('fallback', `${why} Using the browser voice for now.`);
    // Paused (e.g. a clip failed to load after the player paused): speak it on resume instead.
    if (paused) {
      pendingTts = { req, why, my };
      return;
    }
    speakTts(req, r, my);
  };

  const speakTts = (req: VoiceRequest, r: PlayRecord, my: number): void => {
    const style = ttsStyle(req.speaker);
    if (req.delivery === 'slow') style.rate *= 0.82;
    style.volume = voiceEnabled ? vol.voice : 0;
    tts.speak(
      req.text,
      style,
      (fail) => {
        if (my !== gen) return;
        started(my); // it won't be heard: the words show instead
        if (paused) return;
        r.error = fail;
        setStatus('error', `${fail} Subtitles only.`);
      },
      () => started(my),
    );
  };

  /** Line `my` waits for its clip(s) to load (given up after LOAD_TIMEOUT, in update()). */
  const startLoading = (req: VoiceRequest, my: number): void => {
    loadingGen = my;
    loadingReq = req;
    loadingAt = ctx?.currentTime ?? 0;
  };

  /** A generated line: its segment clips back to back, as one line (one record, one fade, one
   *  hold while loading). Every part is fetched and decoded before the first plays, so the line
   *  never stalls halfway; if any part is missing the WHOLE line goes to the browser voice. Each
   *  part starts when the one before ends, on the context's clock: pausing (which suspends the
   *  context) freezes the list, and a newer line or stopVoice drops the parts not yet played. */
  const saySegments = (req: VoiceRequest, ids: readonly string[], my: number): void => {
    const files = ids.map(segmentFile);
    if (!ctx || !ids.every(segmentServed) || files.some((f) => missingSegments.has(f))) {
      viaTts(req, ctx ? 'No recording for part of this line.' : null, my);
      return;
    }
    const asked = performance.now();
    startLoading(req, my);
    const load = (f: string): Promise<AudioBuffer> =>
      bufferFor(f).catch((e: unknown) => {
        missingSegments.add(f);
        throw e;
      });
    Promise.all(files.map(load)).then(
      (bufs) => {
        if (loadingGen === my) loadingGen = -1;
        if (my !== gen || !ctx) return;
        const c = ctx;
        const g = c.createGain();
        g.connect(analyser as AnalyserNode);
        const r: PlayRecord = {
          id: ids.join('+'),
          speaker: req.speaker,
          text: req.text,
          via: 'clip',
          file: files.join(' '),
          manifestDuration: 0,
          bufferDuration: bufs.reduce((t, b) => t + b.duration, 0),
          startedAt: c.currentTime,
          endedAt: null,
          maxRms: 0,
          latencyMs: Math.round(performance.now() - asked),
          error: null,
          maxMasterRms: 0,
          interrupted: false,
          segments: 0,
        };
        const part = (i: number): void => {
          const s = c.createBufferSource();
          s.buffer = bufs[i] as AudioBuffer;
          s.connect(g);
          s.onended = () => {
            live.delete(s);
            fading.delete(s);
            if (source !== s) return; // cut off: the rest of the list is dropped
            if (i + 1 < bufs.length) return part(i + 1);
            r.endedAt = c.currentTime;
            source = null;
            sourceGain = null;
          };
          s.start();
          source = s;
          sourceGain = g;
          live.add(s);
          maxLive = Math.max(maxLive, live.size);
          maxAudible = Math.max(maxAudible, live.size - fading.size);
          r.segments = i + 1;
          started(my);
        };
        record(r);
        part(0);
        if (status === 'fallback' || status === 'error') setStatus('ok', okMessage());
      },
      (e: unknown) => {
        if (loadingGen === my) loadingGen = -1;
        if (my !== gen) return;
        viaTts(req, `Couldn't load part of this line (${(e as Error).message}).`, my);
      },
    );
  };

  const m: AudioManager = {
    get context() {
      return ctx;
    },
    output(b) {
      if (b === 'music') return duck;
      return bus[b] ?? null;
    },
    update() {
      // A clip taking too long: the browser voice says its line now, under a new generation so
      // the clip is dropped when it does land (never said twice).
      if (ctx && loadingReq && loadingGen === gen && ctx.currentTime - loadingAt > LOAD_TIMEOUT) {
        const req = loadingReq;
        loadingGen = -1;
        loadingReq = null;
        viaTts(req, 'A voice clip is taking too long to load.', ++gen);
      }
      if (!ctx || !duck) return;
      const speaking = source !== null || tts.speaking;
      const want = duckLevel(speaking, currentListen);
      if (want === duckTarget) return;
      // Duck fast (an order mustn't be masked), come back slowly.
      duck.gain.setTargetAtTime(want, ctx.currentTime, want < duckTarget ? 0.05 : 0.4);
      duckTarget = want;
    },
    get musicDuck() {
      return duck?.gain.value ?? 1;
    },
    masterRms() {
      if (!masterTap || !masterScope) return 0;
      masterTap.getFloatTimeDomainData(masterScope);
      let m = 0;
      for (let i = 0; i < masterScope.length; i++) m += (masterScope[i] as number) ** 2;
      return Math.sqrt(m / masterScope.length);
    },
    masterPeak() {
      if (!peakTap || !peakScope) return 0;
      peakTap.getFloatTimeDomainData(peakScope);
      let m = 0;
      for (let i = 0; i < peakScope.length; i++) m = Math.max(m, Math.abs(peakScope[i] as number));
      return m;
    },
    unlock() {
      try {
        if (!ctx) {
          init();
          tts.unlock();
        }
        if (!ctx) return;
        if (ctx.state !== 'running' && !paused) {
          void ctx
            .resume()
            .then(checkRunning, () =>
              setStatus('blocked', 'The browser blocked sound. Click anywhere to turn it on.'),
            );
          // iOS: a sound started inside the gesture is what actually unlocks output.
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          s.connect(ctx.destination);
          s.start();
        }
        checkRunning();
      } catch (e) {
        setStatus('error', `Sound failed to start: ${(e as Error).message}`);
      }
    },
    say(req, h) {
      lastLine = req;
      currentListen = req.listen === true;
      const my = ++gen;
      pendingTts = null;
      stopSource();
      tts.stop();
      dropHooks();
      hooks = h ?? null;
      if (!voiceEnabled) {
        started(my); // voices off: the subtitle is the line
        return;
      }
      // Segments are rendered at normal pace only: a slow repeat is the browser voice, whole.
      if (req.segments?.length && req.delivery !== 'slow') {
        saySegments(req, req.segments, my);
        return;
      }
      const clip = clipFor(req.speaker, req.text, req.delivery);
      if (!clip || !ctx || !shipped(clip)) {
        viaTts(req, !clip ? 'No recording for this line.' : shipped(clip) ? null : NOT_SHIPPED, my);
        return;
      }
      const asked = performance.now();
      startLoading(req, my);
      bufferFor(clip.file).then(
        (buf) => {
          if (loadingGen === my) loadingGen = -1;
          if (my !== gen || !ctx) return;
          const g = ctx.createGain();
          g.gain.value = clip.playback.gain;
          const s = ctx.createBufferSource();
          s.buffer = buf;
          s.playbackRate.value = clip.playback.rate;
          s.connect(g).connect(analyser as AnalyserNode);
          const r: PlayRecord = {
            id: clip.dialogueId,
            speaker: req.speaker,
            text: req.text,
            via: 'clip',
            file: clip.file,
            manifestDuration: clip.duration,
            bufferDuration: buf.duration,
            startedAt: ctx.currentTime,
            endedAt: null,
            maxRms: 0,
            latencyMs: Math.round(performance.now() - asked),
            error: null,
            maxMasterRms: 0,
            interrupted: false,
          };
          s.onended = () => {
            r.endedAt = ctx?.currentTime ?? 0;
            live.delete(s);
            fading.delete(s);
            if (source === s) {
              source = null;
              sourceGain = null;
            }
          };
          s.start();
          source = s;
          sourceGain = g;
          live.add(s);
          maxLive = Math.max(maxLive, live.size);
          maxAudible = Math.max(maxAudible, live.size - fading.size);
          record(r);
          if (status === 'fallback' || status === 'error') setStatus('ok', okMessage());
          started(my);
        },
        (e: unknown) => {
          if (loadingGen === my) loadingGen = -1;
          if (my !== gen) return;
          viaTts(req, `Couldn't load a voice clip (${(e as Error).message}).`, my);
        },
      );
    },
    replay(h) {
      if (!lastLine) return null;
      const l = lastLine;
      m.say(l, h);
      return l;
    },
    get lastLine() {
      return lastLine;
    },
    stopVoice(opts) {
      gen++;
      loadingGen = -1;
      pendingTts = null;
      if (opts?.forget) lastLine = null;
      stopSource();
      tts.stop();
      dropHooks();
    },
    stopSpeaker(speaker) {
      if (lastLine?.speaker === speaker) m.stopVoice();
    },
    setPaused(p) {
      paused = p;
      if (p) {
        tts.pause();
        if (ctx && ctx.state === 'running') void ctx.suspend();
      } else {
        tts.resume();
        if (ctx && ctx.state !== 'running') void ctx.resume().then(checkRunning);
        const due = pendingTts;
        pendingTts = null;
        if (due && due.my === gen) {
          const r = history[history.length - 1];
          if (r && r.via === 'tts' && r.text === due.req.text) speakTts(due.req, r, due.my);
        }
      }
    },
    get paused() {
      return paused;
    },
    prefetch(reqs) {
      for (const q of reqs) {
        const c = clipFor(q.speaker, q.text, q.delivery);
        if (c && shipped(c)) fetchClip(c.file).catch(() => undefined);
      }
    },
    volume(b) {
      return vol[b];
    },
    setVolume(b, v) {
      vol[b] = Math.max(0, Math.min(1, v));
      // Browser speech takes its volume when a line starts; muting stops the current one.
      if (b === 'voice' && vol.voice === 0) tts.stop();
      const g = bus[b];
      if (g && ctx && !(b === 'voice' && !voiceEnabled))
        g.gain.setTargetAtTime(vol[b], ctx.currentTime, 0.03);
      save();
      emit();
    },
    get voiceEnabled() {
      return voiceEnabled;
    },
    set voiceEnabled(on: boolean) {
      voiceEnabled = on;
      voicePref = on;
      if (!on) m.stopVoice();
      const g = bus.voice;
      if (g && ctx) g.gain.setTargetAtTime(on ? vol.voice : 0, ctx.currentTime, 0.03);
      if (status !== 'locked' && status !== 'blocked')
        setStatus(on ? 'ok' : 'off', on ? okMessage() : 'Voice is off.');
      save();
      emit();
    },
    get status() {
      return status;
    },
    get message() {
      return message;
    },
    onChange(cb) {
      listeners.push(cb);
    },
    voiceLevel() {
      if (!analyser || !scope || !source) return 0;
      analyser.getFloatTimeDomainData(scope);
      let sum = 0;
      for (let i = 0; i < scope.length; i++) sum += (scope[i] as number) ** 2;
      const rms = Math.sqrt(sum / scope.length);
      if (current && current.via === 'clip' && rms > current.maxRms) current.maxRms = rms;
      if (masterTap && masterScope && current && current.via === 'clip') {
        masterTap.getFloatTimeDomainData(masterScope);
        let m = 0;
        for (let i = 0; i < masterScope.length; i++) m += (masterScope[i] as number) ** 2;
        const mr = Math.sqrt(m / masterScope.length);
        if (mr > current.maxMasterRms) current.maxMasterRms = mr;
      }
      return Math.min(1, rms * 5);
    },
    get speaking() {
      return source !== null || tts.speaking;
    },
    get clipPlaying() {
      return source !== null;
    },
    get loading() {
      return loadingGen >= 0 && loadingGen === gen;
    },
    get history() {
      return history;
    },
    get clipCount() {
      return VOICE_MANIFEST.clips.length;
    },
    get voices() {
      return { live: live.size, fading: fading.size, maxLive, maxAudible };
    },
    get outputInfo() {
      if (!ctx) return null;
      const sink = (ctx as AudioContext & { sinkId?: unknown }).sinkId;
      return {
        state: ctx.state,
        sampleRate: ctx.sampleRate,
        baseLatency: ctx.baseLatency ?? 0,
        outputLatency: ctx.outputLatency ?? 0,
        destinationChannels: ctx.destination.maxChannelCount,
        sinkId: typeof sink === 'string' ? sink : sink ? 'device' : '',
      };
    },
  };
  return m;
}
