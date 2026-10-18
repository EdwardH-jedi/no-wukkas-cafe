// Production build of the committed tree (todo.md T3.1): the checkout can hold untracked files the
// audio gate rightly refuses (old placeholder renders in public/assets/voice/), so this exports HEAD
// with `git archive` into a scratch directory, links node_modules, runs `npm run build` there and
// copies dist/ back. Uncommitted changes are not in the build.
//
//   npm run build:clean                       build HEAD → dist/, fail over 3,000,000 bytes
//   npm run build:clean -- --budget 2500000   another budget (bytes of everything but audio)
//
// Prints the audio gate's line(s) and the size of dist/ without audio (AGENTS.md §7: initial load
// under 3 MB before audio). Exits with the build's code, or 1 over budget. The env passes through
// to the build (scripts/deploy.ts sets NWC_BASE for Vite's `base`).

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = new Set([
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.m4a',
  '.aac',
  '.flac',
  '.aif',
  '.aiff',
  '.aifc',
  '.caf',
  '.weba',
]);

const args = process.argv.slice(2);
const at = args.indexOf('--budget');
const budget = at >= 0 ? Number(args[at + 1]) : 3_000_000;
if (!Number.isFinite(budget) || budget < 0) {
  console.error(`build:clean: --budget needs a number of bytes, got ${args[at + 1]}`);
  process.exit(2);
}

/** Bytes of every file under `dir` except audio. */
function nonAudioBytes(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += nonAudioBytes(p);
    else if (e.isFile() && !AUDIO.has(extname(e.name).toLowerCase())) n += statSync(p).size;
  }
  return n;
}

const git = (...a: string[]): string =>
  spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
const sha = git('rev-parse', '--short', 'HEAD');
if (git('status', '--porcelain', '--untracked-files=no'))
  console.log(`build:clean: building HEAD ${sha}; uncommitted changes are NOT in this build`);
else console.log(`build:clean: building HEAD ${sha}`);

const work = mkdtempSync(join(tmpdir(), 'nwc-build-'));
const modules = join(work, 'node_modules');
let code: number;
try {
  const exported = spawnSync('sh', ['-c', 'git archive HEAD | tar -x -C "$1"', 'sh', work], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (exported.status !== 0) throw new Error('git archive | tar failed');
  symlinkSync(join(ROOT, 'node_modules'), modules, 'dir');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: work,
    encoding: 'utf8',
    env: process.env,
  });
  process.stdout.write(build.stdout ?? '');
  process.stderr.write(build.stderr ?? '');
  code = build.status ?? 1;
  const gate = `${build.stdout ?? ''}${build.stderr ?? ''}`
    .split('\n')
    .filter((l) => l.includes('[audio-gate]'));
  if (code === 0) {
    const out = join(ROOT, 'dist');
    rmSync(out, { recursive: true, force: true });
    cpSync(join(work, 'dist'), out, { recursive: true });
    const bytes = nonAudioBytes(out);
    console.log('');
    for (const l of gate) console.log(l.trim());
    console.log(
      `build:clean: dist/ ${bytes.toLocaleString('en-AU')} bytes without audio (budget ${budget.toLocaleString('en-AU')})`,
    );
    if (bytes > budget) {
      console.error(
        `build:clean: over budget by ${(bytes - budget).toLocaleString('en-AU')} bytes`,
      );
      code = 1;
    }
  } else {
    for (const l of gate) console.log(l.trim());
    console.error(`build:clean: the build failed (exit ${code}); dist/ left as it was`);
  }
} finally {
  // The link first, so removing the scratch directory never reaches the real node_modules.
  if (existsSync(modules)) unlinkSync(modules);
  rmSync(work, { recursive: true, force: true });
}
process.exit(code);
