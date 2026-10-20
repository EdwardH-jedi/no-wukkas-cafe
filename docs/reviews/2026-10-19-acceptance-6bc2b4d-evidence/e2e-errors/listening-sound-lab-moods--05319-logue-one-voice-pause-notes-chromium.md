# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: listening.spec.ts >> sound lab: moods, separate buses, ducking under real dialogue, one voice, pause, notes
- Location: tests/e2e/listening.spec.ts:87:1

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 2
Received:    0
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]:
      - paragraph [ref=e5]: No Wukkas Café · dev tool
      - heading "Café sound lab" [level=1] [ref=e6]
      - paragraph [ref=e7]: The game's three original music moods through the real audio engine. Switch moods, balance the buses, test the duck under real dialogue, measure loudness and clipping, and rate what you hear. Volumes here don't change your saved game settings.
    - generic [ref=e8]:
      - button "Sound on" [ref=e9] [cursor=pointer]
      - button "Pause" [ref=e10] [cursor=pointer]
  - status
  - generic [ref=e11]:
    - generic [ref=e12]:
      - region [ref=e13]:
        - heading "Music" [level=2] [ref=e14]
        - generic [ref=e15]:
          - 'button "Opening 92 bpm, swung Indie acoustic / light jazz: fingerpicked pluck, soft keys, brushes In game: Title, Day 1, Day 2 intro" [ref=e16] [cursor=pointer]':
            - generic [ref=e17]: Opening
            - generic [ref=e18]: 92 bpm, swung
            - generic [ref=e19]: "Indie acoustic / light jazz: fingerpicked pluck, soft keys, brushes"
            - generic [ref=e20]: "In game: Title, Day 1, Day 2 intro"
          - 'button "Rush 118 bpm Upbeat indie / surf / funk: kit, syncopated bass, tremolo surf lead In game: Day 2 service" [pressed] [ref=e21] [cursor=pointer]':
            - generic [ref=e22]: Rush
            - generic [ref=e23]: 118 bpm
            - generic [ref=e24]: "Upbeat indie / surf / funk: kit, syncopated bass, tremolo surf lead"
            - generic [ref=e25]: "In game: Day 2 service"
          - 'button "Afternoon 78 bpm, swung Neo-soul / relaxed jazz: Rhodes-style keys, swung kit, walking bass In game: Day 1 verdict, Day 2 wrap-up and report" [ref=e26] [cursor=pointer]':
            - generic [ref=e27]: Afternoon
            - generic [ref=e28]: 78 bpm, swung
            - generic [ref=e29]: "Neo-soul / relaxed jazz: Rhodes-style keys, swung kit, walking bass"
            - generic [ref=e30]: "In game: Day 1 verdict, Day 2 wrap-up and report"
        - generic [ref=e31]:
          - button "Music off" [ref=e32] [cursor=pointer]
          - generic [ref=e33]: "Playing: Rush"
      - region [ref=e34]:
        - heading "Mix" [level=2] [ref=e35]
        - generic [ref=e36]:
          - generic [ref=e37]:
            - generic [ref=e38]: Voices
            - slider "Voices volume" [ref=e39]: "100"
            - status [ref=e40]: 100%
          - generic [ref=e41]:
            - generic [ref=e42]: Music
            - slider "Music volume" [ref=e43]: "80"
            - status [ref=e44]: 80%
          - generic [ref=e45]:
            - generic [ref=e46]: Café ambience
            - slider "Café ambience volume" [ref=e47]: "20"
            - status [ref=e48]: 20%
          - generic [ref=e49]:
            - generic [ref=e50]: Machine & effects
            - slider "Machine & effects volume" [ref=e51]: "80"
            - status [ref=e52]: 80%
        - generic [ref=e53]:
          - generic [ref=e54]:
            - generic [ref=e55]: Crowd
            - combobox "Crowd" [ref=e56]:
              - option "Empty café"
              - option "Normal morning" [selected]
              - option "Packed (Hard)"
          - generic [ref=e57] [cursor=pointer]:
            - checkbox "Espresso machine running (grinder, pump, steam, pour)" [ref=e58]
            - text: Espresso machine running (grinder, pump, steam, pour)
          - button "Reset to game defaults" [ref=e59] [cursor=pointer]
      - region [ref=e60]:
        - heading "Dialogue and ducking" [level=2] [ref=e61]
        - paragraph [ref=e62]: Real game lines. Music drops to 0.28 under an order the player must hear and 0.55 under other talk, then comes back over about a second.
        - generic [ref=e63]:
          - button "Dazza's order" [ref=e64] [cursor=pointer]
          - button "Karen's order" [ref=e65] [cursor=pointer]
          - button "Priya's order" [ref=e66] [cursor=pointer]
          - button "Gaz chatting" [active] [ref=e67] [cursor=pointer]
          - button "3 lines, fast" [ref=e68] [cursor=pointer]
          - button "Stop voice" [ref=e69] [cursor=pointer]
        - paragraph [ref=e70]: Nobody's talking.
        - generic [ref=e71]:
          - generic [ref=e72]:
            - generic [ref=e73]: Peak (held)
            - text: "-5.2 dB"
          - generic [ref=e74]:
            - generic [ref=e75]: RMS
            - text: "-48.6 dB"
          - generic [ref=e76]:
            - generic [ref=e77]: Music duck
            - text: "1.00"
          - generic [ref=e78]:
            - generic [ref=e79]: Clip events
            - text: "0"
          - generic [ref=e80]:
            - generic [ref=e81]: Voices at once (max)
            - text: "0"
          - generic [ref=e82]:
            - generic [ref=e83]: Audio
            - text: running
        - 'generic "Last 12 seconds: output level and music duck" [ref=e84]'
        - paragraph [ref=e85]:
          - generic [ref=e86]: output RMS
          - generic [ref=e88]: output peak
          - generic [ref=e90]: music duck (0–1)
          - generic [ref=e92]: 0 dBFS
      - region [ref=e94]:
        - heading "Measure" [level=2] [ref=e95]
        - paragraph [ref=e96]: "Renders each mood offline through the game's own synth: 28 s of music alone at 100% (its headroom), and 16 s of the worst case: every bus at 100%, a packed café, every machine sound at once and an order spoken over the ducked music. Loudness is BS.1770 integrated (LUFS); peaks are true peaks (4× oversampled)."
        - button "Measure the three moods" [ref=e98] [cursor=pointer]
        - list
    - complementary [ref=e99]:
      - heading "Listening notes" [level=2] [ref=e100]
      - generic [ref=e101]:
        - generic [ref=e102]: Reviewer
        - textbox "Reviewer" [ref=e103]:
          - /placeholder: Your name
      - generic [ref=e104]:
        - generic [ref=e105]: Listening on
        - textbox "Listening on" [ref=e106]:
          - /placeholder: e.g. MacBook speakers, AirPods
      - group "Opening" [ref=e107]:
        - 'radiogroup "Fits the café: Opening" [ref=e109]':
          - generic [ref=e110]: Fits the café
          - generic [ref=e111] [cursor=pointer]:
            - radio "1"
            - generic [ref=e112]: "1"
          - generic [ref=e113] [cursor=pointer]:
            - radio "2"
            - generic [ref=e114]: "2"
          - generic [ref=e115] [cursor=pointer]:
            - radio "3"
            - generic [ref=e116]: "3"
          - generic [ref=e117] [cursor=pointer]:
            - radio "4"
            - generic [ref=e118]: "4"
          - generic [ref=e119] [cursor=pointer]:
            - radio "5"
            - generic [ref=e120]: "5"
        - 'radiogroup "Sits under the voices: Opening" [ref=e121]':
          - generic [ref=e122]: Sits under the voices
          - generic [ref=e123] [cursor=pointer]:
            - radio "1"
            - generic [ref=e124]: "1"
          - generic [ref=e125] [cursor=pointer]:
            - radio "2"
            - generic [ref=e126]: "2"
          - generic [ref=e127] [cursor=pointer]:
            - radio "3"
            - generic [ref=e128]: "3"
          - generic [ref=e129] [cursor=pointer]:
            - radio "4"
            - generic [ref=e130]: "4"
          - generic [ref=e131] [cursor=pointer]:
            - radio "5"
            - generic [ref=e132]: "5"
        - 'radiogroup "Easy to hear all shift: Opening" [ref=e133]':
          - generic [ref=e134]: Easy to hear all shift
          - generic [ref=e135] [cursor=pointer]:
            - radio "1"
            - generic [ref=e136]: "1"
          - generic [ref=e137] [cursor=pointer]:
            - radio "2"
            - generic [ref=e138]: "2"
          - generic [ref=e139] [cursor=pointer]:
            - radio "3"
            - generic [ref=e140]: "3"
          - generic [ref=e141] [cursor=pointer]:
            - radio "4"
            - generic [ref=e142]: "4"
          - generic [ref=e143] [cursor=pointer]:
            - radio "5"
            - generic [ref=e144]: "5"
        - 'radiogroup "Doesn''t feel repetitive: Opening" [ref=e145]':
          - generic [ref=e146]: Doesn't feel repetitive
          - generic [ref=e147] [cursor=pointer]:
            - radio "1"
            - generic [ref=e148]: "1"
          - generic [ref=e149] [cursor=pointer]:
            - radio "2"
            - generic [ref=e150]: "2"
          - generic [ref=e151] [cursor=pointer]:
            - radio "3"
            - generic [ref=e152]: "3"
          - generic [ref=e153] [cursor=pointer]:
            - radio "4"
            - generic [ref=e154]: "4"
          - generic [ref=e155] [cursor=pointer]:
            - radio "5"
            - generic [ref=e156]: "5"
        - textbox "Notes on Opening" [ref=e157]:
          - /placeholder: What works, what grates, where it clashes with voices
      - group "Rush" [ref=e158]:
        - 'radiogroup "Fits the café: Rush" [ref=e160]':
          - generic [ref=e161]: Fits the café
          - generic [ref=e162] [cursor=pointer]:
            - radio "1"
            - generic [ref=e163]: "1"
          - generic [ref=e164] [cursor=pointer]:
            - radio "2"
            - generic [ref=e165]: "2"
          - generic [ref=e166] [cursor=pointer]:
            - radio "3"
            - generic [ref=e167]: "3"
          - generic [ref=e168] [cursor=pointer]:
            - radio "4"
            - generic [ref=e169]: "4"
          - generic [ref=e170] [cursor=pointer]:
            - radio "5"
            - generic [ref=e171]: "5"
        - 'radiogroup "Sits under the voices: Rush" [ref=e172]':
          - generic [ref=e173]: Sits under the voices
          - generic [ref=e174] [cursor=pointer]:
            - radio "1"
            - generic [ref=e175]: "1"
          - generic [ref=e176] [cursor=pointer]:
            - radio "2"
            - generic [ref=e177]: "2"
          - generic [ref=e178] [cursor=pointer]:
            - radio "3"
            - generic [ref=e179]: "3"
          - generic [ref=e180] [cursor=pointer]:
            - radio "4"
            - generic [ref=e181]: "4"
          - generic [ref=e182] [cursor=pointer]:
            - radio "5"
            - generic [ref=e183]: "5"
        - 'radiogroup "Easy to hear all shift: Rush" [ref=e184]':
          - generic [ref=e185]: Easy to hear all shift
          - generic [ref=e186] [cursor=pointer]:
            - radio "1"
            - generic [ref=e187]: "1"
          - generic [ref=e188] [cursor=pointer]:
            - radio "2"
            - generic [ref=e189]: "2"
          - generic [ref=e190] [cursor=pointer]:
            - radio "3"
            - generic [ref=e191]: "3"
          - generic [ref=e192] [cursor=pointer]:
            - radio "4"
            - generic [ref=e193]: "4"
          - generic [ref=e194] [cursor=pointer]:
            - radio "5"
            - generic [ref=e195]: "5"
        - 'radiogroup "Doesn''t feel repetitive: Rush" [ref=e196]':
          - generic [ref=e197]: Doesn't feel repetitive
          - generic [ref=e198] [cursor=pointer]:
            - radio "1"
            - generic [ref=e199]: "1"
          - generic [ref=e200] [cursor=pointer]:
            - radio "2"
            - generic [ref=e201]: "2"
          - generic [ref=e202] [cursor=pointer]:
            - radio "3"
            - generic [ref=e203]: "3"
          - generic [ref=e204] [cursor=pointer]:
            - radio "4"
            - generic [ref=e205]: "4"
          - generic [ref=e206] [cursor=pointer]:
            - radio "5"
            - generic [ref=e207]: "5"
        - textbox "Notes on Rush" [ref=e208]:
          - /placeholder: What works, what grates, where it clashes with voices
      - group "Afternoon" [ref=e209]:
        - 'radiogroup "Fits the café: Afternoon" [ref=e211]':
          - generic [ref=e212]: Fits the café
          - generic [ref=e213] [cursor=pointer]:
            - radio "1"
            - generic [ref=e214]: "1"
          - generic [ref=e215] [cursor=pointer]:
            - radio "2"
            - generic [ref=e216]: "2"
          - generic [ref=e217] [cursor=pointer]:
            - radio "3"
            - generic [ref=e218]: "3"
          - generic [ref=e219] [cursor=pointer]:
            - radio "4"
            - generic [ref=e220]: "4"
          - generic [ref=e221] [cursor=pointer]:
            - radio "5"
            - generic [ref=e222]: "5"
        - 'radiogroup "Sits under the voices: Afternoon" [ref=e223]':
          - generic [ref=e224]: Sits under the voices
          - generic [ref=e225] [cursor=pointer]:
            - radio "1"
            - generic [ref=e226]: "1"
          - generic [ref=e227] [cursor=pointer]:
            - radio "2"
            - generic [ref=e228]: "2"
          - generic [ref=e229] [cursor=pointer]:
            - radio "3"
            - generic [ref=e230]: "3"
          - generic [ref=e231] [cursor=pointer]:
            - radio "4"
            - generic [ref=e232]: "4"
          - generic [ref=e233] [cursor=pointer]:
            - radio "5"
            - generic [ref=e234]: "5"
        - 'radiogroup "Easy to hear all shift: Afternoon" [ref=e235]':
          - generic [ref=e236]: Easy to hear all shift
          - generic [ref=e237] [cursor=pointer]:
            - radio "1"
            - generic [ref=e238]: "1"
          - generic [ref=e239] [cursor=pointer]:
            - radio "2"
            - generic [ref=e240]: "2"
          - generic [ref=e241] [cursor=pointer]:
            - radio "3"
            - generic [ref=e242]: "3"
          - generic [ref=e243] [cursor=pointer]:
            - radio "4"
            - generic [ref=e244]: "4"
          - generic [ref=e245] [cursor=pointer]:
            - radio "5"
            - generic [ref=e246]: "5"
        - 'radiogroup "Doesn''t feel repetitive: Afternoon" [ref=e247]':
          - generic [ref=e248]: Doesn't feel repetitive
          - generic [ref=e249] [cursor=pointer]:
            - radio "1"
            - generic [ref=e250]: "1"
          - generic [ref=e251] [cursor=pointer]:
            - radio "2"
            - generic [ref=e252]: "2"
          - generic [ref=e253] [cursor=pointer]:
            - radio "3"
            - generic [ref=e254]: "3"
          - generic [ref=e255] [cursor=pointer]:
            - radio "4"
            - generic [ref=e256]: "4"
          - generic [ref=e257] [cursor=pointer]:
            - radio "5"
            - generic [ref=e258]: "5"
        - textbox "Notes on Afternoon" [ref=e259]:
          - /placeholder: What works, what grates, where it clashes with voices
      - generic [ref=e260]:
        - button "Save to disk" [ref=e261] [cursor=pointer]
        - button "Export JSON" [ref=e262] [cursor=pointer]
      - paragraph [ref=e263]: Saves to reports/listening-notes.json with the current mix and the last measurement.
