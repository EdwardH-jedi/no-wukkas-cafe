// Loudness and peak measurement on raw samples. Pure (Float32Arrays in, numbers out) so it runs in
// Vitest. Used by the dev listening lab and casting page (dev/*.html) on audio rendered offline or
// decoded from files. Not used in the game loop.
//
// Integrated loudness follows ITU-R BS.1770-4 / EBU R128: K-weighting (shelf + high-pass, the
// coefficients derived for any sample rate as libebur128 does), 400 ms blocks with 75% overlap,
// an absolute gate at -70 LUFS and a relative gate 10 LU below. True peak uses 4× oversampling
// with a windowed-sinc interpolator, close to the BS.1770 annex method.

/** Samples at or above this magnitude count as clipped (the output device would clip them). */
export const CLIP_LEVEL = 0.999;

export const dbfs = (x: number): number => (x > 0 ? 20 * Math.log10(x) : -Infinity);

export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** The two K-weighting stages for a sample rate. */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
  // Stage 1: high shelf, +4 dB above ~1.7 kHz (the head).
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sampleRate);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2: the "RLB" high-pass at ~38 Hz.
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / sampleRate);
  a0 = 1 + K / Q + K * K;
  const highPass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  return [shelf, highPass];
}

function filter(x: ArrayLike<number>, f: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i] as number;
    const yi = f.b0 * xi + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
    y[i] = yi;
  }
  return y;
}

const blockLoudness = (z: number): number => -0.691 + 10 * Math.log10(z);

/**
 * Integrated loudness in LUFS of one or two channels (L, R; both weighted 1). -Infinity for
 * silence or anything shorter than one 400 ms block.
 */
export function integratedLoudness(channels: readonly Float32Array[], sampleRate: number): number {
  const [s1, s2] = kWeighting(sampleRate);
  const weighted = channels.map((c) => filter(filter(c, s1), s2));
  const len = weighted[0]?.length ?? 0;
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  if (len < block) return -Infinity;
  // Running sums of squares per channel make each block O(1).
  const prefix = weighted.map((w) => {
    const p = new Float64Array(w.length + 1);
    for (let i = 0; i < w.length; i++) p[i + 1] = (p[i] as number) + (w[i] as number) ** 2;
    return p;
  });
  const z: number[] = [];
  for (let start = 0; start + block <= len; start += step) {
    let sum = 0;
    for (const p of prefix) sum += ((p[start + block] as number) - (p[start] as number)) / block;
    z.push(sum);
  }
  const gated = (zs: number[], gate: number): number[] =>
    zs.filter((x) => x > 0 && blockLoudness(x) > gate);
  const mean = (zs: number[]): number => zs.reduce((s, x) => s + x, 0) / zs.length;
  const abs = gated(z, -70);
  if (!abs.length) return -Infinity;
  const rel = gated(abs, blockLoudness(mean(abs)) - 10);
  return rel.length ? blockLoudness(mean(rel)) : -Infinity;
}

/** Largest |sample|. */
export function samplePeak(data: Float32Array): number {
  let m = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i] as number);
    if (a > m) m = a;
  }
  return m;
}

const OVERSAMPLE = 4;
const TAPS = 12;
/** Polyphase windowed-sinc interpolator: PHASES[p][k] weights sample i+k-5 for the point i+p/4. */
const PHASES: Float64Array[] = Array.from({ length: OVERSAMPLE }, (_, p) => {
  const h = new Float64Array(TAPS);
  for (let k = 0; k < TAPS; k++) {
    const t = k - (TAPS / 2 - 1) - p / OVERSAMPLE; // distance from the interpolated point
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    h[k] = sinc * 0.5 * (1 + Math.cos((Math.PI * t) / (TAPS / 2 + 1))); // Hann window
  }
  return h;
});

/** Estimated true peak (4× oversampled), linear. Never below the sample peak. */
export function truePeak(data: Float32Array): number {
  let m = samplePeak(data);
  const off = TAPS / 2 - 1;
  for (let i = 0; i < data.length; i++) {
    for (let p = 1; p < OVERSAMPLE; p++) {
      const h = PHASES[p] as Float64Array;
      let acc = 0;
      for (let k = 0; k < TAPS; k++) {
        const j = i + k - off;
        if (j >= 0 && j < data.length) acc += (data[j] as number) * (h[k] as number);
      }
      const a = Math.abs(acc);
      if (a > m) m = a;
    }
  }
  return m;
}

/** Samples at or above CLIP_LEVEL. */
export function clippedSamples(data: Float32Array, level = CLIP_LEVEL): number {
  let n = 0;
  for (let i = 0; i < data.length; i++) if (Math.abs(data[i] as number) >= level) n++;
  return n;
}

export function rms(data: Float32Array): number {
  if (!data.length) return 0;
  let s = 0;
  for (let i = 0; i < data.length; i++) s += (data[i] as number) ** 2;
  return Math.sqrt(s / data.length);
}

export function dcOffset(data: Float32Array): number {
  if (!data.length) return 0;
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] as number;
  return s / data.length;
}

/** Peak |sample| per bucket, for drawing a waveform. */
export function waveformPeaks(data: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(Math.max(0, buckets));
  if (!data.length || buckets <= 0) return out;
  const per = data.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * per);
    const to = Math.max(from + 1, Math.floor((b + 1) * per));
    let m = 0;
    for (let i = from; i < to && i < data.length; i++) {
      const a = Math.abs(data[i] as number);
      if (a > m) m = a;
    }
    out[b] = m;
  }
  return out;
}

export interface LoudnessReport {
  /** Integrated loudness, LUFS. */
  lufs: number;
  /** Sample peak, dBFS. */
  peakDb: number;
  /** True peak (4× oversampled), dBTP. */
  truePeakDb: number;
  /** RMS of all channels, dBFS. */
  rmsDb: number;
  /** Peak minus RMS, dB: low = squashed, high = very dynamic. */
  crestDb: number;
  /** Largest |mean| of any channel. */
  dc: number;
  clipped: number;
  seconds: number;
}

/** Everything the listening lab and casting page show about a piece of audio. */
export function analyse(channels: readonly Float32Array[], sampleRate: number): LoudnessReport {
  let peak = 0;
  let tp = 0;
  let sq = 0;
  let n = 0;
  let dc = 0;
  let clipped = 0;
  for (const c of channels) {
    peak = Math.max(peak, samplePeak(c));
    tp = Math.max(tp, truePeak(c));
    const r = rms(c);
    sq += r * r * c.length;
    n += c.length;
    dc = Math.max(dc, Math.abs(dcOffset(c)));
    clipped += clippedSamples(c);
  }
  const rmsAll = n ? Math.sqrt(sq / n) : 0;
  return {
    lufs: integratedLoudness(channels, sampleRate),
    peakDb: dbfs(peak),
    truePeakDb: dbfs(tp),
    rmsDb: dbfs(rmsAll),
    crestDb: dbfs(peak) - dbfs(rmsAll),
    dc,
    clipped,
    seconds: (channels[0]?.length ?? 0) / sampleRate,
  };
}
