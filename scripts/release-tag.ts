// Tag a release (todo.md T5.4): `v<package.json version>` on main, locally. Never pushes; it prints
// the push command, which is Edward's to run. Refuses, cheapest check first, unless:
//
//   1. the working tree is clean: no changes and no untracked files (gitignored ones don't count).
//      The release check below runs on the working tree, so anything not in the commit could pass
//      it for a tree that isn't the one being tagged;
//   2. HEAD is main, and main equals origin/main after a fetch;
//   3. the tag doesn't exist yet and the version is plain semver;
//   4. `npm run release:check` passes (every voice clip licensed, then the build with the audio gate);
//   5. after the check, 1 and 2 still hold and main is still the commit that was checked. The tag
//      goes on that commit.
//
//   npm run release:tag
//
// NWC_RELEASE_CHECK replaces the check command, for tests only (release:check can't pass in a
// temporary repository). The git repository is the working directory (npm runs scripts from the
// package root).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REMOTE = 'origin';
const BRANCH = 'main';
const CHECK = process.env.NWC_RELEASE_CHECK ?? 'npm run release:check';
const cwd = process.cwd();

const refuse = (msg: string): never => {
  console.error(`release:tag: refused: ${msg}`);
  process.exit(1);
};
function git(a: readonly string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync('git', a, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout.trimEnd(), err: r.stderr.trim() };
}

/** Gates 1 and 2; returns the commit main is on. `when` names the pass in a refusal. */
function preflight(when: string): string {
  const no = (msg: string): never => refuse(`${msg}${when}`);
  const status = git(['status', '--porcelain', '--untracked-files=all']);
  if (!status.ok) no(`git status failed: ${status.err}`);
  if (status.out)
    no(`the working tree is not clean (commit, move or ignore these)${when}:\n${status.out}`);
  const head = git(['symbolic-ref', '--quiet', '--short', 'HEAD']).out;
  if (head !== BRANCH) no(`HEAD is ${head || 'detached'}, not ${BRANCH}`);
  const fetched = git(['fetch', '--quiet', REMOTE, `${BRANCH}:refs/remotes/${REMOTE}/${BRANCH}`]);
  if (!fetched.ok) no(`could not fetch ${REMOTE} ${BRANCH}: ${fetched.err}`);
  const local = git(['rev-parse', `${BRANCH}^{commit}`]).out;
  const remote = git(['rev-parse', `${REMOTE}/${BRANCH}^{commit}`]).out;
  if (local !== remote)
    no(`${BRANCH} (${local.slice(0, 7)}) is not ${REMOTE}/${BRANCH} (${remote.slice(0, 7)})`);
  return local;
}

const checked = preflight('');

const { version } = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
  version?: unknown;
};
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version))
  refuse(`package.json version ${JSON.stringify(version)} is not major.minor.patch`);
const tag = `v${version as string}`;
if (git(['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`]).ok)
  refuse(`${tag} already exists`);

console.log(`release:tag: ${CHECK}`);
const check = spawnSync(CHECK, { cwd, shell: true, stdio: 'inherit' });
if (check.status !== 0) refuse(`the release check failed (exit ${check.status}); nothing tagged`);

// The check takes minutes, and the tree, main or origin/main can move meanwhile: run the gates again
// and tag the commit that was checked, never the branch name (todo.md M5 gate review F1).
const now = preflight(' after the release check; nothing tagged');
if (now !== checked)
  refuse(
    `${BRANCH} moved during the release check (${checked.slice(0, 7)} → ${now.slice(0, 7)}); nothing tagged`,
  );
const tagged = git(['tag', '-a', tag, '-m', `No Wukkas Café ${version as string}`, checked]);
if (!tagged.ok) refuse(`git tag failed: ${tagged.err}`);
console.log(`release:tag: tagged ${tag} at ${checked.slice(0, 7)} (local only, nothing pushed)`);
console.log(`release:tag: to publish it: git push ${REMOTE} ${tag}`);
