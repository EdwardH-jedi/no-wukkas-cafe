import { describe, expect, it } from 'vitest';
import type { LoudnessReport } from '../../src/audio/meter';
import { MIX_LIMITS, mixFindings, type MoodMeasure } from '../../src/audio/mixCheck';

const report = (over: Partial<LoudnessReport> = {}): LoudnessReport => ({
  lufs: -20,
  peakDb: -6,
  truePeakDb: -5.5,
  rmsDb: -22,
  crestDb: 16,
  dc: 0,
  clipped: 0,
  seconds: 30,
  ...over,
});
const opts = { musicVolume: 0.45, duckListen: 0.28, speechLufs: null };
const clean: MoodMeasure[] = [
  { mood: 'opening', music: report({ lufs: -21 }), worst: report({ peakDb: -2 }) },
  { mood: 'rush', music: report({ lufs: -19.5 }), worst: report({ peakDb: -1.5 }) },
  { mood: 'afternoon', music: report({ lufs: -20.5 }), worst: report({ peakDb: -2.5 }) },
];

describe('mixFindings', () => {
  it('clean moods give only information', () => {
    const f = mixFindings(clean, opts);
    expect(f.every((x) => x.level === 'info')).toBe(true);
    expect(f[0]?.message).toMatch(/Moods span 1\.5 LU/);
  });

  it('clipping is a defect, alone or in the worst-case mix', () => {
    const ms = structuredClone(clean);
    ms[1]!.music = report({ clipped: 12, peakDb: 0.4 });
    ms[2]!.worst = report({ clipped: 300, peakDb: 2.1 });
    const defects = mixFindings(ms, opts).filter((x) => x.level === 'defect');
    expect(defects.map((d) => d.mood)).toEqual(['rush', 'afternoon']);
    expect(defects[0]?.message).toMatch(/rush clips on its own/);
    expect(defects[1]?.message).toMatch(/every volume at 100%.*300 samples/);
  });

  it('warns on a hot true peak, a DC offset is a defect', () => {
    const ms = structuredClone(clean);
    ms[0]!.music = report({ truePeakDb: -0.5, dc: 0.01 });
    const f = mixFindings(ms, opts).filter((x) => x.mood === 'opening');
    expect(f.map((x) => x.level)).toEqual(['warning', 'defect']);
  });

  it('warns when the moods are far apart in loudness', () => {
    const ms = structuredClone(clean);
    ms[1]!.music.lufs = -14;
    const spread = mixFindings(ms, opts).find((x) => x.mood === null);
    expect(spread?.level).toBe('warning');
    expect(spread?.message).toMatch(/7\.0 LU.*volume jump/);
  });

  it('speech over the ducked music: info above the rule of thumb, warning below', () => {
    // Music -20 LUFS at 100% → at 45%, ducked to 0.28: -20 + 20·log10(0.126) = -38.0 LUFS.
    const one = [{ ...clean[0]!, music: report() }];
    const loud = mixFindings(one, { ...opts, speechLufs: -17 }).find((x) =>
      /Orders sit/.test(x.message),
    );
    expect(loud?.message).toMatch(/Orders sit 21\.0 LU/);
    expect(loud?.level).toBe('info');
    const quiet = mixFindings(one, {
      ...opts,
      speechLufs: -38 + MIX_LIMITS.speechOverMusicLu - 1,
    }).find((x) => /Orders sit/.test(x.message));
    expect(quiet?.level).toBe('warning');
  });
});
