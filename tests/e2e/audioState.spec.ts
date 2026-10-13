// Browser regression tests for the Codex audit's audio-state findings (voices on, Chromium):
//   A1  pause → title → new game: audio must play again
//   A2  a clip that fails while paused must not start the browser voice until resume
//   A3  a slow clip holds the order: the register doesn't open before the order is heard
//   A7  the browser-voice fallback follows the Voices volume
// Device output is muted in headless Chromium (--mute-audio): these check the audio graph and the
// speech calls, not what a person hears.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface PlayRecord {
  speaker: string;
  text: string;
  via: 'clip' | 'tts';
  bufferDuration: number;
  startedAt: number;
  endedAt: number | null;
  maxRms: number;
  interrupted: boolean;
}
interface AudioDebug {
  status: string;
  contextState: string;
  history: PlayRecord[];
}
interface RushLite {
  phase: string;
  paused: boolean;
  customers: Array<{ id: string; state: string }>;
}
type W = {
  __trial: { audio: AudioDebug; rush: RushLite | null; state: { phase: string; paused: boolean } };
  __spoken: Array<{ text: string; volume: number; at: number }>;
};

const manifest = JSON.parse(
  readFileSync(new URL('../../src/data/voice/manifest.json', import.meta.url), 'utf8'),
) as { clips: Array<{ file: string; characterId: string }> };

const audio = (page: Page): Promise<AudioDebug> =>
  page.evaluate(() => (window as unknown as W).__trial.audio);
const rush = (page: Page): Promise<RushLite | null> =>
  page.evaluate(() => (window as unknown as W).__trial.rush);
const spoken = (page: Page): Promise<W['__spoken']> =>
  page.evaluate(() => (window as unknown as W).__spoken);

/** Record every browser-speech utterance (text + volume) without changing what happens. */
async function recordSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__spoken = [];
    const s = window.speechSynthesis;
    if (!s) return;
    const speak = s.speak.bind(s);
    s.speak = (u: SpeechSynthesisUtterance) => {
      if (u.text.trim()) w.__spoken.push({ text: u.text, volume: u.volume, at: performance.now() });
      speak(u);
    };
  });
}

async function needClips(page: Page): Promise<void> {
  const c = manifest.clips.find((x) => x.characterId === 'gaz')!;
  test.skip(
    !(await page.request.get(`/${c.file}`)).ok(),
    'voice clips not rendered (npm run voices)',
  );
}

async function toDazzaAtRegister(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  for (let i = 0; i < 80; i++) {
    const r = await rush(page);
    if (
      r?.phase === 'service' &&
      r.customers.some((c) => c.id === 'dazza' && c.state === 'register')
    )
      return;
    if (r?.phase === 'intro') await page.mouse.click(640, 300);
    await page.waitForTimeout(250);
  }
  throw new Error('Dazza never reached the register');
}

test.describe('audio state (Codex A1, A2, A3, A7)', () => {
  test.setTimeout(150_000);

  test('A1: pausing, going to the title and starting again keeps the audio running', async ({
    page,
  }) => {
    await page.goto('/?seed=7&ibis=0');
    await needClips(page);
    await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
    await expect.poll(async () => (await audio(page)).contextState).toBe('running');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
    await page.getByRole('button', { name: 'Title screen' }).click();
    await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
    await expect.poll(async () => (await audio(page)).contextState).toBe('running');
    await expect
      .poll(
        async () =>
          (await audio(page)).history.find(
            (h) => h.speaker === 'gaz' && h.endedAt !== null && h.maxRms > 0.02,
          ) ?? null,
        {
          timeout: 20_000,
        },
      )
      .not.toBeNull();
  });

  test('A2: a clip that fails while paused waits for resume before the browser voice speaks', async ({
    page,
  }) => {
    await recordSpeech(page);
    // Dazza's clips fail, slowly (so the failure lands while the game is paused).
    await page.route('**/assets/voice/dazza/**', async (r) => {
      await new Promise((ok) => setTimeout(ok, 1500));
      await r.fulfill({ status: 404, body: 'missing' });
    });
    await page.goto('/?seed=7&ibis=0');
    await needClips(page);
    await toDazzaAtRegister(page);
    await page.getByRole('button', { name: /Take Dazza's order/ }).click();
    // Pause once his line has been asked for (its clip is now in flight for 1.5 s).
    await expect
      .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.state)
      .toBe('ordering');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
    // The failure arrives while paused: recorded as a fallback, but not spoken.
    await expect
      .poll(async () => (await audio(page)).history.at(-1)?.via, { timeout: 10_000 })
      .toBe('tts');
    const dazzaText = (await audio(page)).history.at(-1)!.text;
    await page.waitForTimeout(800);
    expect((await spoken(page)).some((s) => s.text.includes(dazzaText.slice(0, 12)))).toBe(false);
    // Resume: now it speaks.
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await spoken(page)).some((s) => s.text.includes(dazzaText.slice(0, 12))))
      .toBe(true);
  });

  test('A3: a slow order clip holds the register until the order has been heard', async ({
    page,
  }) => {
    // Day 2 prefetches every clip at the start; make that prefetch miss (so nothing is cached)
    // and the request made when he speaks slow.
    let slow = false;
    await page.route('**/assets/voice/dazza/**', async (r) => {
      if (!slow) return r.fulfill({ status: 503, body: 'not yet' });
      await new Promise((ok) => setTimeout(ok, 3000));
      await r.continue();
    });
    await page.goto('/?seed=7&ibis=0');
    await needClips(page);
    await toDazzaAtRegister(page);
    slow = true;
    await page.getByRole('button', { name: /Take Dazza's order/ }).click();
    // The order line is a ~3 s clip. Without the hold, the register opens ~3.4 s after Take
    // order, while the late clip (arriving at ~3 s) is still playing; with it, the line's clock
    // only starts once the clip does.
    await page.waitForTimeout(4500);
    let r = await rush(page);
    expect(r!.customers.find((c) => c.id === 'dazza')!.state).toBe('ordering');
    await expect
      .poll(
        async () =>
          (await audio(page)).history.find((h) => h.speaker === 'dazza' && h.via === 'clip')
            ?.endedAt ?? null,
        {
          timeout: 15_000,
        },
      )
      .not.toBeNull();
    const order = (await audio(page)).history.find(
      (h) => h.speaker === 'dazza' && h.via === 'clip',
    )!;
    expect(order.interrupted).toBe(false);
    expect(order.endedAt! - order.startedAt).toBeGreaterThan(order.bufferDuration - 0.1);
    await expect
      .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.state)
      .toBe('deciding');
    r = await rush(page);
    expect(r!.customers.find((c) => c.id === 'dazza')!.state).toBe('deciding');
  });

  test('A7: the browser-voice fallback uses the Voices volume', async ({ page }) => {
    await recordSpeech(page);
    await page.route('**/assets/voice/dazza/**', (r) =>
      r.fulfill({ status: 404, body: 'missing' }),
    );
    await page.goto('/?seed=7&ibis=0');
    await needClips(page);
    await toDazzaAtRegister(page);
    await page.getByRole('button', { name: 'Sound settings' }).click();
    await page.getByLabel('Voices volume').fill('40');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: /Take Dazza's order/ }).click();
    await expect
      .poll(async () => (await spoken(page)).length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const s = (await spoken(page)).at(-1)!;
    expect(s.volume).toBeCloseTo(0.4, 5);
  });
});
