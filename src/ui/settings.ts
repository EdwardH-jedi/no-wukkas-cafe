// Listening settings: difficulty, subtitle rule and learning mode. Per-viewer conveniences kept in
// localStorage (wrapped: private mode or blocked storage just means defaults).

import { DIFFICULTY, type Difficulty, type SubtitleMode } from '../sim/listening';

export interface ListenSettings {
  difficulty: Difficulty;
  /** 'auto' follows the difficulty (Easy: always, Normal: after two repeats, Hard: off);
   *  'always' is the accessibility setting. */
  subtitles: 'auto' | SubtitleMode;
  /** Show the transcript with the key words marked once an order is rung up. Off by default:
   *  the shift report's "Listen again" list is the learning loop. */
  learning: boolean;
}

const KEY = 'nwc.listen.v1';

export function loadListenSettings(): ListenSettings {
  const d: ListenSettings = { difficulty: 'normal', subtitles: 'auto', learning: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<ListenSettings>;
    return {
      difficulty: s.difficulty && s.difficulty in DIFFICULTY ? s.difficulty : d.difficulty,
      subtitles:
        s.subtitles === 'always' ||
        s.subtitles === 'afterRepeat' ||
        s.subtitles === 'off' ||
        s.subtitles === 'auto'
          ? s.subtitles
          : d.subtitles,
      learning: typeof s.learning === 'boolean' ? s.learning : d.learning,
    };
  } catch {
    return d;
  }
}

export function saveListenSettings(s: ListenSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* settings just won't persist */
  }
}

export function subtitleMode(s: ListenSettings): SubtitleMode {
  return s.subtitles === 'auto' ? DIFFICULTY[s.difficulty].subtitles : s.subtitles;
}
