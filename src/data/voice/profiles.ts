// Voice casting. Every speaker has an accent and a list of acceptable voices in preference order.
//
// PLACEHOLDER STATUS (2026-10-13): no licensed voice provider or credentials are configured, so the
// render script (scripts/voices.mjs) uses macOS system voices via `say`. Apple licenses those for
// personal, non-commercial use only: the rendered files are gitignored and must be replaced with
// licensed recordings before anything is distributed. See OVERNIGHT_REPORT.md.
//
// Accent comes from the voice itself (a native Indian-English, Mandarin or Korean voice reading
// standard English), never from misspelt text. Pace and pitch vary per person, not per accent.

export type Accent = 'australian' | 'indian' | 'korean' | 'chinese';

export interface VoiceProfile {
  speaker: string;
  accent: Accent;
  /** BCP-47 locale of the voice. */
  locale: string;
  /** macOS voice names, best first. The first one installed is used. */
  prefer: string[];
  /** Words per minute for `say`. */
  rate: number;
  /** Pitch/formant ratio applied after rendering (1 = none). Used to darken the only Australian
   *  system voice (female) for the male characters until a male voice is installed. */
  pitch: number;
  /** Apply `pitch` only when falling back to this voice. */
  pitchOnlyFor?: string;
  /** Web Speech fallback settings if the clip is missing. */
  tts: { pitch: number; rate: number; female: boolean };
}

const AU_MALE = [
  'Lee (Premium)',
  'Lee (Enhanced)',
  'Lee',
  'Gordon (Premium)',
  'Gordon (Enhanced)',
  'Gordon',
];

export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  gaz: {
    speaker: 'gaz',
    accent: 'australian',
    locale: 'en-AU',
    prefer: [...AU_MALE, 'Karen'],
    rate: 182,
    pitch: 0.88,
    pitchOnlyFor: 'Karen',
    tts: { pitch: 0.82, rate: 1.06, female: false },
  },
  dazza: {
    speaker: 'dazza',
    accent: 'australian',
    locale: 'en-AU',
    prefer: [
      'Gordon (Premium)',
      'Gordon (Enhanced)',
      'Gordon',
      'Lee (Premium)',
      'Lee (Enhanced)',
      'Lee',
      'Karen',
    ],
    rate: 205,
    pitch: 0.9,
    pitchOnlyFor: 'Karen',
    tts: { pitch: 0.7, rate: 1.12, female: false },
  },
  beryl: {
    speaker: 'beryl',
    accent: 'australian',
    locale: 'en-AU',
    prefer: ['Catherine (Premium)', 'Catherine (Enhanced)', 'Catherine', 'Karen'],
    rate: 150,
    pitch: 1,
    tts: { pitch: 1.25, rate: 0.82, female: true },
  },
  karen: {
    speaker: 'karen',
    accent: 'australian',
    locale: 'en-AU',
    prefer: ['Karen (Premium)', 'Karen (Enhanced)', 'Karen'],
    rate: 192,
    pitch: 1.03,
    tts: { pitch: 1.1, rate: 1.05, female: true },
  },
  priya: {
    speaker: 'priya',
    accent: 'indian',
    locale: 'en-IN',
    prefer: ['Isha (Premium)', 'Isha (Enhanced)', 'Isha', 'Tara', 'Sangeeta', 'Veena'],
    rate: 165,
    pitch: 1,
    tts: { pitch: 1.0, rate: 0.95, female: true },
  },
  jiwoo: {
    speaker: 'jiwoo',
    accent: 'korean',
    locale: 'ko-KR',
    prefer: ['Yuna (Premium)', 'Yuna (Enhanced)', 'Yuna'],
    rate: 172,
    pitch: 1,
    tts: { pitch: 1.2, rate: 1.1, female: true },
  },
  mei: {
    speaker: 'mei',
    accent: 'chinese',
    locale: 'zh-CN',
    prefer: ['Tingting (Premium)', 'Tingting (Enhanced)', 'Tingting', 'Lili'],
    rate: 178,
    pitch: 1,
    tts: { pitch: 1.05, rate: 1.0, female: true },
  },
};

export const voiceProfile = (speaker: string): VoiceProfile => {
  const p = VOICE_PROFILES[speaker];
  if (!p) throw new Error(`no voice profile for ${speaker}`);
  return p;
};
