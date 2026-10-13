// Plays Day 2 (the morning rush) in a real browser with real input. Listening: take Dazza's order,
// check the transcript stays hidden until "could you repeat that?" (Normal difficulty), ask a
// clarifying question, replay, ring up what he said on the register and make his ticket. Then ring
// the second customer up WRONG on purpose: learning-mode feedback shows, the drink made from the
// wrong ticket is handed back, Gaz calls out the mishearing and the ticket is corrected. Everyone
// else times out; the shift report (incl. listening) must match the state; restart; title.
// Screenshots land in test-results/evidence-rush/.

import { expect, test, type Page } from '@playwright/test';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';

interface Order {
  type: 'flatWhite' | 'longBlack';
  milk: 'full' | 'oat' | 'soy' | 'almond' | null;
  extraHot: boolean;
  heart: boolean;
}
interface Cust {
  id: string;
  state: string;
  order: Order;
  heard: Order | null;
  listen: { replays: number; repeats: number; clarified: string[] };
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
  ready: { type: string; temp: number; milkType: string | null } | null;
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
  line: { speaker: string; key: string; text: string; delivery: string } | null;
  listening: Array<{ customer: string; wrong: string[] }>;
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

const NAME: Record<string, string> = { dazza: 'Dazza', priya: 'Priya' };
const ticket = (page: Page, id: string) =>
  page.locator('#rail .ticket', { hasText: NAME[id] ?? id });

/** Ring up an order on the register with real clicks, then Enter. */
async function ringUp(page: Page, o: Order): Promise<void> {
  const pos = page.locator('#pos');
  const click = (name: string) => pos.getByRole('button', { name, exact: true }).click();
  await click(o.type === 'flatWhite' ? 'Flat white' : 'Long black');
  if (o.type === 'flatWhite') {
    await click({ full: 'Full cream', oat: 'Oat', soy: 'Soy', almond: 'Almond' }[o.milk ?? 'full']);
    await click(o.extraHot ? 'Extra hot' : 'Normal');
    await click(o.heart ? 'Heart' : 'No heart');
  }
  await page.keyboard.press('Enter');
}

async function steamAndPour(page: Page, extraHot: boolean, shotName: string): Promise<void> {
  await until(page, (s) => s.station === 'steam');
  await takeOrders(page);
  const h = page.viewportSize()?.height ?? 640;
  await page.mouse.move(640, steamY(0.25, h));
  await page.mouse.down();
  await until(page, (s) => s.aeration >= 0.4);
  await page.mouse.move(640, steamY(2.2, h), { steps: 4 });
  await until(page, (s) => s.temp >= (extraHot ? 70 : 60));
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
      await snap(page, shotName);
      // The pour buttons sit off to the side, clear of the cup the pointer steers across.
      const box = await page.getByRole('button', { name: /Hand it over/ }).boundingBox();
      const rim = await page.evaluate(() =>
        (window as unknown as { __trial: Debug }).__trial.project(1.25, 0),
      );
      expect(box?.x ?? 0).toBeGreaterThan(rim.x);
    }
  }
  if (held) await page.mouse.up();
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 1));
}

/** Make whatever a ticket says, through the station, with real input. */
async function makeTicket(page: Page, id: string, o: Order): Promise<void> {
  await ticket(page, id).getByRole('button', { name: 'Make' }).click();
  await grindAndLock(page);
  if (o.type === 'longBlack') {
    await until(page, (s) => s.station === 'water');
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await until(page, (s) => s.water >= 0.62);
    await snap(page, `long-black-water-${id}`);
    await page.mouse.up();
    await pullShot(page);
  } else {
    await pullShot(page);
    await steamAndPour(page, o.extraHot, `pour-${id}`);
  }
  await until(page, (s) => s.station === 'ready' && s.ready?.type === o.type);
}

