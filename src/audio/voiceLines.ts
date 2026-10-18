// The voice lines (split out of audio/manager.ts): the ONE place a line is started, held while its
// clip loads, handed to the browser voice, faded out or dropped. Every line gets a generation
// number; a newer line, stopVoice or the load timeout moves the generation on, and anything that
// lands for an older generation (a late clip, a speech callback) is ignored. Nothing else in audio/
// cancels a voice, so no two players can disagree about which line is current.

import { clipFor } from '../data/voice';
import { segmentFile } from '../data/voice/manifest';
import { VOICE_PROFILES } from '../data/voice/profiles';
import { NOT_SHIPPED, segmentServed, shipped, type ClipCache } from './clips';
import type { AudioGraph } from './graph';
import type { StatusBoard } from './status';
import type { PlayRecord, VoiceHooks, VoiceRequest } from './types';
import { createTts, type TtsStyle } from './voice';

/** A clip still loading after this long (s, on the audio clock, which stops while paused) is given
 *  up and the browser voice says the line instead, as for a missing clip. This is the ONE deadline
 *  for a loading line: the game holds that line (boot.ts, `input.voiceHold = audio.loading`) until
 *  the clip plays or this hands it to the browser voice, so no newer line can drop it unheard. */
export const LOAD_TIMEOUT = 12;

export interface VoiceDeps {
  /** The graph, once the first gesture built it. */
  graph(): AudioGraph | null;
  clips: ClipCache;
  board: StatusBoard;
  okMessage(): string;
  voiceOn(): boolean;
  voiceVolume(): number;
  paused(): boolean;
}

export interface VoiceLines {
  say(req: VoiceRequest, hooks?: VoiceHooks): void;
  replay(hooks?: VoiceHooks): VoiceRequest | null;
  readonly lastLine: VoiceRequest | null;
  stopVoice(opts?: { forget?: boolean }): void;
  stopSpeaker(speaker: string): void;
  /** Voices switched off mid-line: the sound stops, the line's words stay. */
  voicesOff(): void;
  /** Pause or resume speech; `context` suspends or resumes the AudioContext in between. */
  setPaused(p: boolean, context: () => void): void;
  /** The load timeout: call every frame. */
  update(): void;
  /** Stop browser speech only (the voice volume went to 0). */
  silenceSpeech(): void;
  /** Inside the first gesture: iOS only lets speech start after one. */
  unlockSpeech(): void;
  readonly speaking: boolean;
  readonly clipPlaying: boolean;
  readonly loading: boolean;
  /** The current line is an order or answer (the music ducks deeper). */
  readonly listening: boolean;
  readonly voices: { live: number; fading: number; maxLive: number; maxAudible: number };
  voiceLevel(): number;
}

