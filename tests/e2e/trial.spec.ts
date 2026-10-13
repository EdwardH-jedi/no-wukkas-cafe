// Plays the Day 1 trial in a real browser with real input events: grind, shot, steam, the owner's
// demo, then three attempts:
//   1. a heart poured mouse-style (hold the button, wheel for height),
//   2. a heart poured trackpad-style (hover to steer, Space to tip, small scroll deltas and the
//      1/2/3 height presets: nothing needs click-and-scroll at the same time),
//   3. a deliberate pour onto the counter, which Gaz must call out and which doesn't count.
// Then the verdict (best valid attempt), restart from the verdict and from the pause menu.
// Screenshots of every step land in test-results/evidence/.

import { expect, test, type Page } from '@playwright/test';
import { OWNER_LINES } from '../../src/data/ownerLines';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';
import { HEIGHT_PRESETS } from '../../src/sim/latte/pitcher';

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

type Debug = {
  state: DebugState;
  tick: { phase: string; phaseTime: number };
  timeScale: number;
  project(x: number, y: number): { x: number; y: number };
};

const state = (page: Page): Promise<DebugState> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.state);

let shotIndex = 0;
const snap = async (page: Page, name: string): Promise<void> => {
  shotIndex++;
  await page.screenshot({
    path: `test-results/evidence/${String(shotIndex).padStart(2, '0')}-${name}.png`,
  });
};

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

async function steamMilk(page: Page, viaSpace = false): Promise<void> {
  await until(page, (s) => s.phase === 'steam');
  const h = page.viewportSize()?.height ?? 800;
  await page.mouse.move(640, steamY(0.25, h));
  if (viaSpace) await page.keyboard.down(' ');
  else await page.mouse.down();
  await until(page, (s) => s.aeration >= 0.4);
  await page.mouse.move(640, steamY(2.2, h), { steps: 4 });
  await until(page, (s) => s.temp >= 60);
  if (viaSpace) await page.keyboard.up(' ');
  else await page.mouse.up();
}

/** Wait for the pour camera to settle, slow game time (software GL runs ~20 fps), return a clock. */
async function startPour(page: Page): Promise<() => Promise<{ phase: string; t: number }>> {
  const START = 1.2;
  await until(page, (s) => s.phase === 'pour', 60_000);
  await until(page, (s) => s.phaseTime > START - 0.1);
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 0.3));
  return async () => {
    const tick = await page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.tick);
    return { phase: tick.phase, t: tick.phaseTime - START };
  };
}

async function endPour(page: Page): Promise<void> {
  await page.evaluate(() => ((window as unknown as { __trial: Debug }).__trial.timeScale = 1));
  await until(page, (s) => s.phase === 'inspect');
  await page.waitForTimeout(1200);
}

/** Mouse style: the demo track, holding the button to pour and using the wheel for height. */
async function pourWithMouse(page: Page): Promise<void> {
  const clock = await startPour(page);
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
  let sentHeight = (await state(page)).controls.targetHeight;
  let snapped = false;
  for (let i = 0; i < 6000; i++) {
    const { phase, t } = await clock();
    if (phase !== 'pour') break;
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
      await snap(page, 'pour-mouse');
    }
  }
  if (held) await page.mouse.up();
  await endPour(page);
}

