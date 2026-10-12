# Day 2 (the morning rush): verification run, 2026-10-12

Branch `feat/day2-morning-rush`.

## What was run

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | pass |
| Lint + format | `npm run lint` | pass |
| Unit tests (sim + core) | `npm test` | 102 passed (27 of them new for Day 2) |
| Production build | `npm run build` | pass, JS 701 kB (190 kB gzip) |
| Browser e2e, Day 2 | `npx playwright test tests/e2e/rush.spec.ts` | pass (3.3 min) |
| Browser e2e, Day 1 (regression) | `npx playwright test tests/e2e/trial.spec.ts` | pass (2.7 min) |

## The Day 2 e2e, step by step (real mouse/keyboard input)

| Step | Input | Outcome in this run |
|---|---|---|
| Gaz's intro, Dazza walks in | clicks to skip lines | Dazza reaches the register |
| Take Dazza's order | "Take Dazza's order" button | ticket #1 "flat white" prints when he finishes speaking |
| Make a flat white | button, hold to grind, Tamp & lock in, click shot start/stop, hold + mouse to steam, mouse pour | Priya's order taken with **T** while the shot ran |
| Serve Dazza | his ticket's Serve button | accepted, correct, satisfaction **92**, tip **$2.80**, waited 41 s |
| Make a long black | button, grind, hold for hot water (63%), shot | crema-only cup on the pass |
| Serve it to the wrong customer | Nan Beryl's ticket | handed back, stays on the pass, Gaz: "{name} wanted a flat white, not a long black…" |
| Serve it to Priya | her ticket | accepted |
| Stop working | game time ×4 while waiting | Beryl, Jiwoo and Karen walk out with their own lines, Gaz reacts |
| Shift report | | 2/5 completed, 2 correct, 3 walk-outs, 38% satisfaction, $4.80 tips, grade "Total disaster" (3 walk-outs) — matches the state |
| Replay / title | "Run the rush again", then pause → "Title screen" | fresh shift, no customers left over; title shows Day 1 / Day 2 |

Also asserted: no page errors; draw calls stayed under 150 with customers on screen.

## Frame rate and draw calls (desktop Chrome, Apple Silicon, GPU)

Took every order and made nothing, so the café filled up: **4 customers on screen at once, 115
draw calls, 120 fps** (the display's refresh limit). Four is the realistic peak because arrivals are
staggered and earlier customers leave. Each customer costs 4 draw calls (merged vertex-coloured body,
two legs, face) and casts no shadow.

## Difficulty, from the headless bots (`tests/core/rush.test.ts`)

| Profile | Served | Walk-outs | Grade |
|---|---|---|---|
| Competent | 5/5, all correct | 0 | excellent |
| 10 s slower per drink | 5/5 | 0 | excellent |
| 15–20 s slower per drink | 4/5 (Karen leaves) | 1 | good |
| 30 s slower per drink | 3/5 | 2 | okay |
| Idle | 0/5 | 5 | disaster |

## Screenshots

`01-intro`, `02-dazza-at-register`, `03-pour-flat-white`, `04-flat-white-on-the-pass`,
`05-dazza-served`, `06-long-black-hot-water`, `07-wrong-drink`, `08-walkout`, `09-shift-report`.

## Environment notes

- Headless Chromium 156 with SwiftShader (software WebGL), 1024×640, roughly 20 fps.
- The pour runs at 0.3× game time and the walk-out wait at up to 4× through the dev-only
  `__trial.timeScale` hook. Rules and scoring are unchanged by it.

## Not verified here

- A human playing a whole shift (pacing, readability under pressure, whether the difficulty curve
  above matches real players).
- A physical MacBook trackpad (simulated trackpad-style input is covered by the Day 1 e2e; Day 2 adds
  only buttons and single-key shortcuts).
- iPhone Safari, and audio/TTS by ear (each customer has their own pitch/rate and a male/female voice
  preference).
