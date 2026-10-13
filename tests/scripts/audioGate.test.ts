import { describe, expect, it } from 'vitest';
import { classifyAudio, type ProvenanceEntry } from '../../scripts/audio-gate';
import { VOICE_MANIFEST } from '../../src/data/voice';

const entry = (file: string, over: Partial<ProvenanceEntry> = {}): ProvenanceEntry => ({
  file,
  title: 'Morning Tram',
  author: 'Someone',
  source: 'https://example.org/track',
  licence: 'CC0 1.0',
  verifiedBy: 'Edward',
  verifiedOn: '2026-10-14',
  ...over,
});

describe('audio release gate', () => {
  const placeholder = VOICE_MANIFEST.clips[0]!.file;

  it('strips placeholder voice clips and ignores non-audio files', () => {
    const r = classifyAudio([placeholder, 'assets/index.js', 'index.html'], VOICE_MANIFEST, {
      files: [],
    });
    expect(r).toEqual({ keep: [], strip: [placeholder], reject: [] });
  });

  it('rejects audio nobody can account for (e.g. old renders not in the manifest)', () => {
    const r = classifyAudio(
      ['assets/voice/gaz/13b99ab5.mp3', 'assets/music/track.ogg', 'sfx/door.wav'],
      VOICE_MANIFEST,
      { files: [] },
    );
    expect(r.reject.map((x) => x.file)).toEqual([
      'assets/voice/gaz/13b99ab5.mp3',
      'assets/music/track.ogg',
      'sfx/door.wav',
    ]);
  });

  it('keeps files with a verified licence; unverified entries are rejected', () => {
    const r = classifyAudio(['assets/music/a.ogg', 'assets/music/b.ogg'], VOICE_MANIFEST, {
      files: [entry('assets/music/a.ogg'), entry('assets/music/b.ogg', { verifiedBy: '' })],
    });
    expect(r.keep).toEqual(['assets/music/a.ogg']);
    expect(r.reject).toEqual([
      { file: 'assets/music/b.ogg', why: expect.stringMatching(/not verified/) },
    ]);
  });

  it('keeps licensed release voice clips, rejects release clips without a licence', () => {
    const m = {
      clips: [
        {
          file: 'assets/voice/a.mp3',
          source: { placeholder: false, licence: 'Actor buyout 2027' },
        },
        { file: 'assets/voice/b.mp3', source: { placeholder: false } },
      ],
    };
    const r = classifyAudio(['assets/voice/a.mp3', 'assets/voice/b.mp3'], m, { files: [] });
    expect(r.keep).toEqual(['assets/voice/a.mp3']);
    expect(r.reject.map((x) => x.file)).toEqual(['assets/voice/b.mp3']);
  });

  it('the committed provenance list is valid (every entry verified)', async () => {
    const p = (await import('../../src/data/audio/provenance.json')).default as {
      files: ProvenanceEntry[];
    };
    const r = classifyAudio(
      p.files.map((e) => e.file),
      { clips: [] },
      p,
    );
    expect(r.reject).toEqual([]);
  });
});
