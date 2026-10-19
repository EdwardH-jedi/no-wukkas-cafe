// Real Chromium measurements complement the authored Day 2-only phone specification.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boardKey, emptyScores, insert, type ScoreEntry } from '../../src/sim/scores';

const ROOT = resolve(import.meta.dirname, '../..');
const URL = 'http://[::1]:5213';
let server: ChildProcess;
let browser: Browser;
beforeAll(async () => {
  server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '::1', '--port', '5213', '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(URL)).ok;
    } catch {
      /* server still starting */
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  expect(ready).toBe(true);
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}, 30_000);
afterAll(async () => {
  await browser?.close();
  server?.kill('SIGTERM');
});

async function pageFor(
  width: number,
  height: number,
  size: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(
    (textSize) =>
      localStorage.setItem(
        'nwc.listen.v1',
        JSON.stringify({
          version: 2,
          difficulty: 'normal',
          subtitles: 'always',
          textSize,
        }),
      ),
    size,
  );
  return { context, page };
}

describe('independent acceptance: phone layout in actual DOM', () => {
  for (const [width, height] of [
    [390, 844],
    [375, 667],
  ]) {
    for (const size of ['s', 'm', 'l']) {
      it(`Day 1 #subs remains inside ${width}x${height} at ${size}`, async () => {
        const { context, page } = await pageFor(width!, height!, size);
        try {
          await page.goto(`${URL}/?voice=0&seed=7`);
          await page.getByRole('button', { name: 'Day 1: Start the trial', exact: true }).click();
          await page.locator('#subs:not(.gone)').waitFor({ state: 'visible' });
          const box = await page.locator('#subs').boundingBox();
          console.log('acceptance-subs', { width, height, size, box });
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(width!);
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.y + box!.height).toBeLessThanOrEqual(height!);
        } finally {
          await context.close();
        }
      }, 60_000);
    }
  }

  for (const [width, height] of [
    [390, 844],
    [375, 667],
  ]) {
    for (const size of ['s', 'm', 'l']) {
      it(`register and rush subtitle fit ${width}x${height} at ${size}`, async () => {
        const { context, page } = await pageFor(width!, height!, size);
        try {
          await page.goto(`${URL}/?voice=0&seed=7&ibis=0`);
          await page.getByRole('button', { name: 'Day 2: The morning rush', exact: true }).click();
          await page.waitForFunction(
            () =>
              (window as unknown as { __trial: { rush: { phase: string } } }).__trial.rush
                ?.phase === 'intro',
          );
          for (let i = 0; i < 60; i++) {
            const phase = await page.evaluate(
              () =>
                (window as unknown as { __trial: { rush: { phase: string } } }).__trial.rush.phase,
            );
            if (phase !== 'intro') break;
            await page.mouse.click(width! / 2, height! * 0.45);
            await page.waitForTimeout(150);
          }
          await page.waitForFunction(
            () =>
              (window as unknown as { __trial: { rush: { customers: Array<{ state: string }> } } })
                .__trial.rush.customers[0]?.state === 'register',
          );
          await page.keyboard.press('t');
          await page.locator('#pos').waitFor({ state: 'visible' });
          await page.locator('#rsubs:not(.gone)').waitFor({ state: 'visible' });
          await page.waitForTimeout(400);
          const pos = await page.locator('#pos').boundingBox();
          const instr = await page.locator('#rinstr').boundingBox();
          const subs = await page.locator('#rsubs').boundingBox();
          console.log('acceptance-register', {
            width,
            height,
            size,
            pos,
            instr,
            subs,
            instruction: await page.locator('#rinstr').innerText(),
          });
          expect(pos).not.toBeNull();
          expect(instr).not.toBeNull();
          expect(subs).not.toBeNull();
          const overlap =
            pos!.x < instr!.x + instr!.width &&
            instr!.x < pos!.x + pos!.width &&
            pos!.y < instr!.y + instr!.height &&
            instr!.y < pos!.y + pos!.height;
          if (overlap && process.env.REVIEW_EVIDENCE_DIR)
            await page.screenshot({
              path: `${process.env.REVIEW_EVIDENCE_DIR}/register-${width}-${height}-${size}.png`,
            });
          expect(overlap).toBe(false);
          expect(subs!.x).toBeGreaterThanOrEqual(0);
          expect(subs!.x + subs!.width).toBeLessThanOrEqual(width!);
          expect(subs!.y).toBeGreaterThanOrEqual(0);
          expect(subs!.y + subs!.height).toBeLessThanOrEqual(height!);
        } finally {
          await context.close();
        }
      }, 90_000);
    }
  }

  it('desktop register matches the actual pre-T2.4 tree within 2px', async () => {
    const tree = resolve(mkdtempSync(resolve(tmpdir(), 'nwc-acceptance-desktop-')), 'tree');
    const add = spawnSync('git', ['worktree', 'add', '--detach', tree, 'ea6fdd4^'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(add.status, add.stderr).toBe(0);
    symlinkSync(resolve(ROOT, 'node_modules'), resolve(tree, 'node_modules'), 'dir');
    // Symlinked dependencies live outside Vite's temporary-worktree root. Allow the
    // same bundled font files, otherwise old-tree fonts 403 and create a false size delta.
    const config = resolve(tree, 'vite.config.ts');
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace(
        'server: { port:',
        `server: { fs: { allow: ${JSON.stringify([tree, ROOT])} }, port:`,
      ),
    );
    const oldURL = 'http://[::1]:5214';
    const oldServer = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--host', '::1', '--port', '5214', '--strictPort'],
      { cwd: tree, stdio: 'ignore' },
    );
    try {
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(oldURL)).ok) break;
        } catch {
          /* startup */
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      const boxes = [];
      for (const url of [oldURL, URL]) {
        const context = await browser.newContext({
          viewport: { width: 1024, height: 640 },
          deviceScaleFactor: 1,
        });
        try {
          const page = await context.newPage();
          await page.goto(`${url}/?voice=0&seed=7&ibis=0`);
          await page.evaluate(() => document.fonts.ready);
          await page.getByRole('button', { name: 'Day 2: The morning rush', exact: true }).click();
          await page.waitForFunction(
            () =>
              (window as unknown as { __trial: { rush: { phase: string } } }).__trial.rush
                ?.phase === 'intro',
          );
          for (let i = 0; i < 60; i++) {
            if (
              await page.evaluate(
                () =>
                  (window as unknown as { __trial: { rush: { phase: string } } }).__trial.rush
                    .phase !== 'intro',
              )
            )
              break;
            await page.mouse.click(512, 288);
            await page.waitForTimeout(150);
          }
          await page.waitForFunction(
            () =>
              (window as unknown as { __trial: { rush: { customers: Array<{ state: string }> } } })
                .__trial.rush.customers[0]?.state === 'register',
          );
          await page.keyboard.press('t');
          await page.waitForFunction(
            () =>
              (window as unknown as { __trial: { rush: { customers: Array<{ state: string }> } } })
                .__trial.rush.customers[0]?.state === 'deciding',
          );
          await page.waitForTimeout(400);
          await page.evaluate(() => document.fonts.ready);
          expect(await page.evaluate(() => document.fonts.check('14px "Bowlby One"'))).toBe(true);
          console.log(
            'acceptance-desktop-detail',
            url,
            await page.locator('#pos').evaluate((el) => ({
              text: el.textContent,
              font: getComputedStyle(el).font,
              rows: [...el.children].map((x) => ({
                cls: x.className,
                height: x.getBoundingClientRect().height,
                text: x.textContent,
              })),
            })),
          );
          if (process.env.REVIEW_EVIDENCE_DIR)
            await page.screenshot({
              path: `${process.env.REVIEW_EVIDENCE_DIR}/desktop-${url === URL ? 'current' : 'before'}.png`,
            });
          boxes.push(await page.locator('#pos').boundingBox());
        } finally {
          await context.close();
        }
      }
      console.log('acceptance-desktop-pre-post', boxes);
      expect(boxes[0]).not.toBeNull();
      expect(boxes[1]).not.toBeNull();
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(Math.abs(boxes[0]![key] - boxes[1]![key])).toBeLessThanOrEqual(2);
    } finally {
      oldServer.kill('SIGTERM');
      await new Promise<void>((done) => oldServer.once('exit', () => done()));
      const removed = spawnSync('git', ['worktree', 'remove', '--force', tree], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      expect(removed.status, removed.stderr).toBe(0);
    }
  }, 120_000);

  it('Scores at 390px fits, traps Tab, closes with Esc, and clears only on the second click', async () => {
    const { context, page } = await pageFor(390, 844, 'l');
    try {
      let scores = emptyScores();
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        for (let shiftIndex = 0; shiftIndex < 5; shiftIndex++) {
          const e: ScoreEntry = {
            mode: 'week',
            week: 1,
            shiftIndex,
            seed: 1,
            difficulty,
            grade: 'excellent',
            served: 10,
            walkouts: 0,
            tipsCents: 12345,
            at: '2026-10-19T00:00:00.000Z',
          };
          scores = insert(scores, e).scores;
          if (!shiftIndex)
            for (let n = 0; n < 10; n++)
              scores = insert(scores, {
                ...e,
                mode: 'endless',
                week: null,
                shiftIndex: null,
                served: 100 + n,
              }).scores;
        }
      }
      await page.addInitScript(
        (s) => localStorage.setItem('nwc.scores.v1', JSON.stringify(s)),
        scores,
      );
      await page.goto(`${URL}/?voice=0`);
      await page.getByRole('button', { name: 'Scores', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Scores', exact: true });
      await dialog.waitFor({ state: 'visible' });
      const layout = await dialog.evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        right: el.getBoundingClientRect().right,
        left: el.getBoundingClientRect().left,
        overflowing: [...el.querySelectorAll('*')]
          .filter((x) => x.scrollWidth > x.clientWidth + 1)
          .map((x) => x.className),
      }));
      console.log('acceptance-scores', layout);
      expect(layout.scroll).toBeLessThanOrEqual(layout.width);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(390);
      expect(layout.overflowing).toEqual([]);
      expect(await dialog.locator('.sc-top li').count()).toBe(30);
      await page.keyboard.press('Tab');
      expect(await page.locator('.sc-clear').evaluate((e) => e === document.activeElement)).toBe(
        true,
      );
      await page.keyboard.press('Shift+Tab');
      expect(await page.locator('.sc-back').evaluate((e) => e === document.activeElement)).toBe(
        true,
      );
      const before = await page.evaluate(() => localStorage.getItem('nwc.scores.v1'));
      await dialog.getByRole('button', { name: 'Clear scores', exact: true }).click();
      expect(await page.evaluate(() => localStorage.getItem('nwc.scores.v1'))).toBe(before);
      await dialog.getByRole('button', { name: 'Press again to clear', exact: true }).click();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nwc.scores.v1')!))).toEqual(
        emptyScores(),
      );
      await page.keyboard.press('Escape');
      expect(await dialog.count()).toBe(0);
      expect(
        await page
          .getByRole('button', { name: 'Scores', exact: true })
          .evaluate((e) => e === document.activeElement),
      ).toBe(true);
      expect(Object.keys(scores.boards)).toContain(
        boardKey({ mode: 'endless', shiftIndex: null, difficulty: 'hard' }),
      );
    } finally {
      await context.close();
    }
  }, 60_000);
});
