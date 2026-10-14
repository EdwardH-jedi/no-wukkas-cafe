import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadListenSettings, saveListenSettings } from '../../src/ui/settings';

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

  it('defaults: Normal, subtitles by difficulty, learning mode off', () => {
    expect(loadListenSettings()).toEqual({
      version: 2,
      difficulty: 'normal',
      subtitles: 'auto',
      learning: false,
    });
  });

  it('a v1 blob (saved before learning mode went off by default) is replaced by the defaults', () => {
    store.set(KEY, JSON.stringify({ difficulty: 'hard', subtitles: 'always', learning: true }));
    const s = loadListenSettings();
    expect(s.learning).toBe(false);
    expect(s.version).toBe(2);
    expect(s).toEqual({ version: 2, difficulty: 'normal', subtitles: 'auto', learning: false });
  });

  it('a v2 blob round-trips', () => {
    saveListenSettings({ version: 2, difficulty: 'easy', subtitles: 'always', learning: true });
    expect(loadListenSettings()).toEqual({
      version: 2,
      difficulty: 'easy',
      subtitles: 'always',
      learning: true,
    });
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
