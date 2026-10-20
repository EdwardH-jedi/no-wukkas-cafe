// Phone HUD layout (todo.md T2.4, T2.5, T5.6): while a customer is ordering, the register panel (#pos)
// never covers the instruction line (#rinstr) on a phone at any text size, also with a drink on the
// pass, and the subtitle box
// stays inside the viewport at every text size. Measured from element boxes; the desktop register
// keeps its place.

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

const SIZES = ['s', 'm', 'l'] as const;
type TextSize = (typeof SIZES)[number];

/** Settings → Text size, stored before the page loads (the HUD zooms by it). */
async function setTextSize(page: Page, size: TextSize): Promise<void> {
  await page.addInitScript(
    (t) =>
      localStorage.setItem(
        'nwc.listen.v1',
        JSON.stringify({ version: 2, difficulty: 'normal', subtitles: 'always', textSize: t }),
      ),
    size,
  );
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

/** Day 2 (seed 7): the first customer's long black made and left on the pass, then the next
 *  customer ordering at the register with the POS open. The side buttons ("Bin it") are out, so
 *  rush.css's second phone #pos rule (`#rbl:has(> #ractions.side:not(:empty)) ~ #pos`) applies. */
async function toPassAndRegister(page: Page): Promise<void> {
  await toRegister(page);
  const { width: W, height: H } = page.viewportSize()!;
  const mid = { x: W / 2, y: H * 0.6 };
  const first = (await rush(page))!.customers[0]!;
  expect(first.order.type, "seed 7's first order").toBe('longBlack');
  await page.locator('#pos').getByRole('button', { name: 'Long black', exact: true }).click();
  await page.keyboard.press('Enter');
  await until(
    () => rush(page),
    (s) => s.customers[0]?.state === 'waiting',
  );
  await page.keyboard.press('f');
  await until(
    () => rush(page),
    (s) => s.station === 'grind',
  );
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await until(
    () => rush(page),
    (s) => s.dose >= 18.6,
  );
  await page.mouse.up();
  await page.keyboard.press('Enter');
  await until(
    () => rush(page),
    (s) => s.station === 'water',
  );
  await page.mouse.down();
  await until(
    () => rush(page),
    (s) => s.water >= 0.62,
  );
  await page.mouse.up();
  await until(
    () => rush(page),
    (s) => s.station === 'shot',
  );
  await page.mouse.click(mid.x, mid.y);
  await until(
    () => rush(page),
    (s) => s.shotTime >= 26.5,
  );
  await page.mouse.click(mid.x, mid.y);
  await until(
    () => rush(page),
    (s) => s.ready !== null,
  );
  await until(
    () => rush(page),
    (s) => s.customers.some((c) => c.state === 'register'),
    120_000,
  );
  await page.keyboard.press('t');
  await until(
    () => rush(page),
    (s) => s.customers.some((c) => c.state === 'deciding'),
  );
  await page.waitForTimeout(400);
}

test.describe('phone HUD', () => {
  // #pos is zoomed by the text size, which scales its own `top` too: Small once left it 4.8 px
  // short of the instruction's bottom edge (acceptance audit F3), so every size is measured.
  for (const [name, opts] of Object.entries(PHONES)) {
    for (const size of SIZES) {
      test(`register clear of the instruction at ${name}, text size ${size}`, async ({
        browser,
      }) => {
        test.setTimeout(180_000);
        const { ctx, page } = await open(browser, opts);
        await setTextSize(page, size);
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
  }

  // A drink on the pass while the next customer orders (todo.md T5.6): the register moves up out of
  // the side buttons' way by the same formula (acceptance F3), so it is measured the same way.
  for (const [name, opts] of Object.entries(PHONES)) {
    for (const size of SIZES) {
      test(`register under the instruction with a drink on the pass at ${name}, text size ${size}`, async ({
        browser,
      }) => {
        test.setTimeout(240_000);
        const { ctx, page } = await open(browser, opts);
        await setTextSize(page, size);
        await toPassAndRegister(page);
        expect(await page.locator('#rbl > #ractions.side:not(:empty)').count()).toBe(1);
        expect(await box(page, '#ractions button[data-a="bin"]'), '"Bin it" shows').not.toBeNull();
        const pos = await box(page, '#pos');
        const instr = await box(page, '#rinstr');
        expect(pos, '#pos is open').not.toBeNull();
        expect(instr, '#rinstr shows').not.toBeNull();
        const bottom = instr!.y + instr!.height;
        expect(pos!.y, `#pos top ${pos!.y} vs #rinstr bottom ${bottom}`).toBeGreaterThanOrEqual(
          bottom,
        );
        await ctx.close();
      });
    }
  }

  // The literal Day 1 #subs (todo.md T2.5; acceptance audit F9) on both phones at every text size.
  // The screen's own width bounds it, not a hard-coded 390, so 375 is checked against 375.
  for (const [name, opts] of Object.entries(PHONES)) {
    for (const size of SIZES) {
      test(`Day 1 subtitle box #subs inside the screen at ${name}, text size ${size}`, async ({
        browser,
      }) => {
        test.setTimeout(120_000);
        const { ctx, page } = await open(browser, opts);
        await setTextSize(page, size);
        await page.goto('/?voice=0&seed=7');
        await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
        await page.locator('#subs:not(.gone)').waitFor({ state: 'visible', timeout: 30_000 });
        const b = await box(page, '#subs');
        expect(b, '#subs shows').not.toBeNull();
        const { width: W, height: H } = page.viewportSize()!;
        expect(b!.x, `#subs left ${b!.x}`).toBeGreaterThanOrEqual(0);
        expect(b!.x + b!.width, `#subs right ${b!.x + b!.width}`).toBeLessThanOrEqual(W);
        expect(b!.y, `#subs top ${b!.y}`).toBeGreaterThanOrEqual(0);
        expect(b!.y + b!.height, `#subs bottom ${b!.y + b!.height}`).toBeLessThanOrEqual(H);
        await ctx.close();
      });
    }
  }

  // One rule sizes #subs, #psubs and #rsubs (hud.css, base.css); Day 2's box is measured below.
  for (const size of SIZES) {
    test(`subtitle box inside the screen at text size ${size} (390x844)`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { ctx, page } = await open(browser, PHONES['390x844']!);
      await setTextSize(page, size);
      await toRegister(page);
      await page.locator('#rsubs:not(.gone)').waitFor({ state: 'attached', timeout: 30_000 });
      const b = await page.evaluate(() => {
        const r = document.querySelector('#rsubs')!.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      expect(b.left, `#rsubs left ${b.left}`).toBeGreaterThanOrEqual(0);
      expect(b.right, `#rsubs right ${b.right}`).toBeLessThanOrEqual(390);
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
