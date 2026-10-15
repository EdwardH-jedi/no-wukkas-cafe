// The week in a real browser: the title's "The week: shifts" opens shift select, only the shift the
// week is on can be played, a week shift runs in week mode, its report is autosaved (a disaster
// replays the same shift), and a save further on opens that shift and Endless Rush.

import { expect, test, type Page } from '@playwright/test';

interface Dbg {
  timeScale: number;
  rush: {
    phase: string;
    week: { week: number; shiftIndex: number; endless: boolean } | null;
    customers: Array<{ key: string }>;
  } | null;
  save: { week: number; shift: number; reports: Array<{ shift: number }>; memoryOnly: boolean };
}
const dbg = (page: Page): Promise<Dbg> =>
  page.evaluate(() => {
    const t = (window as unknown as { __trial: Dbg }).__trial;
    return { timeScale: t.timeScale, rush: t.rush, save: t.save };
  });
const setScale = (page: Page, v: number): Promise<number> =>
  page.evaluate((x) => ((window as unknown as { __trial: Dbg }).__trial.timeScale = x), v);
const snap = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: `test-results/evidence-week/${name}.png` });
const row = (page: Page, i: number) => page.locator(`.shift-select button[data-shift="${i}"]`);

const summary = {
  customers: 6,
  ordersCompleted: 6,
  correctOrders: 6,
  walkouts: 0,
  avgServeSeconds: 40,
  satisfaction: 80,
  tipsCents: 450,
  wasted: 0,
  grade: 'good',
};

test.describe('the week', () => {
  test.setTimeout(300_000);

  test('a fresh save plays Monday in week mode; the report is saved', async ({ page }) => {
    await page.goto('/?voice=0&seed=7&ibis=0');
    await page.getByRole('button', { name: 'The week: shifts' }).click();
    await expect(page.locator('.shift-select')).toBeVisible();
    await expect(row(page, 0)).toBeEnabled();
    for (const i of [1, 2, 3, 4]) await expect(row(page, i)).toBeDisabled();
    await expect(page.locator('.shift-select-endless')).toBeDisabled();
    await snap(page, '01-shift-select-fresh');

    await row(page, 0).click();
    await expect(page.locator('.shift-select')).toHaveCount(0);
    await expect
      .poll(async () => (await dbg(page)).rush?.week)
      .toEqual({
        week: 1,
        shiftIndex: 0,
        endless: false,
      });
    expect((await dbg(page)).rush?.customers).toHaveLength(6);
    await expect(page.locator('#rday')).toContainText('Monday');

    // Nobody is served: everyone walks out, a disaster. The receipt is kept, the shift isn't.
    // About 300 s of game time: the same budget as the Day 2 spec's wait for its report.
    await setScale(page, 4);
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const d = await dbg(page);
      if (d.rush?.phase === 'summary') break;
      if (d.rush?.phase === 'intro') await page.mouse.click(640, 300);
      await page.waitForTimeout(250);
    }
    await setScale(page, 1);
    await expect(page.locator('#rsummary')).toContainText('WEEK 1 · MONDAY · SHIFT REPORT');
    await snap(page, '02-monday-report');
    const save = (await dbg(page)).save;
    expect(save.reports).toEqual([expect.objectContaining({ shift: 0 })]);
    expect(save.shift).toBe(0);
    expect(save.memoryOnly).toBe(false);
    const again = page.getByRole('button', { name: 'Try again', exact: true });
    await expect(again).toBeVisible();
    await again.click();
    await expect.poll(async () => (await dbg(page)).rush?.phase).toBe('intro');
    expect((await dbg(page)).rush?.week?.shiftIndex).toBe(0);
    // It survives a reload.
    await page.reload();
    await expect.poll(async () => (await dbg(page)).save.reports.length).toBe(1);
  });

  test('a save on Wednesday opens Wednesday only, and Endless Rush', async ({ page }) => {
    const save = {
      version: 2,
      createdAt: '2026-10-15T00:00:00.000Z',
      seed: 7,
      difficulty: 'normal',
      week: 1,
      shift: 2,
      unlockedDrinks: ['flatWhite', 'longBlack', 'cappuccino', 'latte'],
      upgrades: [],
      regulars: {},
      reports: [
        { week: 1, shift: 0, summary },
        { week: 1, shift: 1, summary },
      ],
      cents: 900,
    };
    await page.addInitScript((s) => localStorage.setItem('nwc.save.v2', s), JSON.stringify(save));
    await page.goto('/?voice=0&seed=7&ibis=0');
    await page.getByRole('button', { name: 'The week: shifts' }).click();
    await expect(row(page, 0)).toBeDisabled();
    await expect(row(page, 0)).toHaveAttribute('data-status', 'done');
    await expect(row(page, 1)).toBeDisabled();
    await expect(row(page, 2)).toBeEnabled();
    await expect(row(page, 3)).toBeDisabled();
    await expect(row(page, 2)).toBeFocused();
    await snap(page, '03-shift-select-wednesday');

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.shift-select')).toHaveCount(0);
    await page.getByRole('button', { name: 'The week: shifts' }).click();
    await page.locator('.shift-select-endless').click();
    await expect.poll(async () => (await dbg(page)).rush?.week?.endless).toBe(true);
    expect((await dbg(page)).rush?.customers.length).toBeGreaterThan(10);
    await expect(page.locator('#rday')).toContainText('Endless');
  });

  test('Day 2 from the title is still Day 2', async ({ page }) => {
    await page.goto('/?voice=0&seed=7&ibis=0');
    await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
    await expect.poll(async () => (await dbg(page)).rush?.phase).toBe('intro');
    expect((await dbg(page)).rush?.week).toBeNull();
    await expect(page.locator('#rday')).toContainText('Morning rush');
  });
});
