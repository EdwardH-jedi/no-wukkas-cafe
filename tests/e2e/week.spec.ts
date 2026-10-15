// The week in a real browser: the title's "The week: shifts" opens shift select, only the shift the
// week is on can be played, a week shift runs in week mode, its report is autosaved (a disaster
// replays the same shift), and a save further on opens that shift and Endless Rush. Also the shell
// around it: the title's menu (keyboard, Endless Rush unlocking) and the café upgrade shop.

import { expect, test, type Page } from '@playwright/test';

interface Dbg {
  timeScale: number;
  rush: {
    phase: string;
    week: { week: number; shiftIndex: number; endless: boolean } | null;
    customers: Array<{ key: string }>;
  } | null;
  save: {
    week: number;
    shift: number;
    reports: Array<{ shift: number }>;
    cents: number;
    upgrades: string[];
    memoryOnly: boolean;
  };
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

/** A save on Wednesday: Monday and Tuesday passed. */
const wednesday = {
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
    await page.addInitScript(
      (s) => localStorage.setItem('nwc.save.v2', s),
      JSON.stringify(wednesday),
    );
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

  test('the title lists every mode; Endless Rush unlocks on the way back', async ({ page }) => {
    await page.goto('/?voice=0&seed=7&ibis=0');
    const endless = page.locator('#title button[data-act="endless"]');
    await expect(endless).toBeDisabled();
    await expect(page.locator('#title-sub-endless')).toHaveText(
      'Pass Monday in the week to unlock it.',
    );
    for (const name of [
      'Day 1: Start the trial',
      'Day 2: The morning rush',
      'The week: shifts',
      'Latte art practice',
      'Settings',
    ])
      await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
    await snap(page, '04-title');

    // Keyboard: Tab from the top reaches the week; Space presses it (the game's Space doesn't
    // swallow it); Esc goes back with focus where it was.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    const week = page.getByRole('button', { name: 'The week: shifts', exact: true });
    await expect(week).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('.shift-select')).toBeVisible();
    await expect(row(page, 0)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.shift-select')).toHaveCount(0);
    await expect(week).toBeFocused();

    // The save moves on (as passing Monday would) while a rush runs: back on the title, Endless
    // Rush is open without a reload.
    await page.evaluate(
      (s) => localStorage.setItem('nwc.save.v2', s),
      JSON.stringify({ ...wednesday, shift: 1, reports: [{ week: 1, shift: 0, summary }] }),
    );
    await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
    await expect.poll(async () => (await dbg(page)).rush?.phase).toBe('intro');
    await page.keyboard.press('Escape');
    await page.locator('#rpause').getByRole('button', { name: 'Title screen' }).click();
    await expect(endless).toBeEnabled();
    await expect(page.locator('#title-sub-endless')).toHaveText(
      'Keep serving until the third walk-out.',
    );
    await expect(page.getByRole('button', { name: 'Day 1: Start the trial' })).toBeFocused();
    await endless.click();
    await expect.poll(async () => (await dbg(page)).rush?.week?.endless).toBe(true);
  });

  test('the shop sells what the till covers and says why it refuses the rest', async ({ page }) => {
    await page.addInitScript(
      (s) => localStorage.setItem('nwc.save.v2', s),
      JSON.stringify({ ...wednesday, cents: 20_000 }),
    );
    await page.goto('/?voice=0&seed=7&ibis=0');
    await page.getByRole('button', { name: 'The week: shifts' }).click();
    const door = page.locator('.shift-select-shop');
    await expect(door).toContainText('In the till: $200.00 · 0 of 4 owned');
    await door.click();
    const shop = page.getByRole('dialog', { name: 'Café upgrades' });
    await expect(shop).toBeVisible();
    await expect(page.locator('.shift-select')).toHaveCount(0);

    await shop.getByRole('button', { name: 'Buy Better grinder for $450.00' }).click();
    await expect(shop.locator('.shop-msg')).toHaveText(
      'Not enough in the till: Better grinder costs $450.00, you have $200.00.',
    );
    expect((await dbg(page)).save.cents).toBe(20_000);

    await shop.getByRole('button', { name: 'Buy Docket rail for $150.00' }).click();
    await expect(shop.locator('.shop-msg')).toHaveText(
      'Docket rail bought. $50.00 left in the till.',
    );
    await expect(shop.locator('.shop-till')).toHaveText('In the till: $50.00');
    await expect(shop.getByRole('button', { name: 'Docket rail: owned' })).toBeFocused();
    const saved = (await dbg(page)).save;
    expect([saved.cents, saved.upgrades]).toEqual([5_000, ['docketRail']]);
    await snap(page, '05-shop');

    await page.keyboard.press('Escape');
    await expect(page.locator('.shop')).toHaveCount(0);
    await expect(door).toBeFocused();
    await expect(door).toContainText('1 of 4 owned');
  });
});