export function createVoiceLines(deps: VoiceDeps): VoiceLines {
  const { clips, board } = deps;
  const tts = createTts();
  const ctxOf = (): AudioContext | null => deps.graph()?.ctx ?? null;
  // Voice sources started and not yet ended; `fading` = being faded out by a newer line.
  const live = new Set<AudioBufferSourceNode>();
  const fading = new Set<AudioBufferSourceNode>();
  let maxLive = 0;
  let maxAudible = 0;
  let currentListen = false;
  let source: AudioBufferSourceNode | null = null;
  let sourceGain: GainNode | null = null;
  let gen = 0;
  let lastLine: VoiceRequest | null = null;
  /** Generation whose clip is loading, or -1; the line and when it was asked for (audio clock). */
  let loadingGen = -1;
  let loadingReq: VoiceRequest | null = null;
  let loadingAt = 0;
  /** A browser-voice fallback that became due while paused: spoken on resume if still current. */
  let pendingTts: { req: VoiceRequest; why: string | null; my: number } | null = null;
  /** The current line's hooks, and whether its onStart has fired. A load timeout moves the line
   *  to a new generation (the browser voice); it is still the same line with the same hooks. */
  let hooks: VoiceHooks | null = null;
  let hooksStarted = false;
  /** Generation whose clip was started on a suspended context (paused, or the browser stopped
   *  audio), or -1: its first sample plays on resume, so its onStart waits for that (update()). */
  let startDue = -1;

  const stopSource = (): void => {
    const ctx = ctxOf();
    if (source && sourceGain && ctx) {
      fading.add(source);
      const r = board.current;
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

  /** Generation `my` of the current line is audible (or never will be): tell the caller, once. */
  const started = (my: number): void => {
    if (my !== gen || hooksStarted) return;
    hooksStarted = true;
    hooks?.onStart?.();
  };
  /** A clip of generation `my` was just started on `ctx`: audible now, or once the context runs. */
  const clipStarted = (ctx: BaseAudioContext, my: number): void => {
    if (ctx.state === 'running') started(my);
    else startDue = my;
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
      startedAt: ctxOf()?.currentTime ?? 0,
      endedAt: null,
      maxRms: 0,
      latencyMs: 0,
      error: why,
      maxMasterRms: 0,
      interrupted: false,
    };
    board.record(r);
    if (!tts.available) {
      board.set(
        'error',
        `${why ?? 'No recording'}, and this browser has no speech. Subtitles only.`,
      );
      started(my);
      return;
    }
    if (why) board.set('fallback', `${why} Using the browser voice for now.`);
    // Paused (e.g. a clip failed to load after the player paused): speak it on resume instead.
    if (deps.paused()) {
      pendingTts = { req, why, my };
      return;
    }
    speakTts(req, r, my);
  };

  const speakTts = (req: VoiceRequest, r: PlayRecord, my: number): void => {
    const style = ttsStyle(req.speaker);
    if (req.delivery === 'slow') style.rate *= 0.82;
    style.volume = deps.voiceOn() ? deps.voiceVolume() : 0;
    tts.speak(
      req.text,
      style,
      (fail) => {
        if (my !== gen) return;
        started(my); // it won't be heard: the words show instead
        if (deps.paused()) return;
        r.error = fail;
        board.set('error', `${fail} Subtitles only.`);
      },
      () => started(my),
    );
  };

  /** Line `my` waits for its clip(s) to load (given up after LOAD_TIMEOUT, in update()). */
  const startLoading = (req: VoiceRequest, my: number): void => {
    loadingGen = my;
    loadingReq = req;
    loadingAt = ctxOf()?.currentTime ?? 0;
  };

  /** A source starts as the current line's: counted, and the one a newer line fades out. */
  const begin = (s: AudioBufferSourceNode, g: GainNode): void => {
    s.start();
    source = s;
    sourceGain = g;
    live.add(s);
    maxLive = Math.max(maxLive, live.size);
    maxAudible = Math.max(maxAudible, live.size - fading.size);
  };

  /** A generated line: its segment clips back to back, as one line (one record, one fade, one
   *  hold while loading). Every part is fetched and decoded before the first plays, so the line
   *  never stalls halfway; if any part is missing the WHOLE line goes to the browser voice. Each
   *  part starts when the one before ends, on the context's clock: pausing (which suspends the
   *  context) freezes the list, and a newer line or stopVoice drops the parts not yet played. */
  const saySegments = (req: VoiceRequest, ids: readonly string[], my: number): void => {
    const files = ids.map(segmentFile);
    const ctx = ctxOf();
    if (!ctx || !ids.every(segmentServed) || files.some((f) => clips.missingSegments.has(f))) {
      viaTts(req, ctx ? 'No recording for part of this line.' : null, my);
      return;
    }
    const asked = performance.now();
    startLoading(req, my);
    const load = (f: string): Promise<AudioBuffer> =>
      clips.bufferFor(f).catch((e: unknown) => {
        clips.missingSegments.add(f);
        throw e;
      });
    Promise.all(files.map(load)).then(
      (bufs) => {
        if (loadingGen === my) loadingGen = -1;
        const graph = deps.graph();
        if (my !== gen || !graph) return;
        const c = graph.ctx;
        const g = c.createGain();
        g.connect(graph.analyser);
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
          begin(s, g);
          r.segments = i + 1;
          clipStarted(c, my);
        };
        board.record(r);
        part(0);
        if (board.status === 'fallback' || board.status === 'error')
          board.set('ok', deps.okMessage());
      },
      (e: unknown) => {
        if (loadingGen === my) loadingGen = -1;
        if (my !== gen) return;
        viaTts(req, `Couldn't load part of this line (${(e as Error).message}).`, my);
      },
    );
  };

  const say = (req: VoiceRequest, h?: VoiceHooks): void => {
    lastLine = req;
    currentListen = req.listen === true;
    const my = ++gen;
    pendingTts = null;
    stopSource();
    tts.stop();
    dropHooks();
    hooks = h ?? null;
    if (!deps.voiceOn()) {
      started(my); // voices off: the subtitle is the line
      return;
    }
    // Segments are rendered at normal pace only: a slow repeat is the browser voice, whole.
    if (req.segments?.length && req.delivery !== 'slow') {
      saySegments(req, req.segments, my);
      return;
    }
    const clip = clipFor(req.speaker, req.text, req.delivery);
    if (!clip || !ctxOf() || !shipped(clip)) {
      viaTts(req, !clip ? 'No recording for this line.' : shipped(clip) ? null : NOT_SHIPPED, my);
      return;
    }
    const asked = performance.now();
    startLoading(req, my);
    clips.bufferFor(clip.file).then(
      (buf) => {
        if (loadingGen === my) loadingGen = -1;
        const graph = deps.graph();
        if (my !== gen || !graph) return;
        const ctx = graph.ctx;
        const g = ctx.createGain();
        g.gain.value = clip.playback.gain;
        const s = ctx.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = clip.playback.rate;
        s.connect(g).connect(graph.analyser);
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
          r.endedAt = ctxOf()?.currentTime ?? 0;
          live.delete(s);
          fading.delete(s);
          if (source === s) {
            source = null;
            sourceGain = null;
          }
        };
        begin(s, g);
        board.record(r);
        if (board.status === 'fallback' || board.status === 'error')
          board.set('ok', deps.okMessage());
        clipStarted(ctx, my);
      },
      (e: unknown) => {
        if (loadingGen === my) loadingGen = -1;
        if (my !== gen) return;
        viaTts(req, `Couldn't load a voice clip (${(e as Error).message}).`, my);
      },
    );
  };

  const stopVoice = (opts?: { forget?: boolean }): void => {
    gen++;
    loadingGen = -1;
    pendingTts = null;
    if (opts?.forget) lastLine = null;
    stopSource();
    tts.stop();
    dropHooks();
  };

  return {
    say,
    replay(h) {
      if (!lastLine) return null;
      const l = lastLine;
      say(l, h);
      return l;
    },
    get lastLine() {
      return lastLine;
    },
    stopVoice,
    stopSpeaker(speaker) {
      if (lastLine?.speaker === speaker) stopVoice();
    },
    voicesOff() {
      // Its subtitle is not stopped (the words are all there is now), and one still loading
      // shows at once.
      const h = hooks;
      const shown = hooksStarted;
      hooks = null;
      stopVoice();
      hooks = h;
      hooksStarted = true;
      if (h && !shown) h.onStart?.();
    },
    setPaused(p, context) {
      if (p) {
        tts.pause();
        context();
        return;
      }
      tts.resume();
      context();
      const due = pendingTts;
      pendingTts = null;
      if (due && due.my === gen) {
        const r = board.history[board.history.length - 1];
        if (r && r.via === 'tts' && r.text === due.req.text) speakTts(due.req, r, due.my);
      }
    },
    update() {
      const ctx = ctxOf();
      // A clip started while the context was suspended is heard from now: its subtitle with it.
      // A newer line or stopVoice moved the generation on, and started() ignores the old one.
      if (startDue >= 0 && ctx?.state === 'running') {
        const my = startDue;
        startDue = -1;
        started(my);
      }
      // A clip taking too long: the browser voice says its line now, under a new generation so
      // the clip is dropped when it does land (never said twice).
      if (ctx && loadingReq && loadingGen === gen && ctx.currentTime - loadingAt > LOAD_TIMEOUT) {
        const req = loadingReq;
        loadingGen = -1;
        loadingReq = null;
        viaTts(req, 'A voice clip is taking too long to load.', ++gen);
      }
    },
    silenceSpeech: () => tts.stop(),
    unlockSpeech: () => tts.unlock(),
    get speaking() {
      return source !== null || tts.speaking;
    },
    get clipPlaying() {
      return source !== null;
    },
    get loading() {
      return loadingGen >= 0 && loadingGen === gen;
    },
    get listening() {
      return currentListen;
    },
    get voices() {
      return { live: live.size, fading: fading.size, maxLive, maxAudible };
    },
    voiceLevel() {
      const graph = deps.graph();
      if (!graph || !source) return 0;
      const rms = graph.voiceRms();
      const current = board.current;
      if (current && current.via === 'clip' && rms > current.maxRms) current.maxRms = rms;
      if (current && current.via === 'clip') {
        const mr = graph.masterRms();
        if (mr > current.maxMasterRms) current.maxMasterRms = mr;
      }
      return Math.min(1, rms * 5);
    },
  };
}
