// `npm run voices:sheet`: the listen-through and recording sheet covers every speaker of the release
// cast, gives actors a file name per line that the importer accepts, and leaves the review empty.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { voicePlan } from '../../scripts/voices-plan';
import { CAST } from '../../src/data/voice/casting';
import { voiceScript } from '../../src/data/voice/script';

const root = join(import.meta.dirname, '..', '..');

interface SheetLine {
  id: string;
  kind: string;
  deliverAs?: string;
  staged?: unknown;
}
interface Sheet {
  speakers: Array<{
    speaker: string;
    lines: SheetLine[];
    segments: SheetLine[];
    review: Record<string, unknown>;
  }>;
}

describe('npm run voices:sheet', () => {
  it('writes JSON and Markdown for every speaker: TTS lines to review, actors’ lines to record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nwc-sheet-test-'));
    const r = spawnSync(process.execPath, [join(root, 'scripts/voices-sheet.ts')], {
      cwd: root,
      env: { ...process.env, VOICES_AUDITIONS: dir, VOICES_CACHE: join(dir, 'cache') },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(r.status, r.stderr).toBe(0);
    const sheet = JSON.parse(readFileSync(join(dir, 'review-sheet.json'), 'utf8')) as Sheet;
    expect(sheet.speakers.map((s) => s.speaker).sort()).toEqual(Object.keys(CAST).sort());
    const plan = voicePlan(voiceScript(), CAST);
    for (const s of sheet.speakers) {
      expect(s.review).toMatchObject({ verdict: null, caricature: null });
      if (CAST[s.speaker]?.provenance === 'recorded') {
        const want = plan.recorded.filter((j) => j.speaker === s.speaker);
        expect(s.lines.map((l) => l.deliverAs)).toEqual(
          want.map((j) => `${basename(j.file, '.mp3')}.wav`),
        );
      } else {
        expect(s.lines.length).toBe(plan.tts.filter((j) => j.speaker === s.speaker).length);
        expect(s.lines.every((l) => l.staged === null)).toBe(true); // nothing rendered here
      }
    }
    const md = readFileSync(join(dir, 'review-sheet.md'), 'utf8');
    expect(md).toMatch(/Caricature check \(AGENTS\.md §6\)/);
    expect(md).toMatch(/## Jiwoo \(jiwoo\)[\s\S]*Recorded by an actor/);
    expect(md).toMatch(/## Karen \(karen\)[\s\S]*Licensed TTS:\*\* en-AU-Chirp3-HD-Kore/);
  });
});
