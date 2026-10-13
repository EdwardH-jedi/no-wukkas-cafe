// Café background music, as data: three original moods written in code (no recordings, no
// samples, nothing copied). Generic chord progressions and scale-based melodies chosen by a
// seeded RNG per bar, so a given bar always plays the same. Pure: the synth (audio/music.ts) turns
// these events into sound.

import { createRng } from '../core/rng';

export type MusicMood = 'opening' | 'rush' | 'afternoon';
export type Instrument = 'keys' | 'pluck' | 'bass' | 'lead' | 'kick' | 'snare' | 'hat' | 'brush';

export interface NoteEvent {
  /** Beats from the start of the bar. */
  at: number;
  /** Length in beats. */
  len: number;
  /** MIDI note (ignored by drums). */
  midi: number;
  inst: Instrument;
  /** 0..1 */
  vel: number;
}

interface Chord {
  root: number;
  /** Semitones above the root. */
  tones: readonly number[];
}

export interface MoodDef {
  bpm: number;
  /** 0 = straight eighths, 0.33 = swung. */
  swing: number;
  beatsPerBar: number;
  chords: readonly Chord[];
  /** Melody scale (semitones above the chord root's key). */
  scale: readonly number[];
  key: number;
  /** Mix per instrument (0..1). */
  mix: Partial<Record<Instrument, number>>;
}

// maj7 = [0,4,7,11], m7 = [0,3,7,10], dom7 = [0,4,7,10], m9 adds 14, 6/9 = [0,4,9,14]
export const MOODS: Record<MusicMood, MoodDef> = {
  // Before the doors open: indie acoustic / light jazz. Fingerpicked pluck, soft keys, brushes.
  opening: {
    bpm: 92,
    swing: 0.12,
    beatsPerBar: 4,
    key: 65, // F
    scale: [0, 2, 4, 7, 9],
    chords: [
      { root: 53, tones: [0, 4, 7, 11] }, // Fmaj7
      { root: 52, tones: [0, 3, 7, 10] }, // Em7
      { root: 50, tones: [0, 3, 7, 10] }, // Dm7
      { root: 48, tones: [0, 4, 7, 11] }, // Cmaj7
    ],
    mix: { pluck: 0.55, keys: 0.25, bass: 0.45, brush: 0.18 },
  },
  // The morning rush: upbeat Aussie indie / surf / funk. Tremolo surf lead, busy hats, syncopated bass.
  rush: {
    bpm: 118,
    swing: 0,
    beatsPerBar: 4,
    key: 64, // E
    scale: [0, 3, 5, 7, 10],
    chords: [
      { root: 52, tones: [0, 3, 7, 10] }, // Em7
      { root: 57, tones: [0, 4, 7, 10] }, // A7
      { root: 55, tones: [0, 4, 7] }, // G
      { root: 50, tones: [0, 4, 7, 10] }, // D7
    ],
    mix: { lead: 0.32, keys: 0.22, bass: 0.55, kick: 0.6, snare: 0.4, hat: 0.22 },
  },
  // After the rush: neo-soul / relaxed jazz. Lazy swing, extended Rhodes chords.
  afternoon: {
    bpm: 78,
    swing: 0.33,
    beatsPerBar: 4,
    key: 62, // D
    scale: [0, 2, 3, 5, 7, 9, 10],
    chords: [
      { root: 50, tones: [0, 3, 7, 10, 14] }, // Dm9
      { root: 55, tones: [0, 4, 7, 10, 14] }, // G9
      { root: 48, tones: [0, 4, 7, 11, 14] }, // Cmaj9
      { root: 57, tones: [0, 4, 7, 10, 13] }, // A7b9
    ],
    mix: { keys: 0.5, bass: 0.5, kick: 0.35, snare: 0.22, hat: 0.16, lead: 0.12 },
  },
};

const MOOD_SALT: Record<MusicMood, number> = { opening: 0x0b5e, rush: 0x5ea5, afternoon: 0xa7e2 };

/** Seconds per bar for a mood. */
export const barSeconds = (m: MusicMood): number => (60 / MOODS[m].bpm) * MOODS[m].beatsPerBar;

const swung = (beat: number, swing: number): number =>
  // Off-beat eighths land later by `swing` of an eighth.
  Math.abs(((beat * 2) % 2) - 1) < 1e-9 ? beat + swing * 0.5 : beat;

