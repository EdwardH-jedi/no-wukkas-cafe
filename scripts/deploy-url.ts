// Where a deploy lands (scripts/deploy.ts): Vite's `base` and the public address, from the git
// remote's URL and an optional custom domain. Pure, so the test can check every remote form.

export interface Site {
  /** Vite's `base`: the path the game is served under. */
  base: string;
  /** The published address, or null when the remote isn't on GitHub and there is no domain. */
  url: string | null;
}

/** The repository's name and its GitHub owner (null off GitHub) from a remote URL: https, ssh
 *  (`git@github.com:owner/repo.git`) or a local path. */
export function repoOf(remote: string): { owner: string | null; name: string } {
  const gh = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (gh) return { owner: gh[1]!, name: gh[2]! };
  const name = remote
    .replace(/\/+$/, '')
    .split(/[/\\]/)
    .pop()!
    .replace(/\.git$/, '');
  return { owner: null, name };
}

export function siteFor(remote: string, domain: string | null): Site {
  if (domain) return { base: '/', url: `https://${domain}/` };
  const { owner, name } = repoOf(remote);
  return {
    base: `/${name}/`,
    url: owner ? `https://${owner.toLowerCase()}.github.io/${name}/` : null,
  };
}
