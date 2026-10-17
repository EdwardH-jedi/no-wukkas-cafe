// Phase 1.5 evidence (review 2026-10-17 §9): the five fixed items captured at exactly 390×844 and
// 1024×640 CSS pixels with deviceScaleFactor 1, so each PNG's size IS the viewport, and one JSON
// sidecar per capture ({item, viewport, commit, timestamp} plus what was measured: element boxes,
// overlaps, line keys, activation counts). A screenshot can't show Space activating a button or a
// line's wording across a shift, so those sidecars carry the measured facts. Skipped unless
// POLISH_SHOTS names the output directory:
//
//   POLISH_SHOTS=docs/verification/2026-10-17-polish POLISH_COMMIT=$(git rev-parse --short HEAD) \
//     E2E_PORT=5202 npx playwright test --config tests/review/playwright.ipv6.config.ts polishEvidence

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { playShift, type RushState } from './helpers/weekBot';

const DIR = process.env.POLISH_SHOTS ?? '';
const COMMIT = process.env.POLISH_COMMIT ?? 'unknown';

const VIEWPORTS: Record<string, BrowserContextOptions> = {
  '390x844': {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  '1024x640': { viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1 },
};

type Box = { x: number; y: number; width: number; height: number } | null;
const overlap = (a: Box, b: Box): boolean =>
  !!a &&
  !!b &&
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

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
  const css = page.viewportSize();
  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  const sidecar = {
    item,
    viewport: vp,
    css,
    devicePixelRatio,
    commit: COMMIT,
    timestamp: new Date().toISOString(),
    ...facts,
  };
  writeFileSync(`${base}.json`, `${JSON.stringify(sidecar, null, 2)}\n`);
}

const boxes = async (page: Page, sels: readonly string[]): Promise<Record<string, Box>> => {
  const out: Record<string, Box> = {};
  for (const sel of sels) {
    const l = page.locator(sel).first();
    out[sel] = (await l.count()) && (await l.isVisible()) ? await l.boundingBox() : null;
  }
  return out;
};

type Debug = {
  rush: RushState | null;
  practice: { phase: string; phaseTime: number; poured: number } | null;
  project(x: number, y: number): { x: number; y: number };
};
const rush = (page: Page): Promise<RushState | null> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.rush);

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

async function open(browser: Browser, vp: string, init?: (page: Page) => Promise<unknown>) {
  const ctx = await browser.newContext({
    ...VIEWPORTS[vp],
    baseURL: test.info().project.use.baseURL,
  });
  const page = await ctx.newPage();
  if (init) await init(page);
  return { ctx, page };
}