/** Trackpad style: no mouse button. Hover to steer, Space to tip, small scroll deltas, presets. */
async function pourTrackpadStyle(page: Page): Promise<void> {
  const clock = await startPour(page);
  const [HIGH, LIFT, LOW] = HEIGHT_PRESETS;
  // (time, x, y, space held, height action)
  const plan: Array<{
    t: number;
    x: number;
    y: number;
    space: boolean;
    preset?: number;
    scroll?: number;
  }> = [
    { t: 0.0, x: 0, y: -0.3, space: false },
    { t: 0.5, x: 0, y: -0.3, space: true },
    { t: 1.5, x: 0, y: -0.3, space: true, scroll: 1 }, // fine trackpad scroll: 7 → 6 cm
    { t: 3.6, x: 0, y: -0.35, space: true, preset: LOW },
    { t: 6.4, x: 0, y: -0.38, space: true, preset: LIFT },
    { t: 6.6, x: 0, y: 0.1, space: false },
    { t: 6.95, x: 0, y: 0.85, space: false },
    { t: 7.4, x: 0, y: 0.6, space: false, preset: HIGH },
    { t: 8.0, x: 0, y: 0.6, space: false },
  ];
  const at = (t: number) => {
    let a = plan[0]!;
    let b = plan[0]!;
    for (let i = 0; i < plan.length; i++)
      if (plan[i]!.t <= t) {
        a = plan[i]!;
        b = plan[i + 1] ?? a;
      }
    const u = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 0;
    return { a, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  let space = false;
  let lastKey = -1;
  let snapped = false;
  for (let i = 0; i < 6000; i++) {
    const { phase, t } = await clock();
    if (phase !== 'pour') break;
    if (t < 0) continue;
    const k = at(t);
    const p = await page.evaluate(
      ([x, y]) =>
        (window as unknown as { __trial: Debug }).__trial.project(x as number, y as number),
      [k.x, k.y],
    );
    await page.mouse.move(p.x, p.y); // hover only: no button is ever pressed
    const ki = plan.indexOf(k.a);
    if (ki !== lastKey) {
      lastKey = ki;
      if (k.a.preset !== undefined)
        await page.keyboard.press(String(HEIGHT_PRESETS.indexOf(k.a.preset as 7) + 1));
      // Trackpad two-finger scroll: lots of small deltas rather than wheel notches.
      if (k.a.scroll) for (let n = 0; n < 21; n++) await page.mouse.wheel(0, 4 * k.a.scroll);
    }
    if (k.a.space !== space) {
      if (k.a.space) await page.keyboard.down(' ');
      else await page.keyboard.up(' ');
      space = k.a.space;
    }
    if (!snapped && t > 5.6) {
      snapped = true;
      await snap(page, 'pour-trackpad');
    }
  }
  if (space) await page.keyboard.up(' ');
  await endPour(page);
}

test('Day 1 trial: mouse and trackpad-style hearts, Gaz reacts, verdict, restart', async ({
  page,
}) => {
  // ~2.6 min alone in software GL; late in a full suite run it has gone past the 180 s default.
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7');
  await expect(page.getByRole('heading', { name: 'No Wukkas Café' })).toBeVisible();
  await page.waitForTimeout(800);
  await snap(page, 'title');
  await page.getByRole('button', { name: 'Start the trial' }).click();

  // --- greeting
  await until(page, (s) => s.phase === 'intro');
  await page.waitForTimeout(1500);
  await snap(page, 'intro');
  expect((await state(page)).line).toBeTruthy();
  await clickThrough(page, 'intro');

  // --- grind: hold the mouse button on the canvas
  await until(page, (s) => s.phase === 'grind');
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await until(page, (s) => s.dose >= 18.6);
  await page.mouse.up();
  await snap(page, 'grind');
  const dose = (await state(page)).dose;
  expect(dose).toBeGreaterThanOrEqual(18);
  expect(dose).toBeLessThanOrEqual(20);
  await page.getByRole('button', { name: 'Tamp & lock in' }).click();

  // --- shot: click to start, click to stop inside the window
  await until(page, (s) => s.phase === 'shot');
  await page.mouse.click(640, 400);
  await until(page, (s) => s.shotTime >= 26.5);
  await page.mouse.click(640, 400);
  await snap(page, 'shot');
  const shot = await state(page);
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
  await snap(page, 'pause');
  expect((await state(page)).temp).toBeCloseTo(frozen.temp, 5);
  await page.keyboard.press('Escape');
  await page.mouse.up(); // pausing let go of the button: press it again
  await page.mouse.down();
  await until(page, (s) => s.aeration >= 0.4);
  await page.mouse.move(640, steamY(2.2, h), { steps: 4 });
  await snap(page, 'steam');
  await until(page, (s) => s.temp >= 60);
  await page.mouse.up();
  const milk = await state(page);
  expect(milk.temp).toBeGreaterThanOrEqual(55);
  expect(milk.temp).toBeLessThanOrEqual(65);

  // --- Gaz demonstrates
  await until(page, (s) => s.phase === 'demo', 20_000);
  await until(page, (s) => s.phase !== 'demo' || s.fill > 0.75, 30_000);
  await snap(page, 'demo');

  // --- attempt 1: mouse-style heart
  await pourWithMouse(page);
  await snap(page, 'inspect');
  await clickThrough(page, 'inspect');
  const first = await until(page, (s) => s.phase === 'feedback');
  const a1 = first.results[0];
  test.info().annotations.push({ type: 'attempt 1 (mouse)', description: JSON.stringify(a1) });
  expect(a1?.valid).toBe(true);
  expect(a1?.faults).not.toContain('blob');
  expect(a1?.total ?? 0).toBeGreaterThanOrEqual(75);
  await expect(page.locator('#card .bigScore')).toContainText(String(a1?.total));
  await snap(page, 'feedback');

  // --- attempt 2: trackpad-style heart (Space for steaming and pouring, no mouse button)
  await page.getByRole('button', { name: /Next attempt/ }).click();
  await steamMilk(page, true);
  await pourTrackpadStyle(page);
  await clickThrough(page, 'inspect');
  const second = await until(page, (s) => s.phase === 'feedback');
  const a2 = second.results[1];
  test
    .info()
    .annotations.push({ type: 'attempt 2 (trackpad-style)', description: JSON.stringify(a2) });
  expect(a2?.valid).toBe(true);
  expect(a2?.faults).not.toContain('blob');
  expect(a2?.total ?? 0).toBeGreaterThanOrEqual(75);
  await snap(page, 'feedback-trackpad');

  // --- attempt 3: pour onto the counter on purpose; Gaz must say so
  await page.getByRole('button', { name: /Next attempt/ }).click();
  await steamMilk(page);
  await until(page, (s) => s.phase === 'pour', 30_000);
  await until(page, (s) => s.phaseTime > 1.1); // camera settled on the cup
  const off = await page.evaluate(() =>
    (window as unknown as { __trial: Debug }).__trial.project(1.25, -0.3),
  ); // past the rim
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
  await snap(page, 'spill');
  await page.mouse.up();
  await page.keyboard.press('Enter'); // "Hand it over"
  await clickThrough(page, 'inspect');
  const third = await until(page, (s) => s.phase === 'feedback');
  expect(third.results[2]?.valid).toBe(false);
  await page.getByRole('button', { name: 'Hear the verdict' }).click();

  // --- verdict: best *valid* attempt
  const verdict = await until(page, (s) => s.phase === 'verdict' && s.outcome !== null);
  expect(verdict.results).toHaveLength(3);
  const best = Math.max(a1?.total ?? 0, a2?.total ?? 0);
  expect(verdict.outcome?.score).toBe(best);
  expect([0, 1]).toContain(verdict.outcome?.bestIndex);
  const title = {
    hired: 'Hired',
    almost: 'Almost hired',
    failed: 'Failed trial',
    disaster: 'Disaster',
  }[verdict.outcome?.band as 'hired'];
  await expect(page.locator('#verdict .stamp')).toHaveText(title, { timeout: 20_000 });
  await snap(page, 'verdict');
  expect(verdict.drawCalls).toBeLessThan(150);

  // --- replay from the verdict, then restart from the pause menu
  await page.getByRole('button', { name: 'Do the trial again' }).click();
  const fresh = await until(page, (s) => s.phase === 'intro');
  expect(fresh.results).toHaveLength(0);
  await clickThrough(page, 'intro');
  await until(page, (s) => s.phase === 'grind');
  await page.keyboard.press('Escape');
  await until(page, (s) => s.paused);
  await page.getByRole('button', { name: 'Restart trial' }).click();
  const again = await until(page, (s) => s.phase === 'intro' && !s.paused);
  expect(again.results).toHaveLength(0);
  expect(errors).toEqual([]);
});
