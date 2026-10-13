// Vite plugins for voice clips (docs/VOICE_ASSETS.md):
//  - dev server: serves placeholder clips from voice-cache/ at /assets/voice/… (release clips in
//    public/assets/voice/ are served by Vite as usual);
//  - production build: strips any placeholder clip that ended up in dist/ (e.g. renders left in
//    public/ from before 2026-10-13), so a build never redistributes placeholder audio.

import { createReadStream, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import type { Plugin } from 'vite';

const URL_PREFIX = '/assets/voice/';

interface ManifestLike {
  clips: Array<{ file: string; source?: { placeholder?: boolean } }>;
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
          if (!file.startsWith(cache) || !existsSync(file) || !statSync(file).isFile())
            return next();
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('X-Voice-Source', 'placeholder-cache');
          createReadStream(file).pipe(res);
        });
      },
    },
    {
      name: 'nwc-voice-release-only',
      apply: 'build',
      configResolved(config) {
        outDir = resolve(config.root, config.build.outDir);
      },
      closeBundle() {
        const manifestPath = resolve(root, 'src/data/voice/manifest.json');
        if (!existsSync(manifestPath)) return;
        const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestLike;
        let stripped = 0;
        for (const c of m.clips) {
          if (c.source?.placeholder === false) continue;
          const f = join(outDir, c.file);
          if (existsSync(f)) {
            rmSync(f);
            stripped++;
            // Drop folders the stripping emptied.
            for (let d = dirname(f); d.startsWith(join(outDir, 'assets')); d = dirname(d))
              if (readdirSync(d).length === 0) rmSync(d, { recursive: true });
              else break;
          }
        }
        if (stripped)
          console.warn(
            `[voice] stripped ${stripped} placeholder clip(s) from ${outDir}: placeholder audio never ships`,
          );
      },
    },
  ];
}
