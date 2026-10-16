// Scenario 8 helpers: throwaway projects in the OS temp dir, built by Vite with the real release
// gate (scripts/vite-voice.ts) reading this repo's voice manifest and provenance list.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { build } from 'vite';
import { voiceAssets } from '../../scripts/vite-voice';

export const REPO = resolve(import.meta.dirname, '../..');

export interface Project {
  dir: string;
  dist: string;
  put(path: string, bytes?: string | Uint8Array): void;
  cleanup(): void;
}

/** A one-page app; `put` adds files (paths relative to the project, e.g. "public/x.mp3"). */
export function project(main = 'document.title = "gate";'): Project {
  const dir = mkdtempSync(join(tmpdir(), 'nwc-gate-'));
  const put = (path: string, bytes: string | Uint8Array = 'ID3 not really audio'): void => {
    const p = join(dir, path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, bytes);
  };
  put(
    'index.html',
    '<!doctype html><title>gate</title><script type="module" src="/main.js"></script>',
  );
  put('main.js', main);
  mkdirSync(join(dir, 'public'), { recursive: true });
  return {
    dir,
    dist: join(dir, 'dist'),
    put,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** `vite build` of the project with the repo's release gate. Resolves to the error, or null. */
export async function buildWithGate(p: Project, root = REPO): Promise<Error | null> {
  try {
    await build({
      root: p.dir,
      configFile: false,
      logLevel: 'silent',
      publicDir: join(p.dir, 'public'),
      plugins: [voiceAssets(root)],
      build: { outDir: p.dist, emptyOutDir: true },
    });
    return null;
  } catch (e) {
    return e as Error;
  }
}
