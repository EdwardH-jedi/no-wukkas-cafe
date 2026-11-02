// The first session, after the 2026-11-02 playtest, in a real browser with real input events
// (synthetic Playwright mouse/keyboard on software WebGL; no real device, no audio: ?voice=0):
//   T1  Day 1's shot timer says where the shot is (approaching / in range / over-extracted) in
//       words and a "Stop now" banner, explains the training clock, and Gaz's shot on attempt 2
//       gets full espresso marks after a deliberately bad first shot (which keeps its own score).
//   T2  Day 2: confirm A → B at the register → Make A. While A's drink is made only the station
//       acts (no register panel, Enter/R/clicks never reach it); bin it and B is back as they were.
//   T3  The trial's pause menu → Title screen (pointer mid-grind, keyboard mid-steam, a phone-width
//       viewport), then a new trial that starts fresh. Nothing is scored, saved or logged as done.
// Screenshots land in test-results/evidence-first-session/.

import { expect, test, type Page } from '@playwright/test';

interface TrialState {
  phase: string;
  attempt: number;
  dose: number;
  shotTime: number;
  temp: number;
  aeration: number;
  poured: number;
  phaseTime: number;
  results: Array<{ total: number; valid: boolean; faults: string[]; espresso: number }>;
  paused: boolean;
  input: { held: boolean; spaceHeld: boolean; keyHeight: number; touchHeight: number };
}
interface Cust {
  id: string;
  state: string;
  ticket: number | null;
  order: { type: string; milk: string | null; extraHot: boolean; heart: boolean };
  heard: Cust['order'] | null;
  listen: { replays: number; repeats: number; questions: number; clarified: string[] };
}
interface RushState {
  phase: string;
  context: 'register' | 'production';
  station: string;
  dose: number;
  customers: Cust[];
  listening: Array<{ customer: string }>;
}
type Debug = {
  state: TrialState;
  rush: RushState | null;
  telemetry: { records: Array<{ kind: string; ending: string }> };
  timeScale: number;
  project(x: number, y: number): { x: number; y: number };
};

const trial = (page: Page): Promise<TrialState> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.state);
const rush = (page: Page): Promise<RushState> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.rush as RushState);
const project = (page: Page, x: number, y: number): Promise<{ x: number; y: number }> =>
  page.evaluate(
    ([cx, cy]) => (window as unknown as { __trial: Debug }).__trial.project(cx!, cy!),
    [x, y],
  );
const telemetryRecords = (page: Page): Promise<Array<{ kind: string; ending: string }>> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.telemetry.records);
const timeScale = (page: Page, k: number): Promise<number> =>
  page.evaluate((x) => ((window as unknown as { __trial: Debug }).__trial.timeScale = x), k);

async function poll<S>(
  read: () => Promise<S>,
  pred: (s: S) => boolean,
  timeout = 60_000,
): Promise<S> {
  const end = Date.now() + timeout;
  for (;;) {
    const s = await read();
    if (pred(s)) return s;
    if (Date.now() > end) throw new Error(`timed out; last ${JSON.stringify(s).slice(0, 600)}`);
    await new Promise((ok) => setTimeout(ok, 25));
  }
}
const untilTrial = (page: Page, pred: (s: TrialState) => boolean, timeout?: number) =>
  poll(() => trial(page), pred, timeout);
const untilRush = (page: Page, pred: (s: RushState) => boolean, timeout?: number) =>
  poll(() => rush(page), pred, timeout);

let shot = 0;
const snap = async (page: Page, name: string): Promise<void> => {
  shot++;
  await page.screenshot({
    path: `test-results/evidence-first-session/${String(shot).padStart(2, '0')}-${name}.png`,
  });
};

/** Click through Gaz's subtitles while the trial is in `phase`. */
async function clickThrough(page: Page, phase: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if ((await trial(page)).phase !== phase) return;
    await page.mouse.click(640, 400);
    await page.waitForTimeout(150);
  }
}

const steamY = (depth: number, h: number): number => (0.2 + ((3 - depth) / 3.8) * 0.6) * h;

async function startTrial(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start the trial' }).click();
  await untilTrial(page, (s) => s.phase === 'intro');
  await clickThrough(page, 'intro');
  await untilTrial(page, (s) => s.phase === 'grind');
}

async function grindAndLock(page: Page): Promise<void> {
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await untilTrial(page, (s) => s.dose >= 18.6);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Tamp & lock in' }).click();
}

async function steam(page: Page): Promise<void> {
  await untilTrial(page, (s) => s.phase === 'steam');
  const h = page.viewportSize()?.height ?? 640;
  await page.mouse.move(640, steamY(0.25, h));
  await page.mouse.down();
  await untilTrial(page, (s) => s.aeration >= 0.4);
  await page.mouse.move(640, steamY(2.2, h), { steps: 4 });
  await untilTrial(page, (s) => s.temp >= 60);
  await page.mouse.up();
}

