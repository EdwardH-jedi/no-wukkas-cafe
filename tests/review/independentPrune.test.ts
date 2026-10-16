// Execute only the actual prune block in a disposable fixture. Never invoke rendering or touch
// the real cache, manifest, paid staging, or public assets.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const fixtures: string[] = [];
afterEach(() => fixtures.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));
const root = resolve(import.meta.dirname, '../..');
const source = readFileSync(join(root, 'scripts/voices.ts'), 'utf8');
const from = source.indexOf('  if (prune && !failures.length) {');
const block = source.slice(from, source.indexOf('\n  const issues = validateManifest', from));

function run(prune: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'nwc-prune-review-'));
  fixtures.push(dir);
  const cache = join(dir, 'voice-cache');
  for (const name of ['voice-cache/segments', 'voice-cache/licensed', 'outside-cache'])
    mkdirSync(join(dir, name), { recursive: true });
  for (const name of [
    'voice-cache/orphan.mp3',
    'voice-cache/segments/keep.mp3',
    'voice-cache/licensed/paid.mp3',
    'outside-cache/sentinel.mp3',
  ])
    writeFileSync(join(dir, name), 'review fixture');
  symlinkSync(join(dir, 'outside-cache'), join(cache, 'linked-speaker'), 'dir');
  const code = `
    import { rmSync } from 'node:fs';
    import { listClips, cachePath, CACHE_DIR, ownIndex } from ${JSON.stringify(pathToFileURL(join(root, 'scripts/voice-node.ts')).href)};
    const prune = ${prune};
    const failures = [];
    const manifest = { clips: [] };
    ${block}
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, VOICES_CACHE: cache },
    encoding: 'utf8',
  });
  expect(child.status, child.stderr).toBe(0);
  return { dir, output: child.stdout.trim() };
}

it('pruning is explicitly gated and leaves segment/licensed indexes alone', () => {
  expect(from).toBeGreaterThan(0);
  expect(source).toContain("const prune = args.includes('--prune')");
  const off = run(false);
  expect(existsSync(join(off.dir, 'voice-cache/orphan.mp3'))).toBe(true);
  expect(existsSync(join(off.dir, 'outside-cache/sentinel.mp3'))).toBe(true);
  const on = run(true);
  console.log(on.output);
  expect(existsSync(join(on.dir, 'voice-cache/orphan.mp3'))).toBe(false);
  expect(existsSync(join(on.dir, 'voice-cache/segments/keep.mp3'))).toBe(true);
  expect(existsSync(join(on.dir, 'voice-cache/licensed/paid.mp3'))).toBe(true);
});

it('prune must never follow a cache subdirectory symlink and delete a file outside voice-cache', () => {
  const result = run(true);
  console.log(
    JSON.stringify({
      output: result.output,
      outsideSentinelSurvived: existsSync(join(result.dir, 'outside-cache/sentinel.mp3')),
    }),
  );
  expect(existsSync(join(result.dir, 'outside-cache/sentinel.mp3'))).toBe(true);
});