test.describe('Phase 1.5 evidence', () => {
  test.skip(!DIR, 'evidence capture only: set POLISH_SHOTS');

  for (const vp of Object.keys(VIEWPORTS)) {
    test(`1.5.1 + 1.5.2 Day 2 HUD at ${vp}`, async ({ browser }) => {
      test.setTimeout(300_000);
      const { ctx, page } = await open(browser, vp);
      const W = VIEWPORTS[vp]!.viewport!.width;
      const H = VIEWPORTS[vp]!.viewport!.height;
      const mid = { x: W / 2, y: H * 0.6 };
      const HUD = ['#rinstr', '#rail', '#rgauges', '#ractions', '#pos', '#pos .ring'];
      const bin = '#ractions button[data-a="bin"]';
      await page.goto('/?voice=0&seed=7&ibis=0');
      await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
      await until(
        () => rush(page),
        (s) => s.phase === 'intro',
      );
      for (let i = 0; i < 60 && (await rush(page))?.phase === 'intro'; i++) {
        await page.mouse.click(mid.x, H * 0.45);
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
      const reg = await boxes(page, HUD);
      await capture(page, '1.5.1', vp, 'register', {
        claim: '#rinstr is clear of the ticket rail',
        boxes: reg,
        instructionOverRail: overlap(reg['#rinstr'] ?? null, reg['#rail'] ?? null),
      });

      // Ring up what was ordered, make it, and capture the shot running.
      const o = (await rush(page))!.customers[0]!.order;
      const pos = page.locator('#pos');
      const click = (n: string) => pos.getByRole('button', { name: n, exact: true }).click();
      const ringUp = async (order: typeof o, key: string): Promise<void> => {
        await click(order.type === 'flatWhite' ? 'Flat white' : 'Long black');
        if (order.type === 'flatWhite') {
          await click(
            { full: 'Full cream', oat: 'Oat', soy: 'Soy', almond: 'Almond' }[order.milk ?? 'full'],
          );
          await click(order.extraHot ? 'Extra hot' : 'Normal');
          await click(order.heart ? 'Heart' : 'No heart');
        }
        await page.keyboard.press('Enter');
        await until(
          () => rush(page),
          (s) => s.customers.find((c) => c.key === key)?.state === 'waiting',
        );
      };
      /** Make the oldest ticket: grind, then tamp and lock in. */
      const grind = async (): Promise<void> => {
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
      };
      await ringUp(o, (await rush(page))!.customers[0]!.key);
      await grind();
      if (o.type === 'longBlack') {
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
      }
      await until(
        () => rush(page),
        (s) => s.station === 'shot',
      );
      await page.mouse.click(mid.x, mid.y);
      await until(
        () => rush(page),
        (s) => s.extracting && s.shotTime > 4,
      );
      const shot = await boxes(page, HUD);
      const cup = await page.evaluate(() =>
        (window as unknown as { __trial: Debug }).__trial.project(0, 0),
      );
      const cupBox: Box = { x: cup.x - 30, y: cup.y - 30, width: 60, height: 60 };
      await capture(page, '1.5.1', vp, 'shot', {
        claim: 'the gauge column never covers the cup; #ractions visible beside the gauges',
        order: o,
        boxes: shot,
        cupCentre: cup,
        gaugesOverCup: overlap(shot['#rgauges'] ?? null, cupBox),
        actionsVisible: shot['#ractions'] !== null,
      });
      await until(
        () => rush(page),
        (s) => s.shotTime >= 26.5,
      );
      await page.mouse.click(mid.x, mid.y);
      await until(
        () => rush(page),
        (s) => s.shotDone,
      );
      if (o.type === 'flatWhite') {
        await until(
          () => rush(page),
          (s) => s.station === 'steam',
        );
        const steamY = (d: number) => (0.2 + ((3 - d) / 3.8) * 0.6) * H;
        await page.mouse.move(mid.x, steamY(0.25));
        await page.mouse.down();
        await until(
          () => rush(page),
          (s) => s.aeration >= 0.4,
        );
        await page.mouse.move(mid.x, steamY(2.2), { steps: 4 });
        await until(
          () => rush(page),
          (s) => s.temp >= (o.extraHot ? 70 : 60),
        );
        await page.mouse.up();
        await until(
          () => rush(page),
          (s) => s.station === 'pour' && s.stationTime > 1.1,
        );
        await page.mouse.move(mid.x, H * 0.5);
        await page.mouse.down();
        await page.waitForTimeout(2500);
        await page.mouse.up();
        await page.keyboard.press('Enter');
      }
      await until(
        () => rush(page),
        (s) => s.ready !== null,
      );

      // 1.5.2: a drink on the pass and the next customer at the register.
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
      await page.waitForTimeout(800);
      const pass = await boxes(page, [...HUD, bin]);
      const binVsRingUp = overlap(pass[bin] ?? null, pass['#pos .ring'] ?? null);
      await capture(page, '1.5.2', vp, 'pass-and-register', {
        claim: '"Bin it" never sits under the register\'s "Ring it up"',
        boxes: pass,
        binVsRingUp,
      });
      expect(pass[bin]).not.toBeNull();
      expect(binVsRingUp).toBe(false);

      // 1.5.1's exact case: a FLAT WHITE's shot, with the milk gauge under the shot timer. The
      // first customer always orders a long black; seed 7's second orders a flat white. Ring
      // them up, hand the long black over, then make the flat white.
      const second = (await rush(page))!.customers.find((c) => c.state === 'deciding')!;
      expect(second.order.type).toBe('flatWhite');
      await ringUp(second.order, second.key);
      await page.keyboard.press('1'); // the drink on the pass to the oldest ticket
      await until(
        () => rush(page),
        (s) => s.ready === null,
      );
      await grind();
      await until(
        () => rush(page),
        (s) => s.station === 'shot',
      );
      await page.mouse.click(mid.x, mid.y);
      await until(
        () => rush(page),
        (s) => s.extracting && s.shotTime > 4,
      );
      await page.waitForTimeout(300);
      const fw = await boxes(page, HUD);
      const fwCup = await page.evaluate(() =>
        (window as unknown as { __trial: Debug }).__trial.project(0, 0),
      );
      const fwCupBox: Box = { x: fwCup.x - 30, y: fwCup.y - 30, width: 60, height: 60 };
      const gaugeText = (await page.locator('#rgauges').textContent()) ?? '';
      await capture(page, '1.5.1', vp, 'flat-white-shot', {
        claim: "the gauge column never clips the cup during a flat white's shot",
        order: second.order,
        boxes: fw,
        cupCentre: fwCup,
        gaugeText,
        gaugesOverCup: overlap(fw['#rgauges'] ?? null, fwCupBox),
        actionsVisible: fw['#ractions'] !== null,
      });
      expect(overlap(fw['#rgauges'] ?? null, fwCupBox)).toBe(false);
      await ctx.close();
    });

    test(`1.5.3 a later week shift's intro at ${vp}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const tuesday = {
        version: 2,
        createdAt: '2026-10-16T00:00:00.000Z',
        seed: 1,
        difficulty: 'normal',
        week: 1,
        shift: 1,
        unlockedDrinks: ['flatWhite', 'longBlack', 'cappuccino'],
        upgrades: [],
        regulars: {},
        reports: [],
        cents: 0,
      };
      const { ctx, page } = await open(browser, vp, (p) =>
        p.addInitScript(
          (save) => localStorage.setItem('nwc.save.v2', save),
          JSON.stringify(tuesday),
        ),
      );
      await page.goto('/?voice=0&seed=1&ibis=0');
      await page.getByRole('button', { name: 'The week: shifts', exact: true }).click();
      await page.locator('.shift-select button[data-shift="1"]').click();
      const first = await until(
        () => rush(page),
        (s) => s.phase === 'intro' && s.line !== null,
      );
      await page.waitForTimeout(1500); // the subtitle types out
      const keys = new Set<string>();
      const texts: string[] = [];
      if (first.line) {
        keys.add(first.line.key);
        texts.push(first.line.text);
      }
      await capture(page, '1.5.3', vp, 'tuesday-intro', {
        claim: 'a week shift after the first does not replay RUSH_INTRO ("your first paid shift")',
        week: first.week,
        line: first.line,
      });
      // Every intro line of the shift, without skipping: none is RUSH_INTRO's.
      for (let i = 0; i < 400; i++) {
        const s = await rush(page);
        if (!s || s.phase !== 'intro') break;
        if (s.line && !keys.has(s.line.key)) {
          keys.add(s.line.key);
          texts.push(s.line.text);
        }
        await page.waitForTimeout(100);
      }
      const all = [...keys];
      const lines = {
        item: '1.5.3',
        viewport: vp,
        commit: COMMIT,
        timestamp: new Date().toISOString(),
        keys: all,
        texts,
        rushIntro: all.some((k) => /^rush\.intro\.\d/.test(k)),
        firstPaidShift: texts.some((t) => /first paid shift/i.test(t)),
      };
      writeFileSync(
        join(DIR, `1.5.3-intro-lines-${vp}.json`),
        `${JSON.stringify(lines, null, 2)}\n`,
      );
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((k) => k.startsWith('rush.intro.shift1.'))).toBe(true);
      expect(lines.firstPaidShift).toBe(false);
      await ctx.close();
    });

    test(`1.5.7 Space on a focused control at ${vp}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { ctx, page } = await open(browser, vp);
      const W = VIEWPORTS[vp]!.viewport!.width;
      const H = VIEWPORTS[vp]!.viewport!.height;
      const practice = () =>
        page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.practice);
      await page.goto('/?voice=0&seed=7');
      await page.getByRole('button', { name: 'Latte art practice' }).click();
      await until(practice, (s) => s.phase === 'pour' && s.phaseTime > 2.2);
      const cup = await page.evaluate(() =>
        (window as unknown as { __trial: Debug }).__trial.project(0, 0),
      );
      await page.mouse.move(Math.min(W - 1, cup.x), Math.min(H - 1, cup.y));
      await page.mouse.down();
      await page.waitForTimeout(3500);
      await page.mouse.up();
      // Half a cup: "Done" ends the pour (the review comes on its own only when the cup is full).
      await page.getByRole('button', { name: /^Done/ }).click();
      await until(practice, (s) => s.phase === 'review', 30_000);
      const demo = page.getByRole('button', { name: /^Watch Gaz/ }).first();
      await expect(demo).toBeVisible();
      // Count real activations of the button, then focus it from the keyboard and press Space.
      await demo.evaluate((b) => {
        const w = window as unknown as { __clicks: number };
        w.__clicks = 0;
        b.addEventListener('click', () => w.__clicks++);
      });
      for (let i = 0; i < 12; i++) {
        const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
        if (/Watch Gaz/.test(focused)) break;
        await page.keyboard.press('Tab');
      }
      const focusedLabel = await page.evaluate(
        () => document.activeElement?.textContent?.trim() ?? '',
      );
      const clicks = () =>
        page.evaluate(() => (window as unknown as { __clicks: number }).__clicks);
      await capture(page, '1.5.7', vp, 'focused-watch-gaz', {
        claim: 'Space on a focused control outside the play HUD activates it (no preventDefault)',
        focused: focusedLabel,
        phaseBefore: (await practice())?.phase,
      });
      const before = await clicks();
      await page.keyboard.press(' ');
      const after = await until(practice, (s) => s.phase !== 'review', 10_000).catch(() => null);
      const activations = await clicks();
      await page.waitForTimeout(600);
      await capture(page, '1.5.7', vp, 'after-space', {
        claim: 'Space on a focused control outside the play HUD activates it (no preventDefault)',
        focused: focusedLabel,
        activationsBeforeSpace: before,
        activationsAfterSpace: activations,
        phaseAfter: after?.phase ?? (await practice())?.phase,
      });
      expect(focusedLabel).toMatch(/Watch Gaz/);
      expect(activations - before).toBe(1);
      expect(after?.phase).toBe('demo');
      await ctx.close();
    });
  }

  test('1.5.4 the closing line after a whole Day 2 (1024x640, the report again at 390x844)', async ({
    browser,
  }) => {
    test.setTimeout(720_000);
    const { ctx, page } = await open(browser, '1024x640', (p) =>
      // Every line said, by key, as the shift goes (the closing line is on screen only briefly).
      p.addInitScript(() => {
        const seen: Array<{ key: string; text: string }> = [];
        (window as unknown as { __said: typeof seen }).__said = seen;
        setInterval(() => {
          const t = (window as unknown as { __trial?: Debug }).__trial;
          const line = t?.rush?.line;
          if (line && seen[seen.length - 1]?.key !== line.key)
            seen.push({ key: line.key, text: line.text });
        }, 50);
      }),
    );
    await page.goto('/?voice=0&seed=7&ibis=0');
    await page.getByRole('button', { name: 'Day 2: The morning rush', exact: true }).click();
    await expect.poll(async () => (await rush(page))?.phase).toBe('intro');
    const played = await playShift(page, { timeout: 600_000 });
    const said = await page.evaluate(
      () => (window as unknown as { __said: Array<{ key: string; text: string }> }).__said,
    );
    const ends = said.filter((l) => l.key.startsWith('rush.end.'));
    const report = page.locator('#rsummary');
    await expect(report).toBeVisible();
    await page.waitForTimeout(600);
    const quote = await report
      .locator('.quote')
      .textContent()
      .catch(() => null);
    const facts = {
      claim: 'the closing line is count-agnostic: no "Five for five" after 6/6 (or 9/9, 10/10)',
      summary: played.end.summary,
      endLines: ends,
      excellentLines: ends.filter((l) => l.key.startsWith('rush.end.excellent')).length,
      reportQuote: quote,
      saysFiveForFive: [...ends.map((l) => l.text), quote ?? ''].some((t) =>
        /five for five/i.test(t),
      ),
    };
    await capture(page, '1.5.4', '1024x640', 'report', facts);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await capture(page, '1.5.4', '390x844', 'report', {
      ...facts,
      note: 'the same report: the desktop context resized to 390×844 (no touch emulation)',
    });
    expect(ends.length).toBeGreaterThan(0);
    expect(facts.saysFiveForFive).toBe(false);
    await ctx.close();
  });
});
