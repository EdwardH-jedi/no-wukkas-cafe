import { describe, expect, it } from 'vitest';
import manifestJson from '../../../src/data/voice/manifest.json';
import type { VoiceClip, VoiceManifest } from '../../../src/data/voice/manifest';
import { provenanceOf, SHIPPABLE_PROVENANCE, voiceRefIds } from '../../../src/sim/contracts/voice';

const src = (s: Partial<VoiceClip['source']>): Pick<VoiceClip, 'source'> => ({
  source: {
    engine: 'azure',
    voice: 'x',
    rate: 1,
    pitch: 0,
    placeholder: false,
    deterministic: true,
    ...s,
  },
});

describe('provenance', () => {
  it('placeholder clips, and release clips without a licence, never count as shippable', () => {
    expect(provenanceOf(src({ placeholder: true, licence: 'Plan X' }))).toBe('placeholder');
    expect(provenanceOf(src({ licence: undefined }))).toBe('placeholder');
    expect(provenanceOf(src({ licence: '  ' }))).toBe('placeholder');
  });

  it('licensed clips are TTS unless the engine says recorded', () => {
    expect(provenanceOf(src({ licence: 'Azure TTS standard, sub 123' }))).toBe('licensed_tts');
    expect(provenanceOf(src({ engine: 'recorded', licence: 'Actor agreement 2026-11' }))).toBe(
      'recorded',
    );
    expect(SHIPPABLE_PROVENANCE).not.toContain('placeholder');
  });

  it('today every clip in the manifest is a placeholder (matches the release gate)', () => {
    const m = manifestJson as unknown as VoiceManifest;
    expect(m.clips.length).toBeGreaterThan(0);
    for (const c of m.clips) expect(provenanceOf(c)).toBe('placeholder');
  });
});

describe('voiceRefIds', () => {
  it('lists the clips a reference plays, in order, as a copy', () => {
    expect(voiceRefIds({ kind: 'clip', id: 'gaz:1' })).toEqual(['gaz:1']);
    const ids = ['a', 'b', 'c'];
    const out = voiceRefIds({ kind: 'segments', ids });
    expect(out).toEqual(ids);
    expect(out).not.toBe(ids);
  });
});