```

# Test source

```ts
  29  |   volumes: Record<string, number>;
  30  |   voices: { maxAudible: number };
  31  |   history: Array<{ speaker: string; via: string; endedAt: number | null; interrupted: boolean }>;
  32  | }
  33  | type Lab = {
  34  |   __listen: {
  35  |     audio: {
  36  |       context: AudioContext | null;
  37  |       musicDuck: number;
  38  |       speaking: boolean;
  39  |       volume(b: string): number;
  40  |       voices: { maxAudible: number };
  41  |       history: LabDebug['history'];
  42  |     };
  43  |     music: { mood: string | null; scheduled: number };
  44  |     measure(): Promise<Measurement>;
  45  |   };
  46  | };
  47  | 
  48  | const lab = (page: Page): Promise<LabDebug> =>
  49  |   page.evaluate(() => {
  50  |     const l = (window as unknown as Lab).__listen;
  51  |     return {
  52  |       ctx: l.audio.context?.state ?? 'none',
  53  |       mood: l.music.mood,
  54  |       scheduled: l.music.scheduled,
  55  |       duck: l.audio.musicDuck,
  56  |       speaking: l.audio.speaking,
  57  |       volumes: Object.fromEntries(
  58  |         ['voice', 'music', 'ambience', 'sfx'].map((b) => [b, l.audio.volume(b)]),
  59  |       ),
  60  |       voices: { ...l.audio.voices },
  61  |       history: l.audio.history.map((h) => ({ ...h })),
  62  |     };
  63  |   });
  64  | 
  65  | /** Lowest music duck seen while `speaker`'s line plays; then wait for the music to come back. */
  66  | async function duckUnder(page: Page, speaker: string): Promise<number> {
  67  |   await expect
  68  |     .poll(async () => (await lab(page)).history.at(-1)?.speaker, { timeout: 15_000 })
  69  |     .toBe(speaker);
  70  |   let low = 1;
  71  |   for (let i = 0; i < 80; i++) {
  72  |     const a = await lab(page);
  73  |     const last = a.history.at(-1);
  74  |     if (last?.endedAt !== null) break;
  75  |     low = Math.min(low, a.duck);
  76  |     await page.waitForTimeout(100);
  77  |   }
  78  |   await expect
  79  |     .poll(async () => {
  80  |       const a = await lab(page);
  81  |       return !a.speaking && a.duck > 0.9;
  82  |     })
  83  |     .toBe(true);
  84  |   return low;
  85  | }
  86  | 
  87  | test('sound lab: moods, separate buses, ducking under real dialogue, one voice, pause, notes', async ({
  88  |   page,
  89  | }) => {
  90  |   test.setTimeout(150_000);
  91  |   const saved: string[] = [];
  92  |   await page.route('**/__dev/save/listening', (r) => {
  93  |     saved.push(r.request().postData() ?? '');
  94  |     return r.fulfill({
  95  |       contentType: 'application/json',
  96  |       body: '{"ok":true,"file":"reports/listening-notes.json"}',
  97  |     });
  98  |   });
  99  |   const errors: string[] = [];
  100 |   page.on('pageerror', (e) => errors.push(e.message));
  101 |   await page.goto('/dev/listening.html');
  102 | 
  103 |   await page.getByRole('button', { name: '▶ Start sound' }).click();
  104 |   await expect.poll(async () => (await lab(page)).ctx).toBe('running');
  105 |   await expect.poll(async () => (await lab(page)).mood).toBe('opening');
  106 |   await expect.poll(async () => (await lab(page)).scheduled).toBeGreaterThan(20);
  107 | 
  108 |   // Switch tracks.
  109 |   await page.getByRole('button', { name: /^Rush/ }).click();
  110 |   await expect.poll(async () => (await lab(page)).mood).toBe('rush');
  111 |   await expect(page.getByRole('button', { name: /^Rush/ })).toHaveAttribute('aria-pressed', 'true');
  112 | 
  113 |   // Separate bus volumes.
  114 |   await page.getByLabel('Music volume').fill('80');
  115 |   await page.getByLabel('Café ambience volume').fill('20');
  116 |   let a = await lab(page);
  117 |   expect(a.volumes).toEqual({ voice: 1, music: 0.8, ambience: 0.2, sfx: 0.8 });
  118 | 
  119 |   // The music ducks deep under an order, less under chat, and comes back.
  120 |   await page.getByRole('button', { name: "Dazza's order" }).click();
  121 |   const underOrder = await duckUnder(page, 'dazza');
  122 |   await page.getByRole('button', { name: 'Gaz chatting' }).click();
  123 |   const underChat = await duckUnder(page, 'gaz');
  124 |   console.log(`duck under an order ${underOrder.toFixed(2)}, under chat ${underChat.toFixed(2)}`);
  125 |   expect(underOrder).toBeLessThan(0.35);
  126 |   expect(underChat).toBeGreaterThan(0.45);
  127 |   expect(underChat).toBeLessThan(0.65);
  128 |   a = await lab(page);
> 129 |   expect(a.history.filter((h) => h.via === 'clip').length).toBeGreaterThanOrEqual(2);
      |                                                            ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  130 | 
  131 |   // Three lines fired quickly: each cuts the one before, never two audible at once.
  132 |   await page.getByRole('button', { name: '3 lines, fast' }).click();
  133 |   await expect
  134 |     .poll(async () => (await lab(page)).history.at(-1)?.speaker, { timeout: 15_000 })
  135 |     .toBe('priya');
  136 |   await expect
  137 |     .poll(async () => (await lab(page)).history.at(-1)?.endedAt ?? null, { timeout: 20_000 })
  138 |     .not.toBeNull();
  139 |   a = await lab(page);
  140 |   expect(a.voices.maxAudible).toBe(1);
  141 |   expect(a.history.slice(2, -1).some((h) => h.interrupted)).toBe(true);
  142 |   expect(a.history.at(-1)?.interrupted).toBe(false);
  143 | 
  144 |   // Pause freezes the audio clock and the music; resume carries on.
  145 |   await page.getByRole('button', { name: 'Pause' }).click();
  146 |   await expect.poll(async () => (await lab(page)).ctx).toBe('suspended');
  147 |   const frozen = (await lab(page)).scheduled;
  148 |   await page.waitForTimeout(1500);
  149 |   expect((await lab(page)).scheduled).toBe(frozen);
  150 |   await page.getByRole('button', { name: 'Resume' }).click();
  151 |   await expect.poll(async () => (await lab(page)).ctx).toBe('running');
  152 |   await expect.poll(async () => (await lab(page)).scheduled).toBeGreaterThan(frozen);
  153 | 
  154 |   // Ratings and notes save with the current mix; the game's own settings are untouched.
  155 |   await page.getByLabel('Reviewer').fill('E2E');
  156 |   await page
  157 |     .locator('[data-notes-mood="rush"] input[data-k="fit"][value="4"]')
  158 |     .check({ force: true });
  159 |   await page.getByLabel('Notes on Rush').fill('surf lead sits nicely');
  160 |   await page.getByRole('button', { name: 'Save to disk' }).click();
  161 |   await expect(page.locator('[data-toast]')).toContainText('reports/listening-notes.json');
  162 |   const notes = JSON.parse(saved[0] ?? '{}') as {
  163 |     kind: string;
  164 |     reviewer: string;
  165 |     moods: Record<string, { ratings: Record<string, number>; notes: string }>;
  166 |     mix: Record<string, number>;
  167 |   };
  168 |   expect(notes.kind).toBe('nwc-listening-notes');
  169 |   expect(notes.reviewer).toBe('E2E');
  170 |   expect(notes.moods.rush).toEqual({ ratings: { fit: 4 }, notes: 'surf lead sits nicely' });
  171 |   expect(notes.mix.music).toBe(0.8);
  172 |   expect(await page.evaluate(() => localStorage.getItem('nwc.audio.v1'))).toBeNull();
  173 |   expect(errors).toEqual([]);
  174 | });
  175 | 
  176 | test('the three moods: no clipping, no DC offset, even loudness, orders above the music', async ({
  177 |   page,
  178 | }) => {
  179 |   test.setTimeout(120_000);
  180 |   await page.goto('/dev/listening.html');
  181 |   const r = await page.evaluate(() => (window as unknown as Lab).__listen.measure());
  182 |   for (const m of r.measures)
  183 |     console.log(
  184 |       `${m.mood}: ${m.music.lufs.toFixed(1)} LUFS, ${m.music.truePeakDb.toFixed(1)} dBTP, DC ${m.music.dc.toFixed(5)}; worst case ${m.worst?.truePeakDb.toFixed(1)} dBTP, ${m.worst?.clipped} clipped`,
  185 |     );
  186 |   expect(r.measures.map((m) => m.mood)).toEqual(['opening', 'rush', 'afternoon']);
  187 |   for (const m of r.measures) {
  188 |     expect(m.music.clipped, `${m.mood} clips alone`).toBe(0);
  189 |     expect(m.music.truePeakDb, `${m.mood} true peak`).toBeLessThan(0);
  190 |     expect(m.worst?.clipped, `${m.mood} clips in the worst-case mix`).toBe(0);
  191 |     // Regression: the FM keys put a 0 Hz sideband into every chord (DC up to 0.0047).
  192 |     expect(Math.abs(m.music.dc), `${m.mood} DC offset`).toBeLessThan(0.0005);
  193 |   }
  194 |   const lufs = r.measures.map((m) => m.music.lufs);
  195 |   expect(Math.max(...lufs) - Math.min(...lufs)).toBeLessThan(3);
  196 |   expect(r.findings.filter((f) => f.level === 'defect')).toEqual([]);
  197 |   if (r.speechLufs !== null)
  198 |     for (const f of r.findings.filter((x) => /Orders sit/.test(x.message)))
  199 |       expect(f.level, f.message).toBe('info');
  200 | });
  201 | 
```