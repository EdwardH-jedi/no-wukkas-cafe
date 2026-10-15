// Latte-art practice in a real browser with real input: start from the title, pour a heart with
// the mouse (the demo's own control track), read the review, pour again holding Space through the
// restart (the gate must ignore it), reset mid-pour, toggle the guide, pour a blob and read why it
// failed, watch Gaz with the lesson strip, then back to the title. Screenshots land in
// test-results/evidence/practice-*.png.

import { expect, test, type Page } from '@playwright/test';
import { controlsAt, OWNER_DEMO, type TrackKey } from '../../src/sim/latte/demo';

interface PracticeState {
  phase: string;
  phaseTime: number;
  count: number;
  best: number;
  guide: boolean;
  fill: number;
  poured: number;
  armed: boolean;
  step: number;
  controls: { targetHeight: number; holding: boolean };
  demoActive: boolean;
  demoRate: number;
  line: string | null;
  attempts: Array<{ n: number; art: number; findings: string[] }>;
  paused: boolean;
  drawCalls: number;
}

type Debug = {
  practice: PracticeState | null;
  timeScale: number;
  project(x: number, y: number): { x: number; y: number };
};

const state = (page: Page): Promise<PracticeState | null> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.practice);

async function until(
  page: Page,
  pred: (s: PracticeState) => boolean,
  timeout = 60_000,
): Promise<PracticeState> {
  const end = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    if (s && pred(s)) return s;
    if (Date.now() > end) throw new Error(`timed out; last ${JSON.stringify(s)}`);
    await page.waitForTimeout(25);
  }
}

const snap = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: `test-results/evidence/practice-${name}.png` });

const timeScale = (page: Page, v: number): Promise<number> =>
  page.evaluate((v) => ((window as unknown as { __trial: Debug }).__trial.timeScale = v), v);

/** Pour along a control track with the mouse: move = aim, button = pour, wheel = height. The
 *  wheel is closed-loop on the game's target height and lands 0.01 cm past the track's height in
 *  the direction of travel (as tests/e2e/latteRegression.spec.ts does): the pull-through thinning
 *  starts at exactly 3 cm, and an open-loop sum of wheel deltas that came to 2.9999 cm poured a
 *  full-flow sweep (art ≈ 0.74, a flake). */
async function pourTrack(page: Page, track: readonly TrackKey[]): Promise<void> {
  const DT = 0.04;
  const samples = Array.from({ length: Math.ceil(8.4 / DT) + 1 }, (_, i) =>
    controlsAt(track, i * DT),
  );
  const screen = await page.evaluate(
    (pts) =>
      pts.map(([x, y]) =>
        (window as unknown as { __trial: Debug }).__trial.project(x as number, y as number),
      ),
    samples.map((c) => [c.targetX, c.targetY]),
  );
  await timeScale(page, 0.3);
  const start = (await state(page))?.phaseTime ?? 0;
  let held = false;
  // The target height a wheel event was sent from: wait until the game has applied it before
  // sending another, so one correction is never sent twice.
  let sentFrom: number | null = null;
  let waited = 0;
  for (let i = 0; i < 6000; i++) {
    const s = await state(page);
    if (!s || s.phase !== 'pour') break;
    const idx = Math.min(samples.length - 1, Math.round((s.phaseTime - start) / DT));
    const k = samples[idx]!;
    const p = screen[idx]!;
    await page.mouse.move(p.x, p.y);
    const target = s.controls.targetHeight;
    if (target !== sentFrom) sentFrom = null; // applied
    const pending = sentFrom !== null && ++waited < 20;
    const dh = k.targetHeight - target;
    if (!pending && Math.abs(dh) > 0.05) {
      await page.mouse.wheel(0, -(dh + Math.sign(dh) * 0.01) / 0.012);
      sentFrom = target;
      waited = 0;
    }
    if (k.holding !== held) {
      if (k.holding) await page.mouse.down();
      else await page.mouse.up();
      held = k.holding;
    }
  }
  if (held) await page.mouse.up();
  await timeScale(page, 1);
}

const BLOB: TrackKey[] = OWNER_DEMO.map((k) =>
  k.t >= 6.4 ? { ...k, x: 0, y: -0.35, h: k.hold ? 0.7 : 8 } : { ...k },
);

