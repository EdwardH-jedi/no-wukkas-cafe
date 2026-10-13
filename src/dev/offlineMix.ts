// Renders the café mix offline (OfflineAudioContext), for measuring in the listening lab: the
// game's own music synth and SFX on a copy of the manager's bus layout (voice / music → duck /
// ambience / sfx → master), with the manager's duck rule under a spoken line. Deterministic: the
// same spec renders the same samples, so measurements can be regression-tested.

import type { AudioManager, Bus } from '../audio/manager';
import { createMusic } from '../audio/music';
import { duckLevel, type MusicMood } from '../audio/musicPatterns';
import { createSfx } from '../audio/sfx';

export interface MixSpec {
  mood: MusicMood | null;
  seconds: number;
  volumes: Record<Bus, number>;
  /** Café crowd level for the ambience (0 empty, 1 normal, 1.7 packed); null = no SFX at all. */
  crowd: number | null;
  /** Every machine loop running at once (grinder, pump, steam, pour): an upper bound. */
  machine: boolean;
  /** A spoken line over the music, ducked as the manager would. */
  speech: { buffer: AudioBuffer; gain: number; at: number; listen: boolean } | null;
  sampleRate?: number;
}

/** The manager's duck time constants (audio/manager.ts update()): down fast, back up slowly. */
const DUCK_DOWN = 0.05;
const DUCK_UP = 0.4;

export async function renderMix(spec: MixSpec): Promise<AudioBuffer> {
  const rate = spec.sampleRate ?? 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(spec.seconds * rate), rate);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const bus = {} as Record<Bus, GainNode>;
  for (const b of ['voice', 'music', 'ambience', 'sfx'] as const) {
    bus[b] = ctx.createGain();
    bus[b].gain.value = spec.volumes[b];
    bus[b].connect(master);
  }
  const duck = ctx.createGain();
  duck.connect(bus.music);

  if (spec.mood) {
    const music = createMusic({ context: ctx, output: () => duck });
    music.setMood(spec.mood);
    music.renderAhead(spec.seconds);
  }

  if (spec.crowd !== null) {
    // createSfx only needs the context, the two outputs and unlock() from the manager.
    const host = {
      context: ctx,
      unlock: () => undefined,
      output: (b: 'sfx' | 'ambience' | 'music') =>
        b === 'sfx' ? bus.sfx : b === 'ambience' ? bus.ambience : null,
    } as unknown as AudioManager;
    const sfx = createSfx(host);
    sfx.unlock();
    sfx.setNoise(spec.crowd);
    if (spec.machine)
      sfx.update({ grind: 1, pump: 1, steam: 1, steamZone: 'whirl', pour: 1, pourHigh: 1 });
  }

  if (spec.speech) {
    const { buffer, gain, at, listen } = spec.speech;
    const g = ctx.createGain();
    g.gain.value = gain;
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(g).connect(bus.voice);
    s.start(at);
    duck.gain.setTargetAtTime(duckLevel(true, listen), at, DUCK_DOWN);
    duck.gain.setTargetAtTime(duckLevel(false, listen), at + buffer.duration, DUCK_UP);
  }
  return ctx.startRendering();
}

/** The channels of `buf` from `fromSeconds` on (skips fade-ins and settling). */
export function channelsFrom(buf: AudioBuffer, fromSeconds: number): Float32Array[] {
  const start = Math.min(buf.length, Math.round(fromSeconds * buf.sampleRate));
  return Array.from({ length: buf.numberOfChannels }, (_, i) =>
    buf.getChannelData(i).subarray(start),
  );
}

/** Fetch and decode a clip (no user gesture needed for an offline context). */
export async function decodeClip(url: string, rate = 48000): Promise<AudioBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return new OfflineAudioContext(1, 1, rate).decodeAudioData(await r.arrayBuffer());
}
