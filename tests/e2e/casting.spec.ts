// The voice-casting page (dev/casting.html) in a real browser, hermetic: the audition index and
// takes are served by route interception (test tones, never voices), so the result doesn't depend
// on what's in the local voice-auditions/ folder. Checks: identity cards, missing-asset
// indicators, measured waveforms, one take at a time, ratings → decisions → checks → export.

import { expect, test, type Page, type Route } from '@playwright/test';

/** A mono 16-bit WAV of a sine tone. */
function toneWav(freq: number, seconds: number, amp = 0.4, rate = 24000): Buffer {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(Math.round(amp * 32767 * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2);
  return b;
}

const take = (file: string, line: number, duration: number) => ({ file, line, duration });
const cand = (o: Record<string, unknown>) => ({
  note: '',
  configured: true,
  pipelineTestOnly: false,
  licence: null,
  source: null,
  takes: [],
  missingLines: [],
  needs: null,
  ...o,
});

/** Gaz: one candidate with nothing. Mei: one delivered candidate with both lines, one waiting for
 *  audio, and a macOS placeholder. */
const INDEX = {
  version: 1,
  generatedAt: '2026-10-14T00:00:00.000Z',
  lines: { gaz: ['G one', 'G two'], mei: ['M one', 'M two'] },
  candidates: [
    cand({
      character: 'gaz',
      slug: 'azure-en-AU-DuncanNeural',
      provider: 'azure',
      voice: 'en-AU-DuncanNeural',
      missingLines: [0, 1],
      status: 'missing',
      needs: 'Not rendered: Azure needs Edward to approve the spend.',
      identity: 'azure:en-AU-DuncanNeural',
    }),
    cand({
      character: 'mei',
      slug: 'files-mei-test',
      provider: 'files',
      voice: 'mei-test',
      configured: false,
      licence: 'TEST TONE',
      takes: [take('mei/files-mei-test/1.wav', 0, 1.2), take('mei/files-mei-test/2.wav', 1, 0.8)],
      status: 'ready',
      identity: 'performer:test',
    }),
    cand({
      character: 'mei',
      slug: 'files-mei-actor-a',
      provider: 'files',
      voice: 'mei-actor-a',
      missingLines: [0, 1],
      status: 'missing',
      needs: 'Awaiting recordings.',
      identity: 'files:mei-actor-a',
    }),
    cand({
      character: 'mei',
      slug: 'macos-Tingting',
      provider: 'macos',
      voice: 'Tingting',
      configured: false,
      pipelineTestOnly: true,
      takes: [take('mei/macos-Tingting/1.wav', 0, 1.0)],
      missingLines: [1],
      status: 'placeholder',
      identity: 'macos:Tingting',
    }),
  ],
};

interface CastingDebug {
  failed: string[];
  measured: Array<{ url: string; duration: number; lufs: number; clipped: number }>;
  issues: Array<{ level: string; character: string; message: string }>;
  decisions: {
    kind: string;
    reviewer: string;
    characters: Record<
      string,
      {
        status: string;
        chosen: string | null;
        candidates: Record<string, { ratings: Record<string, number> }>;
      }
    >;
  };
  player: { log: Array<{ url: string; endedAt: number | null; cut: boolean }>; maxAudible: number };
}
const debug = (page: Page): Promise<CastingDebug> =>
  page.evaluate(() => {
    const c = (window as unknown as { __casting: CastingDebug }).__casting;
    return JSON.parse(
      JSON.stringify({
        failed: c.failed,
        measured: c.measured,
        issues: c.issues,
        decisions: c.decisions,
        player: { log: c.player.log, maxAudible: c.player.maxAudible },
      }),
    ) as CastingDebug;
  });

async function serve(page: Page): Promise<string[]> {
  const saved: string[] = [];
  await page.route('**/__auditions/index.json', (r: Route) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(INDEX) }),
  );
  await page.route('**/__auditions/mei/**/*.wav', (r: Route) => {
    const f = r.request().url();
    const sec = f.includes('Tingting') ? 1.0 : f.endsWith('2.wav') ? 0.8 : 1.2;
    return r.fulfill({
      contentType: 'audio/wav',
      body: toneWav(f.endsWith('2.wav') ? 660 : 440, sec),
    });
  });
  await page.route('**/__dev/load/casting', (r: Route) =>
    r.fulfill({ contentType: 'application/json', body: '{"ok":true,"data":null}' }),
  );
  await page.route('**/__dev/save/casting', (r: Route) => {
    saved.push(r.request().postData() ?? '');
    return r.fulfill({
      contentType: 'application/json',
      body: '{"ok":true,"file":"voice-auditions/decisions.json"}',
    });
  });
  return saved;
}

const lastEnded = async (page: Page): Promise<number | null> =>
  (await debug(page)).player.log.at(-1)?.endedAt ?? null;

