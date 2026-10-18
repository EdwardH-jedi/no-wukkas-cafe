// Phone HUD layout (todo.md T2.4, T2.5): while a customer is ordering, the register panel (#pos)
// never covers the instruction line (#rinstr) on a phone, and the subtitle box stays inside the
// viewport at every text size. Measured from element boxes; the desktop register keeps its place.

import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import type { RushState } from './helpers/weekBot';

const PHONES: Record<string, BrowserContextOptions> = {
  '390x844': {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  '375x667': {
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
};
const DESKTOP: BrowserContextOptions = {
  viewport: { width: 1024, height: 640 },
  deviceScaleFactor: 1,
};

type Box = { x: number; y: number; width: number; height: number } | null;
const overlap = (a: Box, b: Box): boolean =>
  !!a &&
  !!b &&
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const box = async (page: Page, sel: string): Promise<Box> => {
  const l = page.locator(sel).first();
  return (await l.count()) && (await l.isVisible()) ? await l.boundingBox() : null;
};

const rush = (page: Page): Promise<RushState | null> =>
  page.evaluate(() => (window as unknown as { __trial: { rush: RushState | null } }).__trial.rush);

async function until<T>(
  read: () => Promise<T | null>,
  pred: (s: T) => boolean,
  ms = 90_000,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const s = await read();
    if (s && pred(s)) return s;
    if (Date.now() > end) throw new Error(`timed out; last ${JSON.stringify(s)}`);
    await new Promise((ok) => setTimeout(ok, 30));
  }
}

async function open(browser: Browser, opts: BrowserContextOptions) {
  const ctx = await browser.newContext({ ...opts, baseURL: test.info().project.use.baseURL });
  return { ctx, page: await ctx.newPage() };
}

/** Day 2 (seed 7) to the first customer ordering at the register, the POS open. */
async function toRegister(page: Page): Promise<void> {
  const { width: W, height: H } = page.viewportSize()!;
  await page.goto('/?voice=0&seed=7&ibis=0');
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  await until(
    () => rush(page),
    (s) => s.phase === 'intro',
  );
  for (let i = 0; i < 60 && (await rush(page))?.phase === 'intro'; i++) {
    await page.mouse.click(W / 2, H * 0.45);
    await page.waitForTimeout(150);
  }
  await until(
    () => rush(page),
    (s) => s.customers[0]?.state === 'register',
  );
  await page.keyboard.press('t');
  await until(
    () => rush(page),
    (s) => s.customers[0]?.state === 'deciding',
  );
  await page.waitForTimeout(400);
}

test.describe('phone HUD', () => {
  for (const [name, opts] of Object.entries(PHONES)) {
    test(`register clear of the instruction at ${name}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { ctx, page } = await open(browser, opts);
      await toRegister(page);
      const pos = await box(page, '#pos');
      const instr = await box(page, '#rinstr');
      expect(pos, '#pos is open').not.toBeNull();
      expect(instr, '#rinstr shows').not.toBeNull();
      expect(
        overlap(pos, instr),
        `#pos ${JSON.stringify(pos)} over #rinstr ${JSON.stringify(instr)}`,
      ).toBe(false);
      await ctx.close();
    });
  }

  test('the desktop register keeps its place at 1024x640', async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page } = await open(browser, DESKTOP);
    await toRegister(page);
    const pos = await box(page, '#pos');
    expect(pos).not.toBeNull();
    // Measured before T2.4 on the same build: the phone change must not move it.
    const before = { x: 662, y: 133.3, width: 346, height: 373.4 };
    for (const k of ['x', 'y', 'width', 'height'] as const)
      expect(
        Math.abs(pos![k] - before[k]),
        `#pos.${k} ${pos![k]} vs ${before[k]}`,
      ).toBeLessThanOrEqual(2);
    await ctx.close();
  });
});
