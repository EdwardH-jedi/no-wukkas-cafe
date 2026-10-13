// Checks the voice manifest and the audio files it points at.
//
//   npm run voices:check                  development: placeholders allowed
//   npm run voices:check -- --release     release: any placeholder clip is an error
//   npm run voices:check -- --manifest-only   skip file checks (machines without clips)
//
// Manifest checks (shared with the unit tests): schema, duplicate ids/files, ids and paths that
// match speaker + transcript + delivery, voice profile/accent/locale, duration, speech pace,
// loudness, placeholder/licence flags, coverage of every line the game can say.
// File checks: every clip exists where it should (placeholders in voice-cache/, release clips in
// public/assets/voice/), its measured duration matches the manifest (±30 ms), and no cached file
// is orphaned. Exit code 1 on any error.

import { existsSync, readFileSync } from 'node:fs';
import {
  CACHE_DIR,
  cachePath,
  listClips,
  MANIFEST,
  measure,
  pool,
  publicPath,
  ROOT,
} from './voice-node.ts';

const { voiceScript } = await import('../src/data/voice/script.ts');
const { VOICE_PROFILES } = await import('../src/data/voice/profiles.ts');
const { summarise, validateManifest } = await import('../src/data/voice/validate.ts');
type Manifest = import('../src/data/voice/manifest.ts').VoiceManifest;
type Issue = import('../src/data/voice/validate.ts').Issue;

/** Measured vs manifest duration tolerance, seconds. */
const DRIFT = 0.03;

const args = process.argv.slice(2);
const release = args.includes('--release');
const manifestOnly = args.includes('--manifest-only');

const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
const issues: Array<
  Issue | { level: 'error' | 'warn'; code: string; id?: string; message: string }
> = validateManifest(m, { script: voiceScript(), profiles: VOICE_PROFILES, release });

if (!manifestOnly) {
  const seen = new Set<string>();
  await pool(m.clips, 8, async (c) => {
    const placeholder = c.source?.placeholder !== false;
    const where = placeholder ? cachePath(c.file) : publicPath(c.file);
    let path = where;
    if (!existsSync(where)) {
      // Placeholder renders from before 2026-10-13 lived in public/ (copied into builds).
      if (placeholder && existsSync(publicPath(c.file))) {
        path = publicPath(c.file);
        issues.push({
          level: 'warn',
          code: 'legacy-location',
          id: c.dialogueId,
          message: 'placeholder clip found in public/assets/voice (old location)',
        });
      } else {
        issues.push({
          level: 'error',
          code: 'missing-audio',
          id: c.dialogueId,
          message: `no file at ${where.replace(`${ROOT}/`, '')}${placeholder ? ' (run npm run voices)' : ''}`,
        });
        return;
      }
    }
    seen.add(c.file);
    const got = await measure(path, false);
    if (Math.abs(got.duration - c.duration) > DRIFT)
      issues.push({
        level: 'error',
        code: 'duration-drift',
        id: c.dialogueId,
        message: `file is ${got.duration} s, manifest says ${c.duration} s (re-run npm run voices)`,
      });
  });
  for (const f of listClips(CACHE_DIR))
    if (!m.clips.some((c) => c.file === f))
      issues.push({
        level: 'warn',
        code: 'orphan-file',
        message: `voice-cache/${f.slice('assets/voice/'.length)} is not in the manifest (npm run voices -- --prune)`,
      });
}

const s = summarise(issues as Issue[]);
const byCode = new Map<string, number>();
for (const i of issues)
  byCode.set(`${i.level} ${i.code}`, (byCode.get(`${i.level} ${i.code}`) ?? 0) + 1);
for (const i of issues.filter((x) => x.level === 'error').slice(0, 25))
  console.error(`  ${i.code}: ${i.id ?? ''} ${i.message}`);
console.log(
  `voices:check (${release ? 'release' : 'development'}${manifestOnly ? ', manifest only' : ''}): ` +
    `${m.clips.length} clips, status "${m.status}", ${s.errors} error(s), ${s.warnings} warning(s)`,
);
for (const [k, n] of [...byCode].sort()) console.log(`  ${k}: ${n}`);
if (s.errors) process.exitCode = 1;
