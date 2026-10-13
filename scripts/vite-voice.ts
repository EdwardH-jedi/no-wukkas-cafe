// Vite plugins for audio files (docs/VOICE_ASSETS.md, docs/AUDIO_PROVENANCE.md):
//  - dev server: serves placeholder voice clips from voice-cache/ at /assets/voice/… (release
//    clips in public/assets/voice/ are served by Vite as usual);
//  - production build: every audio file in dist/ goes through the release gate
//    (scripts/audio-gate.ts). Placeholder voice clips are removed; audio with unknown or
//    unverified provenance FAILS the build, so nothing unlicensed ships silently.

import { createReadStream, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { classifyAudio, type ProvenanceLike, type VoiceManifestLike } from './audio-gate.ts';

const URL_PREFIX = '/assets/voice/';

const readJson = <T>(path: string, fallback: T): T =>
  existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

export function voiceAssets(root: string): Plugin[] {
  const cache = resolve(root, 'voice-cache');
  let outDir = resolve(root, 'dist');
  return [
    {
      name: 'nwc-voice-cache',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '').split('?')[0] ?? '';
          const base = server.config.base.replace(/\/$/, '');
          const path = url.startsWith(base) ? url.slice(base.length) : url;
          if (!path.startsWith(URL_PREFIX)) return next();
          const file = normalize(join(cache, decodeURIComponent(path.slice(URL_PREFIX.length))));
          if (!file.startsWith(cache + '/') || !existsSync(file) || !statSync(file).isFile())
            return next();
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('X-Voice-Source', 'placeholder-cache');
          createReadStream(file).pipe(res);
        });
      },
    },
    {
      name: 'nwc-audio-release-gate',
      apply: 'build',
      configResolved(config) {
        outDir = resolve(config.root, config.build.outDir);
      },
      closeBundle() {
        const voice = readJson<VoiceManifestLike>(resolve(root, 'src/data/voice/manifest.json'), {
          clips: [],
        });
        const provenance = readJson<ProvenanceLike>(
          resolve(root, 'src/data/audio/provenance.json'),
          { files: [] },
        );
        const gate = classifyAudio(listFiles(outDir), voice, provenance);
        for (const f of gate.strip) {
          const p = join(outDir, f);
          rmSync(p);
          // Drop folders the stripping emptied.
          for (let d = dirname(p); d.startsWith(join(outDir, 'assets')); d = dirname(d))
            if (readdirSync(d).length === 0) rmSync(d, { recursive: true });
            else break;
        }
        if (gate.strip.length)
          console.warn(
            `[audio-gate] removed ${gate.strip.length} placeholder voice clip(s) from ${outDir}: placeholder audio never ships`,
          );
        if (gate.reject.length) {
          const list = gate.reject.map((r) => `  ${r.file}: ${r.why}`).join('\n');
          throw new Error(
            `[audio-gate] ${gate.reject.length} audio file(s) in the build have no verified licence:\n${list}\n` +
              'Remove them from public/, or record their licence (docs/AUDIO_PROVENANCE.md).',
          );
        }
        console.log(`[audio-gate] ok: ${gate.keep.length} licensed audio file(s) in the build`);
      },
    },
  ];
}
