// One AudioContext for every sound: recorded voice lines, café SFX and room tone, each on its own
// bus with its own volume. Created and resumed inside the Start click (Chrome's autoplay policy and
// iOS Safari both need a user gesture) and suspended on pause, so audio freezes with the game clock.
//
// Voice lines are pre-rendered clips (see src/data/voice). Only one line plays at a time: a new line
// fades the old one out. When a clip is missing or fails to load, the line falls back to browser
// speech (audio/voice.ts) and the status says so instead of failing silently.
//
// This file puts the pieces together: the graph (audio/graph.ts), the clip cache (clips.ts), the
// voice lines, which alone start and cancel a voice (voiceLines.ts), the status and history
// (status.ts) and the saved settings (prefs.ts). It owns the context's lifecycle (unlock, pause,
// "blocked"), the music duck, the volumes and the voices switch.

import { VOICE_MANIFEST } from '../data/voice';
import { createClipCache } from './clips';
import { audioContextClass, createGraph, type AudioGraph } from './graph';
import { duckLevel } from './musicPatterns';
import { loadAudioPrefs, saveAudioPrefs } from './prefs';
import { createStatusBoard } from './status';
import type { AudioManager, Bus } from './types';
import { createVoiceLines } from './voiceLines';

export type { AudioManager, AudioStatus, Bus, PlayRecord, VoiceHooks, VoiceRequest } from './types';
export { DEFAULT_VOLUMES } from './prefs';
export { LOAD_TIMEOUT } from './voiceLines';

/** `voiceOff`: start with voices off for this page only (the ?voice=0 test switch), without
 *  touching the player's saved setting. `persist: false`: start from the defaults and never save
 *  volumes (the dev listening lab, so tuning there doesn't change the player's game settings). */
export function createAudioManager(
  base: string,
  opts: { voiceOff?: boolean; persist?: boolean } = {},
): AudioManager {
  const persist = opts.persist !== false;
  const saved = loadAudioPrefs(persist);
  const vol: Record<Bus, number> = {
    voice: saved.voice,
    music: saved.music,
    ambience: saved.ambience,
    sfx: saved.sfx,
  };
  let duckTarget = 1;
  let voiceEnabled = saved.voiceOn && !opts.voiceOff;
  let voicePref = saved.voiceOn; // what gets saved
  let graph: AudioGraph | null = null;
  let paused = false;
  const board = createStatusBoard();
  const clips = createClipCache(base, () => graph?.ctx ?? null);
  const okMessage = (): string =>
    VOICE_MANIFEST.clips.length
      ? `Voice on: ${VOICE_MANIFEST.clips.length} recorded lines (placeholder voices).`
      : 'Voice on (browser speech).';
  const voice = createVoiceLines({
    graph: () => graph,
    clips,
    board,
    okMessage,
    voiceOn: () => voiceEnabled,
    voiceVolume: () => vol.voice,
    paused: () => paused,
  });

  const save = (): void => {
    if (persist) saveAudioPrefs(vol, voicePref);
  };

  const checkRunning = (): void => {
    if (!graph) return;
    const { status } = board;
    if (graph.ctx.state === 'running') {
      if (status === 'locked' || status === 'blocked')
        board.set(voiceEnabled ? 'ok' : 'off', voiceEnabled ? okMessage() : 'Voice is off.');
    } else if (!paused && status !== 'locked') {
      // Suspended, or iOS Safari's "interrupted" (a call, Siri, another app's audio).
      board.set('blocked', 'The browser blocked sound. Click anywhere to turn it on.');
    }
  };

  const init = (): void => {
    const C = audioContextClass();
    if (!C) {
      board.set('error', 'This browser has no Web Audio. Subtitles only.');
      return;
    }
    graph = createGraph(C, vol, voiceEnabled);
    graph.ctx.onstatechange = () => checkRunning();
  };

  const m: AudioManager = {
    get context() {
      return graph?.ctx ?? null;
    },
    output(b) {
      if (!graph) return null;
      return b === 'music' ? graph.duck : graph.bus[b];
    },
    update() {
      voice.update();
      if (!graph) return;
      const want = duckLevel(voice.speaking, voice.listening);
      if (want === duckTarget) return;
      // Duck fast (an order mustn't be masked), come back slowly.
      graph.duck.gain.setTargetAtTime(want, graph.ctx.currentTime, want < duckTarget ? 0.05 : 0.4);
      duckTarget = want;
    },
    get musicDuck() {
      return graph?.duck.gain.value ?? 1;
    },
    masterRms() {
      return graph ? graph.masterRms() : 0;
    },
    masterPeak() {
      return graph ? graph.masterPeak() : 0;
    },
    unlock() {
      try {
        if (!graph) {
          init();
          voice.unlockSpeech();
        }
        if (!graph) return;
        const ctx = graph.ctx;
        if (ctx.state !== 'running' && !paused) {
          void ctx
            .resume()
            .then(checkRunning, () =>
              board.set('blocked', 'The browser blocked sound. Click anywhere to turn it on.'),
            );
          // iOS: a sound started inside the gesture is what actually unlocks output.
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          s.connect(ctx.destination);
          s.start();
        }
        checkRunning();
      } catch (e) {
        board.set('error', `Sound failed to start: ${(e as Error).message}`);
      }
    },
    say: voice.say,
    replay: voice.replay,
    get lastLine() {
      return voice.lastLine;
    },
    stopVoice: voice.stopVoice,
    stopSpeaker: voice.stopSpeaker,
    setPaused(p) {
      paused = p;
      const ctx = graph?.ctx ?? null;
      voice.setPaused(p, () => {
        if (p) {
          if (ctx && ctx.state === 'running') void ctx.suspend();
        } else if (ctx && ctx.state !== 'running') void ctx.resume().then(checkRunning);
      });
    },
    get paused() {
      return paused;
    },
    get interrupted() {
      return (
        graph !== null && !paused && board.status !== 'locked' && graph.ctx.state !== 'running'
      );
    },
    prefetch: clips.prefetch,
    volume(b) {
      return vol[b];
    },
    setVolume(b, v) {
      vol[b] = Math.max(0, Math.min(1, v));
      // Browser speech takes its volume when a line starts; muting stops the current one.
      if (b === 'voice' && vol.voice === 0) voice.silenceSpeech();
      if (graph && !(b === 'voice' && !voiceEnabled))
        graph.bus[b].gain.setTargetAtTime(vol[b], graph.ctx.currentTime, 0.03);
      save();
      board.emit();
    },
    get voiceEnabled() {
      return voiceEnabled;
    },
    set voiceEnabled(on: boolean) {
      voiceEnabled = on;
      voicePref = on;
      if (!on) voice.voicesOff();
      if (graph)
        graph.bus.voice.gain.setTargetAtTime(on ? vol.voice : 0, graph.ctx.currentTime, 0.03);
      if (board.status !== 'locked' && board.status !== 'blocked')
        board.set(on ? 'ok' : 'off', on ? okMessage() : 'Voice is off.');
      save();
      board.emit();
    },
    get status() {
      return board.status;
    },
    get message() {
      return board.message;
    },
    onChange: board.onChange,
    voiceLevel: voice.voiceLevel,
    get speaking() {
      return voice.speaking;
    },
    get clipPlaying() {
      return voice.clipPlaying;
    },
    get loading() {
      return voice.loading;
    },
    get history() {
      return board.history;
    },
    get clipCount() {
      return VOICE_MANIFEST.clips.length;
    },
    get voices() {
      return voice.voices;
    },
    get outputInfo() {
      return graph ? graph.outputInfo() : null;
    },
  };
  return m;
}
