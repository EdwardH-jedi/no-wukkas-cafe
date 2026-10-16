// `npm run voices:check` covers the segment manifest: the real script against a temp segment
// manifest and public folder (VOICES_SEGMENT_MANIFEST / VOICES_PUBLIC / VOICES_CACHE). The line
// manifest is the committed one, read only. Without --manifest-only every line clip is missing in
// the sandbox, so these tests look at the segment report, not at the totals.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { segmentFile, type SegmentClip } from '../../src/data/voice/manifest';
import { SEGMENT_INVENTORY } from '../../src/data/voice/segments';

const root = join(import.meta.dirname, '..', '..');
const greet = SEGMENT_INVENTORY.dazza[0]!;
const said = (id: string): string => SEGMENT_INVENTORY.dazza.find((g) => g.id === id)!.text.trim();

const clip = (over: Partial<SegmentClip> = {}): SegmentClip => ({
  id: greet.id,
  characterId: 'dazza',
  voiceId: 'google-tts:en-AU-Chirp3-HD-Fenrir',
  transcript: greet.text.trim(),
  file: segmentFile(greet.id),
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

function sandbox(clips: SegmentClip[]) {
  const dir = mkdtempSync(join(tmpdir(), 'nwc-check-test-'));
  const manifest = join(dir, 'segments.manifest.json');
  writeFileSync(manifest, JSON.stringify({ version: 1, clips }));
  const run = (...args: string[]) => {
    const r = spawnSync(process.execPath, [join(root, 'scripts/voices-check.ts'), ...args], {
      cwd: root,
      env: {
        ...process.env,
        VOICES_SEGMENT_MANIFEST: manifest,
        VOICES_PUBLIC: join(dir, 'public'),
        VOICES_CACHE: join(dir, 'cache'),
      },
      encoding: 'utf8',
      timeout: 60_000,
    });
    const report = r.stdout.split('\n').find((l) => l.startsWith('voices:check segments:')) ?? '';
    return { ...r, report };
  };
  /** A real MP3 at a segment's public path; returns its measured duration. */
  const audio = (file: string): number => {
    const out = join(dir, 'public', file);
    mkdirSync(dirname(out), { recursive: true });
    spawnSync('ffmpeg', [
      ...['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi'],
      ...['-i', 'sine=frequency=200:duration=0.8', '-ar', '24000', '-ac', '1', out],
    ]);
    const p = spawnSync('ffprobe', [
      ...['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out],
    ]);
    return Math.round(Number(String(p.stdout).trim()) * 1000) / 1000;
  };
  /** A stand-in file in the sandbox's voice-cache/. */
  const cached = (rel: string): void => {
    mkdirSync(dirname(join(dir, 'cache', rel)), { recursive: true });
    writeFileSync(join(dir, 'cache', rel), 'mp3');
  };
  return { run, audio, cached };
}

describe('npm run voices:check: the segment manifest', () => {
  it('passes a licensed segment entry, and reports how many segments ship', () => {
    const r = sandbox([clip()]).run('--manifest-only');
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatch(
      /^voices:check segments: 1\/\d+ segments have a release clip in .*segments\.manifest\.json, 0 error\(s\)/,
    );
  });

  it('fails a broken entry: changed words, no licence, a placeholder (also with --release)', () => {
    const s = sandbox([
      clip({ transcript: 'Morning, love.' }),
      clip({
        id: 'dazza.hot.1',
        transcript: said('dazza.hot.1'),
        file: segmentFile('dazza.hot.1'),
        source: { ...clip().source, licence: '' },
      }),
      clip({
        id: 'dazza.closeSay.2',
        transcript: said('dazza.closeSay.2'),
        file: segmentFile('dazza.closeSay.2'),
        source: { ...clip().source, placeholder: true },
      }),
    ]);
    for (const args of [['--manifest-only'], ['--manifest-only', '--release']]) {
      const r = s.run(...args);
      expect(r.status).toBe(1);
      expect(r.report).toMatch(/, 3 error\(s\)/);
      expect(r.stderr).toMatch(/segment-text: dazza\.greet\.1 /);
      expect(r.stderr).toMatch(/no-licence: dazza\.hot\.1 /);
      expect(r.stderr).toMatch(/placeholder-in-release: dazza\.closeSay\.2 /);
    }
  });

  it('checks the files: a listed clip must exist at its duration; an unlisted one fails', () => {
    const s = sandbox([clip({ duration: 0.5 })]);
    const missing = s.run();
    expect(missing.report).toMatch(/, 1 error\(s\)/);
    expect(missing.stderr).toMatch(
      /missing-audio: dazza\.greet\.1 no file at .*segments\/dazza\/dazza\.greet\.1\.mp3/,
    );

    const duration = s.audio(segmentFile(greet.id));
    s.audio(segmentFile('dazza.hot.1')); // in public/ but not listed: the build gate rejects it
    const drift = s.run();
    expect(drift.report).toMatch(/, 2 error\(s\)/);
    expect(drift.stderr).toMatch(/duration-drift: dazza\.greet\.1 /);
    expect(drift.stderr).toMatch(/unlisted-segment: {2}.*dazza\.hot\.1\.mp3 is not in the segment/);

    const fixed = sandbox([clip({ duration })]);
    fixed.audio(segmentFile(greet.id));
    const ok = fixed.run();
    expect(ok.report).toMatch(/, 0 error\(s\)/);
    expect(ok.stderr).not.toMatch(/dazza\.greet\.1/);
  });

  it('placeholder segment clips and the licensed staging in voice-cache/ are not orphans', () => {
    const s = sandbox([]);
    s.cached('segments/dazza/dazza.greet.1.mp3'); // npm run voices -- --segments
    s.cached('licensed/karen/0badf00d.mp3'); // npm run voices:render -- --allow-paid
    s.cached('gaz/0badf00d.mp3'); // a line clip the manifest doesn't list
    const r = s.run();
    expect(r.stdout).toMatch(/^ {2}warn orphan-file: 1$/m);
  });
});
