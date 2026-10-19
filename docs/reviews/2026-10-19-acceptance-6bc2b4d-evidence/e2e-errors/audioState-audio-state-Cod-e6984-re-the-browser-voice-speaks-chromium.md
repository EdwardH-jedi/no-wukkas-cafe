# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audioState.spec.ts >> audio state (Codex A1, A2, A3, A7) >> A2: a clip that fails while paused waits for resume before the browser voice speaks
- Location: tests/e2e/audioState.spec.ts:114:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic "Café counter, first-person view" [ref=e3]
  - generic:
    - generic:
      - generic:
        - generic:
          - generic: Day 2
          - generic: Morning rush
        - generic:
          - generic: Time
          - generic: 7:00
        - generic "Served · walk-outs":
          - generic: Served
          - generic: 0/6
          - generic: Walk-outs
          - generic: "0"
        - generic:
          - generic: Tips
          - generic: $0.00
        - button "Replay the last line" [ref=e4] [cursor=pointer]: ↻ Replay
        - button "Sound settings" [ref=e5] [cursor=pointer]: Sound
        - button "Pause" [ref=e7] [cursor=pointer]: ❚❚
      - generic:
        - generic "Order tickets"
        - generic:
          - generic: Take the order
          - generic: Listen to Dazza…
      - status:
        - generic: GAZOwner
      - generic [ref=e9]:
        - heading "Paused" [level=3] [ref=e10]
        - generic [ref=e11]:
          - button "Back to it" [ref=e12] [cursor=pointer]
          - button "Restart shift" [ref=e13] [cursor=pointer]
          - button "Title screen" [ref=e14] [cursor=pointer]
      - region "Register" [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Register
          - generic [ref=e18]: Dazza
          - generic [ref=e19]: listening…
        - generic [ref=e20]:
          - generic [ref=e21]: Drink
          - button "Flat white" [ref=e22] [cursor=pointer]
          - button "Long black" [ref=e23] [cursor=pointer]
        - generic [ref=e24]:
          - generic [ref=e25]: Milk
          - button "Full cream" [pressed] [ref=e26] [cursor=pointer]
          - button "Oat" [ref=e27] [cursor=pointer]
          - button "Soy" [ref=e28] [cursor=pointer]
          - button "Almond" [ref=e29] [cursor=pointer]
        - generic [ref=e30]:
          - generic [ref=e31]: Temp
          - button "Normal" [pressed] [ref=e32] [cursor=pointer]
          - button "Extra hot" [ref=e33] [cursor=pointer]
        - generic [ref=e34]:
          - generic [ref=e35]: Art
          - button "No heart" [pressed] [ref=e36] [cursor=pointer]
          - button "Heart" [ref=e37] [cursor=pointer]
        - generic [ref=e38]:
          - button "↻ Replay −1 s" [ref=e39] [cursor=pointer]
          - button "“Sorry, could you repeat that?” −6 s · 2 left" [ref=e40] [cursor=pointer]
        - generic [ref=e41]:
          - generic [ref=e42]: Ask
          - button "Drink?" [ref=e43] [cursor=pointer]
          - button "Milk?" [ref=e44] [cursor=pointer]
          - button "Hot?" [ref=e45] [cursor=pointer]
          - button "Heart?" [ref=e46] [cursor=pointer]
          - generic "Each question costs them 3 s of patience" [ref=e47]: −3 s each
        - button "Ring it up Enter" [disabled] [ref=e49] [cursor=pointer]
    - alert [ref=e50] [cursor=pointer]: Couldn't load a voice clip (no audio at assets/voice/gaz/60721c87.mp3). Using the browser voice for now.
```

# Test source

```ts
  39  | ) as { clips: Array<{ file: string; characterId: string }> };
  40  | 
  41  | const audio = (page: Page): Promise<AudioDebug> =>
  42  |   page.evaluate(() => (window as unknown as W).__trial.audio);
  43  | const rush = (page: Page): Promise<RushLite | null> =>
  44  |   page.evaluate(() => (window as unknown as W).__trial.rush);
  45  | const spoken = (page: Page): Promise<W['__spoken']> =>
  46  |   page.evaluate(() => (window as unknown as W).__spoken);
  47  | 
  48  | /** Record every browser-speech utterance (text + volume) without changing what happens. */
  49  | async function recordSpeech(page: Page): Promise<void> {
  50  |   await page.addInitScript(() => {
  51  |     const w = window as unknown as W;
  52  |     w.__spoken = [];
  53  |     const s = window.speechSynthesis;
  54  |     if (!s) return;
  55  |     const speak = s.speak.bind(s);
  56  |     s.speak = (u: SpeechSynthesisUtterance) => {
  57  |       if (u.text.trim()) w.__spoken.push({ text: u.text, volume: u.volume, at: performance.now() });
  58  |       speak(u);
  59  |     };
  60  |   });
  61  | }
  62  | 
  63  | async function needClips(page: Page): Promise<void> {
  64  |   const c = manifest.clips.find((x) => x.characterId === 'gaz')!;
  65  |   test.skip(
  66  |     !(await page.request.get(`/${c.file}`)).ok(),
  67  |     'voice clips not rendered (npm run voices)',
  68  |   );
  69  | }
  70  | 
  71  | async function toDazzaAtRegister(page: Page): Promise<void> {
  72  |   await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  73  |   for (let i = 0; i < 80; i++) {
  74  |     const r = await rush(page);
  75  |     if (
  76  |       r?.phase === 'service' &&
  77  |       r.customers.some((c) => c.id === 'dazza' && c.state === 'register')
  78  |     )
  79  |       return;
  80  |     if (r?.phase === 'intro') await page.mouse.click(640, 300);
  81  |     await page.waitForTimeout(250);
  82  |   }
  83  |   throw new Error('Dazza never reached the register');
  84  | }
  85  | 
  86  | test.describe('audio state (Codex A1, A2, A3, A7)', () => {
  87  |   test.setTimeout(150_000);
  88  | 
  89  |   test('A1: pausing, going to the title and starting again keeps the audio running', async ({
  90  |     page,
  91  |   }) => {
  92  |     await page.goto('/?seed=7&ibis=0');
  93  |     await needClips(page);
  94  |     await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  95  |     await expect.poll(async () => (await audio(page)).contextState).toBe('running');
  96  |     await page.keyboard.press('Escape');
  97  |     await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
  98  |     await page.getByRole('button', { name: 'Title screen' }).click();
  99  |     await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
  100 |     await expect.poll(async () => (await audio(page)).contextState).toBe('running');
  101 |     await expect
  102 |       .poll(
  103 |         async () =>
  104 |           (await audio(page)).history.find(
  105 |             (h) => h.speaker === 'gaz' && h.endedAt !== null && h.maxRms > 0.02,
  106 |           ) ?? null,
  107 |         {
  108 |           timeout: 20_000,
  109 |         },
  110 |       )
  111 |       .not.toBeNull();
  112 |   });
  113 | 
  114 |   test('A2: a clip that fails while paused waits for resume before the browser voice speaks', async ({
  115 |     page,
  116 |   }) => {
  117 |     await recordSpeech(page);
  118 |     // Dazza's clips fail, slowly (so the failure lands while the game is paused).
  119 |     await page.route('**/assets/voice/dazza/**', async (r) => {
  120 |       await new Promise((ok) => setTimeout(ok, 1500));
  121 |       await r.fulfill({ status: 404, body: 'missing' });
  122 |     });
  123 |     await page.goto('/?seed=7&ibis=0');
  124 |     await needClips(page);
  125 |     await toDazzaAtRegister(page);
  126 |     await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  127 |     // Pause once his line has been asked for (its clip is now in flight for 1.5 s).
  128 |     await expect
  129 |       .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.state)
  130 |       .toBe('ordering');
  131 |     await page.keyboard.press('Escape');
  132 |     await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
  133 |     // The failure arrives while paused: recorded as a fallback, but not spoken.
  134 |     await expect
  135 |       .poll(async () => (await audio(page)).history.at(-1)?.via, { timeout: 10_000 })
  136 |       .toBe('tts');
  137 |     const dazzaText = (await audio(page)).history.at(-1)!.text;
  138 |     await page.waitForTimeout(800);
> 139 |     expect((await spoken(page)).some((s) => s.text.includes(dazzaText.slice(0, 12)))).toBe(false);
      |                                                                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  140 |     // Resume: now it speaks.
  141 |     await page.keyboard.press('Escape');
  142 |     await expect
  143 |       .poll(async () => (await spoken(page)).some((s) => s.text.includes(dazzaText.slice(0, 12))))
  144 |       .toBe(true);
  145 |   });
  146 | 
  147 |   test('A3: a slow order clip holds the register until the order has been heard', async ({
  148 |     page,
  149 |   }) => {
  150 |     // Day 2 prefetches every clip at the start; make that prefetch miss (so nothing is cached)
  151 |     // and the request made when he speaks slow.
  152 |     let slow = false;
  153 |     await page.route('**/assets/voice/dazza/**', async (r) => {
  154 |       if (!slow) return r.fulfill({ status: 503, body: 'not yet' });
  155 |       await new Promise((ok) => setTimeout(ok, 3000));
  156 |       await r.continue();
  157 |     });
  158 |     await page.goto('/?seed=7&ibis=0');
  159 |     await needClips(page);
  160 |     await toDazzaAtRegister(page);
  161 |     slow = true;
  162 |     await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  163 |     // The order line is a ~3 s clip. Without the hold, the register opens ~3.4 s after Take
  164 |     // order, while the late clip (arriving at ~3 s) is still playing; with it, the line's clock
  165 |     // only starts once the clip does.
  166 |     await page.waitForTimeout(4500);
  167 |     let r = await rush(page);
  168 |     expect(r!.customers.find((c) => c.id === 'dazza')!.state).toBe('ordering');
  169 |     await expect
  170 |       .poll(
  171 |         async () =>
  172 |           (await audio(page)).history.find((h) => h.speaker === 'dazza' && h.via === 'clip')
  173 |             ?.endedAt ?? null,
  174 |         {
  175 |           timeout: 15_000,
  176 |         },
  177 |       )
  178 |       .not.toBeNull();
  179 |     const order = (await audio(page)).history.find(
  180 |       (h) => h.speaker === 'dazza' && h.via === 'clip',
  181 |     )!;
  182 |     expect(order.interrupted).toBe(false);
  183 |     expect(order.endedAt! - order.startedAt).toBeGreaterThan(order.bufferDuration - 0.1);
  184 |     await expect
  185 |       .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.state)
  186 |       .toBe('deciding');
  187 |     r = await rush(page);
  188 |     expect(r!.customers.find((c) => c.id === 'dazza')!.state).toBe('deciding');
  189 |   });
  190 | 
  191 |   test('A7: the browser-voice fallback uses the Voices volume', async ({ page }) => {
  192 |     await recordSpeech(page);
  193 |     await page.route('**/assets/voice/dazza/**', (r) =>
  194 |       r.fulfill({ status: 404, body: 'missing' }),
  195 |     );
  196 |     await page.goto('/?seed=7&ibis=0');
  197 |     await needClips(page);
  198 |     await toDazzaAtRegister(page);
  199 |     await page.getByRole('button', { name: 'Sound settings' }).click();
  200 |     await page.getByLabel('Voices volume').fill('40');
  201 |     await page.getByRole('button', { name: 'Done' }).click();
  202 |     await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  203 |     await expect
  204 |       .poll(async () => (await spoken(page)).length, { timeout: 10_000 })
  205 |       .toBeGreaterThan(0);
  206 |     const s = (await spoken(page)).at(-1)!;
  207 |     expect(s.volume).toBeCloseTo(0.4, 5);
  208 |   });
  209 | });
  210 | 
```