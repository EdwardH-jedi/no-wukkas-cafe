// Shared contract for the week-1 lanes: how a spoken line points at audio, and where a clip came
// from. Manifest entries are the existing VoiceClip (data/voice/manifest.ts); provenance is derived
// from its `source` exactly the way the audio release gate reads it (scripts/audio-gate.ts).

import type { VoiceClip } from '../../data/voice/manifest';

export type VoiceRef =
  /** One recorded or rendered line, by dialogue id. */
  | { kind: 'clip'; id: string }
  /** Assembled from segments in order: greeting / order / modifiers / closer / change. */
  | { kind: 'segments'; ids: string[] };

export type Provenance = 'placeholder' | 'licensed_tts' | 'recorded';

/** Only these may ship (the build gate). */
export const SHIPPABLE_PROVENANCE: readonly Provenance[] = ['licensed_tts', 'recorded'];

export type VoiceManifestEntry = VoiceClip;

/** `source.engine` for a human recording (no TTS engine involved). */
export const RECORDED_ENGINE = 'recorded';

/** Placeholder unless the clip is marked non-placeholder AND names its licence. */
export function provenanceOf(clip: Pick<VoiceClip, 'source'>): Provenance {
  const s = clip.source;
  if (s.placeholder || !s.licence?.trim()) return 'placeholder';
  return s.engine === RECORDED_ENGINE ? 'recorded' : 'licensed_tts';
}

/** Every clip id a reference needs, in play order. */
export function voiceRefIds(ref: VoiceRef): string[] {
  return ref.kind === 'clip' ? [ref.id] : [...ref.ids];
}
