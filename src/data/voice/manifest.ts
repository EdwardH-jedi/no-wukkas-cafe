// Types for src/data/voice/manifest.json (written by scripts/voices.ts) and lookups the game uses.

import type { Accent } from './profiles';
import type { Delivery } from './ids';

export interface VoiceClip {
  dialogueId: string;
  characterId: string;
  /** Engine:voice that produced the clip, e.g. "macos:Karen". */
  voiceId: string;
  accent: Accent;
  locale: string;
  /** First gameplay key this line was rendered for. */
  key: string;
  delivery: Delivery;
  transcript: string;
  /** Path under the site root (public/), e.g. "assets/voice/gaz/1a2b3c4d.mp3". */
  file: string;
  /** Seconds, measured from the encoded file. */
  duration: number;
  /** Mean loudness from ffmpeg volumedetect, dB. */
  meanDb: number;
  playback: { gain: number; rate: number };
  source: { engine: string; voice: string; rate: number; pitch: number; placeholder: boolean };
}

export interface VoiceManifest {
  version: 1;
  provider: string;
  clips: VoiceClip[];
}
