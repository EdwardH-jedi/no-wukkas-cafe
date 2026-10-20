// The release version lives in package.json; CHANGELOG.md has a section for it (todo.md T5.2).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version: string;
};
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

describe('release version', () => {
  it('is plain semver (major.minor.patch)', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has its own section in CHANGELOG.md', () => {
    const heading = new RegExp(`^## ${version.replaceAll('.', '\\.')}( \\(unreleased\\))?$`, 'm');
    expect(changelog).toMatch(heading);
  });
});
