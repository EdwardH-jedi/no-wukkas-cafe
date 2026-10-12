// Plays the Day 1 trial in a real browser with real mouse input: grind, shot, steam, the owner's
// demo, a heart poured by moving/holding/scrolling the mouse, a deliberate pour onto the counter,
// the verdict, pause and restart.

import { expect, test, type Page } from '@playwright/test';
import { OWNER_LINES } from '../../src/data/ownerLines';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';

interface DebugState {
  phase: string;
  attempt: number;
  dose: number;
  shotTime: number;
  temp: number;
  aeration: number;
  fill: number;
  spill: number;
  poured: number;
  controls: { targetHeight: number };
  phaseTime: number;
  results: Array<{ total: number; valid: boolean; band: string; faults: string[]; art: number }>;
  outcome: { band: string; score: number; bestIndex: number } | null;
  line: string | null;
  paused: boolean;
  drawCalls: number;
}

const state = (page: Page): Promise<DebugState> =>
  page.evaluate(() => (window as unknown as { __trial: { state: DebugState } }).__trial.state);

async function until(
  page: Page,
  pred: (s: DebugState) => boolean,
  timeout = 60_000,
): Promise<DebugState> {
  const end = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if (pred(s)) return s;
    if (Date.now() > end)
      throw new Error(
        `timed out; last state ${JSON.stringify({ ...s, results: s.results.length })}`,
      );
    await page.waitForTimeout(25);
  }
}

const project = (page: Page, x: number, y: number): Promise<{ x: number; y: number }> =>
  page.evaluate(
    ([cx, cy]) =>
      (
        window as unknown as {
          __trial: { project(a: number, b: number): { x: number; y: number } };
        }
      ).__trial.project(cx as number, cy as number),
    [x, y],
  );

/** Click through Gaz's subtitles in the phases where clicks aren't gameplay. */
async function clickThrough(page: Page, phase: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if ((await state(page)).phase !== phase) return;
    await page.mouse.click(640, 400);
    await page.waitForTimeout(150);
  }
}

/** Steam depth comes from the pointer's height on screen (main.ts): mouse down = tip at the surface. */
const steamY = (depth: number, h: number): number => (0.2 + ((3 - depth) / 3.8) * 0.6) * h;

async function steamMilk(page: Page): Promise<void> {
  await until(page, (s) => s.phase === 'steam');
  const h = page.viewportSize()?.height ?? 800;
  await page.mouse.move(640, steamY(0.25, h));
  await page.mouse.down();
  await until(page, (s) => s.aeration >= 0.4);
  await page.mouse.move(640, steamY(2.2, h), { steps: 4 });
  await until(page, (s) => s.temp >= 60);
  await page.mouse.up();
}

