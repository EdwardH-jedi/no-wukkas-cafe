import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { devTools } from './scripts/vite-dev-tools.ts';
import { voiceAssets } from './scripts/vite-voice.ts';

// This game runs on its own port. Older sibling projects (~/Desktop/Developer/cafe*) claim 5173
// with strictPort; sharing it made `npm run dev` here slide silently to another port while
// localhost:5173 kept showing their placeholder page. strictPort makes a clash loud instead.
export const DEV_PORT = 5183;

/** index.html's og:image must be an absolute URL for share cards: scripts/deploy.ts sets
 *  NWC_SITE_URL to the published address; elsewhere it is empty and the path stays relative. */
const siteUrl = (): Plugin => ({
  name: 'nwc-site-url',
  transformIndexHtml: (html) => html.replaceAll('__NWC_SITE_URL__', process.env.NWC_SITE_URL ?? ''),
});

export default defineConfig({
  // devTools: dev-server-only plumbing for the audio review pages in dev/ (never built).
  plugins: [voiceAssets(import.meta.dirname), devTools(import.meta.dirname), siteUrl()],
  server: { port: DEV_PORT, strictPort: true },
  preview: { port: 4183, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Headless whole-shift tests take a few seconds alone and more beside each other; vitest's
    // 5 s default timed them out on slower machines. Longer runs keep their own timeout.
    testTimeout: 20_000,
  },
});
