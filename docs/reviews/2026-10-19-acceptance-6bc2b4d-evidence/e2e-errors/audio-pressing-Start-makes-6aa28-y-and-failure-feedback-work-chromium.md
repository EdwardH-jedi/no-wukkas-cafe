# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audio.spec.ts >> pressing Start makes Gaz audibly speak; pause, replay and failure feedback work
- Location: tests/e2e/audio.spec.ts:38:1

# Error details

```
Error: expect(received).not.toBeNull()

Received: null

Call Log:
- Timeout 20000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic "Café counter, first-person view" [ref=e3]
  - generic:
    - generic:
      - generic:
        - generic:
          - generic: Trial
          - generic:
            - generic: 1 Shot
            - generic: 2 Milk
            - generic: 3 Heart
        - generic: Goes
        - generic:
          - generic: Best
          - generic: –
        - button "Replay the last line" [ref=e4] [cursor=pointer]: ↻ Replay
        - button "Sound settings" [ref=e5] [cursor=pointer]: Sound
        - button "Pause" [ref=e7] [cursor=pointer]: ❚❚
      - generic:
        - generic: Grind
        - generic: Hold the mouse button (or Space) to grind into the basket.
      - generic:
        - generic:
          - generic:
            - generic: Dose
            - generic: 18–20 g
          - generic: 0.0g
      - button "Tamp & lock in" [disabled] [ref=e8] [cursor=pointer]
      - status [ref=e9] [cursor=pointer]:
        - generic [ref=e10]: GAZOwner
        - generic [ref=e11]: Grinder first. Hold it down. Eighteen to twenty grams. Not a bucket.
    - alert [ref=e12] [cursor=pointer]: Couldn't load a voice clip (no audio at assets/voice/gaz/e42b3ef7.mp3). Using the browser voice for now.
```

# Test source

