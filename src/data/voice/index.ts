// Voice clip lookups. The manifest is committed (text + measured durations), the audio files are
// rendered locally by `npm run voices`, so timing stays deterministic even where clips are missing.

import manifestJson from './manifest.json';
import segmentsJson from './segments.manifest.json';
import { dialogueId, type Delivery } from './ids';
import {
  releaseSegmentIds,
  type SegmentManifest,
  type VoiceClip,
  type VoiceManifest,
} from './manifest';

export const VOICE_MANIFEST = manifestJson as VoiceManifest;

/** The generated-order segment clips that ship (release audio only; none yet). The scripts read
 *  the JSON from disk instead of importing it here. */
export const SEGMENT_MANIFEST = segmentsJson as SegmentManifest;
/** Segment ids a production build may ask the server for (data/voice/manifest.ts). */
export const RELEASE_SEGMENTS: ReadonlySet<string> = releaseSegmentIds(SEGMENT_MANIFEST);

const byId = new Map<string, VoiceClip>(VOICE_MANIFEST.clips.map((c) => [c.dialogueId, c]));

export function clipFor(
  speaker: string,
  text: string,
  delivery: Delivery = 'normal',
): VoiceClip | null {
  return byId.get(dialogueId(speaker, text, delivery)) ?? null;
}

/** Breathing room after a clip before the next line starts, seconds. */
export const CLIP_TAIL = 0.35;

/** Reading time when there's no clip: same rule the subtitles always used. */
export function readingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.min(7, Math.max(1.8, 1.2 + words * 0.3));
}

/** How long a line holds the floor: the recording plus a beat, or reading time without one. */
export function spokenDuration(
  speaker: string,
  text: string,
  delivery: Delivery = 'normal',
): number {
  const c = clipFor(speaker, text, delivery);
  return c ? Math.max(1.2, c.duration + CLIP_TAIL) : readingTime(text);
}
