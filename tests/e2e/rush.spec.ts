// Plays Day 2 (the morning rush) in a real browser with real input: take orders (one while a shot
// runs), make a flat white for Dazza and serve it from his ticket, make a long black and hand it to
// the wrong customer first (rejected, Gaz complains), then to Priya; let everyone else time out;
// check the shift report against the state; restart; back to the title.
// Screenshots land in test-results/evidence-rush/.

import { expect, test, type Page } from '@playwright/test';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';

interface Cust {
  id: string;
  state: string;
  patience: number;
  max: number;
  ticket: number | null;
  outcome: string | null;
  rejected: number;
  satisfaction: number | null;
}
interface RushState {
  phase: string;
  serviceTime: number;
  station: string;
  stationTime: number;
  drink: string | null;
  dose: number;
  shotTime: number;
  extracting: boolean;
  shotDone: boolean;
  temp: number;
  aeration: number;
  steamDone: boolean;
  water: number;
  ready: { type: string; temp: number } | null;
  fill: number;
  controls: { targetHeight: number };
  customers: Cust[];
  records: Array<{
    customer: string;
    accepted: boolean;
    correct: boolean;
    satisfaction: number;
    tipCents: number;
    waited: number;
  }>;
  summary: {
    ordersCompleted: number;
    correctOrders: number;
    walkouts: number;
    satisfaction: number;
    tipsCents: number;
    avgServeSeconds: number;
    grade: string;
  } | null;
  line: { speaker: string; key: string; text: string } | null;
  crowd: number;
  drawCalls: number;
  paused: boolean;
}
type Debug = {
  rush: RushState | null;
  timeScale: number;
  project(x: number, y: number): { x: number; y: number };
};

const rush = async (page: Page): Promise<RushState> =>
  (await page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.rush)) as RushState;

/** Every line said, polled in the background, so short reactions aren't missed. */
const heard = new Set<string>();
let maxCrowd = 0;
let maxDrawCalls = 0;

async function until(
  page: Page,
  pred: (s: RushState) => boolean,
  timeout = 90_000,
): Promise<RushState> {
  const end = Date.now() + timeout;
  for (;;) {
    const s = await rush(page);
    if (s.line) heard.add(s.line.key);
    if (s.crowd >= maxCrowd) {
      maxCrowd = s.crowd;
      maxDrawCalls = Math.max(maxDrawCalls, s.drawCalls);
    }
    if (pred(s)) return s;
    if (Date.now() > end)
      throw new Error(
        `timed out; last ${JSON.stringify({ ...s, customers: s.customers.map((c) => `${c.id}:${c.state}`) })}`,
      );
    await page.waitForTimeout(25);
  }
}

let shot = 0;
const snap = async (page: Page, name: string): Promise<void> => {
  shot++;
  await page.screenshot({
    path: `test-results/evidence-rush/${String(shot).padStart(2, '0')}-${name}.png`,
  });
};

const cust = (s: RushState, id: string): Cust => s.customers.find((c) => c.id === id) as Cust;
const steamY = (depth: number, h: number): number => (0.2 + ((3 - depth) / 3.8) * 0.6) * h;

/** Take any order waiting at the register (keyboard T, as a trackpad player would). */
async function takeOrders(page: Page): Promise<void> {
  const s = await rush(page);
  if (s.customers.some((c) => c.state === 'register')) await page.keyboard.press('t');
}

async function grindAndLock(page: Page): Promise<void> {
  await until(page, (s) => s.station === 'grind');
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await until(page, (s) => s.dose >= 18.6);
  await page.mouse.up();
  await page.getByRole('button', { name: /Tamp & lock in/ }).click();
}

async function pullShot(page: Page): Promise<void> {
  await until(page, (s) => s.station === 'shot');
  await page.mouse.click(640, 400);
  for (;;) {
    const s = await until(page, () => true);
    await takeOrders(page); // the shot runs on its own: a good moment to take an order
    if (s.shotTime >= 26.5) break;
    await page.waitForTimeout(60);
  }
  await page.mouse.click(640, 400);
  await until(page, (s) => s.shotDone);
}

