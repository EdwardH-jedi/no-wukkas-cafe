# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audioSmoke.spec.ts >> voice on >> owner speaks after Start; subtitles and the sim follow the audio; output path active
- Location: tests/e2e/audioSmoke.spec.ts:105:3

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
      - status [ref=e8] [cursor=pointer]:
        - generic [ref=e9]: GAZOwner
        - generic [ref=e10]: Job is one flat white with a heart on top. Three goes. Impr
    - alert [ref=e11] [cursor=pointer]: Couldn't load a voice clip (no audio at assets/voice/gaz/86be8997.mp3). Using the browser voice for now.
```

# Test source

```ts
  14  |   speaker: string;
  15  |   text: string;
  16  |   via: 'clip' | 'tts';
  17  |   manifestDuration: number;
  18  |   bufferDuration: number;
  19  |   startedAt: number;
  20  |   endedAt: number | null;
  21  |   maxRms: number;
  22  |   maxMasterRms: number;
  23  |   interrupted: boolean;
  24  |   error: string | null;
  25  | }
  26  | interface AudioDebug {
  27  |   status: string;
  28  |   contextState: string;
  29  |   currentTime: number;
  30  |   history: PlayRecord[];
  31  |   voices: { live: number; fading: number; maxLive: number; maxAudible: number };
  32  |   output: { state: string; sampleRate: number; destinationChannels: number; sinkId: string } | null;
  33  | }
  34  | interface Tick {
  35  |   t: number;
  36  |   /** Game time. Lags the audio clock whenever a frame takes longer than the 0.1 s step cap. */
  37  |   sim: number;
  38  |   now: number;
  39  |   clip: { text: string; endedAt: number | null; via: string } | null;
  40  |   playing: boolean;
  41  |   line: string | null;
  42  |   subs: string;
  43  |   counter: { id: string; state: string } | null;
  44  |   live: number;
  45  | }
  46  | interface RushLite {
  47  |   phase: string;
  48  |   customers: Array<{ id: string; state: string; listen: { replays: number } }>;
  49  | }
  50  | 
  51  | type W = { __trial: { audio: AudioDebug; audioTick: Tick; rush: RushLite | null } };
  52  | 
  53  | const manifest = JSON.parse(
  54  |   readFileSync(new URL('../../src/data/voice/manifest.json', import.meta.url), 'utf8'),
  55  | ) as { clips: Array<{ file: string; characterId: string }> };
  56  | 
  57  | const audio = (page: Page): Promise<AudioDebug> =>
  58  |   page.evaluate(() => (window as unknown as W).__trial.audio);
  59  | const rush = (page: Page): Promise<RushLite | null> =>
  60  |   page.evaluate(() => (window as unknown as W).__trial.rush);
  61  | 
  62  | /** Snapshot the audio/sim/subtitle state every animation frame for `ms`. */
  63  | const sample = (page: Page, ms: number): Promise<Tick[]> =>
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
> 114 |     expect(first.via).toBe('clip');
      |                       ^ Error: expect(received).toBe(expected) // Object.is equality
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
```