/** A quick pour into the middle of the cup, then "Hand it over" (Enter). The cup's score doesn't
 *  matter here; every attempt records its espresso points, valid or not. */
async function quickPour(page: Page): Promise<void> {
  await untilTrial(page, (s) => s.phase === 'pour', 60_000);
  await untilTrial(page, (s) => s.phaseTime > 1.2);
  const mid = await project(page, 0, -0.1);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await untilTrial(page, (s) => s.poured > 0.4 || s.phase !== 'pour', 20_000);
  await page.mouse.up();
  if ((await trial(page)).phase === 'pour') await page.keyboard.press('Enter');
  await untilTrial(page, (s) => s.phase === 'inspect');
  await clickThrough(page, 'inspect');
  await untilTrial(page, (s) => s.phase === 'feedback');
}

test('T1: the shot timer reads approaching / in range / over with a Stop banner and the training clock; Gaz’s later shot scores full', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7');
  await startTrial(page);
  await grindAndLock(page);
  await untilTrial(page, (s) => s.phase === 'shot');

  const card = page.locator('#gauges .gauge.shotTrain');
  const banner = card.locator('.stopCue');
  const tag = card.locator('[data-g="st"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-state', 'ready');
  await expect(card).toContainText('Stop at 25–31 s');
  await expect(card.locator('.clockNote')).toContainText('Training clock: 3.4× speed');
  await expect(card.locator('.clockNote')).toContainText('about 7–9 real seconds');
  await expect(banner).toBeHidden();

  await timeScale(page, 0.35); // time to read each state at ~20 fps software GL
  await page.mouse.click(640, 400); // pump on
  await untilTrial(page, (s) => s.shotTime >= 12);
  await expect(card).toHaveAttribute('data-state', 'approach');
  await expect(tag).toContainText('not yet');
  await expect(banner).toBeHidden();
  await snap(page, 'shot-approaching');

  await untilTrial(page, (s) => s.shotTime >= 26);
  await expect(card).toHaveAttribute('data-state', 'inRange');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(/Stop now/);
  await expect(tag).toContainText('In range');
  await snap(page, 'shot-in-range-stop-now');

  // Deliberately past the window: over-extracted, said in words and in the banner.
  await timeScale(page, 1);
  await untilTrial(page, (s) => s.shotTime >= 33);
  await expect(card).toHaveAttribute('data-state', 'over');
  await expect(banner).toHaveText(/Too long/);
  await expect(tag).toContainText('Over-extracted');
  await snap(page, 'shot-over-extracted');
  await untilTrial(page, (s) => s.shotTime >= 38);
  await page.mouse.click(640, 400); // stop it, far too late (a shotLong fault)
  await expect(card).toHaveAttribute('data-state', 'stopped');
  await expect(tag).toContainText('over-extracted');
  await expect(banner).toBeHidden();

  // Attempt 1 on the player's own bad shot; attempt 2 on Gaz's.
  await steam(page);
  await untilTrial(page, (s) => s.phase === 'demo', 20_000);
  await clickThrough(page, 'demo');
  await quickPour(page);
  const first = (await trial(page)).results[0]!;
  expect(first.faults).toContain('shotLong');
  expect(first.espresso).toBeLessThan(8);

  await page.getByRole('button', { name: /Next attempt/ }).click();
  await steam(page);
  await quickPour(page);
  const after2 = await trial(page);
  test.info().annotations.push({
    type: 'espresso points',
    description: JSON.stringify(after2.results.map((r) => r.espresso)),
  });
  expect(after2.results[1]!.espresso).toBe(8);
  expect(
    after2.results[1]!.faults.filter((f) => f.startsWith('shot') || f.startsWith('dose')),
  ).toEqual([]);
  expect(after2.results[0]).toEqual(first); // the first go keeps its own score
  expect(errors).toEqual([]);
});

const cust = (s: RushState, id: string): Cust => s.customers.find((c) => c.id === id) as Cust;

async function ringUp(page: Page, o: Cust['order']): Promise<void> {
  const pos = page.locator('#pos');
  const click = (name: string) => pos.getByRole('button', { name, exact: true }).click();
  await click(o.type === 'flatWhite' ? 'Flat white' : 'Long black');
  if (o.type === 'flatWhite') {
    await click(
      { full: 'Full cream', oat: 'Oat', soy: 'Soy', almond: 'Almond' }[o.milk ?? 'full'] ?? '',
    );
    await click(o.extraHot ? 'Extra hot' : 'Normal');
    await click(o.heart ? 'Heart' : 'No heart');
  }
  await page.keyboard.press('Enter');
}

