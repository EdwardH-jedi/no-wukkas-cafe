// Phase 7 accessibility evidence (overnight run #3 B3): each setting captured at exactly 390×844
// and 1024×640 (deviceScaleFactor 1), one JSON sidecar per capture ({item, viewport, commit,
// timestamp} plus what was measured). Skipped unless A11Y_SHOTS names the output directory:
//
//   A11Y_SHOTS=docs/verification/2026-10-18-a11y A11Y_COMMIT=$(git rev-parse --short HEAD) \
//     E2E_PORT=5202 npx playwright test --config tests/review/playwright.ipv6.config.ts a11yEvidence

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import type { RushState } from './helpers/weekBot';

const DIR = process.env.A11Y_SHOTS ?? '';
const COMMIT = process.env.A11Y_COMMIT ?? 'unknown';

const VIEWPORTS: Record<string, BrowserContextOptions> = {
  '390x844': {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  '1024x640': { viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1 },
};

/** A PNG and its sidecar: `<item>-<name>-<viewport>.{png,json}`. */
async function capture(
  page: Page,
  item: string,
  vp: string,
  name: string,
  facts: Record<string, unknown> = {},
): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const base = join(DIR, `${item}-${name}-${vp}`);
  await page.screenshot({ path: `${base}.png` });
  const sidecar = {
    item,
    viewport: vp,
    css: page.viewportSize(),
    devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
    commit: COMMIT,
    timestamp: new Date().toISOString(),
    ...facts,
  };
  writeFileSync(`${base}.json`, `${JSON.stringify(sidecar, null, 2)}\n`);
}

type Debug = { rush: RushState | null };
const rush = (page: Page): Promise<RushState | null> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.rush);

async function until<T>(
  read: () => Promise<T | null>,
  pred: (s: T) => boolean,
  ms = 60_000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const s = await read();
    if (s && pred(s)) return s;
    if (Date.now() > end) throw new Error(`timed out; last ${JSON.stringify(s)}`);
    await new Promise((ok) => setTimeout(ok, 30));
  }
}

async function open(
  browser: Browser,
  vp: string,
  extra: BrowserContextOptions = {},
  init?: (page: Page) => Promise<unknown>,
) {
  const ctx = await browser.newContext({
    ...VIEWPORTS[vp],
    ...extra,
    baseURL: test.info().project.use.baseURL,
  });
  const page = await ctx.newPage();
  if (init) await init(page);
  return { ctx, page };
}

/** Day 2 from the title, to Gaz's first intro line on screen. */
async function day2Intro(page: Page): Promise<RushState> {
  await page.goto('/?voice=0&seed=7&ibis=0');
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  const s = await until(
    () => rush(page),
    (x) => x.phase === 'intro' && x.line !== null,
  );
  await page.waitForTimeout(1500); // the subtitle types out
  return s;
}

/** Longest computed transition and animation duration (s) of a few HUD elements. */
const durations = (page: Page) =>
  page.evaluate(() => {
    const secs = (v: string): number =>
      Math.max(
        0,
        ...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1)),
      );
    return ['#rsubs', '#rtopbar', '#rsubs .text', 'button'].map((sel) => {
      const el = document.querySelector(sel);
      const cs = el ? getComputedStyle(el) : null;
      return {
        sel,
        transition: cs ? secs(cs.transitionDuration) : null,
        animation: cs ? secs(cs.animationDuration) : null,
      };
    });
  });

