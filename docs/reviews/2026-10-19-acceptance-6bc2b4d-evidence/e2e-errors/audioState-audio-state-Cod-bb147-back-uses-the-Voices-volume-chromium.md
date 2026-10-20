# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audioState.spec.ts >> audio state (Codex A1, A2, A3, A7) >> A7: the browser-voice fallback uses the Voices volume
- Location: tests/e2e/audioState.spec.ts:191:3

# Error details

```
Error: expect(received).toBeCloseTo(expected, precision)

Expected: 0.4
Received: 1

Expected precision:    5
Expected difference: < 0.000005
Received difference:   0.6
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
          - generic: Register
          - generic: Dazza is at the register. Take the order (T).
      - button "Take Dazza's order T" [active] [ref=e8] [cursor=pointer]
      - status [ref=e9] [cursor=pointer]:
        - generic [ref=e10]: GAZOwner
        - generic [ref=e11]: Here comes Dazza. Take the ord
    - alert [ref=e12] [cursor=pointer]: Couldn't load a voice clip (no audio at assets/voice/gaz/60721c87.mp3). Using the browser voice for now.
```

# Test source

```ts
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
  139 |     expect((await spoken(page)).some((s) => s.text.includes(dazzaText.slice(0, 12)))).toBe(false);
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
> 207 |     expect(s.volume).toBeCloseTo(0.4, 5);
      |                      ^ Error: expect(received).toBeCloseTo(expected, precision)
  208 |   });
  209 | });
  210 | 
```