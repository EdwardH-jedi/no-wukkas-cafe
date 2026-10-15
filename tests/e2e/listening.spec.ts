// The café sound lab (dev/listening.html) in a real browser, on the game's own audio engine:
// moods switch, the buses are separate, the music ducks under real dialogue (deeper under orders),
// one line plays at a time, pausing freezes the music, notes save. And a regression test on the
// music itself, rendered offline: no clipping (alone or in the worst-case mix), no DC offset,
// moods within 3 LU, orders well above the ducked music. Headless Chromium is muted at the device:
// this checks signal and levels, not how it sounds. Dialogue uses the local placeholder clips
// (`npm run voices`), like the other audio specs.

import { expect, test, type Page } from '@playwright/test';

interface Report {
  lufs: number;
  truePeakDb: number;
  peakDb: number;
  dc: number;
  clipped: number;
}
interface Measurement {
  measures: Array<{ mood: string; music: Report; worst: Report | null }>;
  speechLufs: number | null;
  findings: Array<{ level: string; message: string }>;
}
interface LabDebug {
  ctx: string;
  mood: string | null;
  scheduled: number;
  duck: number;
  speaking: boolean;
  volumes: Record<string, number>;
  voices: { maxAudible: number };
  history: Array<{ speaker: string; via: string; endedAt: number | null; interrupted: boolean }>;
}
type Lab = {
  __listen: {
    audio: {
      context: AudioContext | null;
      musicDuck: number;
      speaking: boolean;
      volume(b: string): number;
      voices: { maxAudible: number };
      history: LabDebug['history'];
    };
    music: { mood: string | null; scheduled: number };
    measure(): Promise<Measurement>;
  };
};

const lab = (page: Page): Promise<LabDebug> =>
  page.evaluate(() => {
    const l = (window as unknown as Lab).__listen;
    return {
      ctx: l.audio.context?.state ?? 'none',
      mood: l.music.mood,
      scheduled: l.music.scheduled,
      duck: l.audio.musicDuck,
      speaking: l.audio.speaking,
      volumes: Object.fromEntries(
        ['voice', 'music', 'ambience', 'sfx'].map((b) => [b, l.audio.volume(b)]),
      ),
      voices: { ...l.audio.voices },
      history: l.audio.history.map((h) => ({ ...h })),
    };
  });

/** Lowest music duck seen while `speaker`'s line plays; then wait for the music to come back. */
async function duckUnder(page: Page, speaker: string): Promise<number> {
  await expect
    .poll(async () => (await lab(page)).history.at(-1)?.speaker, { timeout: 15_000 })
    .toBe(speaker);
  let low = 1;
  for (let i = 0; i < 80; i++) {
    const a = await lab(page);
    const last = a.history.at(-1);
    if (last?.endedAt !== null) break;
    low = Math.min(low, a.duck);
    await page.waitForTimeout(100);
  }
  await expect
    .poll(async () => {
      const a = await lab(page);
      return !a.speaking && a.duck > 0.9;
    })
    .toBe(true);
  return low;
}

