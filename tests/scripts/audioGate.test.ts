import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { classifyAudio, type ProvenanceEntry } from '../../scripts/audio-gate';
import { gateManifests, voiceAssets } from '../../scripts/vite-voice';
import { VOICE_MANIFEST } from '../../src/data/voice';
import { segmentFile } from '../../src/data/voice/manifest';

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
          source: { placeholder: false, licence: 'Actor buyout 2027', provenance: 'recorded' },
        },
        { file: 'assets/voice/b.mp3', source: { placeholder: false, provenance: 'recorded' } },
      ],
    };
    const r = classifyAudio(['assets/voice/a.mp3', 'assets/voice/b.mp3'], m, { files: [] });
    expect(r.keep).toEqual(['assets/voice/a.mp3']);
    expect(r.reject.map((x) => x.file)).toEqual(['assets/voice/b.mp3']);
  });

  it('ships only licensed TTS and recordings: any other provenance fails the build', () => {
    const clip = (file: string, provenance?: string) => ({
      file,
      source: { placeholder: false, licence: 'Some terms', ...(provenance ? { provenance } : {}) },
    });
    const m = {
      clips: [
        clip('assets/voice/tts.mp3', 'licensed_tts'),
        clip('assets/voice/rec.mp3', 'recorded'),
        clip('assets/voice/none.mp3'),
        clip('assets/voice/ph.mp3', 'placeholder'),
      ],
    };
    const r = classifyAudio(
      m.clips.map((c) => c.file),
      m,
      { files: [] },
    );
    expect(r.keep).toEqual(['assets/voice/tts.mp3', 'assets/voice/rec.mp3']);
    expect(r.reject).toEqual([
      { file: 'assets/voice/none.mp3', why: expect.stringMatching(/provenance is missing/) },
      { file: 'assets/voice/ph.mp3', why: expect.stringMatching(/provenance is placeholder/) },
    ]);
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

describe('the build gate with the segment manifest (scripts/vite-voice.ts)', () => {
  const placeholder = VOICE_MANIFEST.clips[0]!.file;
  const licensed = segmentFile('dazza.greet.1');
  const unlisted = segmentFile('dazza.hot.1');
  const release = (file: string) => ({
    file,
    source: {
      placeholder: false,
      licence: 'Google Cloud TTS terms',
      provenance: 'licensed_tts',
    },
  });

  /** A project root with the line manifest (one placeholder, one release clip), a segment
   *  manifest listing one licensed segment, an empty provenance list and the given dist/ files. */
  function project(segments: object | null, dist: string[]) {
    const root = mkdtempSync(join(tmpdir(), 'nwc-gate-test-'));
    const json = (rel: string, data: object): void => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), JSON.stringify(data));
    };
    json('src/data/voice/manifest.json', {
      clips: [VOICE_MANIFEST.clips[0], release('assets/voice/gaz/0000beef.mp3')],
    });
    if (segments) json('src/data/voice/segments.manifest.json', segments);
    json('src/data/audio/provenance.json', { files: [] });
    for (const f of dist) {
      mkdirSync(dirname(join(root, 'dist', f)), { recursive: true });
      writeFileSync(join(root, 'dist', f), 'mp3');
    }
    return root;
  }
  const listed = { version: 1, clips: [release(licensed)] };

  it('keeps a licensed segment the segment manifest lists, rejects an unlisted one', () => {
    const { voice, provenance } = gateManifests(project(listed, []));
    const r = classifyAudio(
      [placeholder, 'assets/voice/gaz/0000beef.mp3', licensed, unlisted],
      voice,
      provenance,
    );
    // Strips nothing it shouldn't: only the placeholder line clip goes; both release clips stay.
    expect(r).toEqual({
      keep: ['assets/voice/gaz/0000beef.mp3', licensed],
      strip: [placeholder],
      reject: [{ file: unlisted, why: expect.stringMatching(/segment manifest/) }],
    });
  });

  it('a segment listed without a licence or a release provenance fails the build', () => {
    const bad = {
      version: 1,
      clips: [
        { file: licensed, source: { placeholder: false, provenance: 'licensed_tts' } },
        { file: unlisted, source: { placeholder: false, licence: 'x', provenance: 'placeholder' } },
      ],
    };
    const { voice, provenance } = gateManifests(project(bad, []));
    expect(
      classifyAudio([licensed, unlisted], voice, provenance).reject.map((x) => x.file),
    ).toEqual([licensed, unlisted]);
  });

  it('the committed manifests: no segment clip ships yet, so any segment file fails the build', () => {
    const { voice, provenance } = gateManifests(join(import.meta.dirname, '..', '..'));
    const r = classifyAudio([placeholder, licensed], voice, provenance);
    expect(r.strip).toEqual([placeholder]);
    expect(r.reject.map((x) => x.file)).toEqual([licensed]);
  });

  it('the build plugin keeps the listed segment in dist/ and fails on an unlisted one', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const build = (root: string): void => {
      const plugin = voiceAssets(root).find((p) => p.name === 'nwc-audio-release-gate')!;
      (plugin.configResolved as unknown as (c: object) => void)({
        root,
        build: { outDir: 'dist' },
      });
      (plugin.closeBundle as unknown as () => void)();
    };
    const ok = project(listed, [placeholder, licensed]);
    build(ok);
    expect(existsSync(join(ok, 'dist', licensed))).toBe(true);
    expect(existsSync(join(ok, 'dist', placeholder))).toBe(false);
    expect(() => build(project(listed, [licensed, unlisted]))).toThrow(
      /1 audio file\(s\).*\n.*dazza\.hot\.1\.mp3: no provenance/,
    );
    // Without a segment manifest file, no segment clip is accounted for.
    expect(() => build(project(null, [licensed]))).toThrow(/dazza\.greet\.1\.mp3/);
    vi.restoreAllMocks();
  });
});
