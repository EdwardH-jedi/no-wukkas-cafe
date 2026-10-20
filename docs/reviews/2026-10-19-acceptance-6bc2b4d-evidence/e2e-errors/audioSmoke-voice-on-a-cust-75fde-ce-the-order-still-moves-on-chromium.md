# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audioSmoke.spec.ts >> voice on >> a customer clip that fails to load falls back to the browser voice; the order still moves on
- Location: tests/e2e/audioSmoke.spec.ts:237:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
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
      - status [ref=e8] [cursor=pointer]:
        - generic [ref=e9]: DAZZATradie · regular
        - generic [ref=e10]: 🔊 Listen…
      - region "Register" [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]: Register
          - generic [ref=e14]: Dazza
          - generic [ref=e15]: listening…
        - generic [ref=e16]:
          - generic [ref=e17]: Drink
          - button "Flat white" [ref=e18] [cursor=pointer]
          - button "Long black" [ref=e19] [cursor=pointer]
        - generic [ref=e20]:
          - generic [ref=e21]: Milk
          - button "Full cream" [pressed] [ref=e22] [cursor=pointer]
          - button "Oat" [ref=e23] [cursor=pointer]
          - button "Soy" [ref=e24] [cursor=pointer]
          - button "Almond" [ref=e25] [cursor=pointer]
        - generic [ref=e26]:
          - generic [ref=e27]: Temp
          - button "Normal" [pressed] [ref=e28] [cursor=pointer]
          - button "Extra hot" [ref=e29] [cursor=pointer]
        - generic [ref=e30]:
          - generic [ref=e31]: Art
          - button "No heart" [pressed] [ref=e32] [cursor=pointer]
          - button "Heart" [ref=e33] [cursor=pointer]
        - generic [ref=e34]:
          - button "↻ Replay −1 s" [ref=e35] [cursor=pointer]
          - button "“Sorry, could you repeat that?” −6 s · 2 left" [ref=e36] [cursor=pointer]
        - generic [ref=e37]:
          - generic [ref=e38]: Ask
          - button "Drink?" [ref=e39] [cursor=pointer]
          - button "Milk?" [ref=e40] [cursor=pointer]
          - button "Hot?" [ref=e41] [cursor=pointer]
          - button "Heart?" [ref=e42] [cursor=pointer]
          - generic "Each question costs them 3 s of patience" [ref=e43]: −3 s each
        - button "Ring it up Enter" [disabled] [ref=e45] [cursor=pointer]
    - alert [ref=e46] [cursor=pointer]: Couldn't load a voice clip (HTTP 404 for assets/voice/dazza/6ba230f2.mp3). Using the browser voice for now.
```

# Test source

```ts
  156 |   }) => {
  157 |     await page.goto('/?seed=7&ibis=0');
  158 |     await needClips(page);
  159 |     await toDazzaAtRegister(page);
  160 |     await page.getByRole('button', { name: /Take Dazza's order/ }).click();
  161 |     const ticks = await sample(page, 7_000);
  162 |     let a = await audio(page);
  163 |     const order = a.history.find((h) => h.speaker === 'dazza')!;
  164 |     expect(order.via).toBe('clip');
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
> 256 |     expect(a.history.some((h) => h.speaker === 'gaz' && h.via === 'clip')).toBe(true);
      |                                                                            ^ Error: expect(received).toBe(expected) // Object.is equality
  257 |     // The sim doesn't wait for audio: the register opens on the line's own timing.
  258 |     await expect
  259 |       .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.state, {
  260 |         timeout: 15_000,
  261 |       })
  262 |       .toBe('deciding');
  263 |   });
  264 | });
  265 | 
```