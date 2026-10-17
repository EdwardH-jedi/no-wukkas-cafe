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
  lastLine: string | null;
  speaking: boolean;
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

  // Replay says the last line again. Gaz's next greeting can start right after the click, so look
  // for the replay among the new records rather than at the very last one (that raced: 2 in 5
  // failed on 8333240, before overnight run #3), and take the line Replay repeats from the manager
  // (a line asked for but still loading isn't in the history yet).
  // Click while a line plays that started under a second and a half ago: Gaz's next line is
  // seconds away, so the line Replay repeats can't change between this read and the click (it
  // did when the click fell between two lines).
  await expect
    .poll(async () => {
      const a = await audio(page);
      const h = a.history.at(-1);
      return a.speaking && !!h && h.text === a.lastLine && a.currentTime - h.startedAt < 1.5;
    })
    .toBe(true);
  const was = await audio(page);
  const last = was.lastLine;
  expect(last).not.toBeNull();
  await page.getByRole('button', { name: 'Replay the last line' }).click();
  // A record of that line that started after the click (by the audio clock; the history is a
  // ring of 40, so positions shift).
  const replayed = async () =>
    (await audio(page)).history.some((r) => r.text === last && r.startedAt >= was.currentTime);
  await expect
    .poll(replayed)
    .toBe(true)
    .catch(async (e: unknown) => {
      const now = await audio(page);
      console.log(
        JSON.stringify({
          last,
          at: was.currentTime,
          lastLine: now.lastLine,
          history: now.history.map((r) => [r.text.slice(0, 24), r.via, r.startedAt]),
        }),
      );
      throw e;
    });

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