test('Day 1 trial: espresso, steam, a real-mouse heart, Gaz reacts, verdict, restart', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7');
  await expect(page.getByRole('heading', { name: 'No Wukkas Café' })).toBeVisible();
  await page.getByRole('button', { name: 'Start the trial' }).click();

  // --- greeting
  await until(page, (s) => s.phase === 'intro');
  expect((await state(page)).line).toBeTruthy();
  await clickThrough(page, 'intro');

  // --- grind: hold the mouse button on the canvas
  await until(page, (s) => s.phase === 'grind');
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await until(page, (s) => s.dose >= 18.6);
  await page.mouse.up();
  const dose = (await state(page)).dose;
  expect(dose).toBeGreaterThanOrEqual(18);
  expect(dose).toBeLessThanOrEqual(20);
  await page.getByRole('button', { name: 'Tamp & lock in' }).click();

  // --- shot: click to start, click to stop inside the window
  await until(page, (s) => s.phase === 'shot');
  await page.mouse.click(640, 400);
  await until(page, (s) => s.shotTime >= 26.5);
  await page.mouse.click(640, 400);
  const shot = await until(page, (s) => s.phase === 'steam' || s.shotTime > 0);
  expect(shot.shotTime).toBeGreaterThanOrEqual(25);
  expect(shot.shotTime).toBeLessThanOrEqual(31);

  // --- steam: stretch near the surface, then sink the tip and spin; pause freezes everything
  await until(page, (s) => s.phase === 'steam');
  const h = page.viewportSize()?.height ?? 800;
  await page.mouse.move(640, steamY(0.25, h));
  await page.mouse.down();
  await until(page, (s) => s.temp > 15);
  await page.keyboard.press('Escape');
  const frozen = await until(page, (s) => s.paused);
  await page.waitForTimeout(600);
  expect((await state(page)).temp).toBeCloseTo(frozen.temp, 5);
  await page.keyboard.press('Escape');
  await page.mouse.up(); // pausing let go of the button: press it again
  await page.mouse.down();
  await until(page, (s) => s.aeration >= 0.4);
  await page.mouse.move(640, steamY(2.2, h), { steps: 4 });
  await until(page, (s) => s.temp >= 60);
  await page.mouse.up();
  const milk = await state(page);
  expect(milk.temp).toBeGreaterThanOrEqual(55);
  expect(milk.temp).toBeLessThanOrEqual(65);

  // --- Gaz demonstrates, then it's our pour
  await until(page, (s) => s.phase === 'demo', 20_000);
  await page.screenshot({ path: 'test-results/demo.png' });
  await until(page, (s) => s.phase === 'pour', 60_000);

  // --- pour a heart with the mouse: move = jug position, hold = tip, wheel = height.
  // The camera is still during the pour, so project the track onto the screen once up front and
  // keep each tick to one cheap read plus only the input that changed.
  const DT = 0.04;
  const START = 1.2; // let the camera finish easing into the pour shot first
  await until(page, (s) => s.phaseTime > START - 0.1);
  // Slow game time for the pour so ~20 fps software rendering still samples the mouse finely.
  await page.evaluate(
    () => ((window as unknown as { __trial: { timeScale: number } }).__trial.timeScale = 0.3),
  );
  const samples = Array.from({ length: Math.ceil(8 / DT) + 1 }, (_, i) =>
    controlsAt(OWNER_DEMO, i * DT),
  );
  const screen = await page.evaluate(
    (pts) =>
      pts.map(([x, y]) =>
        (
          window as unknown as {
            __trial: { project(a: number, b: number): { x: number; y: number } };
          }
        ).__trial.project(x as number, y as number),
      ),
    samples.map((c) => [c.targetX, c.targetY]),
  );
  let held = false;
  let sentHeight = (await state(page)).controls.targetHeight;
  let snapped = false;
  for (let i = 0; i < 6000; i++) {
    const tick = await page.evaluate(
      () =>
        (window as unknown as { __trial: { tick: { phase: string; phaseTime: number } } }).__trial
          .tick,
    );
    if (tick.phase !== 'pour') break;
    const t = tick.phaseTime - START;
    if (t < 0) continue;
    const idx = Math.min(samples.length - 1, Math.round(t / DT));
    const k = samples[idx]!;
    const p = screen[idx]!;
    await page.mouse.move(p.x, p.y);
    const dh = k.targetHeight - sentHeight;
    if (Math.abs(dh) > 0.2) {
      await page.mouse.wheel(0, -dh / 0.012);
      sentHeight = k.targetHeight;
    }
    if (k.holding !== held) {
      if (k.holding) await page.mouse.down();
      else await page.mouse.up();
      held = k.holding;
    }
    if (!snapped && t > 5.6) {
      snapped = true;
      await page.screenshot({ path: 'test-results/pour.png' });
    }
  }
  if (held) await page.mouse.up();
  await page.evaluate(
    () => ((window as unknown as { __trial: { timeScale: number } }).__trial.timeScale = 1),
  );
  await until(page, (s) => s.phase === 'inspect');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/inspect.png' });
  await clickThrough(page, 'inspect');
  const first = await until(page, (s) => s.phase === 'feedback');
  const a1 = first.results[0];
  test.info().annotations.push({ type: 'attempt 1', description: JSON.stringify(a1) });
  expect(a1?.valid).toBe(true);
  expect(a1?.faults).not.toContain('blob');
  expect(a1?.faults).not.toContain('noArt');
  expect(a1?.total ?? 0).toBeGreaterThanOrEqual(75);
  await expect(page.locator('#card .bigScore')).toContainText(String(a1?.total));
  await page.screenshot({ path: 'test-results/feedback.png' });

  // --- attempt 2: pour onto the counter on purpose; Gaz must say so
  await page.getByRole('button', { name: /Next attempt/ }).click();
  await steamMilk(page);
  await until(page, (s) => s.phase === 'pour', 30_000);
  await until(page, (s) => s.phaseTime > 1.1); // camera settled on the cup
  const off = await project(page, 1.25, -0.3); // past the rim, onto the bench
  expect(off.x).toBeLessThan(page.viewportSize()?.width ?? 1024);
  await page.mouse.move(off.x, off.y);
  await page.mouse.down();
  const outsideLines = OWNER_LINES['pour.outside']!.tiers.flat().map((l) => l.text);
  const reacted = await until(
    page,
    (s) => s.line !== null && outsideLines.includes(s.line),
    20_000,
  );
  expect(reacted.spill).toBeGreaterThan(0);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Hand it over' }).click();
  await clickThrough(page, 'inspect');
  const second = await until(page, (s) => s.phase === 'feedback');
  expect(second.results[1]?.valid).toBe(false);

  // --- attempt 3: hand over a cup with nothing poured, then hear the verdict
  await page.getByRole('button', { name: /Next attempt/ }).click();
  await steamMilk(page);
  await until(page, (s) => s.phase === 'pour', 30_000);
  await until(page, (s) => s.phaseTime > 0.5);
  await page.keyboard.press('Enter'); // "Hand it over"
  await clickThrough(page, 'inspect');
  await until(page, (s) => s.phase === 'feedback');
  await page.getByRole('button', { name: 'Hear the verdict' }).click();

  const verdict = await until(page, (s) => s.phase === 'verdict' && s.outcome !== null);
  expect(verdict.results).toHaveLength(3);
  expect(verdict.outcome?.bestIndex).toBe(0); // best *valid* attempt
  expect(verdict.outcome?.score).toBe(a1?.total);
  const title = {
    hired: 'Hired',
    almost: 'Almost hired',
    failed: 'Failed trial',
    disaster: 'Disaster',
  }[verdict.outcome?.band as 'hired'];
  await expect(page.locator('#verdict .stamp')).toHaveText(title, { timeout: 20_000 });
  await page.screenshot({ path: 'test-results/verdict.png' });
  expect(verdict.drawCalls).toBeLessThan(150);

  // --- restart
  await page.getByRole('button', { name: 'Do the trial again' }).click();
  const fresh = await until(page, (s) => s.phase === 'intro');
  expect(fresh.results).toHaveLength(0);
  expect(errors).toEqual([]);
});
