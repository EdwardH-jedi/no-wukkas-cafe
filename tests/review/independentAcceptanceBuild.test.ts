// Exercise the script boundary, including dirty source and deploy-to-build environment handoff.
// Temporary detached worktrees only; no source in the review checkout is modified.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const trees: string[] = [];
function fixture(): string {
  const tree = join(mkdtempSync(join(tmpdir(), 'nwc-acceptance-test-')), 'tree');
  const add = spawnSync('git', ['worktree', 'add', '--detach', tree, 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  expect(add.status, add.stderr).toBe(0);
  trees.push(tree);
  symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'), 'dir');
  for (const file of ['build-clean.ts', 'deploy.ts'])
    copyFileSync(join(ROOT, 'scripts', file), join(tree, 'scripts', file));
  return tree;
}
afterEach(() => {
  for (const tree of trees.splice(0)) {
    const removed = spawnSync('git', ['worktree', 'remove', '--force', tree], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(removed.status, removed.stderr).toBe(0);
  }
});

it('build:clean excludes an observable uncommitted source change from HEAD output', () => {
  const tree = fixture();
  const marker = 'INDEPENDENT_ACCEPTANCE_DIRTY_SOURCE_MUST_NOT_SHIP';
  appendFileSync(join(tree, 'src/main.ts'), `\nconsole.info('${marker}');\n`);
  // An HTML marker makes the output inspectable without depending on Rollup chunk naming.
  appendFileSync(join(tree, 'index.html'), `\n<!-- ${marker} -->\n`);
  const built = spawnSync(process.execPath, ['scripts/build-clean.ts'], {
    cwd: tree,
    encoding: 'utf8',
    timeout: 120_000,
  });
  expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
  expect(built.stdout).toContain('[audio-gate] ok:');
  expect(readFileSync(join(tree, 'dist/index.html'), 'utf8')).not.toContain(marker);
}, 150_000);

it('build:clean preserves the child build exit code and existing output on failure', () => {
  const tree = fixture();
  const bin = join(tree, 'docs', 'acceptance-bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 23\n');
  chmodSync(join(bin, 'npm'), 0o755);
  mkdirSync(join(tree, 'dist'));
  writeFileSync(join(tree, 'dist', 'index.html'), 'PREVIOUS_OUTPUT');
  const run = spawnSync(process.execPath, ['scripts/build-clean.ts'], {
    cwd: tree,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(23);
  expect(readFileSync(join(tree, 'dist/index.html'), 'utf8')).toBe('PREVIOUS_OUTPUT');
});

it.each([
  [[], '/no-wukkas-cafe/', 'https://edwardh-jedi.github.io/no-wukkas-cafe/'],
  [['--domain', 'cafe.example.com'], '/', 'https://cafe.example.com/'],
] as const)('deploy passes the actual build its base and site URL (%j)', (args, base, url) => {
  const tree = fixture();
  // Stop before any fetch, worktree commit or push, observing the real child environment.
  writeFileSync(
    join(tree, 'scripts/build-clean.ts'),
    'console.log("ACCEPTANCE_ENV=" + JSON.stringify({base:process.env.NWC_BASE,url:process.env.NWC_SITE_URL})); process.exit(19);\n',
  );
  const run = spawnSync(process.execPath, ['scripts/deploy.ts', ...args], {
    cwd: tree,
    encoding: 'utf8',
    env: { ...process.env, NWC_BASE: '', NWC_SITE_URL: '' },
  });
  expect(run.status).toBe(1);
  const line = run.stdout.split('\n').find((x) => x.startsWith('ACCEPTANCE_ENV='));
  expect(line).toBeDefined();
  expect(JSON.parse(line!.slice('ACCEPTANCE_ENV='.length))).toEqual({ base, url });
});