```ts
  1   | // The owner must actually speak when the player presses Start. Checks real Web Audio playback in
  2   | // Chromium (not just that play() didn't throw): the clip is fetched and decoded to the manifest
  3   | // length, the context runs, playback progresses to `onended`, and the voice bus carries signal.
  4   | // Also: pause freezes the voice, Replay says the line again, and a broken clip is reported.
  5   | 
  6   | import { readFileSync } from 'node:fs';
  7   | import { expect, test, type Page } from '@playwright/test';
  8   | 
  9   | interface PlayRecord {
  10  |   id: string;
  11  |   text: string;
  12  |   via: 'clip' | 'tts';
  13  |   file: string;
  14  |   manifestDuration: number;
  15  |   bufferDuration: number;
  16  |   startedAt: number;
  17  |   endedAt: number | null;
  18  |   maxRms: number;
  19  |   error: string | null;
  20  | }
  21  | interface AudioDebug {
  22  |   status: string;
  23  |   message: string;
  24  |   contextState: string;
  25  |   currentTime: number;
  26  |   history: PlayRecord[];
  27  |   lastLine: string | null;
  28  |   speaking: boolean;
  29  | }
  30  | 
  31  | const manifest = JSON.parse(
  32  |   readFileSync(new URL('../../src/data/voice/manifest.json', import.meta.url), 'utf8'),
  33  | ) as { clips: Array<{ file: string }> };
  34  | 
  35  | const audio = (page: Page): Promise<AudioDebug> =>
  36  |   page.evaluate(() => (window as unknown as { __trial: { audio: AudioDebug } }).__trial.audio);
  37  | 
  38  | test('pressing Start makes Gaz audibly speak; pause, replay and failure feedback work', async ({
  39  |   page,
  40  | }) => {
  41  |   const first = manifest.clips[0];
  42  |   test.skip(!first, 'no voice manifest');
  43  |   const probe = await page.request.get(`/${first!.file}`);
  44  |   test.skip(!probe.ok(), 'voice clips not rendered on this machine (run `npm run voices`)');
  45  | 
  46  |   await page.goto('/?seed=7&ibis=0');
  47  |   await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
  48  | 
  49  |   // First line plays to the end.
  50  |   await expect
  51  |     .poll(async () => (await audio(page)).history.find((h) => h.endedAt !== null) ?? null, {
  52  |       timeout: 20_000,
  53  |     })
> 54  |     .not.toBeNull();
      |          ^ Error: expect(received).not.toBeNull()
  55  |   const a = await audio(page);
  56  |   expect(a.contextState).toBe('running');
  57  |   expect(a.status).toBe('ok');
  58  |   const h = a.history[0]!;
  59  |   expect(h.via).toBe('clip');
  60  |   expect(h.error).toBeNull();
  61  |   expect(Math.abs(h.bufferDuration - h.manifestDuration)).toBeLessThan(0.05);
  62  |   expect(h.endedAt! - h.startedAt).toBeGreaterThan(h.bufferDuration - 0.1);
  63  |   expect(h.maxRms).toBeGreaterThan(0.02);
  64  |   console.log(
  65  |     `first line: "${h.text}" decoded ${h.bufferDuration.toFixed(3)} s (manifest ${h.manifestDuration}), ` +
  66  |       `played ${(h.endedAt! - h.startedAt).toFixed(3)} s, peak RMS ${h.maxRms.toFixed(3)}`,
  67  |   );
  68  | 
  69  |   // Pause freezes the audio clock; resume continues.
  70  |   await page.keyboard.press('Escape');
  71  |   await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
  72  |   const t0 = (await audio(page)).currentTime;
  73  |   await page.waitForTimeout(600);
  74  |   expect((await audio(page)).currentTime).toBe(t0);
  75  |   await page.keyboard.press('Escape');
  76  |   await expect.poll(async () => (await audio(page)).contextState).toBe('running');
  77  | 
  78  |   // Replay says the last line again. Gaz's next greeting can start right after the click, so look
  79  |   // for the replay among the new records rather than at the very last one (that raced: 2 in 5
  80  |   // failed on 8333240, before overnight run #3), and take the line Replay repeats from the manager
  81  |   // (a line asked for but still loading isn't in the history yet).
  82  |   // Click while a line plays that started under a second and a half ago: Gaz's next line is
  83  |   // seconds away, so the line Replay repeats can't change between this read and the click (it
  84  |   // did when the click fell between two lines).
  85  |   await expect
  86  |     .poll(async () => {
  87  |       const a = await audio(page);
  88  |       const h = a.history.at(-1);
  89  |       return a.speaking && !!h && h.text === a.lastLine && a.currentTime - h.startedAt < 1.5;
  90  |     })
  91  |     .toBe(true);
  92  |   const was = await audio(page);
  93  |   const last = was.lastLine;
  94  |   expect(last).not.toBeNull();
  95  |   await page.getByRole('button', { name: 'Replay the last line' }).click();
  96  |   // A record of that line that started after the click (by the audio clock; the history is a
  97  |   // ring of 40, so positions shift).
  98  |   const replayed = async () =>
  99  |     (await audio(page)).history.some((r) => r.text === last && r.startedAt >= was.currentTime);
  100 |   await expect
  101 |     .poll(replayed)
  102 |     .toBe(true)
  103 |     .catch(async (e: unknown) => {
  104 |       const now = await audio(page);
  105 |       console.log(
  106 |         JSON.stringify({
  107 |           last,
  108 |           at: was.currentTime,
  109 |           lastLine: now.lastLine,
  110 |           history: now.history.map((r) => [r.text.slice(0, 24), r.via, r.startedAt]),
  111 |         }),
  112 |       );
  113 |       throw e;
  114 |     });
  115 | 
  116 |   // Sound panel: voice volume slider is live.
  117 |   await page.getByRole('button', { name: 'Sound settings' }).click();
  118 |   await expect(page.getByRole('dialog', { name: 'Sound settings' })).toBeVisible();
  119 |   await page.getByLabel('Voices volume').fill('40');
  120 |   await expect(page.locator('[data-out="voice"]')).toHaveText('40%');
  121 |   await page.getByRole('button', { name: 'Done' }).click();
  122 | });
  123 | 
  124 | test('a voice clip that fails to load is reported, not silent', async ({ page }) => {
  125 |   await page.route('**/assets/voice/**', (r) => r.fulfill({ status: 404, body: 'missing' }));
  126 |   await page.goto('/?seed=7&ibis=0');
  127 |   await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
  128 |   await expect.poll(async () => (await audio(page)).status, { timeout: 10_000 }).not.toBe('locked');
  129 |   await expect.poll(async () => (await audio(page)).status).toMatch(/fallback|error/);
  130 |   await expect(page.locator('#audioToast')).toBeVisible();
  131 |   await expect(page.locator('#audioToast')).toContainText("Couldn't load a voice clip");
  132 |   const a = await audio(page);
  133 |   expect(a.history[0]!.via).toBe('tts');
  134 | });
  135 | 
```