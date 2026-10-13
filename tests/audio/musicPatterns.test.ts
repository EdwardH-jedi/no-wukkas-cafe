import { describe, expect, it } from 'vitest';
import {
  barEvents,
  barSeconds,
  duckLevel,
  moodFor,
  MOODS,
  type Instrument,
  type MusicMood,
} from '../../src/audio/musicPatterns';

const moods: MusicMood[] = ['opening', 'rush', 'afternoon'];
const instruments = (m: MusicMood): Set<Instrument> => {
  const s = new Set<Instrument>();
  for (let b = 0; b < 8; b++) for (const n of barEvents(m, b)) s.add(n.inst);
  return s;
};

describe('café music moods', () => {
  it('each mood has its own tempo and feel', () => {
    expect(MOODS.opening.bpm).toBeGreaterThanOrEqual(85);
    expect(MOODS.opening.bpm).toBeLessThanOrEqual(100);
    expect(MOODS.rush.bpm).toBeGreaterThanOrEqual(110);
    expect(MOODS.afternoon.bpm).toBeLessThanOrEqual(85);
    expect(MOODS.afternoon.swing).toBeGreaterThan(MOODS.rush.swing);
    expect(barSeconds('afternoon')).toBeGreaterThan(barSeconds('rush'));
  });

  it('opening is acoustic (pluck, brushes, no kit); rush has a kit and a surf lead; afternoon is keys and swing', () => {
    const o = instruments('opening');
    expect(o.has('pluck') && o.has('brush')).toBe(true);
    expect(o.has('kick')).toBe(false);
    const r = instruments('rush');
    for (const i of ['kick', 'snare', 'hat', 'lead', 'bass'] as const)
      expect(r.has(i), i).toBe(true);
    const a = instruments('afternoon');
    expect(a.has('keys') && a.has('bass')).toBe(true);
    expect(a.has('pluck')).toBe(false);
  });

  it('a bar always plays the same notes, and the notes are well-formed', () => {
    for (const m of moods)
      for (let b = 0; b < 16; b++) {
        const e = barEvents(m, b);
        expect(e).toEqual(barEvents(m, b));
        expect(e.length).toBeGreaterThan(0);
        for (const n of e) {
          expect(n.at).toBeGreaterThanOrEqual(0);
          expect(n.at).toBeLessThan(MOODS[m].beatsPerBar);
          expect(n.len).toBeGreaterThan(0);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          if (!['kick', 'snare', 'hat', 'brush'].includes(n.inst)) {
            expect(n.midi).toBeGreaterThanOrEqual(24);
            expect(n.midi).toBeLessThanOrEqual(96);
          }
        }
      }
  });

  it('melodies vary from phrase to phrase', () => {
    const lead = (b: number): string =>
      JSON.stringify(
        barEvents('rush', b)
          .filter((n) => n.inst === 'lead')
          .map((n) => n.midi),
      );
    expect(new Set([0, 2, 4, 6, 8, 10].map(lead)).size).toBeGreaterThan(1);
  });
});

describe('where each mood plays', () => {
  it('opening before service, rush during it, afternoon after', () => {
    expect(moodFor('trial', 'title')).toBe('opening');
    expect(moodFor('trial', 'pour')).toBe('opening');
    expect(moodFor('trial', 'verdict')).toBe('afternoon');
    expect(moodFor('rush', 'intro')).toBe('opening');
    expect(moodFor('rush', 'service')).toBe('rush');
    expect(moodFor('rush', 'wrapup')).toBe('afternoon');
    expect(moodFor('rush', 'summary')).toBe('afternoon');
  });
});

describe('ducking under speech', () => {
  it('full when quiet, down under talk, further down under orders and answers', () => {
    expect(duckLevel(false, false)).toBe(1);
    expect(duckLevel(false, true)).toBe(1);
    expect(duckLevel(true, false)).toBeLessThan(1);
    expect(duckLevel(true, true)).toBeLessThan(duckLevel(true, false));
    expect(duckLevel(true, true)).toBeLessThanOrEqual(0.3);
  });
});
