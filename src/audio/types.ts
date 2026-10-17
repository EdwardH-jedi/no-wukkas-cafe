// The audio manager's public API and the records it keeps (split out of audio/manager.ts, which
// re-exports all of it). One AudioContext, a bus per kind of sound, voice lines as clips with the
// browser's speech as the fallback.

import type { Delivery } from '../data/voice/ids';

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
