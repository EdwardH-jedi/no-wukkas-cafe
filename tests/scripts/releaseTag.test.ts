// scripts/release-tag.ts (todo.md T5.4) in a temporary repository with a bare "origin": it tags
// v<version> on main only when the tree is clean (untracked files included), HEAD is main, main
// equals origin/main, the tag is new and the release check passes, and it never pushes.
// NWC_RELEASE_CHECK stands in for `npm run release:check`; it leaves a mark outside the repo, so a
// refusal can show the slow check never ran.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../../scripts/release-tag.ts');
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
let mark: string;

const git = (cwd: string, ...a: string[]): string => {
  const r = spawnSync('git', a, { cwd, encoding: 'utf8', env: ENV });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const tagNow = (check: 'pass' | 'fail' = 'pass') =>
  spawnSync(process.execPath, [SCRIPT], {
    cwd: work,
    encoding: 'utf8',
    env: {
      ...ENV,
      NWC_RELEASE_CHECK: `node -e "require('fs').writeFileSync(process.argv[1], '')" "${mark}"${check === 'fail' ? ' && exit 3' : ''}`,
    },
  });
const tags = (repo: string): string[] => git(repo, 'tag', '--list').split('\n').filter(Boolean);
const commit = (file: string, text: string): void => {
  writeFileSync(join(work, file), text);
  git(work, 'add', file);
  git(work, 'commit', '--quiet', '-m', file);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nwc-release-tag-test-'));
  bare = join(dir, 'origin.git');
  work = join(dir, 'work');
  mark = join(dir, 'check-ran');
  git(dir, 'init', '--quiet', '--bare', '-b', 'main', bare);
  git(dir, 'init', '--quiet', '-b', 'main', work);
  writeFileSync(join(work, '.gitignore'), 'dist/\n');
  commit('package.json', JSON.stringify({ name: 'game', version: '0.1.0' }));
  git(work, 'add', '.gitignore');
  git(work, 'commit', '--quiet', '-m', 'ignore');
  git(work, 'remote', 'add', 'origin', bare);
  git(work, 'push', '--quiet', 'origin', 'main');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('npm run release:tag', () => {
  it('tags v<version> at main locally, prints the push command and pushes nothing', () => {
    mkdirSync(join(work, 'dist'));
    writeFileSync(join(work, 'dist/index.html'), ''); // gitignored: doesn't make the tree dirty
    const r = tagNow();
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(mark)).toBe(true);
    expect(tags(work)).toEqual(['v0.1.0']);
    expect(git(work, 'rev-parse', 'v0.1.0^{commit}')).toBe(git(work, 'rev-parse', 'main'));
    expect(git(work, 'cat-file', '-t', 'v0.1.0')).toBe('tag'); // annotated
    expect(r.stdout).toMatch(/release:tag: to publish it: git push origin v0\.1\.0$/m);
    expect(tags(bare)).toEqual([]);
  });

  it('refuses a dirty tree: a changed tracked file', () => {
    writeFileSync(join(work, 'package.json'), JSON.stringify({ version: '0.1.1' }));
    const r = tagNow();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/refused: the working tree is not clean[\s\S]*package\.json/);
    expect(existsSync(mark)).toBe(false);
    expect(tags(work)).toEqual([]);
  });

  it('refuses a dirty tree: an untracked file (not gitignored)', () => {
    writeFileSync(join(work, 'notes.md'), 'scratch\n');
    const r = tagNow();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/refused: the working tree is not clean[\s\S]*\?\? notes\.md/);
    expect(existsSync(mark)).toBe(false);
    expect(tags(work)).toEqual([]);
  });

  it('refuses when main is not origin/main (ahead, or HEAD elsewhere)', () => {
    commit('local.txt', 'not pushed\n');
    const ahead = tagNow();
    expect(ahead.status).toBe(1);
    expect(ahead.stderr).toMatch(/refused: main \(\w{7}\) is not origin\/main \(\w{7}\)/);

    git(work, 'push', '--quiet', 'origin', 'main');
    git(work, 'switch', '--quiet', '-c', 'feat/x');
    const branch = tagNow();
    expect(branch.status).toBe(1);
    expect(branch.stderr).toMatch(/refused: HEAD is feat\/x, not main/);
    expect(existsSync(mark)).toBe(false);
    expect(tags(work)).toEqual([]);
  });

  it('sees a remote main that moved on since the last fetch', () => {
    const other = join(dir, 'other');
    git(dir, 'clone', '--quiet', bare, other);
    writeFileSync(join(other, 'more.txt'), 'pushed elsewhere\n');
    git(other, 'add', 'more.txt');
    git(other, 'commit', '--quiet', '-m', 'more');
    git(other, 'push', '--quiet', 'origin', 'main');
    const r = tagNow();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is not origin\/main/);
    expect(tags(work)).toEqual([]);
  });

  it('refuses when the release check fails, and tags nothing', () => {
    const r = tagNow('fail');
    expect(existsSync(mark)).toBe(true);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/refused: the release check failed \(exit 3\); nothing tagged/);
    expect(tags(work)).toEqual([]);
  });

  it('refuses a tag that already exists, and a version that is not major.minor.patch', () => {
    git(work, 'tag', 'v0.1.0');
    const again = tagNow();
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/refused: v0\.1\.0 already exists/);

    git(work, 'tag', '-d', 'v0.1.0');
    commit('package.json', JSON.stringify({ version: '0.1' }));
    git(work, 'push', '--quiet', 'origin', 'main');
    const bad = tagNow();
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/refused: package\.json version "0\.1" is not major\.minor\.patch/);
    expect(existsSync(mark)).toBe(false);
    expect(tags(work)).toEqual([]);
  });
});
