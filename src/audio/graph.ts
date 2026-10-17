// The audio graph (split out of audio/manager.ts): one AudioContext, a master gain with two side
// taps (an RMS meter and a peak meter: proof that signal reaches the node feeding the output
// device), a bus per kind of sound, the music duck and the voice analyser. Built inside the first
// user gesture (audio/manager.ts unlock()).

import type { Bus } from './types';

export interface OutputInfo {
  state: string;
  sampleRate: number;
  baseLatency: number;
  outputLatency: number;
  destinationChannels: number;
  sinkId: string;
}

export interface AudioGraph {
  readonly ctx: AudioContext;
  readonly bus: Readonly<Record<Bus, GainNode>>;
  /** Music → duck → music volume. Ducking is separate from the player's volume. */
  readonly duck: GainNode;
  /** Voice → analyser → voice volume (before the volume, so mouths still move turned down). */
  readonly analyser: AnalyserNode;
  /** RMS after the master gain right now. */
  masterRms(): number;
  /** Largest |sample| after the master gain over the last ~43 ms (2048 samples at 48 kHz). */
  masterPeak(): number;
  /** RMS of the voice right now, before its volume. */
  voiceRms(): number;
  outputInfo(): OutputInfo;
}

/** The browser's AudioContext (or Safari's prefixed one), if it has Web Audio at all. */
export const audioContextClass = (): typeof AudioContext | undefined =>
  window.AudioContext ??
  (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

const rms = (tap: AnalyserNode, scope: Float32Array<ArrayBuffer>): number => {
  tap.getFloatTimeDomainData(scope);
  let m = 0;
  for (let i = 0; i < scope.length; i++) m += (scope[i] as number) ** 2;
  return Math.sqrt(m / scope.length);
};

/** `vol`: each bus's starting volume; the voice bus starts silent when voices are off. */
export function createGraph(
  C: typeof AudioContext,
  vol: Readonly<Record<Bus, number>>,
  voiceOn: boolean,
): AudioGraph {
  const ctx = new C({ latencyHint: 'interactive' });
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const masterTap = ctx.createAnalyser();
  masterTap.fftSize = 512;
  const masterScope = new Float32Array(masterTap.fftSize);
  master.connect(masterTap);
  const peakTap = ctx.createAnalyser();
  peakTap.fftSize = 2048;
  const peakScope = new Float32Array(peakTap.fftSize);
  master.connect(peakTap);
  const bus: Partial<Record<Bus, GainNode>> = {};
  for (const b of ['voice', 'music', 'ambience', 'sfx'] as const) {
    const g = ctx.createGain();
    g.gain.value = b === 'voice' && !voiceOn ? 0 : vol[b];
    g.connect(master);
    bus[b] = g;
  }
  const buses = bus as Record<Bus, GainNode>;
  const duck = ctx.createGain();
  duck.connect(buses.music);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const scope = new Float32Array(analyser.fftSize);
  analyser.connect(buses.voice);

  return {
    ctx,
    bus: buses,
    duck,
    analyser,
    masterRms: () => rms(masterTap, masterScope),
    masterPeak() {
      peakTap.getFloatTimeDomainData(peakScope);
      let m = 0;
      for (let i = 0; i < peakScope.length; i++) m = Math.max(m, Math.abs(peakScope[i] as number));
      return m;
    },
    voiceRms: () => rms(analyser, scope),
    outputInfo() {
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
}