test('Day 2 morning rush: listening at the register, a misheard ticket, walk-outs, report', async ({
  page,
}) => {
  test.setTimeout(480_000); // a whole shift, including waiting out the walk-outs
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7&ibis=0');
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

  // --- Listen to Dazza. Normal difficulty: no transcript while he orders.
  await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  await until(page, (s) => cust(s, 'dazza').state === 'ordering' && s.line?.speaker === 'dazza');
  await expect(page.locator('#rsubs .text')).toContainText('Listen');
  await expect(page.locator('#pos')).toBeVisible();
  await snap(page, 'register-listening');
  await until(page, (s) => cust(s, 'dazza').state === 'deciding');

  // Replay, a clarifying question, then "could you repeat that?" (which shows the transcript).
  const pos = page.locator('#pos');
  await pos.getByRole('button', { name: /Replay/ }).click();
  await until(page, (s) => cust(s, 'dazza').listen.replays === 1);
  await pos.getByRole('button', { name: 'Milk?' }).click();
  await expect(pos.locator('.asked')).toContainText('Which milk');
  const asked = await until(page, (s) => s.line?.key === 'dazza.answer.milk');
  await expect(page.locator('#rsubs .text')).toContainText('Listen'); // answers follow the rule too
  expect(cust(asked, 'dazza').listen.clarified).toEqual(['milk']);
  await pos.getByRole('button', { name: /could you repeat that/ }).click();
  const slow = await until(page, (s) => s.line?.speaker === 'dazza' && s.line.delivery === 'slow');
  await expect(page.locator('#rsubs .text')).not.toContainText('Listen');
  await expect(page.locator('#rsubs .text')).toContainText(slow.line!.text.slice(0, 12));
  await snap(page, 'register-after-repeat');

  // Ring up exactly what he said.
  const dz = cust(slow, 'dazza').order;
  await ringUp(page, dz);
  await until(page, (s) => cust(s, 'dazza').state === 'waiting');
  await expect(page.locator('#posFeedback')).toContainText('Spot on');
  await expect(ticket(page, 'dazza')).toContainText(
    dz.type === 'flatWhite' ? 'flat white' : 'long black',
    {
      ignoreCase: true,
    },
  );
  await snap(page, 'dazza-rung-up');

  // --- Make his ticket and serve it.
  await makeTicket(page, 'dazza', dz);
  await snap(page, 'dazza-drink-on-the-pass');
  await ticket(page, 'dazza').getByRole('button', { name: /Serve/ }).click();
  const served = await until(page, (s) => cust(s, 'dazza').outcome === 'served');
  const dazza = served.records.find((r) => r.customer === 'dazza')!;
  test.info().annotations.push({ type: 'Dazza', description: JSON.stringify(dazza) });
  expect(dazza.accepted).toBe(true);
  expect(dazza.satisfaction).toBeGreaterThan(50);
  await page.waitForTimeout(400);
  await snap(page, 'dazza-served');

  // --- Priya: ring her up wrong on purpose (the other drink).
  await takeOrders(page);
  await until(page, (s) => cust(s, 'priya').state === 'deciding', 60_000);
  const pr = cust(await rush(page), 'priya').order;
  const wrong: Order =
    pr.type === 'flatWhite'
      ? { type: 'longBlack', milk: null, extraHot: false, heart: false }
      : { type: 'flatWhite', milk: 'full', extraHot: false, heart: false };
  await ringUp(page, wrong);
  await until(page, (s) => cust(s, 'priya').state === 'waiting');
  await expect(page.locator('#posFeedback')).toContainText('Not quite');
  await expect(page.locator('#posFeedback mark').first()).toBeVisible();
  await snap(page, 'priya-misheard-feedback');

  // The ticket is what gets made: the wrong drink. She hands it back; Gaz calls it out.
  await makeTicket(page, 'priya', wrong);
  await ticket(page, 'priya').getByRole('button', { name: /Serve/ }).click();
  const rejected = await until(page, (s) => cust(s, 'priya').rejected === 1);
  expect(rejected.ready?.type).toBe(wrong.type); // still on the pass
  await until(page, () => heard.has('rush.misheard'), 15_000);
  // …and the ticket is corrected to what she actually said.
  await expect(ticket(page, 'priya')).toContainText(
    pr.type === 'flatWhite' ? 'flat white' : 'long black',
    {
      ignoreCase: true,
    },
  );
  await snap(page, 'priya-ticket-corrected');
  await page.keyboard.press('b'); // bin the wrong drink

  // --- Stop working: everyone else times out. Speed up the wait (no input needs precision).
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 4));
  await until(page, (s) => s.customers.some((c) => c.outcome === 'walkout'), 120_000);
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 1));
  await page.waitForTimeout(300);
  await snap(page, 'walkout');
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 4));
  const end = await until(page, (s) => s.phase === 'summary', 240_000);
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 1));
  await page.waitForTimeout(600);
  await snap(page, 'shift-report');

  // The report matches the state, listening included.
  const s = end.summary!;
  test.info().annotations.push({ type: 'summary', description: JSON.stringify(s) });
  expect(s.ordersCompleted).toBe(1);
  expect(s.walkouts).toBe(5);
  expect(s.tipsCents).toBe(end.records.reduce((t, r) => t + r.tipCents, 0));
  await expect(page.locator('#rsummary')).toContainText('1/6');
  await expect(page.locator('#rsummary')).toContainText(`$${(s.tipsCents / 100).toFixed(2)}`);
  expect(end.listening.map((l) => [l.customer, l.wrong.length > 0])).toEqual([
    ['dazza', false],
    ['priya', true],
  ]);
  await expect(page.locator('#rsummary')).toContainText('Orders heard right');
  await expect(page.locator('#rsummary .misheard')).toContainText('Priya');
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
