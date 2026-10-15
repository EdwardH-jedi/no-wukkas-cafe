// The week's UI end to end (Phase 1, item 1.E), in a real browser with real input:
//  1. A fresh save: title → "The week: shifts" → the café upgrade shop (prices, and a buy refused
//     with an empty till, saying why) → back → Monday, played by a browser bot well enough to pass
//     → the Monday report with "Next shift" → Tuesday starts in week mode, and the save moved on.
//  2. Day 2 from the title, the same bot for the whole shift, to its report.
//  3. A save on Tuesday where a shift event comes up as the first customer steps up: the event card,
//     answered with the number key 1.
// The bot (helpers/weekBot.ts) reads the debug handle to decide, and acts only through keys, clicks
// and the held mouse. Screenshots for review go to docs/verification/2026-10-16-week-ui/.
//
// Seeds: 20 for the fresh save (Monday's generated orders are five long blacks and one flat white,
// a shift a quick player passes with room to spare; the headless bot still passes it with 6 s/3 s
// reaction times), 7 for Day 2 (as rush.spec.ts), and 1 for the Tuesday save (THE_NAME comes up
// for Dazza as he reaches the register, 5.5 s into service, with nobody serving).

import { expect, test, type Page } from '@playwright/test';
import {
  playShift,
  readRush,
  readSave,
  until,
  type Moment,
  type RushState,
} from './helpers/weekBot';

const DIR = 'docs/verification/2026-10-16-week-ui';
const snap = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: `${DIR}/${name}.png` });
};
const row = (page: Page, i: number) => page.locator(`.shift-select button[data-shift="${i}"]`);

/** A passed Monday, as the report would have saved it. */
const monday = {
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

/** A save on Tuesday: Monday passed, cappuccino on the menu, Monday's tips in the till. */
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
  reports: [{ week: 1, shift: 0, summary: monday }],
  cents: 450,
};

/** Skip Gaz's intro with clicks, as a player would. */
async function skipIntro(page: Page): Promise<RushState> {
  return until(
    page,
    (s) => s.phase === 'service',
    60_000,
    async (s) => {
      if (s.phase === 'intro') {
        await page.mouse.click(640, 300);
        await page.waitForTimeout(150);
      }
    },
  );
}