test('latte-art practice: pour, review, retry, reset, guide, blob, watch Gaz', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7');
  await page.getByRole('button', { name: 'Latte art practice' }).click();

  // --- straight to a cup: guide on, step 1 of the lesson
  let s = await until(page, (x) => x.phase === 'pour' && x.phaseTime > 2.2);
  expect(s.guide).toBe(true);
  expect(s.poured).toBe(0);
  await expect(page.locator('#plesson')).toBeVisible();
  await expect(page.locator('#plesson .who')).toHaveText('Your pour');
  await expect(page.locator('#plesson li.cur b')).toHaveText('Pour high to fill');
  await expect(page.locator('#pGuide')).toHaveAttribute('aria-pressed', 'true');
  await snap(page, '01-start');

  // --- pour a heart with the mouse; the review is scored from the foam field
  await pourTrack(page, OWNER_DEMO);
  s = await until(page, (x) => x.phase === 'review');
  const first = s.attempts[0]!;
  test.info().annotations.push({ type: 'practice heart', description: JSON.stringify(first) });
  expect(first.art).toBeGreaterThan(0.75);
  expect(first.findings).not.toContain('noPull');
  await expect(page.locator('#pcard .bigScore')).toContainText(String(Math.round(first.art * 100)));
  await expect(page.locator('#pcard .rows .r')).toHaveCount(5);
  await page.waitForTimeout(1200);
  await snap(page, '02-review-heart');

  // --- pour again with Space, and keep holding it: the gate ignores the carried-over press
  await page.keyboard.down(' ');
  s = await until(page, (x) => x.phase === 'pour');
  expect(s.poured).toBe(0);
  await page.waitForTimeout(800);
  s = (await state(page))!;
  expect(s.poured).toBe(0);
  expect(s.armed).toBe(false);
  await expect(page.locator('#plesson .hint')).toHaveText('Let go, then press again to pour.');
  await snap(page, '03-held-through-restart');
  await page.keyboard.up(' ');
  await until(page, (x) => x.armed);

  // --- reset mid-pour: a fresh cup, still pouring, nothing judged
  const mid = await page.evaluate(() =>
    (window as unknown as { __trial: Debug }).__trial.project(0, -0.3),
  );
  await page.mouse.move(mid.x, mid.y);
  await page.keyboard.down(' ');
  await until(page, (x) => x.poured > 0.05);
  await page.keyboard.up(' ');
  await page.keyboard.press('r');
  s = await until(page, (x) => x.poured === 0);
  expect(s.phase).toBe('pour');
  expect(s.count).toBe(1);

  // --- the guide toggles from the keyboard and the button
  await page.keyboard.press('g');
  await until(page, (x) => !x.guide);
  await expect(page.locator('#pGuide')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#pGuide').click();
  await until(page, (x) => x.guide);

  // --- a blob: the review says why, and compares with the heart
  await until(page, (x) => x.phaseTime > 0.5);
  await pourTrack(page, BLOB);
  s = await until(page, (x) => x.phase === 'review' && x.count === 2);
  expect(s.attempts[1]?.findings[0]).toBe('noPull');
  await expect(page.locator('#pcard .faults')).toContainText('Blob, no pull-through');
  await expect(page.locator('#pcard .vs')).toContainText('pour #1');
  await expect(page.locator('#pcard .attempts canvas')).toHaveCount(2);
  await page.waitForTimeout(1200);
  await snap(page, '04-review-blob');

  // --- Gaz demonstrates, the lesson strip follows his chapters, Enter skips back to a cup
  await page.getByRole('button', { name: 'Watch Gaz' }).click();
  await until(page, (x) => x.demoActive);
  await expect(page.locator('#plesson .who')).toHaveText('Gaz’s hands');
  await until(page, (x) => x.step >= 2, 60_000);
  await expect(page.locator('#plesson li.done').first()).toBeVisible();
  await snap(page, '05-demo');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  s = await until(page, (x) => x.phase === 'pour');
  expect(s.poured).toBe(0);
  expect(s.drawCalls).toBeLessThan(150);

  // --- pause → back to the title
  await page.keyboard.press('Escape');
  await until(page, (x) => x.paused);
  await page.getByRole('button', { name: 'Back to title' }).click();
  await expect(page.getByRole('heading', { name: 'No Wukkas Café' })).toBeVisible();
  expect(await state(page)).toBeNull();
  expect(errors).toEqual([]);
});
