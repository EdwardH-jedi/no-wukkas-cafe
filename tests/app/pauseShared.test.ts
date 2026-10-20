// boot.ts and the review harness share one pause / resume / replay implementation (todo.md T2.6):
// both import all three from the same module, and src/app/ defines each of them exactly once. A
// private copy of the module (same bytes, another name) or a second definition fails here, not
// only the one-word comment check.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const SHARED = ['setPaused', 'resumeAll', 'replayLast'] as const;

/** The module (absolute, extension-less) each of the shared names is imported from. */
function importedFrom(file: string): Record<string, string[]> {
  const source = readFileSync(file, 'utf8');
  const from: Record<string, string[]> = {};
  for (const m of source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = resolve(dirname(file), m[2]!).replace(/\.ts$/, '');
    for (const name of m[1]!.split(',').map((n) => n.trim().split(/\s+as\s+/)[0]!)) {
      if ((SHARED as readonly string[]).includes(name)) (from[name] ??= []).push(target);
    }
  }
  return from;
}

describe('one pause module for boot and the review harness', () => {
  const boot = importedFrom(join(ROOT, 'src/app/boot.ts'));
  const harness = importedFrom(join(ROOT, 'tests/review/harness.ts'));

  it.each(SHARED)('%s is imported once by each, from the same module', (name) => {
    expect(boot[name], `boot imports ${name}`).toHaveLength(1);
    expect(harness[name], `the harness imports ${name}`).toHaveLength(1);
    expect(boot[name]![0]).toBe(harness[name]![0]);
    expect(boot[name]![0]).toBe(join(ROOT, 'src/app/pause'));
  });

  it.each(SHARED)('%s has exactly one exported definition under src/app/', (name) => {
    const definers = readdirSync(join(ROOT, 'src/app'))
      .filter((f) => f.endsWith('.ts'))
      .filter((f) =>
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(
          readFileSync(join(ROOT, 'src/app', f), 'utf8'),
        ),
      );
    expect(definers).toEqual(['pause.ts']);
  });

  it('the harness no longer carries its own copy', () => {
    const source = readFileSync(join(ROOT, 'tests/review/harness.ts'), 'utf8');
    expect(source).not.toContain('copied, not shared');
    for (const name of SHARED) expect(source).not.toMatch(new RegExp(`function\\s+${name}\\b`));
  });
});
