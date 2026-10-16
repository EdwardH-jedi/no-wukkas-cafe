// Types for src/data/voice/manifest.json (written by scripts/voices.ts) and lookups the game uses.
//
// Placeholder vs release audio (docs/VOICE_ASSETS.md):
//  - placeholder clips (source.placeholder = true) are rendered locally for development, live in
//    the gitignored voice-cache/ folder, are served by the dev server only, and are stripped from
//    production builds;
//  - release clips (source.placeholder = false) must name their licence (source.licence) and their
//    provenance (source.provenance: licensed TTS or a recording), live in public/assets/voice/ and
//    ship with the game.

import type { Accent } from './profiles';
import type { Delivery } from './ids';

/** Where a clip's audio comes from. Only licensed TTS output and recordings may ship; a clip
 *  without a provenance is a placeholder (every development render). */
export type Provenance = 'placeholder' | 'licensed_tts' | 'recorded';
export const RELEASE_PROVENANCE: readonly Provenance[] = ['licensed_tts', 'recorded'];
/** Engines that only ever make development stand-ins, whatever a clip claims. */
export const PLACEHOLDER_ENGINES: readonly string[] = ['macos-say', 'fake-tts'];

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
  /** URL path under the site root, e.g. "assets/voice/gaz/1a2b3c4d.mp3". */
  file: string;
  /** Seconds, measured from the encoded file. */
  duration: number;
  /** Mean loudness from ffmpeg volumedetect, dB. */
  meanDb: number;
  playback: { gain: number; rate: number };
  source: {
    engine: string;
    voice: string;
    rate: number;
    pitch: number;
    /** Development stand-in: never distributed. */
    placeholder: boolean;
    /** The engine renders this voice bit-identically every time (probed). When false, a
     *  re-render can change the clip and its duration; the manifest follows the local files. */
    deterministic: boolean;
    /** Required for release clips: who holds the rights and under what terms. */
    licence?: string;
    /** Required for release clips (licensed_tts or recorded); absent means placeholder. */
    provenance?: Provenance;
  };
}

export interface VoiceManifest {
  version: 2;
  /** 'placeholder' while any clip is a placeholder; 'release' only when every clip may ship. */
  status: 'placeholder' | 'release';
  provider: string;
  licence: string;
  clips: VoiceClip[];
}

/** Where placeholder clips live locally (gitignored, dev-server only). */
export const VOICE_CACHE_DIR = 'voice-cache';
/** Where release clips live (bundled into builds). */
export const VOICE_RELEASE_DIR = 'public/assets/voice';
/** URL prefix of every clip's `file`. */
export const VOICE_URL_PREFIX = 'assets/voice/';

/** Where a generated-order segment's clip is served (data/voice/segments.ts): one file per segment
 *  id under its speaker. Placeholder segment clips are rendered by `npm run voices -- --segments`
 *  into voice-cache/segments/ (dev server only, never built or committed). */
export const segmentFile = (id: string): string =>
  `${VOICE_URL_PREFIX}segments/${id.split('.')[0] ?? ''}/${id}.mp3`;
