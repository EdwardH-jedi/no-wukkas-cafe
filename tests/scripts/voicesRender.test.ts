// `npm run voices:render` end to end with the free ffmpeg stand-in (scripts/tts-fake.ts), against a
// temp manifest, cache and public folder (VOICES_MANIFEST / VOICES_CACHE / VOICES_PUBLIC): the paid
// guard, staging and resume, promote (refused for the stand-in, done for licensed staging) and the
// actors' import. Nothing reaches the network or the real files.

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { voicePlan } from '../../scripts/voices-plan';
import { CAST } from '../../src/data/voice/casting';
import type { SegmentManifest, VoiceManifest } from '../../src/data/voice/manifest';
import { VOICE_PROFILES } from '../../src/data/voice/profiles';
import { voiceScript } from '../../src/data/voice/script';
import { SEGMENT_INVENTORY } from '../../src/data/voice/segments';
import { validateManifest } from '../../src/data/voice/validate';
import { validateSegmentManifest } from '../../src/data/voice/validateSegments';

const root = join(import.meta.dirname, '..', '..');
const script = voiceScript();

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'nwc-render-test-'));
  const manifest = join(dir, 'manifest.json');
  copyFileSync(join(root, 'src/data/voice/manifest.json'), manifest);
  const segments = join(dir, 'segments.manifest.json');
  copyFileSync(join(root, 'src/data/voice/segments.manifest.json'), segments);
  const env = {
    ...process.env,
    VOICES_MANIFEST: manifest,
    VOICES_SEGMENT_MANIFEST: segments,
    VOICES_CACHE: join(dir, 'cache'),
    VOICES_PUBLIC: join(dir, 'public'),
    GOOGLE_TTS_ACCESS_TOKEN: '',
    GOOGLE_CLOUD_PROJECT: '',
    GOOGLE_TTS_API_KEY: '',
  };
  const run = (args: string[], extra: Record<string, string> = {}) =>
    spawnSync(process.execPath, [join(root, 'scripts/voices-render.ts'), ...args], {
      cwd: root,
      env: { ...env, ...extra },
      encoding: 'utf8',
      timeout: 120_000,
    });
  const read = (): VoiceManifest => JSON.parse(readFileSync(manifest, 'utf8')) as VoiceManifest;
  const readSegments = (): SegmentManifest =>
    JSON.parse(readFileSync(segments, 'utf8')) as SegmentManifest;
  const staged = (file: string): string =>
    join(dir, 'cache', 'licensed', file.slice('assets/voice/'.length));
  return {
    dir,
    manifest,
    segments,
    run,
    read,
    readSegments,
    staged,
    index: join(dir, 'cache', 'licensed', 'index.json'),
  };
}