async function grindAndLockRush(page: Page): Promise<void> {
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await untilRush(page, (s) => s.dose >= 18.6);
  await page.mouse.up();
  await page.getByRole('button', { name: /Tamp & lock in/ }).click();
}

test('T2: confirm A → B at the register → Make A: only the station acts; B comes back intact', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7&ibis=0');
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  await untilRush(page, (s) => s?.phase === 'intro');
  for (let i = 0; i < 40 && (await rush(page)).phase === 'intro'; i++) {
    await page.mouse.click(640, 300);
    await page.waitForTimeout(200);
  }

  // A (Dazza): take the order, ring it up exactly.
  await untilRush(page, (s) => cust(s, 'dazza').state === 'register');
  await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  const decided = await untilRush(page, (s) => cust(s, 'dazza').state === 'deciding');
  await ringUp(page, cust(decided, 'dazza').order);
  await untilRush(page, (s) => cust(s, 'dazza').state === 'waiting');

  // B (Priya) steps up; take her order and choose part of it on the register (not rung up).
  await timeScale(page, 4);
  await untilRush(page, (s) => cust(s, 'priya').state === 'register', 120_000);
  await timeScale(page, 1);
  await page.keyboard.press('t');
  await untilRush(page, (s) => cust(s, 'priya').state === 'deciding', 60_000);
  const pos = page.locator('#pos');
  const opt = (name: string) => pos.getByRole('button', { name, exact: true });
  await opt('Flat white').click();
  await opt('Oat').click();
  const longBlack = await opt('Long black').boundingBox();
  await snap(page, 'register-priya-partial');

  // Make A: production. The register panel is put away; the station's instruction leads.
  await page
    .locator('#rail .ticket', { hasText: 'Dazza' })
    .getByRole('button', { name: 'Make' })
    .click();
  await untilRush(page, (s) => s.station === 'grind' && s.context === 'production');
  await expect(pos).toBeHidden();
  await expect(page.locator('#rinstr')).toContainText('Grind');
  await expect(page.locator('#rinstr')).toContainText("Priya's order waits on the register");
  await snap(page, 'production-register-put-away');

  // Pointer: a click where "Long black" was reaches the station (it grinds), not the register.
  await page.mouse.click(
    longBlack!.x + longBlack!.width / 2,
    longBlack!.y + longBlack!.height / 2,
    { delay: 120 },
  );
  expect((await rush(page)).dose).toBeGreaterThan(0);
  // Keyboard: R is no replay for Priya; then grind, lock in, and Enter in the next step never
  // rings her up.
  await page.keyboard.press('r');
  await grindAndLockRush(page);
  await untilRush(page, (s) => s.station === 'shot' || s.station === 'water');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const mid = await rush(page);
  expect(mid.context).toBe('production');
  expect(cust(mid, 'priya').heard).toBeNull();
  expect(cust(mid, 'priya').state).toBe('deciding');
  expect(cust(mid, 'priya').listen).toEqual({
    replays: 0,
    repeats: 0,
    questions: 0,
    clarified: [],
  });
  expect(mid.listening).toHaveLength(1);
  expect(cust(mid, 'dazza').state).toBe('waiting');
  expect(cust(mid, 'dazza').heard).toEqual(cust(mid, 'dazza').order);

  // Bin it: back at the register, Priya's choices still there, Dazza's ticket still on the rail.
  await page.keyboard.press('b');
  await untilRush(page, (s) => s.context === 'register' && s.station === 'idle');
  await expect(pos).toBeVisible();
  await expect(opt('Flat white')).toHaveAttribute('aria-pressed', 'true');
  await expect(opt('Oat')).toHaveAttribute('aria-pressed', 'true');
  await expect(opt('Long black')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#rail .ticket', { hasText: 'Dazza' })).toBeVisible();
  await snap(page, 'register-restored');

  // Ring her up with Enter: one ticket, printed once.
  await page.keyboard.press('Enter');
  const done = await untilRush(page, (s) => cust(s, 'priya').state === 'waiting');
  expect(done.listening.map((l) => l.customer)).toEqual(['dazza', 'priya']);
  expect([cust(done, 'dazza').ticket, cust(done, 'priya').ticket]).toEqual([1, 2]);
  expect(cust(done, 'priya').heard?.type).toBe('flatWhite');
  expect(cust(done, 'priya').heard?.milk).toBe('oat');
  expect(errors).toEqual([]);
});

/** Every stored key except the playtest log: settings, the week's save, the scores board. */
const storedState = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) as string;
      if (k !== 'nwc.telemetry.v1') out[k] = localStorage.getItem(k) as string;
    }
    return out;
  });

