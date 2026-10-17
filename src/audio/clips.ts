// Voice clip bytes and buffers (split out of audio/manager.ts): fetched once (a failed fetch may be
// retried), decoded on demand into a small LRU cache, and the rule for which clips a build may ask
// the server for at all.

import { clipFor, RELEASE_SEGMENTS } from '../data/voice';
import type { VoiceClip } from '../data/voice/manifest';
import type { VoiceRequest } from './types';

/** Placeholder clips are development-only (docs/VOICE_ASSETS.md): production builds don't contain
 *  them, so don't even ask the server for them there. */
export const shipped = (c: VoiceClip): boolean =>
  import.meta.env.DEV || c.source.placeholder === false;
export const NOT_SHIPPED =
  'Recorded voices are development-only placeholders and are not in this build.';
const DECODED_CACHE = 16;
/** Which segment clips to ask the server for. Development: every one (placeholders from
 *  voice-cache/segments/, served by the dev server). Production: only release clips the committed
 *  segment manifest lists (data/voice/segments.manifest.json), the ones the build gate keeps; a line
 *  with any other segment goes to the browser voice whole. None are listed yet. */
export const segmentServed = (id: string): boolean =>
  import.meta.env.DEV || RELEASE_SEGMENTS.has(id);

export interface ClipCache {
  fetchClip(file: string): Promise<ArrayBuffer>;
  /** The decoded clip (needs the context: call only once it exists). */
  bufferFor(file: string): Promise<AudioBuffer>;
  /** Download clips ahead of time (not decoded until played). */
  prefetch(reqs: readonly VoiceRequest[]): void;
  /** Segment files that failed to load: a line needing one goes to the browser voice at once. */
  readonly missingSegments: Set<string>;
}

export function createClipCache(base: string, context: () => AudioContext | null): ClipCache {
  const encoded = new Map<string, Promise<ArrayBuffer>>();
  const decoded = new Map<string, AudioBuffer>(); // insertion order = LRU
  const missingSegments = new Set<string>();

  const fetchClip = (file: string): Promise<ArrayBuffer> => {
    let p = encoded.get(file);
    if (!p) {
      p = fetch(base + file).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`);
        // The dev server answers a missing file with its HTML page, not a 404.
        if (r.headers.get('content-type')?.includes('text/html'))
          throw new Error(`no audio at ${file}`);
        return r.arrayBuffer();
      });
      p.catch(() => encoded.delete(file)); // allow a retry later
      encoded.set(file, p);
    }
    return p;
  };

  const bufferFor = async (file: string): Promise<AudioBuffer> => {
    const hit = decoded.get(file);
    if (hit) {
      decoded.delete(file);
      decoded.set(file, hit);
      return hit;
    }
    const bytes = await fetchClip(file);
    const c = context() as AudioContext;
    // decodeAudioData detaches its input: hand it a copy so the cached bytes survive.
    const buf = await c.decodeAudioData(bytes.slice(0));
    decoded.set(file, buf);
    while (decoded.size > DECODED_CACHE) {
      const oldest = decoded.keys().next().value as string;
      decoded.delete(oldest);
    }
    return buf;
  };

  return {
    fetchClip,
    bufferFor,
    prefetch(reqs) {
      for (const q of reqs) {
        const c = clipFor(q.speaker, q.text, q.delivery);
        if (c && shipped(c)) fetchClip(c.file).catch(() => undefined);
      }
    },
    missingSegments,
  };
}