/** A tone as long as the words would take to say, encoded to `file` (mp3 or wav by extension). */
function tone(file: string, words: string): number {
  const seconds = Math.max(0.6, words.split(/\s+/).length / 2.5);
  mkdirSync(dirname(file), { recursive: true });
  spawnSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=200:duration=${seconds.toFixed(2)}`,
    '-ar',
    '24000',
    '-ac',
    '1',
    file,
  ]);
  return seconds;
}

describe('npm run voices:render', () => {
  it('is a dry run by default; --allow-paid without credentials is refused; nothing is written', () => {
    const s = sandbox();
    const before = readFileSync(s.manifest, 'utf8');
    const dry = s.run([]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(
      /131 TTS clip\(s\) wanted, 0 already staged, 131 to render: \d+ characters, ~AU\$[\d.]+ \(cap AU\$20\.00\)/,
    );
    expect(dry.stderr).toMatch(/dry run/);
    const paid = s.run(['--allow-paid']);
    expect(paid.status).toBe(1);
    expect(paid.stderr).toMatch(/refused: --allow-paid needs GOOGLE_TTS_ACCESS_TOKEN/);
    expect(existsSync(s.index)).toBe(false);
    expect(readFileSync(s.manifest, 'utf8')).toBe(before);
  });

  it('stages each clip with its provenance, resumes, and never promotes the stand-in', () => {
    const s = sandbox();
    const fake = { NWC_FAKE_TTS: '1' };
    const first = s.run(['--allow-paid', '--only', 'karen'], fake);
    expect(first.status, first.stderr).toBe(0);
    const karen = voicePlan(script, CAST).tts.filter((j) => j.speaker === 'karen');
    const idx = JSON.parse(readFileSync(s.index, 'utf8')) as {
      clips: Array<Record<string, unknown>>;
    };
    expect(idx.clips).toHaveLength(karen.length);
    expect(idx.clips[0]).toMatchObject({
      engine: 'fake-tts',
      provenance: 'placeholder',
      voice: 'en-AU-Chirp3-HD-Kore',
    });
    for (const j of karen) expect(existsSync(s.staged(j.file))).toBe(true);
    // A second run renders nothing new.
    expect(s.run(['--allow-paid', '--only', 'karen'], fake).stdout).toMatch(
      new RegExp(
        `${karen.length} TTS clip\\(s\\) wanted, ${karen.length} already staged, 0 to render`,
      ),
    );
    const before = readFileSync(s.manifest, 'utf8');
    const promote = s.run(['--promote']);
    expect(promote.status).toBe(1);
    expect(promote.stderr).toMatch(
      /refused: \d+ staged clip\(s\) aren't licensed TTS \(fake-tts\)/,
    );
    expect(readFileSync(s.manifest, 'utf8')).toBe(before);
  }, 180_000);

  it('promotes licensed staging into release clips the validator accepts', () => {
    const s = sandbox();
    const karen = voicePlan(script, CAST).tts.filter((j) => j.speaker === 'karen');
    // What a real paid run leaves behind (licensed_tts, the Google engine), with tones for audio.
    const clips = karen.map((j) => ({
      ...j,
      engine: 'google-tts',
      provenance: 'licensed_tts',
      voice: CAST.karen?.voice,
      licence: CAST.karen?.licence,
      renderedOn: '2026-10-16',
      duration: tone(s.staged(j.file), j.text),
      meanDb: -20,
    }));
    writeFileSync(s.index, JSON.stringify({ clips }));
    const r = s.run(['--promote']);
    expect(r.status, r.stderr).toBe(0);
    const m = s.read();
    for (const j of karen) {
      const c = m.clips.find((x) => x.dialogueId === j.id);
      expect(c?.source).toMatchObject({
        engine: 'google-tts',
        provenance: 'licensed_tts',
        placeholder: false,
        pitch: 1,
      });
      expect(existsSync(join(s.dir, 'public', j.file))).toBe(true);
    }
    // Release check: Karen's clips no longer count as placeholders; everyone else's still do.
    const issues = validateManifest(m, { script, profiles: VOICE_PROFILES, release: true });
    const left = issues.filter((i) => i.code === 'placeholder-in-release');
    const who = (id?: string) => m.clips.find((c) => c.dialogueId === id)?.characterId;
    expect(left.some((i) => who(i.id) === 'karen')).toBe(false);
    expect(left.length).toBeGreaterThan(0);
    expect(issues.filter((i) => i.code === 'provenance' || i.code === 'no-licence')).toEqual([]);
  }, 180_000);

  it("imports an actor's takes only with a signed licence, as recorded clips", () => {
    const s = sandbox();
    const gaz = voicePlan(script, CAST)
      .recorded.filter((j) => j.speaker === 'gaz')
      .slice(0, 2);
    const takes = join(s.dir, 'takes', 'gaz');
    for (const j of gaz) tone(join(takes, `${basename(j.file, '.mp3')}.wav`), j.text);
    const before = readFileSync(s.manifest, 'utf8');
    const refused = s.run(['--import', join(s.dir, 'takes')]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/needs a "licence" and a "performer"/);
    expect(readFileSync(s.manifest, 'utf8')).toBe(before);
    writeFileSync(
      join(takes, 'source.json'),
      JSON.stringify({ licence: 'Buyout, signed 2026-11-01', performer: 'Actor A' }),
    );
    const r = s.run(['--import', join(s.dir, 'takes')]);
    expect(r.status, r.stderr).toBe(0);
    const m = s.read();
    for (const j of gaz) {
      const c = m.clips.find((x) => x.dialogueId === j.id);
      expect(c?.source).toMatchObject({
        engine: 'recording',
        provenance: 'recorded',
        voice: 'Actor A',
        placeholder: false,
      });
      expect(existsSync(join(s.dir, 'public', j.file))).toBe(true);
    }
  }, 180_000);

  it('promotes licensed staged segments into the segment manifest, never the stand-in', () => {
    const s = sandbox();
    const segs = voicePlan(script, CAST, SEGMENT_INVENTORY)
      .tts.filter((j) => j.kind === 'segment' && j.speaker === 'karen')
      .slice(0, 3);
    expect(segs).toHaveLength(3);
    const stage = (engine: string, provenance: string) =>
      segs.map((j) => ({
        ...j,
        engine,
        provenance,
        voice: CAST.karen?.voice,
        licence: CAST.karen?.licence,
        renderedOn: '2026-10-17',
        duration: tone(s.staged(j.file), j.text),
        meanDb: -20,
      }));
    const before = readFileSync(s.segments, 'utf8');
    writeFileSync(s.index, JSON.stringify({ clips: stage('fake-tts', 'placeholder') }));
    const refused = s.run(['--promote']);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/refused: 3 staged clip\(s\) aren't licensed TTS \(fake-tts\)/);
    expect(readFileSync(s.segments, 'utf8')).toBe(before);
    for (const j of segs) expect(existsSync(join(s.dir, 'public', j.file))).toBe(false);

    writeFileSync(s.index, JSON.stringify({ clips: stage('google-tts', 'licensed_tts') }));
    const r = s.run(['--promote']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/promote: 3 segment clip\(s\) now ship; the segment manifest lists 3/);
    const sm = s.readSegments();
    expect(sm.clips.map((c) => c.id)).toEqual(segs.map((j) => j.id).sort());
    for (const j of segs) {
      const c = sm.clips.find((x) => x.id === j.id);
      expect(c).toMatchObject({ characterId: 'karen', transcript: j.text, file: j.file });
      expect(c?.source).toMatchObject({
        engine: 'google-tts',
        provenance: 'licensed_tts',
        placeholder: false,
        licence: CAST.karen?.licence,
      });
      expect(j.file).toMatch(/^assets\/voice\/segments\/karen\//);
      expect(existsSync(join(s.dir, 'public', j.file))).toBe(true);
    }
    expect(
      validateSegmentManifest(sm, { inventory: SEGMENT_INVENTORY, profiles: VOICE_PROFILES }),
    ).toEqual([]);
    // The line manifest gained nothing: segments are not lines.
    expect(s.read().clips.some((c) => c.file.includes('/segments/'))).toBe(false);
  }, 180_000);

  it("imports an actor's segment takes (<speaker>/segments/<id>.wav) as recorded segment clips", () => {
    const s = sandbox();
    const segs = voicePlan(script, CAST, SEGMENT_INVENTORY)
      .recorded.filter((j) => j.kind === 'segment' && j.speaker === 'jiwoo')
      .slice(0, 2);
    expect(segs).toHaveLength(2);
    const takes = join(s.dir, 'takes', 'jiwoo');
    for (const j of segs) tone(join(takes, 'segments', `${j.id}.wav`), j.text);
    tone(join(takes, 'segments', 'jiwoo.greet.99.wav'), 'Hello'); // not a segment of hers
    tone(join(takes, `${segs[0]!.id}.wav`), segs[0]!.text); // a segment take outside segments/
    writeFileSync(
      join(takes, 'source.json'),
      JSON.stringify({ licence: 'Buyout, signed 2026-11-01', performer: 'Actor B' }),
    );
    const lines = readFileSync(s.manifest, 'utf8');
    const r = s.run(['--import', join(s.dir, 'takes')]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/jiwoo\/segments\/jiwoo\.greet\.99\.wav: not a segment/);
    expect(r.stdout).toMatch(/import: 2 segment clip\(s\) now ship; the segment manifest lists 2/);
    const sm = s.readSegments();
    expect(sm.clips.map((c) => c.id)).toEqual(segs.map((j) => j.id).sort());
    for (const c of sm.clips) {
      expect(c.source).toMatchObject({
        engine: 'recording',
        provenance: 'recorded',
        voice: 'Actor B',
        licence: 'Buyout, signed 2026-11-01',
        placeholder: false,
      });
      expect(existsSync(join(s.dir, 'public', c.file))).toBe(true);
    }
    expect(
      validateSegmentManifest(sm, { inventory: SEGMENT_INVENTORY, profiles: VOICE_PROFILES }),
    ).toEqual([]);
    // No line clip came from the stray segment take.
    expect(s.read().clips).toEqual((JSON.parse(lines) as VoiceManifest).clips);
  }, 180_000);
});
