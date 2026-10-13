// Café music in a real browser: the synth schedules notes on the audio clock, produces signal at
// the master bus (with voices, ambience and effects muted so only music is left), follows the
// day (opening → rush), and ducks under a customer's order. Headless Chromium is muted at the
// device (--mute-audio): this checks the audio graph, not how it sounds.

import { expect, test, type Page } from '@playwright/test';

interface AudioDebug {
  contextState: string;
  speaking: boolean;
  masterRms: number;
  music: { mood: string | null; duck: number; scheduled: number };
  history: Array<{ speaker: string; via: string; text: string; endedAt: number | null }>;
}
type W = {
  __trial: {
    audio: AudioDebug;
    rush: { phase: string; customers: Array<{ id: string; state: string }> } | null;
  };
};

const audio = (page: Page): Promise<AudioDebug> =>
  page.evaluate(() => (window as unknown as W).__trial.audio);

test('music plays, follows the day and ducks under an order', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?seed=7&ibis=0');
  // Only music left at the master: everything else to zero.
  await page.getByRole('button', { name: 'Sound settings' }).click();
  for (const l of ['Voices volume', 'Café ambience volume', 'Machine & effects volume'])
    await page.getByLabel(l).fill('0');
  await page.getByLabel('Music volume').fill('100');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
  await expect.poll(async () => (await audio(page)).music.mood).toBe('opening');
  await expect.poll(async () => (await audio(page)).music.scheduled).toBeGreaterThan(20);
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    peak = Math.max(peak, (await audio(page)).masterRms);
    await page.waitForTimeout(100);
  }
  expect(peak).toBeGreaterThan(0.003);
  console.log(`opening: master RMS peak with only music audible ${peak.toFixed(4)}`);

  // Day 2: the rush mood once service starts, and the duck under Dazza's order.
  await page.reload();
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  for (let i = 0; i < 80; i++) {
    const r = await page.evaluate(() => (window as unknown as W).__trial.rush);
    if (
      r?.phase === 'service' &&
      r.customers.some((c) => c.id === 'dazza' && c.state === 'register')
    )
      break;
    if (r?.phase === 'intro') await page.mouse.click(640, 300);
    await page.waitForTimeout(250);
  }
  await expect.poll(async () => (await audio(page)).music.mood).toBe('rush');
  await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  let low = 1;
  for (let i = 0; i < 25; i++) {
    const a = await audio(page);
    const playing = a.history.at(-1);
    if (playing?.speaker === 'dazza' && playing.endedAt === null) low = Math.min(low, a.music.duck);
    await page.waitForTimeout(100);
  }
  expect(low).toBeLessThan(0.35);
  // Back up once nobody's talking.
  await expect
    .poll(
      async () => {
        const a = await audio(page);
        return !a.speaking && a.music.duck > 0.9;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  console.log(`rush: music ducked to ${low.toFixed(2)} under Dazza's order, then recovered`);
});
