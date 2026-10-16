// The licensed voice pass plan (scripts/voices-plan.ts) and `npm run voices:estimate`: who is
// rendered by TTS and who records, what each costs, and the cap refusal.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { totalsBySpeaker, voicePlan } from '../../scripts/voices-plan';
import { CAST } from '../../src/data/voice/casting';
import { segmentFile } from '../../src/data/voice/manifest';
import { voiceScript } from '../../src/data/voice/script';
import { SEGMENT_INVENTORY } from '../../src/data/voice/segments';
import { expectedFile } from '../../src/data/voice/validate';

const root = join(import.meta.dirname, '..', '..');
const script = voiceScript();

describe('the voice pass plan', () => {
  it('TTS for the licensed speakers, everything else for the actors, every script line once', () => {
    const p = voicePlan(script, CAST);
    expect(new Set(p.tts.map((j) => j.speaker))).toEqual(
      new Set(['dazza', 'beryl', 'karen', 'priya']),
    );
    expect(new Set(p.recorded.map((j) => j.speaker))).toEqual(new Set(['gaz', 'jiwoo', 'mei']));
    expect(p.tts.length + p.recorded.length).toBe(script.length);
    for (const j of [...p.tts, ...p.recorded]) {
      expect(j.file).toBe(
        expectedFile({ characterId: j.speaker, dialogueId: j.id, delivery: j.delivery }),
      );
      expect(j.chars).toBe([...j.sent].length);
    }
    // The slow "could you repeat that?" takes are separate renders, at the speaker's rate × 0.8.
    const slow = p.tts.find((j) => j.delivery === 'slow' && j.speaker === 'dazza');
    const normal = p.tts.find((j) => j.text === slow?.text && j.delivery === 'normal');
    expect(slow && normal && slow.rate / normal.rate).toBeCloseTo(0.8, 2);
  });

  it('with segments: every segment of every speaker, at normal pace, served at its segment path', () => {
    const p = voicePlan(script, CAST, SEGMENT_INVENTORY);
    const segs = [...p.tts, ...p.recorded].filter((j) => j.kind === 'segment');
    expect(segs.length).toBe(Object.values(SEGMENT_INVENTORY).flat().length);
    for (const j of segs) {
      expect(j.file).toBe(segmentFile(j.id));
      expect(j.rate).toBe(CAST[j.speaker]?.rate ?? 1);
    }
    const dazza = totalsBySpeaker(p.tts).find((t) => t.speaker === 'dazza');
    expect(dazza?.segments).toBe(SEGMENT_INVENTORY.dazza.length);
  });
});

describe('npm run voices:estimate', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [join(root, 'scripts/voices-estimate.ts'), ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    });

  it('prints AUD per TTS speaker and the actors’ share, well under the cap', () => {
    const r = run('--segments');
    expect(r.status).toBe(0);
    for (const who of ['dazza', 'beryl', 'karen', 'priya'])
      expect(r.stdout).toMatch(new RegExp(`${who} .* chars  US\\$[\\d.]+  AU\\$[\\d.]+`));
    expect(r.stdout).toMatch(/total .* \(cap AU\$20\.00\)/);
    expect(r.stdout).toMatch(/gaz .* words {2}licence pending/);
  });

  it('refuses above the cap, and a cap can only be lowered', () => {
    const low = run('--cap', '0.01');
    expect(low.status).toBe(1);
    expect(low.stderr).toMatch(/refused: AU\$[\d.]+ is over the AU\$0\.01 cap/);
    expect(run('--cap', '1000').stdout).toMatch(/cap AU\$20\.00/);
  });
});
