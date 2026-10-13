// Objective checks on measured café audio (the dev listening lab renders the moods offline and
// passes the measurements here). Pure, so the thresholds are unit-tested. Only measurable faults
// are defects; taste stays with the people listening (docs/AUDIO_PROVENANCE.md, "Listening lab").

import type { LoudnessReport } from './meter';
import type { MusicMood } from './musicPatterns';

export interface MoodMeasure {
  mood: MusicMood;
  /** The music alone, music bus at 100% (the synth's own level and headroom). */
  music: LoudnessReport;
  /** Every bus at 100%, a packed café, the machine running and an order being spoken over the
   *  ducked music: the loudest the output gets in play. Null when not measured. */
  worst: LoudnessReport | null;
}

export interface MixFinding {
  /** defect: measurably wrong (clipping, DC); warning: worth fixing; info: context. */
  level: 'defect' | 'warning' | 'info';
  mood: MusicMood | null;
  message: string;
}

export const MIX_LIMITS = {
  /** True peak above this risks clipping after encoding or resampling (EBU R128 uses -1). */
  truePeakDb: -1,
  /** Moods further apart than this make a mood change sound like a volume jump. */
  moodSpreadLu: 3,
  /** A DC offset above this wastes headroom and thumps on start/stop. */
  dc: 0.001,
  /** An order the player must hear should sit at least this far above the ducked music
   *  (a common rule of thumb for dialogue over music, not a standard). */
  speechOverMusicLu: 10,
};

const f1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '−∞');

export function mixFindings(
  ms: readonly MoodMeasure[],
  opts: {
    /** Default music volume and the duck level under orders. */
    musicVolume: number;
    duckListen: number;
    /** Integrated loudness of order clips at full voice volume, LUFS (null if no clips). */
    speechLufs: number | null;
  },
): MixFinding[] {
  const out: MixFinding[] = [];
  for (const m of ms) {
    if (m.music.clipped > 0)
      out.push({
        level: 'defect',
        mood: m.mood,
        message: `${m.mood} clips on its own at 100% music: ${m.music.clipped} samples at full scale (peak ${f1(m.music.peakDb)} dBFS).`,
      });
    else if (m.music.truePeakDb > MIX_LIMITS.truePeakDb)
      out.push({
        level: 'warning',
        mood: m.mood,
        message: `${m.mood} true peak ${f1(m.music.truePeakDb)} dBTP at 100% music, above ${MIX_LIMITS.truePeakDb} dBTP.`,
      });
    if (m.music.dc > MIX_LIMITS.dc)
      out.push({
        level: 'defect',
        mood: m.mood,
        message: `${m.mood} has a DC offset of ${m.music.dc.toFixed(4)}.`,
      });
    if (m.worst && m.worst.clipped > 0)
      out.push({
        level: 'defect',
        mood: m.mood,
        message: `With every volume at 100%, ${m.mood} plus an order, the crowd and the machine clips the output: ${m.worst.clipped} samples at full scale (peak ${f1(m.worst.peakDb)} dBFS).`,
      });
  }
  const lufs = ms.map((m) => m.music.lufs).filter(Number.isFinite);
  if (lufs.length > 1) {
    const spread = Math.max(...lufs) - Math.min(...lufs);
    const loud = ms.reduce((a, b) => (b.music.lufs > a.music.lufs ? b : a));
    const quiet = ms.reduce((a, b) => (b.music.lufs < a.music.lufs ? b : a));
    const over = spread > MIX_LIMITS.moodSpreadLu;
    out.push({
      level: over ? 'warning' : 'info',
      mood: null,
      message: `Moods span ${f1(spread)} LU (${loud.mood} ${f1(loud.music.lufs)}, ${quiet.mood} ${f1(quiet.music.lufs)} LUFS at 100% music)${over ? `: more than ${MIX_LIMITS.moodSpreadLu} LU, so a mood change sounds like a volume jump` : ''}.`,
    });
  }
  if (opts.speechLufs !== null && Number.isFinite(opts.speechLufs))
    for (const m of ms) {
      const ducked = m.music.lufs + 20 * Math.log10(opts.musicVolume * opts.duckListen);
      const gap = opts.speechLufs - ducked;
      out.push({
        level: gap < MIX_LIMITS.speechOverMusicLu ? 'warning' : 'info',
        mood: m.mood,
        message: `Orders sit ${f1(gap)} LU above the ducked ${m.mood} music at default volumes (speech ${f1(opts.speechLufs)}, music ${f1(ducked)} LUFS).`,
      });
    }
  return out;
}
