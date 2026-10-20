// Reviewer-owned M5 acceptance tests. Fix production/docs, not these expectations.
// All repository mutations are in new local fixtures; no project refs or network remotes are used.
// Scratch fixtures are retained, not deleted, for this review's preservation requirement.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VoiceManifest } from '../../src/data/voice/manifest';

const ROOT = join(import.meta.dirname, '../..');
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Independent review',
  GIT_AUTHOR_EMAIL: 'review@example.invalid',
  GIT_COMMITTER_NAME: 'Independent review',
  GIT_COMMITTER_EMAIL: 'review@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};
const git = (cwd: string, ...args: string[]): string => {
  const r = spawnSync('git', args, { cwd, env: ENV, encoding: 'utf8' });
  expect(r.status, `git ${args.join(' ')}: ${r.stderr}`).toBe(0);
  return r.stdout.trim();
};

function releaseFixture(effect: string) {
  const dir = mkdtempSync(join(tmpdir(), 'nwc-independent-m5-'));
  const work = join(dir, 'work');
  const bare = join(dir, 'origin.git');
  mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  writeFileSync(join(work, 'package.json'), JSON.stringify({ version: '0.1.0' }));
  writeFileSync(join(work, 'game.txt'), 'validated game\n');
  git(work, 'add', '.');
  git(work, 'commit', '-qm', 'initial');
  git(dir, 'clone', '--quiet', '--bare', work, bare);
  git(work, 'remote', 'add', 'origin', bare);
  const checked = git(work, 'rev-parse', 'HEAD');
  // The hook controls the interval occupied by the slow release check. It simulates a second
  // editor/Git process changing state after the initial preflight, then returns success.
  const hook = join(dir, 'check.cjs');
  writeFileSync(
    hook,
    `const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const bare = ${JSON.stringify(bare)};
${effect}
fs.writeFileSync(${JSON.stringify(join(dir, 'check-ran'))}, 'passed');
`,
  );
  const run = () =>
    spawnSync(process.execPath, [join(ROOT, 'scripts/release-tag.ts')], {
      cwd: work,
      env: { ...ENV, NWC_RELEASE_CHECK: `node '${hook.replaceAll("'", "'\\''")}'` },
      encoding: 'utf8',
      timeout: 30_000,
    });
  return { dir, work, bare, checked, run };
}

describe('M5 release tag must still satisfy its gates after the slow check', () => {
  it('does not tag when a tracked file becomes dirty during release:check', () => {
    const f = releaseFixture("fs.writeFileSync('game.txt', 'uncommitted edit\\n');");
    const r = f.run();
    expect(readFileSync(join(f.dir, 'check-ran'), 'utf8')).toBe('passed');
    expect(git(f.work, 'status', '--porcelain')).toContain('game.txt');
    expect.soft(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(git(f.work, 'tag', '--list'), 'must refuse without creating a tag').toBe('');
  });

  it('does not tag an unvalidated main commit created during release:check', () => {
    const f = releaseFixture(`
fs.writeFileSync('game.txt', 'new commit after validation\\n');
git('add', 'game.txt');
git('commit', '-qm', 'concurrent edit');
`);
    const r = f.run();
    expect(git(f.work, 'rev-parse', 'HEAD')).not.toBe(f.checked);
    expect(git(f.work, 'status', '--porcelain')).toBe('');
    expect.soft(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(git(f.work, 'tag', '--list'), 'must not tag the moving branch name').toBe('');
  });

  it('does not tag when origin/main advances during release:check', () => {
    const f = releaseFixture(`
const tree = git('rev-parse', 'HEAD^{tree}');
const next = git('commit-tree', tree, '-p', 'HEAD', '-m', 'remote advanced');
// Transfer only to our local bare fixture; this is not a project push.
execFileSync('git', ['--git-dir', bare, 'fetch', process.cwd(), next]);
execFileSync('git', ['--git-dir', bare, 'update-ref', 'refs/heads/main', next]);
`);
    const r = f.run();
    expect(git(f.work, 'rev-parse', 'HEAD')).toBe(f.checked);
    expect(git(f.bare, 'rev-parse', 'main')).not.toBe(f.checked);
    expect.soft(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(git(f.work, 'tag', '--list'), 'must recheck the remote after validation').toBe('');
  });

  it('still creates one local annotated tag when all gates remain satisfied', () => {
    const f = releaseFixture('');
    const r = f.run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(git(f.work, 'cat-file', '-t', 'v0.1.0')).toBe('tag');
    expect(git(f.work, 'rev-parse', 'v0.1.0^{commit}')).toBe(f.checked);
    expect(git(f.bare, 'tag', '--list')).toBe('');
  });
});

it('M5 summary does not call a speaker ready when its release clips lack licences', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nwc-independent-m5-voice-'));
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'src/data/voice/manifest.json'), 'utf8'),
  ) as VoiceManifest;
  for (const clip of manifest.clips)
    if (clip.characterId === 'dazza')
      clip.source = {
        ...clip.source,
        placeholder: false,
        provenance: 'licensed_tts',
        pitch: 1,
        licence: '',
      };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'segments.manifest.json'), '{"version":1,"clips":[]}');
  const r = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts/voices-check.ts'), '--release', '--manifest-only'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        VOICES_MANIFEST: join(dir, 'manifest.json'),
        VOICES_SEGMENT_MANIFEST: join(dir, 'segments.manifest.json'),
      },
    },
  );
  expect(r.status).toBe(1);
  expect(r.stdout).toMatch(/error no-licence: 32/);
  const row = r.stdout.split('\n').find((line) => /^ {2}dazza\s/.test(line));
  expect(row).toBeDefined();
  expect(row).toMatch(/0 of\s+32 clips are placeholders/);
  expect(row, 'zero placeholders does not mean valid release audio').not.toMatch(/→ ready$/);
});

it('M5 devlog event denominator agrees with every event in its cited balance CSV', () => {
  const text = readFileSync(join(ROOT, 'docs/DEVLOG.md'), 'utf8');
  const reported = text.match(/It fired 0 times in ([\d,]+) events/);
  expect(reported, 'retain the auditable QUEUE_JUMP denominator').not.toBeNull();
  const [header, ...rows] = readFileSync(join(ROOT, 'docs/balance/2026-10-16.csv'), 'utf8')
    .trim()
    .split('\n');
  const index = header!.split(',').indexOf('events');
  expect(index).toBeGreaterThanOrEqual(0);
  const events = rows.flatMap((row) => (row.split(',')[index] ?? '').split(';').filter(Boolean));
  expect(events).not.toContain('QUEUE_JUMP');
  expect(events.length).toBeGreaterThan(0);
  expect(Number(reported![1]!.replaceAll(',', ''))).toBe(events.length);
});

it('M5 changelog scopes voice-start caption synchronisation to rush while Q5 is open', () => {
  const decisions = readFileSync(join(ROOT, 'docs/DECISIONS.md'), 'utf8');
  if (!/^- \[ \] Q5\b/m.test(decisions)) return; // A future explicit decision may change the scope.
  const bullets = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
    .split('\n')
    .filter((line) => /^- /u.test(line));
  const timingClaims = bullets.filter(
    (line) => /subtitles|captions/i.test(line) && /start|sync/i.test(line),
  );
  // Removing an unsupported timing claim or qualifying it as rush-only both fix the release note.
  for (const claim of timingClaims)
    expect(claim, 'Day 1 and practice still display captions before audio.say').toMatch(/rush/i);
});