/** Every note in bar `bar` of `mood`. Deterministic: the same bar always plays the same. */
export function barEvents(mood: MusicMood, bar: number): NoteEvent[] {
  const d = MOODS[mood];
  const rng = createRng(((bar + 1) * 2654435761) ^ MOOD_SALT[mood]);
  const chord = d.chords[bar % d.chords.length] as Chord;
  const out: NoteEvent[] = [];
  const add = (at: number, len: number, midi: number, inst: Instrument, vel: number): void => {
    const mix = d.mix[inst];
    if (mix === undefined) return;
    out.push({ at: swung(at, d.swing), len, midi, inst, vel: vel * mix });
  };
  const chordNotes = chord.tones.map((t) => chord.root + 12 + t);

  if (mood === 'opening') {
    // Fingerpicking: bass note on 1 and 3, chord tones rolling on the eighths.
    for (let e = 0; e < 8; e++) {
      const tone =
        e % 4 === 0 ? chord.root + 12 : (chordNotes[(e + bar) % chordNotes.length] as number) + 12;
      add(e / 2, 0.9, tone, 'pluck', e % 2 === 0 ? 0.9 : 0.65);
    }
    add(0, 3.8, chord.root, 'bass', 0.8);
    for (const n of chordNotes.slice(1)) add(0, 3.6, n, 'keys', 0.55);
    for (let b = 0; b < 4; b++) add(b, 0.9, 0, 'brush', b % 2 === 1 ? 0.9 : 0.5);
    // An occasional melody phrase.
    if (bar % 2 === 1)
      for (let k = 0; k < 3; k++) {
        const deg = d.scale[Math.floor(rng.next() * d.scale.length)] as number;
        add(2 + k * 0.5, 0.45, d.key + 12 + deg, 'pluck', 0.7);
      }
  } else if (mood === 'rush') {
    // Four-on-the-floor-ish indie beat with funk offbeats.
    for (let b = 0; b < 4; b++) add(b, 0.25, 0, 'kick', b === 0 ? 1 : 0.8);
    add(1, 0.25, 0, 'snare', 0.9);
    add(3, 0.25, 0, 'snare', 0.95);
    for (let s = 0; s < 16; s++) add(s / 4, 0.1, 0, 'hat', s % 4 === 2 ? 0.9 : 0.45);
    // Syncopated bass: root, octave, fifth.
    const bassPat = [0, 0.75, 1.5, 2, 2.75, 3.5];
    for (const [i, at] of bassPat.entries()) {
      const iv = [0, 12, 7, 0, 12, 10][i] as number;
      add(at, 0.35, chord.root - 12 + iv, 'bass', i === 0 ? 1 : 0.75);
    }
    // Choppy keys on the offbeats.
    for (const at of [0.5, 1.5, 2.5, 3.5])
      for (const n of chordNotes.slice(0, 3)) add(at, 0.2, n, 'keys', 0.6);
    // Surf lead: a short riff every other bar.
    if (bar % 2 === 0)
      for (let k = 0; k < 6; k++) {
        const deg = d.scale[Math.floor(rng.next() * d.scale.length)] as number;
        add(k * 0.5, 0.4, d.key + deg, 'lead', 0.8);
      }
  } else {
    // Neo-soul: laid-back kick/snare, swung hats, long Rhodes chords, walking-ish bass.
    add(0, 0.3, 0, 'kick', 0.9);
    add(2.5, 0.3, 0, 'kick', 0.6);
    add(1, 0.3, 0, 'snare', 0.7);
    add(3, 0.3, 0, 'snare', 0.75);
    for (let e = 0; e < 8; e++) add(e / 2, 0.15, 0, 'hat', e % 2 === 0 ? 0.6 : 0.4);
    for (const n of chordNotes) add(0, 3.8, n, 'keys', 0.6);
    const walk = [0, 7, 10, 12];
    for (let b = 0; b < 4; b++)
      add(b, 0.9, chord.root - 12 + (walk[b] as number), 'bass', b === 0 ? 1 : 0.7);
    if (bar % 4 === 3)
      for (let k = 0; k < 4; k++) {
        const deg = d.scale[Math.floor(rng.next() * d.scale.length)] as number;
        add(1 + k * 0.75, 0.6, d.key + 12 + deg, 'lead', 0.6);
      }
  }
  return out.filter((n) => n.vel > 0);
}

/** Which mood fits where the player is. */
export function moodFor(mode: 'trial' | 'rush', phase: string): MusicMood {
  if (mode === 'rush')
    return phase === 'service' ? 'rush' : phase === 'intro' ? 'opening' : 'afternoon';
  return phase === 'verdict' ? 'afternoon' : 'opening';
}

/** Music level under speech: well down for orders and answers the player must hear, a little
 *  down for other talk, full otherwise. */
export function duckLevel(speaking: boolean, listen: boolean): number {
  if (!speaking) return 1;
  return listen ? 0.28 : 0.55;
}