test('T3: trial pause → Title screen (pointer mid-grind, keyboard mid-steam), then a fresh trial', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7');

  // Pointer, mid-grind: grinding with the mouse and W (jug up) held, Esc, let go of the mouse (the
  // canvas holds the pointer while it's down), then click "Title screen" with W still held.
  await startTrial(page);
  // What's stored once a trial runs (the Start click may store sound settings): quitting adds none.
  const stored0 = await storedState(page);
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.keyboard.down('w');
  await untilTrial(page, (s) => s.dose > 3 && s.input.keyHeight === 1);
  await page.keyboard.press('Escape');
  await untilTrial(page, (s) => s.paused);
  await page.mouse.up();
  const titleBtn = page.getByRole('button', { name: 'Title screen' });
  await expect(titleBtn).toBeVisible();
  await snap(page, 'trial-pause-menu');
  await titleBtn.click();
  const t1 = await untilTrial(page, (s) => s.phase === 'title');
  expect(t1.paused).toBe(false);
  // W is still down, but nothing it was doing carries into the title.
  expect(t1.input).toEqual({ held: false, spaceHeld: false, keyHeight: 0, touchHeight: 0 });
  await page.keyboard.up('w');
  await expect(page.getByRole('heading', { name: 'No Wukkas Café' })).toBeVisible();
  await expect(page.locator('#pause')).toBeHidden();
  await expect(page.locator('#gauges')).toBeHidden();
  await expect(page.locator('#instr')).toBeHidden();
  await expect(page.locator('#topbar')).toBeHidden();
  await expect(page.locator('#subs')).toHaveClass(/gone/);
  await snap(page, 'title-after-quit');

  // A new trial from the title: fresh attempt state, a grinder that isn't running by itself.
  await startTrial(page);
  const fresh = await trial(page);
  expect(fresh.attempt).toBe(0);
  expect(fresh.results).toEqual([]);
  await page.waitForTimeout(800);
  expect((await trial(page)).dose).toBe(0); // no stuck hold
  // One game loop: phase time runs at the wall clock's pace (a second loop would double it).
  const a = await trial(page);
  const wall0 = Date.now();
  await page.waitForTimeout(1500);
  const b = await trial(page);
  const ratio = (b.phaseTime - a.phaseTime) / ((Date.now() - wall0) / 1000);
  test.info().annotations.push({ type: 'game time / wall time', description: ratio.toFixed(2) });
  expect(ratio).toBeGreaterThan(0.5);
  expect(ratio).toBeLessThan(1.3);

  // Keyboard, mid-steam: Esc, Tab to "Title screen", Enter.
  await grindAndLock(page);
  await untilTrial(page, (s) => s.phase === 'shot');
  await page.mouse.click(640, 400);
  await untilTrial(page, (s) => s.shotTime >= 26.5);
  await page.mouse.click(640, 400);
  await untilTrial(page, (s) => s.phase === 'steam');
  const h = page.viewportSize()?.height ?? 640;
  await page.mouse.move(640, steamY(0.25, h));
  await page.mouse.down();
  await untilTrial(page, (s) => s.temp > 15);
  await page.keyboard.press('Escape');
  await untilTrial(page, (s) => s.paused);
  let focused = '';
  for (let i = 0; i < 30 && focused !== 'titleBtn'; i++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.id ?? '');
  }
  expect(focused).toBe('titleBtn');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  const t2 = await untilTrial(page, (s) => s.phase === 'title');
  expect(t2.paused).toBe(false);
  expect(t2.temp).toBeLessThan(10);
  expect(t2.input).toEqual({ held: false, spaceHeld: false, keyHeight: 0, touchHeight: 0 });

  // The title answers the keyboard too: its first button has focus, Enter starts a new trial.
  const focusedTitle = await page.evaluate(() => document.activeElement?.textContent ?? '');
  expect(focusedTitle).toContain('Start the trial');
  await page.keyboard.press('Enter');
  await untilTrial(page, (s) => s.phase === 'intro');
  expect((await trial(page)).attempt).toBe(0);

  // Quitting scored nothing and saved nothing; the log has the quits as quits.
  expect(await storedState(page)).toEqual(stored0);
  const trials = (await telemetryRecords(page)).filter((r) => r.kind === 'trial');
  expect(trials.map((r) => r.ending)).toEqual(['title', 'title']);
  expect(errors).toEqual([]);
});

test('T3: the pause menu’s Title screen button fits a phone-width viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/?voice=0&seed=7');
  await page.getByRole('button', { name: 'Start the trial' }).click();
  await untilTrial(page, (s) => s.phase === 'intro');
  await page.keyboard.press('Escape');
  await untilTrial(page, (s) => s.paused);
  const btn = page.getByRole('button', { name: 'Title screen' });
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(box!.y + box!.height).toBeLessThanOrEqual(740);
  await snap(page, 'pause-360');
  await btn.click();
  await untilTrial(page, (s) => s.phase === 'title');
});
