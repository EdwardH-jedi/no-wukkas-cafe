// The segment manifest (src/data/voice/segments.manifest.json): the generated-order segment clips
// that ship. Release audio only; empty until the paid render and the actors' recordings land.

import { describe, expect, it } from 'vitest';
import { RELEASE_SEGMENTS, SEGMENT_MANIFEST } from '../../src/data/voice';
import {
  releaseSegmentIds,
  segmentFile,
  type SegmentClip,
  type SegmentManifest,
} from '../../src/data/voice/manifest';
import { VOICE_PROFILES } from '../../src/data/voice/profiles';
import { SEGMENT_INVENTORY } from '../../src/data/voice/segments';
import type { IssueCode } from '../../src/data/voice/validate';
import { validateSegmentManifest } from '../../src/data/voice/validateSegments';

const opts = { inventory: SEGMENT_INVENTORY, profiles: VOICE_PROFILES };
const dazza = SEGMENT_INVENTORY.dazza;
const greet = dazza[0]!; // "Morning, mate. " (segments keep their joining spaces)
const hot = dazza.find((s) => s.id === 'dazza.hot.1')!;

/** A licensed TTS clip of a segment, as `voices:render -- --promote` writes it. */
const clip = (id: string, text: string, over: Partial<SegmentClip> = {}): SegmentClip => ({
  id,
  characterId: id.split('.')[0]!,
  voiceId: 'google-tts:en-AU-Chirp3-HD-Fenrir',
  transcript: text.trim(),
  file: segmentFile(id),
  duration: 0.8,
  meanDb: -20,
  source: {
    engine: 'google-tts',
    voice: 'en-AU-Chirp3-HD-Fenrir',
    rate: 1.1,
    pitch: 1,
    placeholder: false,
    deterministic: false,
    licence: 'Google Cloud TTS terms',
    provenance: 'licensed_tts',
  },
  ...over,
});
const good = (): SegmentManifest => ({
  version: 1,
  clips: [clip(greet.id, greet.text), clip(hot.id, hot.text)],
});
const codes = (m: SegmentManifest): IssueCode[] =>
  validateSegmentManifest(m, opts).map((i) => i.code);
const withSource = (over: Partial<SegmentClip['source']>): SegmentManifest => {
  const m = good();
  m.clips[0] = { ...m.clips[0]!, source: { ...m.clips[0]!.source, ...over } };
  return m;
};

describe('the committed segment manifest', () => {
  it('is valid, and lists only release audio (no segment clip ships yet)', () => {
    expect(SEGMENT_MANIFEST.version).toBe(1);
    expect(validateSegmentManifest(SEGMENT_MANIFEST, opts)).toEqual([]);
    expect(RELEASE_SEGMENTS.size).toBe(SEGMENT_MANIFEST.clips.length);
  });
});

describe('segment manifest validator', () => {
  it('accepts licensed TTS and recorded segment clips with their trimmed words', () => {
    expect(greet.text).not.toBe(greet.text.trim());
    const m = good();
    m.clips.push(
      clip('jiwoo.greet.1', SEGMENT_INVENTORY.jiwoo[0]!.text, {
        voiceId: 'recording:Actor B',
        source: {
          ...m.clips[0]!.source,
          engine: 'recording',
          voice: 'Actor B',
          rate: 1,
          licence: 'Buyout, signed 2026-11-01',
          provenance: 'recorded',
        },
      }),
    );
    expect(validateSegmentManifest(m, opts)).toEqual([]);
  });

  it('catches segments the game no longer says, or says differently', () => {
    const m = good();
    m.clips[0] = clip('dazza.greet.99', 'Hello there.');
    m.clips[1] = { ...m.clips[1]!, transcript: 'extra hot, please' };
    expect(codes(m)).toEqual(['unknown-segment', 'segment-text']);
  });

  it('catches the wrong file, speaker, duplicates and silent or empty clips', () => {
    const m = good();
    m.clips[0] = { ...m.clips[0]!, file: 'assets/voice/dazza/x.mp3' };
    m.clips[1] = { ...m.clips[1]!, characterId: 'karen', duration: 0.01, meanDb: -60 };
    m.clips.push({ ...m.clips[1]!, characterId: 'dazza', duration: 0.8, meanDb: -20 });
    expect(codes(m)).toEqual([
      'file-mismatch',
      'id-mismatch',
      'duration',
      'quiet',
      'duplicate-id',
      'duplicate-file',
      'shared-voice', // Dazza's voice, now also "karen"'s
    ]);
  });

  it('lists only release audio: placeholders, stand-ins, no licence or no provenance fail', () => {
    expect(codes(withSource({ placeholder: true }))).toEqual(['placeholder-in-release']);
    expect(codes(withSource({ engine: 'macos-say' }))).toEqual(['placeholder-flag']);
    expect(codes(withSource({ engine: 'fake-tts', provenance: 'placeholder' }))).toEqual([
      'placeholder-flag',
      'provenance',
    ]);
    expect(codes(withSource({ licence: ' ' }))).toEqual(['no-licence']);
    expect(codes(withSource({ provenance: undefined }))).toEqual(['provenance']);
    expect(codes(withSource({ pitch: 1.2 }))).toEqual(['pitch-shift']);
  });

  it('catches a version bump and one voice shared by two characters', () => {
    const m = { ...good(), version: 2 } as unknown as SegmentManifest;
    m.clips.push(clip('karen.greet.1', SEGMENT_INVENTORY.karen[0]!.text));
    expect(codes(m)).toEqual(['version', 'shared-voice']);
  });
});

describe('releaseSegmentIds (what a production build asks the server for)', () => {
  it('only listed release audio with a licence and a release provenance', () => {
    const m = good();
    m.clips.push(
      { ...clip('dazza.hot.2', ''), source: { ...m.clips[0]!.source, licence: '' } },
      { ...clip('dazza.heart.1', ''), source: { ...m.clips[0]!.source, placeholder: true } },
      {
        ...clip('dazza.heart.2', ''),
        source: { ...m.clips[0]!.source, provenance: 'placeholder' },
      },
    );
    expect([...releaseSegmentIds(m)]).toEqual([greet.id, hot.id]);
    expect(releaseSegmentIds({ version: 1, clips: [] }).size).toBe(0);
  });
});
