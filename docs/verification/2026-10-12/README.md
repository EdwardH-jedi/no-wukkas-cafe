# Day 1 trial: verification run, 2026-10-12

Branch `feat/day1-barista-trial`, code at commit `1b07d51`.

## What was run

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | pass |
| Lint + format | `npm run lint` | pass |
| Unit tests (sim + core) | `npm test` | 75 passed |
| Production build | `npm run build` | pass, JS 657 kB (176 kB gzip), total dist under 1 MB |
| Browser e2e | `npm run test:e2e` | pass (2.7 min) |

The e2e test (`tests/e2e/trial.spec.ts`) plays the whole trial in Chromium with real input events
(Playwright `mouse` / `keyboard`, no calls into the sim):

| Step | Input used | Outcome in this run |
|---|---|---|
| Grind | hold mouse button | 18.6–20 g |
| Shot | click start, click stop | stopped inside 25–31 s |
| Pause | Esc | milk temperature frozen while paused |
| Steam | hold + mouse height | 55–65 °C, silky |
| Owner demo | (watch) | heart poured with the player's physics |
| Attempt 1: mouse | move, hold button, wheel | **92, Hired**, no faults |
| Attempt 2: trackpad-style | hover only, Space to tip, 21 small scroll deltas, keys 1/2/3 | **92, Hired** |
| Attempt 3: counter | pour past the rim | Gaz: "Wrong target." → spill, doesn't count |
| Verdict | | **Hired, 92** (best valid attempt) |
| Replay | "Do the trial again", then pause → "Restart trial" | both back to the greeting with no results |

Also asserted: no page errors, fewer than 150 draw calls.

## Environment notes

- Headless Chromium 156 with SwiftShader (software WebGL), 1024×640, roughly 20 fps.
- During the two pours the test slows game time to 0.3× with the dev-only `__trial.timeScale`
  hook, so input is sampled about as finely as on a real laptop at 60 fps. Physics and scoring are
  unchanged. The exact-input proof that 85+ is reachable is `tests/sim/latte.test.ts`.
- "Trackpad-style" means the input a MacBook trackpad can produce: pointer moves with no button
  held, Space for the pour, small scroll deltas, number keys. It was simulated, not done by hand.

## Screenshots

| File | Shows |
|---|---|
| `01-title.jpg` | title screen and controls |
| `02-intro.jpg` | Gaz's greeting |
| `03-grind.jpg` | dose gauge after grinding |
| `04-shot.jpg` | shot timer stopped in the window |
| `05-pause.jpg` | pause overlay (Back to it / Restart trial) |
| `06-steam.jpg` | steaming with temperature and foam gauges |
| `07-demo.jpg` | Gaz's demonstration mid-bloom |
| `08-pour-mouse.jpg` | attempt 1 pour (mouse) |
| `09-inspect.jpg` | Gaz holding the cup up to inspect it |
| `10-feedback.jpg` | result card for attempt 1 |
| `11-pour-trackpad.jpg` | attempt 2 pour (trackpad-style) |
| `12-feedback-trackpad.jpg` | result card for attempt 2 |
| `13-spill.jpg` | pouring onto the counter, Gaz reacting |
| `14-verdict.jpg` | final verdict with all three cups |

## Not verified here

- A real MacBook trackpad in a person's hands (feel, timing, momentum scrolling).
- iPhone Safari (touch controls, audio unlock, layout at phone width).
- Sound effects and the TTS voice by ear (headless has no audio output).
- Frame rate on real hardware. An earlier session in desktop Chrome with a GPU ran smoothly and
  scored 93–94 with scripted pointer events, but that run isn't part of this log.