test('sound lab: moods, separate buses, ducking under real dialogue, one voice, pause, notes', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const saved: string[] = [];
  await page.route('**/__dev/save/listening', (r) => {
    saved.push(r.request().postData() ?? '');
    return r.fulfill({
      contentType: 'application/json',
      body: '{"ok":true,"file":"reports/listening-notes.json"}',
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/listening.html');

  await page.getByRole('button', { name: '▶ Start sound' }).click();
  await expect.poll(async () => (await lab(page)).ctx).toBe('running');
  await expect.poll(async () => (await lab(page)).mood).toBe('opening');
  await expect.poll(async () => (await lab(page)).scheduled).toBeGreaterThan(20);

  // Switch tracks.
  await page.getByRole('button', { name: /^Rush/ }).click();
  await expect.poll(async () => (await lab(page)).mood).toBe('rush');
  await expect(page.getByRole('button', { name: /^Rush/ })).toHaveAttribute('aria-pressed', 'true');

  // Separate bus volumes.
  await page.getByLabel('Music volume').fill('80');
  await page.getByLabel('Café ambience volume').fill('20');
  let a = await lab(page);
  expect(a.volumes).toEqual({ voice: 1, music: 0.8, ambience: 0.2, sfx: 0.8 });

  // The music ducks deep under an order, less under chat, and comes back.
  await page.getByRole('button', { name: "Dazza's order" }).click();
  const underOrder = await duckUnder(page, 'dazza');
  await page.getByRole('button', { name: 'Gaz chatting' }).click();
  const underChat = await duckUnder(page, 'gaz');
  console.log(`duck under an order ${underOrder.toFixed(2)}, under chat ${underChat.toFixed(2)}`);
  expect(underOrder).toBeLessThan(0.35);
  expect(underChat).toBeGreaterThan(0.45);
  expect(underChat).toBeLessThan(0.65);
  a = await lab(page);
  expect(a.history.filter((h) => h.via === 'clip').length).toBeGreaterThanOrEqual(2);

  // Three lines fired quickly: each cuts the one before, never two audible at once.
  await page.getByRole('button', { name: '3 lines, fast' }).click();
  await expect
    .poll(async () => (await lab(page)).history.at(-1)?.speaker, { timeout: 15_000 })
    .toBe('priya');
  await expect
    .poll(async () => (await lab(page)).history.at(-1)?.endedAt ?? null, { timeout: 20_000 })
    .not.toBeNull();
  a = await lab(page);
  expect(a.voices.maxAudible).toBe(1);
  expect(a.history.slice(2, -1).some((h) => h.interrupted)).toBe(true);
  expect(a.history.at(-1)?.interrupted).toBe(false);

  // Pause freezes the audio clock and the music; resume carries on.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await lab(page)).ctx).toBe('suspended');
  const frozen = (await lab(page)).scheduled;
  await page.waitForTimeout(1500);
  expect((await lab(page)).scheduled).toBe(frozen);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(async () => (await lab(page)).ctx).toBe('running');
  await expect.poll(async () => (await lab(page)).scheduled).toBeGreaterThan(frozen);

  // Ratings and notes save with the current mix; the game's own settings are untouched.
  await page.getByLabel('Reviewer').fill('E2E');
  await page
    .locator('[data-notes-mood="rush"] input[data-k="fit"][value="4"]')
    .check({ force: true });
  await page.getByLabel('Notes on Rush').fill('surf lead sits nicely');
  await page.getByRole('button', { name: 'Save to disk' }).click();
  await expect(page.locator('[data-toast]')).toContainText('reports/listening-notes.json');
  const notes = JSON.parse(saved[0] ?? '{}') as {
    kind: string;
    reviewer: string;
    moods: Record<string, { ratings: Record<string, number>; notes: string }>;
    mix: Record<string, number>;
  };
  expect(notes.kind).toBe('nwc-listening-notes');
  expect(notes.reviewer).toBe('E2E');
  expect(notes.moods.rush).toEqual({ ratings: { fit: 4 }, notes: 'surf lead sits nicely' });
  expect(notes.mix.music).toBe(0.8);
  expect(await page.evaluate(() => localStorage.getItem('nwc.audio.v1'))).toBeNull();
  expect(errors).toEqual([]);
});

test('the three moods: no clipping, no DC offset, even loudness, orders above the music', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/dev/listening.html');
  const r = await page.evaluate(() => (window as unknown as Lab).__listen.measure());
  for (const m of r.measures)
    console.log(
      `${m.mood}: ${m.music.lufs.toFixed(1)} LUFS, ${m.music.truePeakDb.toFixed(1)} dBTP, DC ${m.music.dc.toFixed(5)}; worst case ${m.worst?.truePeakDb.toFixed(1)} dBTP, ${m.worst?.clipped} clipped`,
    );
  expect(r.measures.map((m) => m.mood)).toEqual(['opening', 'rush', 'afternoon']);
  for (const m of r.measures) {
    expect(m.music.clipped, `${m.mood} clips alone`).toBe(0);
    expect(m.music.truePeakDb, `${m.mood} true peak`).toBeLessThan(0);
    expect(m.worst?.clipped, `${m.mood} clips in the worst-case mix`).toBe(0);
    // Regression: the FM keys put a 0 Hz sideband into every chord (DC up to 0.0047).
    expect(Math.abs(m.music.dc), `${m.mood} DC offset`).toBeLessThan(0.0005);
  }
  const lufs = r.measures.map((m) => m.music.lufs);
  expect(Math.max(...lufs) - Math.min(...lufs)).toBeLessThan(3);
  expect(r.findings.filter((f) => f.level === 'defect')).toEqual([]);
  if (r.speechLufs !== null)
    for (const f of r.findings.filter((x) => /Orders sit/.test(x.message)))
      expect(f.level, f.message).toBe('info');
});
