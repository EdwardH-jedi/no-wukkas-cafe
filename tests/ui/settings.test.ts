import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadListenSettings,
  POUR_SENSITIVITY,
  pourSensitivityLabel,
  roundPourSensitivity,
  saveListenSettings,
} from '../../src/ui/settings';

const KEY = 'nwc.listen.v1';

describe('listening settings (localStorage)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults: Normal, subtitles by difficulty, learning mode off, pour sensitivity 1', () => {
    expect(loadListenSettings()).toEqual({
      version: 2,
      difficulty: 'normal',
      subtitles: 'auto',
      learning: false,
      pourSensitivity: 1,
    });
  });

  it('a v1 blob (saved before learning mode went off by default) is replaced by the defaults', () => {
    store.set(KEY, JSON.stringify({ difficulty: 'hard', subtitles: 'always', learning: true }));
    const s = loadListenSettings();
    expect(s.learning).toBe(false);
    expect(s.version).toBe(2);
    expect(s).toEqual({
      version: 2,
      difficulty: 'normal',
      subtitles: 'auto',
      learning: false,
      pourSensitivity: 1,
    });
  });

  it('a v2 blob round-trips', () => {
    saveListenSettings({
      version: 2,
      difficulty: 'easy',
      subtitles: 'always',
      learning: true,
      pourSensitivity: 1.4,
    });
    expect(loadListenSettings()).toEqual({
      version: 2,
      difficulty: 'easy',
      subtitles: 'always',
      learning: true,
      pourSensitivity: 1.4,
    });
  });

  it('a v2 blob from before pour sensitivity keeps its settings and gets the default', () => {
    store.set(
      KEY,
      JSON.stringify({ version: 2, difficulty: 'hard', subtitles: 'off', learning: true }),
    );
    expect(loadListenSettings()).toEqual({
      version: 2,
      difficulty: 'hard',
      subtitles: 'off',
      learning: true,
      pourSensitivity: POUR_SENSITIVITY.default,
    });
  });

  it('pour sensitivity is clamped to the slider range; junk gives the default', () => {
    const load = (v: unknown): number => {
      store.set(KEY, JSON.stringify({ version: 2, pourSensitivity: v }));
      return loadListenSettings().pourSensitivity;
    };
    expect(load(9)).toBe(POUR_SENSITIVITY.max);
    expect(load(0.1)).toBe(POUR_SENSITIVITY.min);
    expect(load(0.8)).toBe(0.8);
    expect(load('fast')).toBe(POUR_SENSITIVITY.default);
    expect(load(null)).toBe(POUR_SENSITIVITY.default);
  });

  it('garbage or blocked storage just gives the defaults', () => {
    store.set(KEY, '{nope');
    expect(loadListenSettings().learning).toBe(false);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadListenSettings().difficulty).toBe('normal');
  });
});

describe('pour sensitivity slider', () => {
  it('snaps slider values to the range and its 0.1 steps', () => {
    expect(roundPourSensitivity(0.7999999)).toBe(0.8);
    expect(roundPourSensitivity(1.35)).toBe(1.4);
    expect(roundPourSensitivity(1)).toBe(1);
    expect(roundPourSensitivity(0.2)).toBe(POUR_SENSITIVITY.min);
    expect(roundPourSensitivity(7)).toBe(POUR_SENSITIVITY.max);
    expect(roundPourSensitivity(Number.NaN)).toBe(POUR_SENSITIVITY.default);
  });

  it('every step from 0.5 to 2 is a clean one-decimal number', () => {
    for (let i = 5; i <= 20; i++) expect(roundPourSensitivity(i * 0.1)).toBe(i / 10);
  });

  it('reads as a multiplier with one decimal', () => {
    expect(pourSensitivityLabel(1)).toBe('1.0×');
    expect(pourSensitivityLabel(0.5)).toBe('0.5×');
    expect(pourSensitivityLabel(1.96)).toBe('2.0×');
  });
});
