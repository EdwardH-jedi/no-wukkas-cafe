// The owner must actually speak when the player presses Start. Checks real Web Audio playback in
// Chromium (not just that play() didn't throw): the clip is fetched and decoded to the manifest
// length, the context runs, playback progresses to `onended`, and the voice bus carries signal.
// Also: pause freezes the voice, Replay says the line again, and a broken clip is reported.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface PlayRecord {
  id: string;
  text: string;
  via: 'clip' | 'tts';
  file: string;
  manifestDuration: number;
  bufferDuration: number;
  startedAt: number;
  endedAt: number | null;
  maxRms: number;
  error: string | null;
}
interface AudioDebug {
  status: string;
  message: string;
  contextState: string;
  currentTime: number;
  history: PlayRecord[];
}

const manifest = JSON.parse(
  readFileSync(new URL('../../src/data/voice/manifest.json', import.meta.url), 'utf8'),
) as { clips: Array<{ file: string }> };

const audio = (page: Page): Promise<AudioDebug> =>
  page.evaluate(() => (window as unknown as { __trial: { audio: AudioDebug } }).__trial.audio);

test('pressing Start makes Gaz audibly speak; pause, replay and failure feedback work', async ({
  page,
}) => {
  const first = manifest.clips[0];
  test.skip(!first, 'no voice manifest');
  const probe = await page.request.get(`/${first!.file}`);
  test.skip(!probe.ok(), 'voice clips not rendered on this machine (run `npm run voices`)');

  await page.goto('/?seed=7&ibis=0');
  await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();

  // First line plays to the end.
  await expect
    .poll(async () => (await audio(page)).history.find((h) => h.endedAt !== null) ?? null, {
      timeout: 20_000,
    })
    .not.toBeNull();
  const a = await audio(page);
  expect(a.contextState).toBe('running');
  expect(a.status).toBe('ok');
  const h = a.history[0]!;
  expect(h.via).toBe('clip');
  expect(h.error).toBeNull();
  expect(Math.abs(h.bufferDuration - h.manifestDuration)).toBeLessThan(0.05);
  expect(h.endedAt! - h.startedAt).toBeGreaterThan(h.bufferDuration - 0.1);
  expect(h.maxRms).toBeGreaterThan(0.02);
  console.log(
    `first line: "${h.text}" decoded ${h.bufferDuration.toFixed(3)} s (manifest ${h.manifestDuration}), ` +
      `played ${(h.endedAt! - h.startedAt).toFixed(3)} s, peak RMS ${h.maxRms.toFixed(3)}`,
  );

  // Pause freezes the audio clock; resume continues.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
  const t0 = (await audio(page)).currentTime;
  await page.waitForTimeout(600);
  expect((await audio(page)).currentTime).toBe(t0);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await audio(page)).contextState).toBe('running');

  // Replay says the last line again.
  const before = (await audio(page)).history.length;
  await page.getByRole('button', { name: 'Replay the last line' }).click();
  await expect.poll(async () => (await audio(page)).history.length).toBeGreaterThan(before);
  const after = await audio(page);
  expect(after.history.at(-1)!.text).toBe(after.history.at(-2)!.text);

  // Sound panel: voice volume slider is live.
  await page.getByRole('button', { name: 'Sound settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Sound settings' })).toBeVisible();
  await page.getByLabel('Voices volume').fill('40');
  await expect(page.locator('[data-out="voice"]')).toHaveText('40%');
  await page.getByRole('button', { name: 'Done' }).click();
});

test('a voice clip that fails to load is reported, not silent', async ({ page }) => {
  await page.route('**/assets/voice/**', (r) => r.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/?seed=7&ibis=0');
  await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
  await expect.poll(async () => (await audio(page)).status, { timeout: 10_000 }).not.toBe('locked');
  await expect.poll(async () => (await audio(page)).status).toMatch(/fallback|error/);
  await expect(page.locator('#audioToast')).toBeVisible();
  await expect(page.locator('#audioToast')).toContainText("Couldn't load a voice clip");
  const a = await audio(page);
  expect(a.history[0]!.via).toBe('tts');
});
