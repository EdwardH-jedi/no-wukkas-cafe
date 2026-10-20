# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audioSmoke.spec.ts >> voice on >> a customer order is voiced; the order moves on when the audio ends; replay, interruption, pause
- Location: tests/e2e/audioSmoke.spec.ts:154:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "clip"
Received: "tts"
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
          - generic: 7:01
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
          - generic: Ring up what Dazza said. Didn't catch it? Replay (R), ask them to repeat, or ask about one thing.
      - status:
        - generic: DAZZATradie · regular
        - generic: 🔊 Listen…
      - region "Register" [ref=e8]:
        - generic [ref=e9]:
          - generic [ref=e10]: Register
          - generic [ref=e11]: Dazza
          - generic [ref=e12]: what did they order?
        - generic [ref=e13]:
          - generic [ref=e14]: Drink
          - button "Flat white" [ref=e15] [cursor=pointer]
          - button "Long black" [ref=e16] [cursor=pointer]
        - generic [ref=e17]:
          - generic [ref=e18]: Milk
          - button "Full cream" [pressed] [ref=e19] [cursor=pointer]
          - button "Oat" [ref=e20] [cursor=pointer]
          - button "Soy" [ref=e21] [cursor=pointer]
          - button "Almond" [ref=e22] [cursor=pointer]
        - generic [ref=e23]:
          - generic [ref=e24]: Temp
          - button "Normal" [pressed] [ref=e25] [cursor=pointer]
          - button "Extra hot" [ref=e26] [cursor=pointer]
        - generic [ref=e27]:
          - generic [ref=e28]: Art
          - button "No heart" [pressed] [ref=e29] [cursor=pointer]
          - button "Heart" [ref=e30] [cursor=pointer]
        - generic [ref=e31]:
          - button "↻ Replay −1 s" [ref=e32] [cursor=pointer]
          - button "“Sorry, could you repeat that?” −6 s · 2 left" [ref=e33] [cursor=pointer]
        - generic [ref=e34]:
          - generic [ref=e35]: Ask
          - button "Drink?" [ref=e36] [cursor=pointer]
          - button "Milk?" [ref=e37] [cursor=pointer]
          - button "Hot?" [ref=e38] [cursor=pointer]
          - button "Heart?" [ref=e39] [cursor=pointer]
          - generic "Each question costs them 3 s of patience" [ref=e40]: −3 s each
        - button "Ring it up Enter" [disabled] [ref=e42] [cursor=pointer]
    - alert: Couldn't load a voice clip (no audio at assets/voice/dazza/6ba230f2.mp3). Using the browser voice for now.
