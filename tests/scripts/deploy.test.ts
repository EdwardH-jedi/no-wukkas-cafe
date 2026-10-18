// scripts/deploy.ts (todo.md T3.4) against a temporary bare "remote": a dry run commits nothing to
// the remote, --push replaces gh-pages with the build (+ .nojekyll, CNAME for a domain), and the
// temporary worktree is always removed. scripts/deploy-url.ts: Vite's base and the Pages address.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoOf, siteFor } from '../../scripts/deploy-url';

const SCRIPT = join(import.meta.dirname, '../../scripts/deploy.ts');
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
};

let dir: string;
let work: string;
let bare: string;
let dist: string;

const git = (cwd: string, ...a: string[]): string => {
  const r = spawnSync('git', a, { cwd, encoding: 'utf8', env: ENV });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const deploy = (...a: string[]) =>
  spawnSync(process.execPath, [SCRIPT, '--dist', dist, ...a], {
    cwd: work,
    encoding: 'utf8',
    env: ENV,
  });
const pages = (): string => git(bare, 'rev-parse', 'gh-pages');
const pagesFiles = (): string[] =>
  git(bare, 'ls-tree', '-r', '--name-only', 'gh-pages').split('\n');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nwc-deploy-test-'));
  bare = join(dir, 'no-wukkas-cafe.git');
  work = join(dir, 'work');
  dist = join(dir, 'dist');
  git(dir, 'init', '--quiet', '--bare', bare);
  git(dir, 'init', '--quiet', '-b', 'main', work);
  writeFileSync(join(work, 'README.md'), 'game\n');
  git(work, 'add', '.');
  git(work, 'commit', '--quiet', '-m', 'game');
  git(work, 'remote', 'add', 'origin', bare);
  git(work, 'push', '--quiet', 'origin', 'main');
  // The old site on gh-pages.
  git(work, 'checkout', '--quiet', '--orphan', 'gh-pages');
  git(work, 'rm', '-r', '-q', '--cached', '.');
  writeFileSync(join(work, 'old.html'), 'old site\n');
  git(work, 'add', 'old.html');
  git(work, 'commit', '--quiet', '-m', 'old site');
  git(work, 'push', '--quiet', 'origin', 'gh-pages');
  git(work, 'checkout', '--quiet', '-f', 'main');
  git(work, 'branch', '-D', '--quiet', 'gh-pages');
  rmSync(join(work, 'old.html'), { force: true });
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>No Wukkas Café</title>\n');
  writeFileSync(join(dist, 'assets/game.js'), 'console.log(1)\n');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('npm run deploy', () => {
  it('a dry run commits nothing to the remote and says where it would go', () => {
    const before = pages();
    const r = deploy();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/dry run, nothing pushed/);
    expect(r.stdout).toMatch(/base \/no-wukkas-cafe\//);
    expect(pages()).toBe(before);
    expect(git(work, 'worktree', 'list').split('\n')).toHaveLength(1);
    expect(git(work, 'status', '--porcelain')).toBe('');
  });

  it('--push replaces gh-pages with the build and .nojekyll', () => {
    const before = pages();
    const r = deploy('--push');
    expect(r.status, r.stderr).toBe(0);
    expect(pages()).not.toBe(before);
    expect(git(bare, 'log', '-1', '--format=%s', 'gh-pages')).toBe(
      `deploy ${git(work, 'rev-parse', '--short', 'HEAD')}`,
    );
    expect(git(bare, 'rev-parse', 'gh-pages^')).toBe(before);
    expect(pagesFiles().sort()).toEqual(['.nojekyll', 'assets/game.js', 'index.html']);
    expect(git(work, 'worktree', 'list').split('\n')).toHaveLength(1);
  });

  it('a custom domain writes CNAME and serves from /', () => {
    const r = deploy('--domain', 'cafe.example.com', '--push');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/URL https:\/\/cafe\.example\.com\//);
    expect(r.stdout).toMatch(/base \/$/m);
    expect(git(bare, 'show', 'gh-pages:CNAME')).toBe('cafe.example.com');
  });

  it('the same build twice pushes nothing new', () => {
    deploy('--push');
    const once = pages();
    const r = deploy('--push');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/nothing to push/);
    expect(pages()).toBe(once);
  });

  it('refuses without a gh-pages branch on the remote', () => {
    git(bare, 'branch', '-D', 'gh-pages');
    const r = deploy();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/has no gh-pages branch/);
  });
});

describe('siteFor', () => {
  it('GitHub remotes publish under /<repo>/ on <owner>.github.io', () => {
    for (const remote of [
      'https://github.com/EdwardH-jedi/no-wukkas-cafe.git',
      'git@github.com:EdwardH-jedi/no-wukkas-cafe.git',
      'https://github.com/EdwardH-jedi/no-wukkas-cafe',
    ])
      expect(siteFor(remote, null)).toEqual({
        base: '/no-wukkas-cafe/',
        url: 'https://edwardh-jedi.github.io/no-wukkas-cafe/',
      });
  });

  it('a domain serves from / at that domain; a local remote has no address', () => {
    expect(siteFor('git@github.com:a/b.git', 'cafe.example.com')).toEqual({
      base: '/',
      url: 'https://cafe.example.com/',
    });
    expect(repoOf('/tmp/x/no-wukkas-cafe.git')).toEqual({ owner: null, name: 'no-wukkas-cafe' });
    expect(siteFor('/tmp/x/no-wukkas-cafe.git', null).url).toBeNull();
  });
});
