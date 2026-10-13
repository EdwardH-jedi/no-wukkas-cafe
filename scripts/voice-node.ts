// Node-only helpers shared by the voice scripts (render + check). Not bundled into the game.

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// src/ uses bundler-style extensionless imports; teach Node to try `.ts`.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

export const run = promisify(execFile);
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Overridable for tests (VOICES_MANIFEST / VOICES_CACHE) so they never touch the real files. */
export const MANIFEST = process.env.VOICES_MANIFEST ?? join(ROOT, 'src/data/voice/manifest.json');
const CACHE = process.env.VOICES_CACHE ?? join(ROOT, 'voice-cache');

const URL_PREFIX = 'assets/voice/';
/** Placeholder clips: gitignored cache, served by the dev server only. */
export const cachePath = (file: string): string => join(CACHE, file.slice(URL_PREFIX.length));
export const CACHE_DIR = CACHE;
/** Release clips (and pre-2026-10-13 placeholder renders): bundled from public/. */
export const publicPath = (file: string): string => join(ROOT, 'public', file);

export interface Measured {
  duration: number;
  meanDb: number;
  maxDb: number;
}

export async function measure(file: string, loudness = true): Promise<Measured> {
  const probe = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  const duration = Math.round(Number(probe.stdout.trim()) * 1000) / 1000;
  if (!loudness) return { duration, meanDb: Number.NaN, maxDb: Number.NaN };
  const vol = await run('ffmpeg', [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]);
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(vol.stderr);
  const max = /max_volume:\s*(-?[\d.]+) dB/.exec(vol.stderr);
  return { duration, meanDb: Number(mean?.[1] ?? -91), maxDb: Number(max?.[1] ?? -91) };
}

/** Run `fn` over `items` with at most `n` in flight. */
export async function pool<T>(
  items: readonly T[],
  n: number,
  fn: (t: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (i < items.length) await fn(items[i++] as T);
    }),
  );
}

/** Every .mp3 under `dir`, as URL paths ("assets/voice/<speaker>/<file>"). */
export function listClips(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.mp3'))
        out.push(`${URL_PREFIX}${relative(dir, p).split('\\').join('/')}`);
    }
  };
  walk(dir);
  return out.sort();
}

export const argValue = (args: readonly string[], flag: string): string | null => {
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