```

# Test source

```ts
  64  |   page.evaluate(async (dur) => {
  65  |     const out: Tick[] = [];
  66  |     const t0 = performance.now();
  67  |     await new Promise<void>((done) => {
  68  |       const f = (): void => {
  69  |         out.push({ ...(window as unknown as W).__trial.audioTick, now: performance.now() });
  70  |         if (performance.now() - t0 < dur) requestAnimationFrame(f);
  71  |         else done();
  72  |       };
  73  |       requestAnimationFrame(f);
  74  |     });
  75  |     return out;
  76  |   }, ms);
  77  | 
  78  | async function needClips(page: Page): Promise<void> {
  79  |   for (const who of ['gaz', 'dazza']) {
  80  |     const c = manifest.clips.find((x) => x.characterId === who);
  81  |     const ok = c ? (await page.request.get(`/${c.file}`)).ok() : false;
  82  |     test.skip(!ok, 'voice clips not rendered on this machine (run `npm run voices`)');
  83  |   }
  84  | }
  85  | 
  86  | async function toDazzaAtRegister(page: Page): Promise<void> {
  87  |   await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  88  |   for (let i = 0; i < 60; i++) {
  89  |     const r = await rush(page);
  90  |     if (
  91  |       r &&
  92  |       r.phase === 'service' &&
  93  |       r.customers.some((c) => c.id === 'dazza' && c.state === 'register')
  94  |     )
  95  |       return;
  96  |     if (r?.phase === 'intro') await page.mouse.click(640, 300);
  97  |     await page.waitForTimeout(250);
  98  |   }
  99  |   throw new Error('Dazza never reached the register');
  100 | }
  101 | 
  102 | test.describe('voice on', () => {
  103 |   test.setTimeout(150_000);
  104 | 
  105 |   test('owner speaks after Start; subtitles and the sim follow the audio; output path active', async ({
  106 |     page,
  107 |   }) => {
  108 |     await page.goto('/?seed=7&ibis=0');
  109 |     await needClips(page);
  110 |     await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
  111 |     const ticks = await sample(page, 12_000);
  112 |     const a = await audio(page);
  113 |     const first = a.history[0]!;
  114 |     expect(first.via).toBe('clip');
  115 |     expect(Math.abs(first.bufferDuration - first.manifestDuration)).toBeLessThan(0.05);
  116 |     expect(first.endedAt).not.toBeNull();
  117 |     expect(first.interrupted).toBe(false);
  118 |     expect(first.endedAt! - first.startedAt).toBeGreaterThan(first.bufferDuration - 0.1);
  119 |     // Signal on the voice bus and after the master gain (the node feeding the device).
  120 |     expect(first.maxRms).toBeGreaterThan(0.02);
  121 |     expect(first.maxMasterRms).toBeGreaterThan(0.01);
  122 |     expect(a.output?.state).toBe('running');
  123 |     expect(a.output?.destinationChannels).toBeGreaterThanOrEqual(1);
  124 | 
  125 |     // While a line's clip plays, the sim is on that line and the subtitle is typing that line.
  126 |     const T = first.text;
  127 |     const during = ticks.filter((k) => k.clip?.text === T && k.clip.endedAt === null && k.playing);
  128 |     expect(during.length).toBeGreaterThan(20);
  129 |     expect(during.every((k) => k.line === T)).toBe(true);
  130 |     expect(during.every((k) => T.startsWith(k.subs))).toBe(true);
  131 |     expect(during.some((k) => k.subs === T)).toBe(true);
  132 |     // The audio clock advances while it plays.
  133 |     expect(during[during.length - 1]!.t).toBeGreaterThan(during[0]!.t + first.bufferDuration * 0.7);
  134 |     // The sim never moves on before the audio ends (no line is ever cut short), and moves on
  135 |     // within the 0.35 s tail after it, plus however far game time fell behind the audio clock
  136 |     // (slow software-GL frames are capped at 0.1 s of game time each).
  137 |     const moved = ticks.find((k) => k.line !== T && k.t > first.startedAt + 0.1);
  138 |     expect(moved).toBeDefined();
  139 |     expect(moved!.t).toBeGreaterThanOrEqual(first.endedAt! - 0.02);
  140 |     const a0 = during[0]!;
  141 |     const lag = moved!.t - a0.t - (moved!.sim - a0.sim);
  142 |     expect(moved!.t - first.endedAt!).toBeLessThan(0.35 + Math.max(0, lag) + 0.25);
  143 |     // Never two lines at full volume.
  144 |     expect(ticks.every((k) => k.live <= 1)).toBe(true);
  145 |     expect(a.voices.maxAudible).toBeLessThanOrEqual(1);
  146 |     console.log(
  147 |       `owner: "${T.slice(0, 40)}…" ${first.bufferDuration.toFixed(3)} s, voice RMS ${first.maxRms.toFixed(3)}, ` +
  148 |         `master RMS ${first.maxMasterRms.toFixed(3)}, sim moved on ${(moved!.t - first.endedAt!).toFixed(3)} s after the clip ` +
  149 |         `(game time ${lag.toFixed(3)} s behind audio over the line); ` +
  150 |         `output ${JSON.stringify(a.output)}`,
  151 |     );
  152 |   });
  153 | 
  154 |   test('a customer order is voiced; the order moves on when the audio ends; replay, interruption, pause', async ({
  155 |     page,
  156 |   }) => {
  157 |     await page.goto('/?seed=7&ibis=0');
  158 |     await needClips(page);
  159 |     await toDazzaAtRegister(page);
  160 |     await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  161 |     const ticks = await sample(page, 7_000);
  162 |     let a = await audio(page);
  163 |     const order = a.history.find((h) => h.speaker === 'dazza')!;
> 164 |     expect(order.via).toBe('clip');
      |                       ^ Error: expect(received).toBe(expected) // Object.is equality
  165 |     expect(Math.abs(order.bufferDuration - order.manifestDuration)).toBeLessThan(0.05);
  166 |     expect(order.endedAt).not.toBeNull();
  167 |     expect(order.maxRms).toBeGreaterThan(0.02);
  168 |     // Ordering while the clip plays; deciding (register open) only once it has ended.
  169 |     const playing = ticks.filter(
  170 |       (k) => k.clip?.text === order.text && k.clip.endedAt === null && k.playing,
  171 |     );
  172 |     expect(playing.length).toBeGreaterThan(10);
  173 |     expect(playing.every((k) => k.counter?.id === 'dazza' && k.counter.state === 'ordering')).toBe(
  174 |       true,
  175 |     );
  176 |     const decided = ticks.find((k) => k.counter?.state === 'deciding');
  177 |     expect(decided).toBeDefined();
  178 |     expect(decided!.t).toBeGreaterThanOrEqual(order.endedAt! - 0.02);
  179 |     const p0 = playing[0]!;
  180 |     const lag = decided!.t - p0.t - (decided!.sim - p0.sim);
  181 |     expect(decided!.t - order.endedAt!).toBeLessThan(0.35 + Math.max(0, lag) + 0.25);
  182 |     console.log(
  183 |       `order: "${order.text.slice(0, 40)}…" ${order.bufferDuration.toFixed(3)} s; register opened ` +
  184 |         `${(decided!.t - order.endedAt!).toFixed(3)} s after the clip (game time ${lag.toFixed(3)} s behind audio)`,
  185 |     );
  186 | 
  187 |     // Replay: the same clip again, counted by the sim.
  188 |     const pos = page.locator('#pos');
  189 |     await pos.getByRole('button', { name: /Replay/ }).click();
  190 |     await expect
  191 |       .poll(async () => (await audio(page)).history.filter((h) => h.text === order.text).length)
  192 |       .toBe(2);
  193 |     await expect
  194 |       .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.listen.replays)
  195 |       .toBe(1);
  196 |     await expect.poll(async () => (await audio(page)).history.at(-1)!.endedAt).not.toBeNull();
  197 |     const replayed = (await audio(page)).history.at(-1)!;
  198 |     expect(replayed.interrupted).toBe(false);
  199 |     expect(replayed.endedAt! - replayed.startedAt).toBeGreaterThan(replayed.bufferDuration - 0.1);
  200 | 
  201 |     // Interruption: asking a question mid-replay cuts the replay; only one line is ever audible.
  202 |     await pos.getByRole('button', { name: /Replay/ }).click();
  203 |     await page.waitForTimeout(500);
  204 |     await pos.getByRole('button', { name: 'Milk?' }).click();
  205 |     await expect.poll(async () => (await audio(page)).history.at(-1)!.speaker).toBe('dazza');
  206 |     await expect.poll(async () => (await audio(page)).history.at(-1)!.text).not.toBe(order.text);
  207 |     // The cut clip fades for 60 ms, then ends.
  208 |     await expect.poll(async () => (await audio(page)).history.at(-2)!.endedAt).not.toBeNull();
  209 |     a = await audio(page);
  210 |     const cut = a.history.at(-2)!;
  211 |     expect(cut.text).toBe(order.text);
  212 |     expect(cut.interrupted).toBe(true);
  213 |     expect(cut.endedAt! - cut.startedAt).toBeLessThan(cut.bufferDuration - 0.5);
  214 |     expect(a.voices.maxAudible).toBeLessThanOrEqual(1);
  215 | 
  216 |     // Pause mid-clip freezes the audio clock; resume finishes the same clip, uncut.
  217 |     await expect.poll(async () => (await audio(page)).history.at(-1)!.endedAt).not.toBeNull();
  218 |     await pos.getByRole('button', { name: /Replay/ }).click();
  219 |     await page.waitForTimeout(400);
  220 |     await page.keyboard.press('Escape');
  221 |     await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
  222 |     const frozen = (await audio(page)).currentTime;
  223 |     await page.waitForTimeout(800);
  224 |     expect((await audio(page)).currentTime).toBe(frozen);
  225 |     await page.keyboard.press('Escape');
  226 |     await expect.poll(async () => (await audio(page)).contextState).toBe('running');
  227 |     await expect
  228 |       .poll(async () => (await audio(page)).history.at(-1)!.endedAt, { timeout: 15_000 })
  229 |       .not.toBeNull();
  230 |     const resumed = (await audio(page)).history.at(-1)!;
  231 |     expect(resumed.interrupted).toBe(false);
  232 |     expect(Math.abs(resumed.endedAt! - resumed.startedAt - resumed.bufferDuration)).toBeLessThan(
  233 |       0.15,
  234 |     );
  235 |   });
  236 | 
  237 |   test('a customer clip that fails to load falls back to the browser voice; the order still moves on', async ({
  238 |     page,
  239 |   }) => {
  240 |     await page.route('**/assets/voice/dazza/**', (r) =>
  241 |       r.fulfill({ status: 404, body: 'missing' }),
  242 |     );
  243 |     await page.goto('/?seed=7&ibis=0');
  244 |     await needClips(page).catch(() => undefined); // dazza is 404 on purpose here
  245 |     const gazClip = manifest.clips.find((x) => x.characterId === 'gaz')!;
  246 |     test.skip(!(await page.request.get(`/${gazClip.file}`)).ok(), 'voice clips not rendered');
  247 |     await toDazzaAtRegister(page);
  248 |     await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  249 |     await expect.poll(async () => (await audio(page)).history.at(-1)?.speaker).toBe('dazza');
  250 |     await expect.poll(async () => (await audio(page)).history.at(-1)?.via).toBe('tts');
  251 |     const a = await audio(page);
  252 |     expect(a.history.at(-1)!.error).toMatch(/404/);
  253 |     expect(a.status).toMatch(/fallback|error/);
  254 |     await expect(page.locator('#audioToast')).toBeVisible();
  255 |     // Gaz's lines still came from clips.
  256 |     expect(a.history.some((h) => h.speaker === 'gaz' && h.via === 'clip')).toBe(true);
  257 |     // The sim doesn't wait for audio: the register opens on the line's own timing.
  258 |     await expect
  259 |       .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.state, {
  260 |         timeout: 15_000,
  261 |       })
  262 |       .toBe('deciding');
  263 |   });
  264 | });
```