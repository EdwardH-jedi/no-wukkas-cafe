# Day 2 listening: Playwright evidence (2026-10-13)

`npx playwright test tests/e2e/rush.spec.ts` → 1 passed (3.9 min), Chromium (SwiftShader), seed 7,
Normal difficulty, `?voice=0` (the sim and subtitles don't depend on audio; real audio playback is
covered by `tests/e2e/audio.spec.ts`).

| # | What it shows |
|---|---|
| 01 | Gaz's intro |
| 02 | Dazza at the register |
| 03 | Dazza ordering: register open, transcript hidden ("🔊 Listen…") on Normal |
| 04 | After "Sorry, could you repeat that?": the slow repeat plays and the transcript appears |
| 05 | Rung up correctly: learning-mode card "Spot on", ticket shows what was rung up |
| 06–08 | His ticket made through the station (real mouse input) and served |
| 09 | Priya rung up wrong on purpose: "Not quite", missed words marked in red |
| 10 | The wrong ticket gets made (long black water) |
| 11 | She hands it back; Gaz calls out the mishearing; the ticket is corrected |
| 12 | Walk-outs |
| 13 | Shift report with "Orders heard right 1/2", replays/repeats/questions, and "Listen again" |