test.describe('the week UI', () => {
  test('title → the week → shop → a passed Monday → next shift', async ({ page }) => {
    test.setTimeout(720_000); // a whole shift played at about real time on software WebGL
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?voice=0&seed=20&ibis=0');

    // --- Title: the week is open; Endless Rush waits for a passed Monday.
    const week = page.getByRole('button', { name: 'The week: shifts', exact: true });
    await expect(week).toBeEnabled();
    await expect(page.locator('#title button[data-act="endless"]')).toBeDisabled();
    await snap(page, '01-title');

    // --- Shift select on a fresh save: Monday open, the rest locked, an empty till.
    await week.click();
    await expect(page.locator('.shift-select')).toBeVisible();
    await expect(row(page, 0)).toBeEnabled();
    await expect(row(page, 0)).toHaveAttribute('data-status', 'open');
    await expect(row(page, 0)).toBeFocused();
    for (const i of [1, 2, 3, 4]) await expect(row(page, i)).toBeDisabled();
    const door = page.getByRole('button', { name: 'Café upgrades', exact: true });
    await expect(door).toContainText('In the till: $0.00 · 0 of 4 owned');
    await snap(page, '02-shift-select');

    // --- The shop: every upgrade priced; with $0 in the till a buy is refused, with the reason.
    await door.click();
    const shop = page.getByRole('dialog', { name: 'Café upgrades' });
    await expect(shop).toBeVisible();
    await expect(shop.locator('.shop-till')).toHaveText('In the till: $0.00');
    const prices: Record<string, [string, string]> = {
      grinder: ['Better grinder', '$450.00'],
      secondGroup: ['Second group head', '$1,200.00'],
      steamWand: ['Better steam wand', '$600.00'],
      docketRail: ['Docket rail', '$150.00'],
    };
    for (const [id, [name, price]] of Object.entries(prices)) {
      const li = shop.locator(`li[data-upgrade="${id}"]`);
      await expect(li.locator('b')).toHaveText(name);
      await expect(li.locator('.price')).toHaveText(price);
      await expect(li.getByRole('button', { name: `Buy ${name} for ${price}` })).toHaveAttribute(
        'data-status',
        'short',
      );
    }
    await shop.getByRole('button', { name: 'Buy Docket rail for $150.00' }).click();
    await expect(shop.locator('.shop-msg')).toHaveText(
      'Not enough in the till: Docket rail costs $150.00, you have $0.00.',
    );
    await expect(shop.locator('.shop-till')).toHaveText('In the till: $0.00');
    const refused = await readSave(page);
    expect([refused.cents, refused.upgrades, refused.shift]).toEqual([0, [], 0]);
    await snap(page, '03-shop-refused');

    await shop.getByRole('button', { name: 'Back to shifts' }).click();
    await expect(page.locator('.shop')).toHaveCount(0);
    await expect(page.locator('.shift-select')).toBeVisible();
    await expect(door).toBeFocused();

    // --- Monday, in week mode.
    await row(page, 0).click();
    await expect(page.locator('.shift-select')).toHaveCount(0);
    await expect
      .poll(async () => (await readRush(page))?.week)
      .toEqual({ week: 1, shiftIndex: 0, endless: false });
    await expect(page.locator('#rday')).toContainText('Monday');
    expect((await readRush(page))?.customers).toHaveLength(6);

    // The bot plays it. Screenshots: the register with a ticket on the rail, and the gauges.
    let ringUps = 0;
    let registerShot = false;
    let gaugeShot = false;
    const at = async (m: Moment, s: RushState): Promise<void> => {
      if (m === 'ringUp' && !registerShot) {
        ringUps++;
        if (s.customers.some((c) => c.state === 'waiting') || ringUps >= 4) {
          registerShot = true;
          await expect(page.locator('#pos')).toBeVisible();
          await snap(page, '04-monday-register-rail');
        }
      }
      if (m === 'shotRunning' && !gaugeShot) {
        gaugeShot = true;
        await expect(page.locator('#rgauges')).toContainText('Shot timer');
        await snap(page, '05-monday-gauges');
      }
    };
    const played = await playShift(page, { at, timeout: 600_000 });
    const s = played.end.summary;
    test
      .info()
      .annotations.push(
        { type: 'Monday summary', description: JSON.stringify(s) },
        { type: 'Monday bot log', description: played.log.join(' | ') },
      );
    expect(registerShot && gaugeShot).toBe(true);

    // --- Passed: the report, its "Next shift", and the autosave on Tuesday.
    if (!s) throw new Error('the shift ended without a summary');
    expect(s.grade).not.toBe('disaster');
    expect(s.walkouts).toBeLessThanOrEqual(2);
    const report = page.locator('#rsummary');
    await expect(report).toBeVisible();
    await expect(report).toContainText('WEEK 1 · MONDAY · SHIFT REPORT');
    await expect(report).toContainText(`${s.ordersCompleted}/${s.customers}`);
    await expect(report.locator('.stamp')).not.toHaveText('Total disaster');
    const next = report.getByRole('button', { name: 'Next shift', exact: true });
    await expect(next).toBeVisible();
    await expect(next).toBeFocused();
    await expect(report.getByRole('button', { name: 'Title screen', exact: true })).toBeVisible();
    const saved = await readSave(page);
    expect(saved.shift).toBe(1);
    expect(saved.reports).toEqual([
      expect.objectContaining({ week: 1, shift: 0, summary: expect.objectContaining({ ...s }) }),
    ]);
    expect(saved.cents).toBe(s.tipsCents);
    expect(saved.memoryOnly).toBe(false);
    await page.waitForTimeout(400);
    await snap(page, '06-monday-report');

    // --- Next shift: Tuesday, in week mode, seven customers.
    await next.click();
    await expect
      .poll(async () => (await readRush(page))?.week)
      .toEqual({ week: 1, shiftIndex: 1, endless: false });
    await expect(page.locator('#rday')).toContainText('Tuesday');
    await expect(report).toBeHidden();
    const tue = await readRush(page);
    expect(tue?.phase).toBe('intro');
    expect(tue?.customers).toHaveLength(7);
    expect(tue?.records).toHaveLength(0);
    expect((await readSave(page)).shift).toBe(1);
    await page.waitForTimeout(800);
    await snap(page, '07-tuesday-intro');
    expect(errors).toEqual([]);
  });

  test('Day 2: the bot plays the whole morning rush to its report', async ({ page }) => {
    test.setTimeout(720_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?voice=0&seed=7&ibis=0');
    await page.getByRole('button', { name: 'Day 2: The morning rush', exact: true }).click();
    await expect.poll(async () => (await readRush(page))?.phase).toBe('intro');
    expect((await readRush(page))?.week).toBeNull();
    await expect(page.locator('#rday')).toContainText('Morning rush');

    const played = await playShift(page, { timeout: 600_000 });
    const s = played.end.summary;
    test
      .info()
      .annotations.push(
        { type: 'Day 2 summary', description: JSON.stringify(s) },
        { type: 'Day 2 bot log', description: played.log.join(' | ') },
      );
    expect(s?.ordersCompleted).toBeGreaterThanOrEqual(1);
    const report = page.locator('#rsummary');
    await expect(report).toBeVisible();
    await expect(report).toContainText('DAY 2 · MORNING RUSH · SHIFT REPORT');
    await expect(report).toContainText(`${s?.ordersCompleted}/${s?.customers}`);
    await expect(report.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await expect(report.getByRole('button', { name: 'Title screen', exact: true })).toBeVisible();
    // Day 2 isn't a week shift: nothing was saved.
    expect((await readSave(page)).reports).toHaveLength(0);
    await page.waitForTimeout(400);
    await snap(page, '09-day2-report');
    expect(errors).toEqual([]);
  });

  test('a shift event is answered with the number key 1', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (save) => localStorage.setItem('nwc.save.v2', save),
      JSON.stringify(tuesday),
    );
    await page.goto('/?voice=0&seed=1&ibis=0');
    await page.getByRole('button', { name: 'The week: shifts', exact: true }).click();
    await expect(row(page, 0)).toHaveAttribute('data-status', 'done');
    await expect(row(page, 1)).toBeEnabled();
    await row(page, 1).click();
    await expect
      .poll(async () => (await readRush(page))?.week)
      .toEqual({ week: 1, shiftIndex: 1, endless: false });
    await skipIntro(page);

    // Dazza steps up to the register and something comes up: the card, his order held for it.
    const card = page.locator('#revent');
    const up = await until(page, (s) => s.event !== null, 60_000);
    expect(up.event).toEqual({ id: 'THE_NAME', customer: 'dazza', choices: ['spell', 'write'] });
    expect(up.station).not.toBe('pour'); // 1–3 are the jug's heights during a pour
    await expect(card).toBeVisible();
    await expect(card).toContainText('wants their name on the cup');
    await expect(card.locator('button[data-choice="spell"] kbd')).toHaveText('1');
    await expect(card.locator('button[data-choice="write"] kbd')).toHaveText('2');
    await expect(page.locator('#rinstr')).toContainText('Answer first');
    await expect(page.locator('#ractions button[data-a="takeOrder"]')).toHaveCount(0);
    const dazza = up.customers.find((c) => c.key === 'dazza');
    expect(dazza?.state).toBe('register');
    await page.waitForTimeout(300);
    await snap(page, '08-event-card');

    // The key answers it: the first choice ("spell"), so Gaz says the "asked" line.
    await page.keyboard.press('1');
    const answered = await until(page, (s) => s.event === null, 10_000);
    expect(answered.eventsFired).toEqual(['THE_NAME']);
    expect(answered.customers.find((c) => c.key === 'dazza')?.state).toBe('register');
    await expect(card).toBeHidden();
    await until(page, (s) => s.line?.key === 'event.theName.asked', 15_000);
    // …and his order can be taken now.
    await expect(page.locator('#ractions button[data-a="takeOrder"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
