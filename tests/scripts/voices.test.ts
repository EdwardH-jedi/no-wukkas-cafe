// The voice generator fails closed (Codex A5): with no usable voices it exits non-zero and leaves
// the manifest untouched. Runs the real script against a temp manifest with a fake `say`.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..', '..');

describe('npm run voices fails closed', () => {
  it('no installed voices: exit 1, nothing written', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nwc-voices-test-'));
    const manifest = join(dir, 'manifest.json');
    copyFileSync(join(root, 'src/data/voice/manifest.json'), manifest);
    const before = readFileSync(manifest, 'utf8');
    // A `say` that knows no voices.
    const bin = join(dir, 'bin');
    spawnSync('mkdir', ['-p', bin]);
    writeFileSync(join(bin, 'say'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'say'), 0o755);
    const run = spawnSync(process.execPath, [join(root, 'scripts/voices.ts')], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        VOICES_MANIFEST: manifest,
        VOICES_CACHE: join(dir, 'cache'),
      },
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/no installed voice for/);
    expect(readFileSync(manifest, 'utf8')).toBe(before);
  });
});
