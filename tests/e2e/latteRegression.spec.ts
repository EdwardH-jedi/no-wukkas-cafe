// Latte-art regression: replay a recorded perfect pour with the mouse in practice mode and check
// the score band hasn't moved. The pour is data (tests/e2e/fixtures/perfect-pour.json: Gaz's demo
// pour sampled every 40 ms, frozen), aimed through the game's own projection so it lands on the
// same cup coordinates whatever the camera does. Input feel changes (pour sensitivity, the Space
// ramp, zoom guards) must leave this mouse pour, at default settings, inside the band.
//
// Band: see BAND below (three runs before any lane 1C change). Run alone it takes ~2 min (slow
// game time keeps the replay faithful on software GL).

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface PracticeState {
  phase: string;
  phaseTime: number;
  count: number;
  fill: number;
  controls: { targetHeight: number; holding: boolean };
  attempts: Array<{ n: number; art: number; findings: string[] }>;
}

type Debug = {
  practice: PracticeState | null;
  timeScale: number;
  project(x: number, y: number): { x: number; y: number };
};

/** Game speed while replaying: software GL runs ~20 fps, so slow time keeps the input fine-grained
 *  even on a busy machine. */
const SLOW = 0.15;

/** [t s, x, y (cup-rim coords), spout height cm, held 0/1] */
type Sample = [number, number, number, number, number];

const POUR = JSON.parse(
  readFileSync(new URL('./fixtures/perfect-pour.json', import.meta.url), 'utf8'),
) as { dt: number; samples: Sample[] };

/** The band, pinned from three runs on chore/p1-ownership (13f11a3) before any lane 1C change, at
 *  SLOW: art 0.8906 / 0.8952 / 0.8898, Heart 82 / 83 / 82 %, Symmetry, Centred and Crisp 100 %,
 *  White 35 %, findings ["textbook"], "Proper heart" each time. Two-sided, so a change that makes
 *  this pour better is caught too. */
const BAND = {
  art: [0.86, 0.93],
  verdict: 'Proper heart',
  findings: ['textbook'],
  rows: {
    Heart: [74, 92],
    Symmetry: [95, 100],
    Centred: [95, 100],
    Crisp: [95, 100],
    /** White coverage, % of the surface. */
    White: [31, 40],
  },
} as const;

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

const timeScale = (page: Page, v: number): Promise<number> =>
  page.evaluate((v) => ((window as unknown as { __trial: Debug }).__trial.timeScale = v), v);

/** Replay the recorded pour with the mouse: move = aim, button = pour, wheel = height. The wheel
 *  is closed-loop on the game's own target height and lands a hair (0.01 cm) past the recorded
 *  height in the direction of travel: the pull-through thinning starts at exactly the lift height
 *  (3 cm), and float noise in summed wheel deltas must not decide whether the sweep is thin. */
async function replay(page: Page, samples: readonly Sample[], dt: number): Promise<void> {
  const screen = await page.evaluate(
    (pts) =>
      pts.map(([x, y]) =>
        (window as unknown as { __trial: Debug }).__trial.project(x as number, y as number),
      ),
    samples.map((s) => [s[1], s[2]]),
  );
  await timeScale(page, SLOW);
  const start = (await state(page))?.phaseTime ?? 0;
  let held = false;
  // The target height a wheel event was sent from: wait until the game has applied it (the target
  // moved) before sending another, so one correction is never sent twice.
  let sentFrom: number | null = null;
  let waited = 0;
  for (let i = 0; i < 6000; i++) {
    const s = await state(page);
    if (!s || s.phase !== 'pour') break;
    const idx = Math.min(samples.length - 1, Math.round((s.phaseTime - start) / dt));
    const [, , , h, hold] = samples[idx]!;
    const p = screen[idx]!;
    await page.mouse.move(p.x, p.y);
    const target = s.controls.targetHeight;
    if (target !== sentFrom) sentFrom = null; // applied
    const pending = sentFrom !== null && ++waited < 20;
    const dh = h - target;
    if (!pending && Math.abs(dh) > 0.05) {
      await page.mouse.wheel(0, -(dh + Math.sign(dh) * 0.01) / 0.012);
      sentFrom = target;
      waited = 0;
    }
    if ((hold === 1) !== held) {
      if (hold === 1) await page.mouse.down();
      else await page.mouse.up();
      held = hold === 1;
    }
  }
  if (held) await page.mouse.up();
  await timeScale(page, 1);
}

/** The review card's bar values, by label ("Heart" → 87). */
async function cardRows(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const out: Record<string, number> = {};
    document.querySelectorAll('#pcard .rows .r').forEach((r) => {
      const spans = r.querySelectorAll(':scope > span');
      const label = spans[0]?.textContent?.trim() ?? '';
      const value = parseInt(spans[1]?.textContent ?? '', 10);
      out[label] = value;
    });
    return out;
  });
}

test('latte regression: a recorded perfect pour keeps its score band', async ({ page }) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?voice=0&seed=7');
  // Default settings: a clean profile, so pour sensitivity is the default (1).
  expect(
    await page.evaluate(() => {
      try {
        return localStorage.getItem('nwc.listen.v1');
      } catch {
        return null;
      }
    }),
  ).toBeNull();
  await page.getByRole('button', { name: 'Latte art practice' }).click();
  await until(page, (x) => x.phase === 'pour' && x.phaseTime > 2.2);

  await replay(page, POUR.samples, POUR.dt);
  const s = await until(page, (x) => x.phase === 'review');
  const a = s.attempts[0]!;
  await expect(page.locator('#pcard .rows .r')).toHaveCount(5);
  const rows = await cardRows(page);
  const verdict = (await page.locator('#pcard .bandTag').textContent())?.trim();
  const measured = JSON.stringify({ art: a.art, findings: a.findings, rows, verdict });
  test.info().annotations.push({ type: 'perfect pour', description: measured });
  console.log(`perfect pour: ${measured}`);

  expect(a.art).toBeGreaterThanOrEqual(BAND.art[0]);
  expect(a.art).toBeLessThanOrEqual(BAND.art[1]);
  expect(verdict).toBe(BAND.verdict);
  expect(a.findings).toEqual(BAND.findings);
  for (const [label, [lo, hi]] of Object.entries(BAND.rows)) {
    expect(rows[label], label).toBeGreaterThanOrEqual(lo);
    expect(rows[label], label).toBeLessThanOrEqual(hi);
  }
  await page.screenshot({ path: 'test-results/evidence/latte-regression-review.png' });
  expect(errors).toEqual([]);
});