test('casting page: identity cards, missing assets, waveforms, one take at a time, decisions', async ({
  page,
}) => {
  const saved = await serve(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/dev/casting.html#gaz');

  // Seven identity cards; Gaz has no audio at all and says so.
  await expect(page.locator('.castcard')).toHaveCount(7);
  await expect(page.locator('[data-summary]')).toContainText('1 of 7');
  await expect(page.locator('[data-no-audio]')).toBeVisible();
  await expect(page.locator('.chead[data-status="missing"]')).toContainText('No audio yet');
  await expect(page.locator('.cell.missing')).toHaveCount(2);
  await expect(page.locator('.idcard')).toContainText('shares this voice with');

  // Mei: a candidate with takes, measured from the decoded audio.
  await page.locator('.castcard[data-who="mei"]').click();
  await expect.poll(async () => (await debug(page)).measured.length).toBe(3);
  const one = (await debug(page)).measured.find((x) => x.url.endsWith('files-mei-test/1.wav'));
  expect(one?.duration).toBeCloseTo(1.2, 2);
  // A 0.4-amplitude sine in one channel: about -11 LUFS, nothing clipped.
  expect(one?.lufs).toBeGreaterThan(-13);
  expect(one?.lufs).toBeLessThan(-9);
  expect(one?.clipped).toBe(0);
  await expect(page.locator('[data-stats]').first()).toContainText(' s ·');
  await expect(page.locator('.chead.placeholder')).toContainText('not a candidate');
  await expect(page.locator('.review.off')).toContainText("can't be cast");
  await expect(page.locator('.cell.missing')).toHaveCount(3);

  // Play line 1, then line 2 before it ends: the first is cut, never two at once.
  await page.getByRole('button', { name: /Play mei-test line 1/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Play mei-test line 2/ }).click();
  await expect.poll(() => lastEnded(page)).not.toBeNull();
  let p = (await debug(page)).player;
  expect(p.maxAudible).toBe(1);
  expect(p.log.map((l) => l.cut)).toEqual([true, false]);

  // Compare line 1 across candidates: the delivered take, then the placeholder, back to back.
  await page.locator('[data-compare="0"]').click();
  await expect.poll(async () => (await debug(page)).player.log.length).toBe(4);
  await expect.poll(() => lastEnded(page)).not.toBeNull();
  p = (await debug(page)).player;
  expect(p.log.slice(2).map((l) => l.url.split('/').slice(-2)[0])).toEqual([
    'files-mei-test',
    'macos-Tingting',
  ]);
  expect(p.log.slice(2).map((l) => l.cut)).toEqual([false, false]);
  expect(p.maxAudible).toBe(1);

  // Ratings and a decision; casting without a cleared licence is an error.
  const review = page.locator('[data-review="files-mei-test"]');
  await review.locator('input[data-k="naturalness"][value="4"]').check({ force: true });
  await review.locator('input[data-k="accent"][value="3"]').check({ force: true });
  await page.locator('[data-dstatus]').selectOption('cast');
  await page.locator('[data-chosen]').selectOption('files-mei-test');
  let d = await debug(page);
  expect(d.decisions.characters.mei?.candidates['files-mei-test']?.ratings).toEqual({
    naturalness: 4,
    accent: 3,
  });
  const meiErrors = (x: CastingDebug) =>
    x.issues.filter((i) => i.character === 'mei' && i.level === 'error').map((i) => i.message);
  expect(meiErrors(d)).toEqual(['Licence for mei-test is not cleared.']);
  await expect(page.locator('[data-issues]')).toContainText('1 error');
  await review.locator('[data-flag="licenceCleared"]').check();
  d = await debug(page);
  expect(meiErrors(d)).toEqual([]);
  // The placeholder isn't even offered as a choice.
  await expect(page.locator('[data-chosen] option[value="macos-Tingting"]')).toHaveCount(0);

  // Export downloads the decisions; Save posts them to the dev server.
  await page.locator('[data-reviewer]').fill('E2E reviewer');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON' }).click(),
  ]);
  const chunks: Buffer[] = [];
  for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8')) as CastingDebug['decisions'];
  expect(exported.kind).toBe('nwc-casting-decisions');
  expect(exported.reviewer).toBe('E2E reviewer');
  expect(exported.characters.mei?.status).toBe('cast');
  expect(exported.characters.mei?.chosen).toBe('files-mei-test');
  await page.getByRole('button', { name: 'Save to disk' }).click();
  await expect(page.locator('[data-toast]')).toContainText(
    'Saved to voice-auditions/decisions.json',
  );
  expect(JSON.parse(saved[0] ?? '{}')).toMatchObject({ kind: 'nwc-casting-decisions' });

  // Decisions survive a reload (localStorage).
  await page.reload();
  await page.locator('.castcard[data-who="mei"]').click();
  await expect(page.locator('[data-dstatus]')).toHaveValue('cast');
  expect((await debug(page)).failed).toEqual([]);
  expect(errors).toEqual([]);
});
