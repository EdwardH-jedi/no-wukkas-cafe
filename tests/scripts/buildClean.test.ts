// scripts/build-clean.ts (todo.md T3.1) on a tiny repo: the build sees HEAD only. The fixture's
// `npm run build` copies index.html and every file in src/ into dist/index.html, so any working-tree
// content that reaches the scratch directory shows up in the output. The real script is copied in
// (it finds its repo from its own location), so a build:clean that stops isolating HEAD fails here
// even though a plain `npm run build:clean` would still exit 0.

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../../scripts/build-clean.ts');
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};
const SENTINEL = 'UNCOMMITTED_SENTINEL_MUST_NOT_SHIP';

const BUILD = `import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
if (process.env.FIXTURE_BUILD_EXIT) process.exit(Number(process.env.FIXTURE_BUILD_EXIT));
mkdirSync('dist', { recursive: true });
const parts = [readFileSync('index.html', 'utf8')];
for (const f of readdirSync('src').sort()) parts.push(readFileSync('src/' + f, 'utf8'));
writeFileSync('dist/index.html', parts.join('\\n'));
writeFileSync('dist/clip.mp3', Buffer.alloc(5000));
console.log('[audio-gate] ok: 0 licensed audio file(s) in the build');
`;

let repo: string;
const git = (...a: string[]): string => {
  const r = spawnSync('git', a, { cwd: repo, encoding: 'utf8', env: ENV });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const buildClean = (args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['scripts/build-clean.ts', ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...ENV, ...env },
    timeout: 60_000,
  });
const dist = (): string => readFileSync(join(repo, 'dist/index.html'), 'utf8');

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'nwc-build-clean-test-'));
  mkdirSync(join(repo, 'scripts'));
  mkdirSync(join(repo, 'src'));
  mkdirSync(join(repo, 'node_modules')); // untracked, as in a checkout
  copyFileSync(SCRIPT, join(repo, 'scripts/build-clean.ts'));
  writeFileSync(join(repo, 'package.json'), '{"scripts":{"build":"node build.mjs"}}\n');
  writeFileSync(join(repo, 'build.mjs'), BUILD);
  writeFileSync(join(repo, 'index.html'), '<title>HEAD page</title>');
  writeFileSync(join(repo, 'src/main.ts'), 'committed source');
  git('init', '--quiet', '-b', 'main');
  git('add', '-A', '.');
  git('reset', '--quiet', '--', 'node_modules');
  git('commit', '--quiet', '-m', 'fixture');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('npm run build:clean', () => {
  it('builds HEAD: committed content in dist/, the audio-gate line and the byte count printed', () => {
    const r = buildClean();
    expect(r.status, r.stderr).toBe(0);
    expect(dist()).toBe('<title>HEAD page</title>\ncommitted source');
    expect(r.stdout).toContain('[audio-gate] ok: 0 licensed audio file(s) in the build');
    expect(r.stdout).toMatch(/dist\/ [\d,]+ bytes without audio \(budget 3,000,000\)/);
  });

  it('leaves uncommitted edits and untracked files out of the build', () => {
    writeFileSync(join(repo, 'src/main.ts'), `committed source ${SENTINEL} edit`);
    writeFileSync(join(repo, 'index.html'), `<title>${SENTINEL} page</title>`);
    writeFileSync(join(repo, 'src/untracked.ts'), `${SENTINEL} untracked`);
    const r = buildClean();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('uncommitted changes are NOT in this build');
    expect(dist()).not.toContain(SENTINEL);
    expect(dist()).toBe('<title>HEAD page</title>\ncommitted source');
  });

  it('removes its scratch directory and never touches the real node_modules', () => {
    writeFileSync(join(repo, 'node_modules/keep.txt'), 'x');
    const r = buildClean();
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(repo, 'node_modules/keep.txt'))).toBe(true);
  });

  it('--budget counts everything but audio and exits 1 over it', () => {
    // dist/ holds a 5,000-byte clip.mp3 that must not count, plus a few dozen bytes of page.
    expect(buildClean(['--budget', '1000']).status).toBe(0);
    const over = buildClean(['--budget', '1']);
    expect(over.status).toBe(1);
    expect(over.stderr).toMatch(/over budget by/);
  });

  it("exits with the build's code and leaves an earlier dist/ as it was", () => {
    mkdirSync(join(repo, 'dist'));
    writeFileSync(join(repo, 'dist/index.html'), 'PREVIOUS_OUTPUT');
    const r = buildClean([], { FIXTURE_BUILD_EXIT: '23' });
    expect(r.status).toBe(23);
    expect(dist()).toBe('PREVIOUS_OUTPUT');
  });
});
