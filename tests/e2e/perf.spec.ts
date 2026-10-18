// Draw-call budget (AGENTS.md §7, todo.md T3.3): fewer than 150 draw calls in the café view with
// customers in it, on a desktop and a phone viewport. Read from the dev handle (renderer.info of
// the last frame). Headless Chromium is a proxy, not a device: frame times here say little, so
// they are only logged (reports/perf/<viewport>.json, gitignored), never asserted.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContextOptions, type Page } from '@playwright/test';

const BUDGET = 150;
const VIEWPORTS: Record<string, BrowserContextOptions> = {
  '1024x640': { viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1 },
  '390x844': {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
};
const IN_CAFE = new Set(['entering', 'queue', 'register', 'ordering', 'deciding', 'waiting']);

type Perf = {
  phase: string;
  customers: Array<{ state: string }>;
  drawCalls: number;
} | null;
const rush = (page: Page): Promise<Perf> =>
  page.evaluate(() => (window as unknown as { __trial: { rush: Perf } }).__trial.rush);

async function until(page: Page, pred: (s: NonNullable<Perf>) => boolean, ms = 90_000) {
  const end = Date.now() + ms;
  for (;;) {
    const s = await rush(page);
    if (s && pred(s)) return s;
    if (Date.now() > end) throw new Error(`timed out; last ${JSON.stringify(s)}`);
    await page.waitForTimeout(50);
  }
}

for (const [vp, opts] of Object.entries(VIEWPORTS)) {
  test(`fewer than ${BUDGET} draw calls with three customers in the café at ${vp}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ ...opts, baseURL: test.info().project.use.baseURL });
    const page = await ctx.newPage();
    const { width: W, height: H } = page.viewportSize()!;
    await page.goto('/?voice=0&seed=7&ibis=0');
    await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
    await until(page, (s) => s.phase === 'intro');
    for (let i = 0; i < 60 && (await rush(page))?.phase === 'intro'; i++) {
      await page.mouse.click(W / 2, H * 0.45);
      await page.waitForTimeout(150);
    }
    // Nobody is served, so the café fills; 4x game speed gets there sooner.
    await page.evaluate(() => {
      (window as unknown as { __trial: { timeScale: number } }).__trial.timeScale = 4;
    });
    await until(page, (s) => s.customers.filter((c) => IN_CAFE.has(c.state)).length >= 3);
    await page.evaluate(() => {
      (window as unknown as { __trial: { timeScale: number } }).__trial.timeScale = 1;
    });
    // The worst of a second of frames, and the frame times over two seconds.
    let worst = 0;
    for (let i = 0; i < 20; i++) {
      worst = Math.max(worst, (await rush(page))!.drawCalls);
      await page.waitForTimeout(50);
    }
    const frames = await page.evaluate(
      () =>
        new Promise<number[]>((done) => {
          const out: number[] = [];
          let last = performance.now();
          const end = last + 2000;
          const tick = (now: number): void => {
            out.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(tick);
            else done(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    const sorted = [...frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const inCafe = (await rush(page))!.customers.filter((c) => IN_CAFE.has(c.state)).length;
    const dir = join(import.meta.dirname, '../../reports/perf');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${vp}.json`),
      `${JSON.stringify({ viewport: vp, drawCalls: worst, budget: BUDGET, inCafe, frames: frames.length, frameMedianMs: Math.round(median * 100) / 100, at: new Date().toISOString() }, null, 2)}\n`,
    );
    console.log(
      `perf ${vp}: ${worst} draw calls, ${inCafe} in the café, median frame ${median.toFixed(1)} ms`,
    );
    expect(worst, `draw calls at ${vp}`).toBeLessThan(BUDGET);
    await ctx.close();
  });
}
