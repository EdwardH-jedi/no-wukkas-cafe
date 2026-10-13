// The bin chicken in a real browser (?ibis=1 makes it turn up 30 s into service): it walks in
// with a customer, the hint shows, Gaz reacts, and it can be shooed out with the I key or by
// clicking it, gently: three shoos and it walks out. Draw calls stay in budget.

import { expect, test, type Page } from '@playwright/test';

interface Dbg {
  ibis: { state: string; shoos: number; screen: { x: number; y: number } };
  rush: { phase: string; drawCalls: number; line: { key: string } | null } | null;
  timeScale: number;
}
const dbg = (page: Page): Promise<Dbg> =>
  page.evaluate(() => {
    const t = (window as unknown as { __trial: Dbg }).__trial;
    return { ibis: t.ibis, rush: t.rush, timeScale: t.timeScale };
  });

async function untilBird(page: Page, heard: Set<string>): Promise<void> {
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  await page.evaluate(() => ((window as unknown as { __trial: Dbg }).__trial.timeScale = 4));
  for (let i = 0; i < 400; i++) {
    const d = await dbg(page);
    if (d.rush?.line) heard.add(d.rush.line.key);
    if (d.rush?.phase === 'intro') await page.mouse.click(640, 300);
    if (d.ibis.state === 'foraging') break;
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => ((window as unknown as { __trial: Dbg }).__trial.timeScale = 1));
  await expect.poll(async () => (await dbg(page)).ibis.state).toBe('foraging');
  await expect(page.locator('#ibisHint')).toBeVisible();
}

async function watchLines(page: Page, heard: Set<string>, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const d = await dbg(page);
    if (d.rush?.line) heard.add(d.rush.line.key);
    await page.waitForTimeout(50);
  }
}

test.describe('bin chicken', () => {
  test.setTimeout(120_000);

  test('three presses of I see it out; Gaz reacts; draw calls stay in budget', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?seed=7&ibis=1&voice=0');
    const heard = new Set<string>();
    await untilBird(page, heard);
    expect((await dbg(page)).rush!.drawCalls).toBeLessThan(150);
    await page.screenshot({ path: 'test-results/evidence-ibis/01-foraging.png' });
    for (let k = 0; k < 3; k++) {
      await page.keyboard.press('i');
      await page.waitForTimeout(600);
    }
    await expect.poll(async () => (await dbg(page)).ibis.state).toMatch(/leaving|gone/);
    await expect(page.locator('#ibisHint')).toBeHidden();
    await watchLines(page, heard, 9000);
    await expect.poll(async () => (await dbg(page)).ibis.state).toBe('gone');
    expect(heard.has('ibis.enter')).toBe(true);
    expect(heard.has('ibis.out')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('clicking the bird shoos it too', async ({ page }) => {
    await page.goto('/?seed=7&ibis=1&voice=0');
    await untilBird(page, new Set());
    for (let k = 0; k < 3; k++) {
      const p = (await dbg(page)).ibis.screen;
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(600);
    }
    expect((await dbg(page)).ibis.shoos).toBe(3);
    await expect.poll(async () => (await dbg(page)).ibis.state, { timeout: 15_000 }).toBe('gone');
    await page.screenshot({ path: 'test-results/evidence-ibis/02-shooed-out.png' });
  });
});
