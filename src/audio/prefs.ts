// The player's sound settings on this device: bus volumes and the voices switch (localStorage
// `nwc.audio.v1`). Split out of audio/manager.ts.

import type { Bus } from './types';

const STORE = 'nwc.audio.v1';

export interface AudioPrefs {
  voice: number;
  music: number;
  ambience: number;
  sfx: number;
  voiceOn: boolean;
}

/** Bus volumes a new player starts with. */
export const DEFAULT_VOLUMES: Readonly<Record<Bus, number>> = {
  voice: 1,
  music: 0.45,
  ambience: 0.7,
  sfx: 0.8,
};

/** The saved settings, or the defaults (`read` false, nothing saved, or storage blocked). */
export const loadAudioPrefs = (read: boolean): AudioPrefs => {
  const d: AudioPrefs = { ...DEFAULT_VOLUMES, voiceOn: true };
  if (!read) return d;
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<AudioPrefs>;
    const v = (x: unknown, f: number): number =>
      typeof x === 'number' && x >= 0 && x <= 1 ? x : f;
    return {
      voice: v(s.voice, d.voice),
      music: v(s.music, d.music),
      ambience: v(s.ambience, d.ambience),
      sfx: v(s.sfx, d.sfx),
      voiceOn: typeof s.voiceOn === 'boolean' ? s.voiceOn : true,
    };
  } catch {
    return d;
  }
};

export const saveAudioPrefs = (vol: Record<Bus, number>, voiceOn: boolean): void => {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...vol, voiceOn }));
  } catch {
    /* private mode: settings just won't persist */
  }
};
