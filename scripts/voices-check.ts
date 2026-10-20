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
// is orphaned.
// The segment manifest (src/data/voice/segments.manifest.json), in both modes: every entry is
// release audio (src/data/voice/validateSegments.ts: a segment the game says, with its current
// words, a licence and provenance licensed_tts or recorded, no placeholders); with file checks,
// each listed clip is in public/assets/voice/segments/ at its measured duration, and no segment
// clip there is unlisted (the build gate would reject it). Exit code 1 on any error.
// With --release the output ends with a summary for `npm run release:check` (which runs the build
// only after this check passes): per speaker, the placeholder clips and the HUMAN step that
// replaces them (src/data/voice/casting.ts CAST), then the build line.

import { existsSync, readFileSync } from 'node:fs';
import {
  CACHE_DIR,
  cachePath,
  listClips,
  MANIFEST,
  measure,
  ownIndex,
  pool,
  publicPath,
  readSegmentManifest,
  ROOT,
  SEGMENT_MANIFEST,
} from './voice-node.ts';

const { voiceScript } = await import('../src/data/voice/script.ts');
const { VOICE_PROFILES } = await import('../src/data/voice/profiles.ts');
const { summarise, validateManifest } = await import('../src/data/voice/validate.ts');
const { SEGMENT_INVENTORY } = await import('../src/data/voice/segments.ts');
const { validateSegmentManifest } = await import('../src/data/voice/validateSegments.ts');
type Manifest = import('../src/data/voice/manifest.ts').VoiceManifest;
type Issue = import('../src/data/voice/validate.ts').Issue;

/** Measured vs manifest duration tolerance, seconds. */
const DRIFT = 0.03;

const args = process.argv.slice(2);
const release = args.includes('--release');
const manifestOnly = args.includes('--manifest-only');

type Found = Issue | { level: 'error' | 'warn'; code: string; id?: string; message: string };
const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
const issues: Found[] = validateManifest(m, {
  script: voiceScript(),
  profiles: VOICE_PROFILES,
  release,
});
const sm = readSegmentManifest();
const segIssues: Found[] = validateSegmentManifest(sm, {
  inventory: SEGMENT_INVENTORY,
  profiles: VOICE_PROFILES,
});
const rel = (p: string): string => p.replace(`${ROOT}/`, '');

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
    if (!ownIndex(f) && !m.clips.some((c) => c.file === f))
      issues.push({
        level: 'warn',
        code: 'orphan-file',
        message: `voice-cache/${f.slice('assets/voice/'.length)} is not in the manifest (npm run voices -- --prune)`,
      });

  // Segment clips ship from public/assets/voice/segments/, listed in the segment manifest.
  await pool(sm.clips, 8, async (c) => {
    const where = publicPath(c.file);
    if (!existsSync(where)) {
      segIssues.push({
        level: 'error',
        code: 'missing-audio',
        id: c.id,
        message: `no file at ${rel(where)}`,
      });
      return;
    }
    const got = await measure(where, false);
    if (Math.abs(got.duration - c.duration) > DRIFT)
      segIssues.push({
        level: 'error',
        code: 'duration-drift',
        id: c.id,
        message: `file is ${got.duration} s, segment manifest says ${c.duration} s`,
      });
  });
  const listed = new Set(sm.clips.map((c) => c.file));
  for (const f of listClips(publicPath('assets/voice')))
    if (f.startsWith('assets/voice/segments/') && !listed.has(f))
      segIssues.push({
        level: 'error',
        code: 'unlisted-segment',
        message: `${rel(publicPath(f))} is not in the segment manifest: the build gate rejects it`,
      });
}

function report(
  found: readonly Found[],
  summary: (s: ReturnType<typeof summarise>) => string,
): void {
  const s = summarise(found as Issue[]);
  const byCode = new Map<string, number>();
  for (const i of found)
    byCode.set(`${i.level} ${i.code}`, (byCode.get(`${i.level} ${i.code}`) ?? 0) + 1);
  for (const i of found.filter((x) => x.level === 'error').slice(0, 25))
    console.error(`  ${i.code}: ${i.id ?? ''} ${i.message}`);
  console.log(`${summary(s)}, ${s.errors} error(s), ${s.warnings} warning(s)`);
  for (const [k, n] of [...byCode].sort()) console.log(`  ${k}: ${n}`);
  if (s.errors) process.exitCode = 1;
}

report(
  issues,
  () =>
    `voices:check (${release ? 'release' : 'development'}${manifestOnly ? ', manifest only' : ''}): ` +
    `${m.clips.length} clips, status "${m.status}"`,
);
// A generated line plays its segment clips in a build only when every one of its segments is listed.
const segmentCount = Object.values(SEGMENT_INVENTORY).flat().length;
const listedIds = new Set(sm.clips.map((c) => c.id)).size;
report(
  segIssues,
  () =>
    `voices:check segments: ${listedIds}/${segmentCount} segments have a release clip in ${rel(SEGMENT_MANIFEST)}`,
);

if (release) {
  const { CAST } = await import('../src/data/voice/casting.ts');
  type Cast = import('../src/data/voice/casting.ts').CastEntry;
  const step = (c: Cast | undefined): string => {
    if (!c) return 'not in the release cast (src/data/voice/casting.ts CAST)';
    if (c.provider === 'google')
      return `paid TTS render: npm run voices:render -- --allow-paid, then -- --promote (Google ${c.voice})`;
    return `actor's takes: npm run voices:render -- --import <dir> (${c.voice}/${c.pending ? ', licence pending' : ''})`;
  };
  const speakers = [...new Set([...Object.keys(CAST), ...m.clips.map((c) => c.characterId)])];
  const width = Math.max(...speakers.map((s) => s.length));
  const digits = String(m.clips.length).length;
  console.log('release:check: what clears the voice gate, per speaker');
  for (const s of speakers) {
    const clips = m.clips.filter((c) => c.characterId === s);
    const held = clips.filter((c) => c.source?.placeholder !== false).length;
    const [a, b] = [held, clips.length].map((x) => String(x).padStart(digits));
    console.log(
      `  ${s.padEnd(width)}  ${a} of ${b} clips are placeholders → ` +
        (held ? step(CAST[s]) : 'ready'),
    );
  }
  console.log(
    process.exitCode
      ? '  build: not run; npm run build (with the audio release gate) runs only after this check exits 0'
      : '  build: the voice check passed; npm run build (with the audio release gate) runs next',
  );
}
