// A generated order on a week shift is heard as its segment clips, back to back, as one line.
// Needs the placeholder segment clips (`npm run voices -- --segments`); skips cleanly without them.

import { expect, test, type Page } from '@playwright/test';

interface PlayRecord {
  speaker: string;
  text: string;
  via: 'clip' | 'tts';
  endedAt: number | null;
  interrupted: boolean;
  segments?: number;
}
interface Lite {
  phase: string;
  customers: Array<{ id: string; state: string; segments: number }>;
}
type W = { __trial: { audio: { status: string; history: PlayRecord[] }; rush: Lite | null } };

const rush = (page: Page): Promise<Lite | null> =>
  page.evaluate(() => (window as unknown as W).__trial.rush);
const history = (page: Page): Promise<PlayRecord[]> =>
  page.evaluate(() => (window as unknown as W).__trial.audio.history);

async function needSegments(page: Page): Promise<void> {
  const res = await page.request.get('/assets/voice/segments/dazza/dazza.greet.1.mp3');
  const audio = res.ok() && (res.headers()['content-type'] ?? '').startsWith('audio/');
  test.skip(!audio, 'segment clips not rendered (npm run voices -- --segments)');
}

/** Start Monday and wait for the first customer at the register. */
async function firstAtRegister(page: Page): Promise<Lite['customers'][number]> {
  await page.getByRole('button', { name: 'The week: shifts' }).click();
  await page.locator('.shift-select button[data-shift="0"]').click();
  for (let i = 0; i < 120; i++) {
    const r = await rush(page);
    const c = r?.phase === 'service' ? r.customers.find((x) => x.state === 'register') : null;
    if (c) return c;
    if (r?.phase === 'intro') await page.mouse.click(640, 300);
    await page.waitForTimeout(250);
  }
  throw new Error('nobody reached the register');
}

test('a generated order plays two or more segment clips as one line', async ({ page }) => {
  test.setTimeout(240_000);
  let found: Lite['customers'][number] | null = null;
  for (const seed of [7, 1, 2, 3, 4, 5, 6, 8]) {
    await page.goto(`/?seed=${seed}&ibis=0`);
    await needSegments(page);
    const c = await firstAtRegister(page);
    if (c.segments >= 2) {
      found = c;
      break;
    }
  }
  expect(found, 'no seed put a generated order at the register first').not.toBeNull();
  const who = found!.id;
  await page.getByRole('button', { name: /^Take .*'s order/ }).click();
  await expect
    .poll(
      async () =>
        (await history(page)).find((h) => h.speaker === who && (h.segments ?? 0) > 0)?.endedAt ??
        null,
      { timeout: 30_000 },
    )
    .not.toBeNull();
  const line = (await history(page)).find((h) => h.speaker === who && (h.segments ?? 0) > 0)!;
  expect(line.via).toBe('clip');
  expect(line.segments).toBe(found!.segments);
  expect(line.segments).toBeGreaterThanOrEqual(2);
  expect(line.interrupted).toBe(false);
  // One line, one record: the order wasn't also spoken by the browser voice.
  expect((await history(page)).filter((h) => h.text === line.text && h.via === 'tts')).toHaveLength(
    0,
  );
});