test.describe('Phase 7 accessibility evidence', () => {
  test.skip(!DIR, 'evidence capture only: set A11Y_SHOTS');

  for (const vp of Object.keys(VIEWPORTS)) {
    test(`d: reduced motion is respected at ${vp}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const measured: Record<string, { matches: boolean; durations: unknown }> = {};
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        const { ctx, page } = await open(browser, vp, { reducedMotion });
        await day2Intro(page);
        measured[reducedMotion] = {
          matches: await page.evaluate(
            () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          ),
          durations: await durations(page),
        };
        if (reducedMotion === 'reduce')
          await capture(page, 'd-reduced-motion', vp, 'day2-intro', {
            claim:
              'prefers-reduced-motion: UI transitions and animations collapse to 0.01 ms; the bird ' +
              'and the steam calm down (src/world/motion.ts; checked in code, a still cannot show it)',
            measured,
          });
        await ctx.close();
      }
      expect(measured.reduce?.matches).toBe(true);
      const reduced = measured.reduce?.durations as Array<{ transition: number | null }>;
      for (const d of reduced) if (d.transition !== null) expect(d.transition).toBeLessThan(0.001);
    });

    test(`a: subtitles on (default) and off at ${vp}`, async ({ browser }) => {
      test.setTimeout(120_000);
      for (const captions of [true, false]) {
        const { ctx, page } = await open(browser, vp, {}, (p) =>
          p.addInitScript(
            (c) =>
              localStorage.setItem(
                'nwc.listen.v1',
                JSON.stringify({
                  version: 2,
                  difficulty: 'normal',
                  subtitles: 'auto',
                  captions: c,
                }),
              ),
            captions,
          ),
        );
        const s = await day2Intro(page);
        const seen = await page.evaluate(() => {
          const el = document.querySelector('#rsubs') as HTMLElement | null;
          return {
            attr: document.documentElement.dataset.captions ?? null,
            display: el ? getComputedStyle(el).display : null,
            text: el?.querySelector('.text')?.textContent ?? null,
          };
        });
        await capture(page, 'a-subtitles', vp, captions ? 'on' : 'off', {
          claim: captions
            ? 'Show subtitles on (the default): captions start with the voice (A2 timing)'
            : 'Show subtitles off: no caption box, orders included',
          setting: { captions },
          line: s.line,
          seen,
        });
        if (captions) expect(seen.display).not.toBe('none');
        else expect(seen.display).toBe('none');
        await ctx.close();
      }
    });

    test(`b: text size small, medium, large at ${vp}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const W = VIEWPORTS[vp]!.viewport!.width;
      const H = VIEWPORTS[vp]!.viewport!.height;
      for (const textSize of ['s', 'm', 'l'] as const) {
        const { ctx, page } = await open(browser, vp, {}, (p) =>
          p.addInitScript(
            (t) =>
              localStorage.setItem(
                'nwc.listen.v1',
                JSON.stringify({
                  version: 2,
                  difficulty: 'normal',
                  subtitles: 'always',
                  textSize: t,
                }),
              ),
            textSize,
          ),
        );
        await day2Intro(page);
        for (let i = 0; i < 60 && (await rush(page))?.phase === 'intro'; i++) {
          await page.mouse.click(W / 2, H * 0.45);
          await page.waitForTimeout(150);
        }
        await until(
          () => rush(page),
          (s) => s.customers.some((c) => c.state === 'register'),
        );
        await page.keyboard.press('t');
        await until(
          () => rush(page),
          (s) => s.customers.some((c) => c.state === 'deciding'),
        );
        await page.waitForTimeout(1500);
        const boxes = await page.evaluate(() =>
          Object.fromEntries(
            ['#rsubs', '#rinstr', '#rail', '#pos', '#ractions'].map((sel) => {
              const el = document.querySelector(sel);
              const b = el?.getBoundingClientRect();
              const zoom = el ? getComputedStyle(el).zoom : null;
              return [sel, b ? { x: b.x, y: b.y, w: b.width, h: b.height, zoom } : null];
            }),
          ),
        );
        const scale = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim(),
        );
        const offscreen = Object.entries(boxes)
          .filter(([, b]) => b && b.w > 0 && (b.x < -1 || b.x + b.w > W + 1))
          .map(([k]) => k);
        await capture(page, 'b-text-size', vp, textSize, {
          claim:
            'Text size scales the HUD text blocks and the subtitles together (S 0.9, M 1, L 1.2)',
          setting: { textSize },
          scale,
          boxes,
          offscreen,
        });
        expect(scale).toBe(String({ s: 0.9, m: 1, l: 1.2 }[textSize]));
        for (const b of Object.values(boxes))
          if (b) expect(Number(b.zoom)).toBeCloseTo(Number(scale));
        expect(offscreen).toEqual([]);
        await ctx.close();
      }
    });

    test(`c: milk on tickets and the pass, not colour alone, at ${vp}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const W = VIEWPORTS[vp]!.viewport!.width;
      const H = VIEWPORTS[vp]!.viewport!.height;
      const { ctx, page } = await open(browser, vp);
      await day2Intro(page);
      for (let i = 0; i < 60 && (await rush(page))?.phase === 'intro'; i++) {
        await page.mouse.click(W / 2, H * 0.45);
        await page.waitForTimeout(150);
      }
      const pos = page.locator('#pos');
      const click = (n: string) => pos.getByRole('button', { name: n, exact: true }).click();
      // Ring up the first two customers as ordered (seed 7: a long black, then an almond flat white).
      for (let n = 0; n < 2; n++) {
        const at = await until(
          () => rush(page),
          (s) => s.customers.some((c) => c.state === 'register'),
          120_000,
        );
        const key = at.customers.find((c) => c.state === 'register')!.key;
        await page.keyboard.press('t');
        const s = await until(
          () => rush(page),
          (x) => x.customers.find((c) => c.key === key)?.state === 'deciding',
        );
        const o = s.customers.find((c) => c.key === key)!.order;
        await click(o.type === 'flatWhite' ? 'Flat white' : 'Long black');
        if (o.type === 'flatWhite') {
          await click(
            { full: 'Full cream', oat: 'Oat', soy: 'Soy', almond: 'Almond' }[o.milk ?? 'full'],
          );
          await click(o.extraHot ? 'Extra hot' : 'Normal');
          await click(o.heart ? 'Heart' : 'No heart');
        }
        await page.keyboard.press('Enter');
        await until(
          () => rush(page),
          (x) => x.customers.find((c) => c.key === key)?.state === 'waiting',
        );
      }
      await page.waitForTimeout(600);
      const tickets = await page.evaluate(() =>
        [...document.querySelectorAll('#rail .ticket')].map((t) => ({
          order: t.querySelector('.to')?.textContent?.trim() ?? '',
          carton: t.querySelector('.tk')?.textContent?.trim() ?? null,
        })),
      );
      await capture(page, 'c-milk-labels', vp, 'tickets', {
        claim:
          "a flat white's ticket names its carton with a shape and a word (full cream too); " +
          'the pass says the carton and its name (rushHud); no milk is told by colour alone',
        tickets,
      });
      expect(
        tickets.some((t) => t.carton !== null && /Almond|Oat|Soy|Full cream/.test(t.carton)),
      ).toBe(true);
      expect(
        tickets.filter((t) => /long black/i.test(t.order)).every((t) => t.carton === null),
      ).toBe(true);
      await ctx.close();
    });
  }
});
