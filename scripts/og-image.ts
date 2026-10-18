// The share-card image (todo.md T3.2): the title screen at 1200×630, written to public/og.png.
// Starts the Vite dev server in-process on a free port, opens the game with voices off, waits for
// the title and the café behind it, and screenshots the page. A capture over 300 kB is re-encoded
// as a 256-colour PNG with ffmpeg (already needed by the voice scripts).
//
//   node scripts/og-image.ts            → public/og.png

import { spawnSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/og.png');
const MAX = 300_000;

const server = await createServer({
  root: ROOT,
  server: { host: '127.0.0.1', port: 5211, strictPort: false, open: false },
  logLevel: 'warn',
});
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('og-image: the dev server has no local URL');

const scratch = mkdtempSync(join(tmpdir(), 'nwc-og-'));
const raw = join(scratch, 'raw.png');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(`${base}?voice=0&seed=1`);
  await page.locator('#title').waitFor({ state: 'visible', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  // The café scene and the neon redraw after the fonts: give them a few frames.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: raw });
} finally {
  await browser.close();
  await server.close();
}

if (statSync(raw).size > MAX) {
  const q = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      raw,
      '-vf',
      'split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a',
      OUT,
    ],
    { stdio: 'inherit' },
  );
  if (q.status !== 0) throw new Error('og-image: ffmpeg failed');
} else renameSync(raw, OUT);
rmSync(scratch, { recursive: true, force: true });
const size = statSync(OUT).size;
console.log(`og-image: ${OUT} ${size.toLocaleString('en-AU')} bytes`);
if (size > MAX) {
  console.error(`og-image: still over ${MAX.toLocaleString('en-AU')} bytes`);
  process.exit(1);
}