test('Day 2 morning rush: orders, a heart for Dazza, a wrong drink, walk-outs, shift report', async ({
  page,
}) => {
  test.setTimeout(480_000); // a whole shift, including waiting out three walk-outs
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7');
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();

  // Gaz's intro, then Dazza walks in.
  await until(page, (s) => s.phase === 'intro');
  await page.waitForTimeout(1200);
  await snap(page, 'intro');
  for (let i = 0; i < 40 && (await rush(page)).phase === 'intro'; i++) {
    await page.mouse.click(640, 300);
    await page.waitForTimeout(200);
  }
  await until(page, (s) => cust(s, 'dazza').state === 'register');
  await page.waitForTimeout(500);
  await snap(page, 'dazza-at-register');

  // Take Dazza's order: the ticket prints once he's finished saying it.
  await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  await until(page, (s) => cust(s, 'dazza').state === 'waiting');
  await expect(page.locator('#rail .ticket')).toHaveCount(1);
  await expect(page.locator('#rail .ticket').first()).toContainText('flat white');

  // --- Flat white for Dazza.
  await page.getByRole('button', { name: /Make a flat white/ }).click();
  await grindAndLock(page);
  await pullShot(page);
  await until(page, (s) => s.station === 'steam');
  await takeOrders(page);
  const h = page.viewportSize()?.height ?? 640;
  await page.mouse.move(640, steamY(0.25, h));
  await page.mouse.down();
  await until(page, (s) => s.aeration >= 0.4);
  await page.mouse.move(640, steamY(2.2, h), { steps: 4 });
  await until(page, (s) => s.temp >= 60);
  await page.mouse.up();

  // Pour the heart with the mouse (game time slowed for the pour only, as in the Day 1 e2e).
  await until(page, (s) => s.station === 'pour');
  await until(page, (s) => s.stationTime > 1.1);
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 0.3));
  const DT = 0.04;
  const samples = Array.from({ length: Math.ceil(8 / DT) + 1 }, (_, i) =>
    controlsAt(OWNER_DEMO, i * DT),
  );
  const screen = await page.evaluate(
    (pts) =>
      pts.map(([x, y]) =>
        (window as unknown as { __trial: Debug }).__trial.project(x as number, y as number),
      ),
    samples.map((c) => [c.targetX, c.targetY]),
  );
  let held = false;
  let sentHeight = 7;
  let pourShot = false;
  for (let i = 0; i < 6000; i++) {
    const s = await rush(page);
    if (s.station !== 'pour') break;
    const t = s.stationTime - 1.2;
    if (t < 0) continue;
    const idx = Math.min(samples.length - 1, Math.round(t / DT));
    const k = samples[idx]!;
    const p = screen[idx]!;
    await page.mouse.move(p.x, p.y);
    if (Math.abs(k.targetHeight - sentHeight) > 0.2) {
      await page.mouse.wheel(0, -(k.targetHeight - sentHeight) / 0.012);
      sentHeight = k.targetHeight;
    }
    if (k.holding !== held) {
      if (k.holding) await page.mouse.down();
      else await page.mouse.up();
      held = k.holding;
    }
    if (!pourShot && t > 5.6) {
      pourShot = true;
      await snap(page, 'pour-flat-white');
    }
  }
  if (held) await page.mouse.up();
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 1));
  await until(page, (s) => s.station === 'ready' && s.ready?.type === 'flatWhite');
  await snap(page, 'flat-white-on-the-pass');

  // Serve it from Dazza's ticket.
  await page
    .locator('#rail .ticket', { hasText: 'Dazza' })
    .getByRole('button', { name: /Serve/ })
    .click();
  const served = await until(page, (s) => cust(s, 'dazza').outcome === 'served');
  const dazza = served.records.find((r) => r.customer === 'dazza')!;
  test.info().annotations.push({ type: 'Dazza', description: JSON.stringify(dazza) });
  expect(dazza.accepted).toBe(true);
  expect(dazza.satisfaction).toBeGreaterThan(50);
  await page.waitForTimeout(400);
  await snap(page, 'dazza-served');

  // --- Long black: water first, then the shot. Take any orders on the way.
  await takeOrders(page);
  await until(page, (s) => cust(s, 'priya').state === 'waiting', 30_000);
  await page.getByRole('button', { name: /Make a long black/ }).click();
  await grindAndLock(page);
  await until(page, (s) => s.station === 'water');
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await until(page, (s) => s.water >= 0.62);
  await snap(page, 'long-black-hot-water');
  await page.mouse.up();
  await pullShot(page);
  await until(page, (s) => s.station === 'ready' && s.ready?.type === 'longBlack');

  // Hand it to someone who ordered a flat white first: they hand it back.
  await until(
    page,
    (s) => s.customers.some((c) => c.state === 'waiting' && c.id !== 'priya'),
    40_000,
  );
  const wrong = (await rush(page)).customers.find(
    (c) => c.state === 'waiting' && c.id !== 'priya',
  )!;
  const wrongName = { beryl: 'Nan Beryl', jiwoo: 'Jiwoo', karen: 'Karen' }[wrong.id] ?? wrong.id;
  await page
    .locator('#rail .ticket', { hasText: wrongName })
    .getByRole('button', { name: /Serve/ })
    .click();
  const rejected = await until(page, (s) => cust(s, wrong.id).rejected === 1);
  expect(rejected.ready?.type).toBe('longBlack'); // still on the pass
  await until(page, () => heard.has('rush.wrongDrink'), 15_000);
  await snap(page, 'wrong-drink');

  // Now to the right person.
  await page
    .locator('#rail .ticket', { hasText: 'Priya' })
    .getByRole('button', { name: /Serve/ })
    .click();
  await until(page, (s) => cust(s, 'priya').outcome === 'served');

  // --- Stop working: everyone else times out. Speed up the wait (no input needs precision).
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 4));
  await until(page, (s) => s.customers.some((c) => c.outcome === 'walkout'), 120_000);
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 1));
  await page.waitForTimeout(300);
  await snap(page, 'walkout');
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 4));
  const end = await until(page, (s) => s.phase === 'summary', 180_000);
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 1));
  await page.waitForTimeout(600);
  await snap(page, 'shift-report');

  // The report matches the state.
  const s = end.summary!;
  test.info().annotations.push({ type: 'summary', description: JSON.stringify(s) });
  expect(s.ordersCompleted).toBe(2);
  expect(s.walkouts).toBe(3);
  expect(s.tipsCents).toBe(end.records.reduce((t, r) => t + r.tipCents, 0));
  await expect(page.locator('#rsummary')).toContainText('2/5');
  await expect(page.locator('#rsummary')).toContainText(`$${(s.tipsCents / 100).toFixed(2)}`);
  expect(heard.has('rush.walkout')).toBe(true);
  expect(maxCrowd).toBeGreaterThanOrEqual(3);
  expect(maxDrawCalls).toBeLessThan(150);
  test.info().annotations.push({
    type: 'draw calls',
    description: `${maxDrawCalls} with ${maxCrowd} customers`,
  });

  // Replay, then back to the title from the pause menu.
  await page.getByRole('button', { name: 'Run the rush again' }).click();
  const fresh = await until(page, (x) => x.phase === 'intro');
  expect(fresh.records).toHaveLength(0);
  expect(fresh.crowd).toBe(0);
  await page.keyboard.press('Escape');
  await until(page, (x) => x.paused);
  await page.getByRole('button', { name: 'Title screen' }).click();
  await expect(page.getByRole('button', { name: /Day 1: Start the trial/ })).toBeVisible();
  expect(errors).toEqual([]);
});
