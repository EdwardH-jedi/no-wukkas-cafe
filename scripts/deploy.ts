// Publish the game to GitHub Pages (todo.md T3.4). Dry run by default: builds HEAD (npm run
// build:clean, with Vite's base for the Pages path), puts dist/ into a temporary worktree of the
// remote's gh-pages branch with .nojekyll (and CNAME for a custom domain), commits "deploy <sha>",
// prints where it would go, and removes the worktree. Only --push publishes.
//
//   npm run deploy                         build + dry run → prints the URL
//   npm run deploy -- --push               the same, then push gh-pages
//   npm run deploy -- --domain cafe.example.com [--push]   base "/" + CNAME
//   --remote <name> (origin) · --branch <name> (gh-pages) · --dist <dir> (skip the build; tests)
//
// The git repository is the working directory (npm runs scripts from the package root).

import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteFor } from './deploy-url.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const push = args.includes('--push');
const domain = opt('--domain');
const remote = opt('--remote') ?? 'origin';
const branch = opt('--branch') ?? 'gh-pages';
const prebuilt = opt('--dist');
const cwd = process.cwd();

function git(a: readonly string[], o: SpawnSyncOptions = {}): string {
  const r = spawnSync('git', a, { cwd, encoding: 'utf8', ...o });
  if (r.status !== 0) {
    const err = typeof r.stderr === 'string' ? r.stderr.trim() : '';
    throw new Error(`git ${a.join(' ')} failed${err ? `: ${err}` : ''}`);
  }
  return typeof r.stdout === 'string' ? r.stdout.trim() : '';
}
const fail = (msg: string): never => {
  console.error(`deploy: ${msg}`);
  process.exit(1);
};

const remoteUrl = git(['remote', 'get-url', remote]);
const site = siteFor(remoteUrl, domain);
const sha = git(['rev-parse', '--short', 'HEAD']);

let dist: string;
if (prebuilt) dist = resolve(prebuilt);
else {
  const b = spawnSync(process.execPath, [join(ROOT, 'scripts/build-clean.ts')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NWC_BASE: site.base, NWC_SITE_URL: site.url ?? '' },
  });
  if (b.status !== 0) fail(`the build failed (exit ${b.status}); nothing deployed`);
  dist = join(ROOT, 'dist');
}
if (!existsSync(join(dist, 'index.html'))) fail(`${dist} has no index.html`);

try {
  git(['fetch', '--quiet', remote, `${branch}:refs/remotes/${remote}/${branch}`]);
} catch {
  fail(`${remote} has no ${branch} branch; create it once, then deploy`);
}

const tree = mkdtempSync(join(tmpdir(), 'nwc-deploy-'));
rmSync(tree, { recursive: true, force: true });
try {
  git(['worktree', 'add', '--quiet', '--detach', tree, `${remote}/${branch}`]);
  const inTree = (a: readonly string[]): string => git(a, { cwd: tree });
  inTree(['rm', '-r', '-q', '--ignore-unmatch', '.']);
  for (const e of readdirSync(dist)) cpSync(join(dist, e), join(tree, e), { recursive: true });
  writeFileSync(join(tree, '.nojekyll'), '');
  if (domain) writeFileSync(join(tree, 'CNAME'), `${domain}\n`);
  inTree(['add', '-A']);
  const files = inTree(['ls-files']).split('\n').filter(Boolean).length;
  const changed = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: tree }).status !== 0;
  if (!changed)
    console.log(`deploy: ${remote}/${branch} already holds this build; nothing to commit`);
  else inTree(['commit', '--quiet', '-m', `deploy ${sha}`]);
  const commit = inTree(['rev-parse', '--short', 'HEAD']);
  console.log(
    `deploy: ${commit} "deploy ${sha}" on ${remote}/${branch}, ${files} files, base ${site.base}`,
  );
  console.log(`deploy: URL ${site.url ?? '(not a GitHub remote: no Pages address)'}`);
  if (!push) console.log(`deploy: dry run, nothing pushed. To publish: npm run deploy -- --push`);
  else if (!changed) console.log('deploy: nothing to push');
  else {
    inTree(['push', '--quiet', remote, `HEAD:refs/heads/${branch}`]);
    console.log(`deploy: pushed ${commit} to ${remote} ${branch}`);
  }
} finally {
  if (existsSync(tree)) spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd });
  spawnSync('git', ['worktree', 'prune'], { cwd });
}
