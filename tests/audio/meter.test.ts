import { describe, expect, it } from 'vitest';
import {
  analyse,
  clippedSamples,
  dbfs,
  integratedLoudness,
  kWeighting,
  samplePeak,
  truePeak,
  waveformPeaks,
} from '../../src/audio/meter';

const sine = (freq: number, amp: number, seconds: number, rate = 48000, phase = 0) => {
  const d = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate + phase);
  return d;
};
const concat = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const amp = (db: number) => 10 ** (db / 20);

describe('K-weighting', () => {
  it('matches the BS.1770 reference coefficients at 48 kHz', () => {
    const [shelf, hp] = kWeighting(48000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 8);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 8);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 8);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 8);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 8);
    expect(hp.a1).toBeCloseTo(-1.99004745483398, 8);
    expect(hp.a2).toBeCloseTo(0.99007225036621, 8);
  });
});

describe('integratedLoudness (BS.1770 / EBU R128)', () => {
  it('a 0 dBFS 1 kHz sine in one channel reads -3.01 LUFS, at 48 and 44.1 kHz', () => {
    expect(integratedLoudness([sine(1000, 1, 5)], 48000)).toBeCloseTo(-3.01, 1);
    expect(integratedLoudness([sine(1000, 1, 5, 44100)], 44100)).toBeCloseTo(-3.01, 1);
  });

  it('EBU Tech 3341 case 1: a -23 dBFS 1 kHz sine in both channels reads -23 LUFS', () => {
    const s = sine(1000, amp(-23), 20);
    expect(integratedLoudness([s, s], 48000)).toBeCloseTo(-23, 1);
  });

  it('silence, and anything shorter than a 400 ms block, has no loudness', () => {
    expect(integratedLoudness([new Float32Array(48000 * 2)], 48000)).toBe(-Infinity);
    expect(integratedLoudness([sine(1000, 1, 0.3)], 48000)).toBe(-Infinity);
  });

  it('the absolute gate ignores silence; the relative gate ignores much quieter passages', () => {
    const tone = sine(1000, amp(-20), 5);
    const quiet = sine(1000, amp(-40), 5);
    const ref = integratedLoudness([tone], 48000);
    // The three blocks straddling the edge (75/50/25% tone) rightly pass both gates: of 50 gated
    // blocks the mean energy is (47 + 1.5) / 50 = 0.97 of the tone's, i.e. -0.13 dB.
    const withSilence = integratedLoudness([concat(tone, new Float32Array(48000 * 5))], 48000);
    expect(withSilence - ref).toBeCloseTo(10 * Math.log10(48.5 / 50), 2);
    expect(Math.abs(integratedLoudness([concat(tone, quiet)], 48000) - ref)).toBeLessThan(0.2);
  });
});

describe('peaks and clipping', () => {
  it('true peak finds the inter-sample peak a sample peak misses', () => {
    // A quarter-sample-rate sine sampled 45° off its crest: samples reach only 0.707 of it.
    const s = sine(12000, 0.9, 1, 48000, Math.PI / 4);
    expect(dbfs(samplePeak(s))).toBeCloseTo(dbfs(0.9 * Math.SQRT1_2), 1);
    expect(Math.abs(dbfs(truePeak(s)) - dbfs(0.9))).toBeLessThan(0.3);
  });

  it('true peak is never below the sample peak', () => {
    const s = sine(440, 0.5, 0.5);
    expect(truePeak(s)).toBeGreaterThanOrEqual(samplePeak(s));
  });

  it('counts clipped samples', () => {
    const s = new Float32Array([0, 0.5, 1, -1, 0.9995, -0.2, 1.3]);
    expect(clippedSamples(s)).toBe(4);
  });

  it('analyse reports a sine: crest 3 dB, no DC, no clipping', () => {
    const s = sine(1000, 0.5, 2);
    const r = analyse([s, s], 48000);
    expect(r.crestDb).toBeCloseTo(3.01, 1);
    expect(r.peakDb).toBeCloseTo(dbfs(0.5), 2);
    expect(r.clipped).toBe(0);
    expect(r.dc).toBeLessThan(1e-4);
    expect(r.seconds).toBe(2);
    const off = analyse([s.map((x) => x + 0.1)], 48000);
    expect(off.dc).toBeCloseTo(0.1, 3);
  });
});

describe('waveformPeaks', () => {
  it('keeps the loudest sample of each bucket', () => {
    const d = new Float32Array([0.1, -0.8, 0.2, 0.3, 0, -0.05]);
    expect([...waveformPeaks(d, 3)].map((x) => +x.toFixed(2))).toEqual([0.8, 0.3, 0.05]);
    expect(waveformPeaks(new Float32Array(0), 4)).toHaveLength(4);
  });
});
