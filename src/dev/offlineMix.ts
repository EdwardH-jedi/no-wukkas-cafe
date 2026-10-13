// Renders the café mix offline (OfflineAudioContext), for measuring in the listening lab: the
// game's own music synth and SFX on a copy of the manager's bus layout (voice / music → duck /
// ambience / sfx → master), with the manager's duck rule under a spoken line. Deterministic: the
// same spec renders the same samples, so measurements can be regression-tested.

import { DEFAULT_VOLUMES, type AudioManager, type Bus } from '../audio/manager';
import { analyse, integratedLoudness } from '../audio/meter';
import { mixFindings, type MixFinding, type MoodMeasure } from '../audio/mixCheck';
import { createMusic } from '../audio/music';
import { duckLevel, type MusicMood } from '../audio/musicPatterns';
import { createSfx } from '../audio/sfx';
import { clipFor } from '../data/voice';

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

export interface Measurement {
  at: string;
  measures: MoodMeasure[];
  speechLufs: number | null;
  speechClips: string[];
  findings: MixFinding[];
}

const ALL_FULL: Record<Bus, number> = { voice: 1, music: 1, ambience: 1, sfx: 1 };
const MUSIC_ONLY: Record<Bus, number> = { voice: 0, music: 1, ambience: 0, sfx: 0 };

/**
 * Measure every mood: alone at 100% music, and in the worst-case mix with the loudest of `lines`
 * (orders, as recorded clips) spoken over it. `onStatus` reports progress for the page.
 */
export async function measureMoods(
  moods: readonly MusicMood[],
  lines: ReadonlyArray<{ speaker: string; text: string; listen: boolean }>,
  onStatus: (msg: string) => void,
): Promise<Measurement> {
  // Order clips (placeholders in development): their loudness, and the loudest for the worst case.
  const speech: Array<{ id: string; buffer: AudioBuffer; gain: number; lufs: number }> = [];
  for (const l of lines.filter((x) => x.listen)) {
    const clip = clipFor(l.speaker, l.text);
    if (!clip) continue;
    try {
      const buffer = await decodeClip(import.meta.env.BASE_URL + clip.file);
      const lufs =
        integratedLoudness([buffer.getChannelData(0)], buffer.sampleRate) +
        20 * Math.log10(clip.playback.gain);
      speech.push({ id: clip.file, buffer, gain: clip.playback.gain, lufs });
    } catch {
      /* clip not rendered locally: measure without speech */
    }
  }
  const loudest = speech.reduce<(typeof speech)[number] | null>(
    (a, b) => (!a || b.lufs > a.lufs ? b : a),
    null,
  );
  const measures: MoodMeasure[] = [];
  for (const mood of moods) {
    onStatus(`Rendering ${mood}…`);
    const alone = await renderMix({
      mood,
      seconds: 28,
      volumes: MUSIC_ONLY,
      crowd: null,
      machine: false,
      speech: null,
    });
    const worst = await renderMix({
      mood,
      seconds: 16,
      volumes: ALL_FULL,
      crowd: 1.7,
      machine: true,
      speech: loudest ? { buffer: loudest.buffer, gain: loudest.gain, at: 4, listen: true } : null,
    });
    measures.push({
      mood,
      music: analyse(channelsFrom(alone, 4), alone.sampleRate),
      worst: analyse(channelsFrom(worst, 3), worst.sampleRate),
    });
  }
  // Energy average of the order clips' loudness.
  const speechLufs = speech.length
    ? 10 * Math.log10(speech.reduce((s, x) => s + 10 ** (x.lufs / 10), 0) / speech.length)
    : null;
  onStatus(
    speech.length
      ? `Done. Speech: ${speech.length} order clips (placeholder voices).`
      : 'Done. No order clips found locally (run npm run voices): speech checks skipped.',
  );
  return {
    at: new Date().toISOString(),
    measures,
    speechLufs,
    speechClips: speech.map((s) => s.id),
    findings: mixFindings(measures, {
      musicVolume: DEFAULT_VOLUMES.music,
      duckListen: duckLevel(true, true),
      speechLufs,
    }),
  };
}
