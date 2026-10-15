# Latte art v2: report

Branch `feat/latte-art-polish` (worktree `no-wukkas-cafe-latte-v2`), based on `7663b80`. **Local commits only: nothing pushed, merged or deployed.**

The goal was to make the latte-art minigame more satisfying, readable and learnable without replacing working systems. The 128² foam simulation, the pitcher physics, the heart scoring and Gaz's control track are unchanged: no score value moves (Day 1 balance unaffected). The changes are in how the pour is seen, controlled, taught and practised.

## Commits

| Hash | What |
|---|---|
| `11917ec` | sim/core: pour gate + aim limit, four-step pour log and `diagnose()`, teaching-pace demo player, practice state machine (+ tests), before screenshots |
| `d70cf7b` | world/UI: straight-on close-up camera, jug ghosting, crema/foam/stream visuals, lesson strip, practice HUD and review card (+ camera tests, practice e2e) |
| `93b5c72` | phone layout fixes, cup readout in the lesson strip, after screenshots, this report |
| `f180e62` | fix: Day 2's pour buttons moved off the (now bigger) cup, with an e2e check |
| the commit adding this table | report corrections only |

## 1. Camera and visual quality

**Close-up, straight-on pour view** (`world/camera.ts`). Before, the camera looked at the cup from the near-left diagonal, 0.30 m away. Now it looks from straight in front, 0.215 m away. Measured with the game's own projection (`tests/world/camera.test.ts`, 16:10):

| | before | after |
|---|---|---|
| inner-rim diameter, share of screen width | 15.4% | **32.9%** (2.1×) |
| "forward" on the cup (the pull-through), off vertical on screen | 40.7° | **4.7°** |

Before, the 41° tilt meant pushing the mouse straight up moved the jug toward the far *right*, so a straight pull-through needed a diagonal hand movement. Now mouse-up means forward, and the heart's point grows straight up the screen.

- The camera holds **perfectly still** during the pour. The old 0.4 mm idle sway is gone, because the pointer maps through this camera and the sway jittered the aim (tested).
- Gaz's demo uses the same framing, so nothing moves when the player takes over (tested). Steam → pour eases in within 1.0 s, smoothly and monotonically (tested). Practice adds a top-down review shot with the cup offset clear of the card.

**Pitcher occlusion** (`world/station.ts`). Before, the jug, its milk and the arm went to 30% opacity everywhere, which left a grey haze over a third of the cup. Now a small shader keeps the **spout solid**, because you aim with it, and fades the body with distance from the spout tip, down to 3%. The arm fades to 8%.

**Crema and microfoam** (`world/coffeeSurface.ts`).
- Crema gets caramel mottling, fine speckle and a darker ring at the cup wall.
- The foam field also drives a **bump map**, so the white stands a hair proud of the crema and its edge catches the light.
- There's a thin brown contrast rim where foam meets crema, and the foam is warm cream rather than paper white.

**Pour stream movement feedback**.
- The stream tapers as it falls, wobbles slightly, and **trails behind a moving jug**: its bottom is offset by the jug's velocity × fall time, so motion is visible in the stream itself.
- Where it lands, **rings spread out**. Poured from high, it punches a dark dimple with a pale halo (milk diving under the crema); poured low, it lays foam. Both fade after the stream stops.
- The aim ring now acts like the jug's **shadow**: wide when high, tight when low. While the stream is off, a faint **plumb line** from the spout to the ring shows the height, which the top-down view otherwise hides.

**Performance.** See the numbers below. The extra cost is about 0.4 ms/frame, and draw calls went down slightly.

## 2. Player controls (mouse and MacBook trackpad)

- **No accidental pouring** (`sim/latte/pitcher.ts: applyPourInput, PourGate`).
  - A button already held when a pour starts doesn't pour until it has been let go once. This covers clicking through Gaz's line, holding on from the demo or steaming, and pressing Space to "pour again" in practice.
  - The lesson strip says why: the Space chip turns red with *"Let go, then press again to pour."*
  - A 0.1 s tap pours nothing (tested).
  - Day 1 and Day 2 now share this one input path; it replaces two copy-pasted versions.
- **Buttons moved out of the steering area.** "Hand it over" sat in the middle of the screen, just below the cup. Hovering it swallowed the pointer moves that steer the jug, and a stray click ended the pour. Pour/demo buttons now sit at the right edge on Day 1, Day 2 and in practice. On Day 2 the closer camera had put "Hand it over" / "Bin it" right on the cup's near rim; that's fixed in `f180e62`, and the register still opens over them. The Day 1 and Day 2 e2e both assert the button stays right of the cup.
- **Responsive steering.** The straight-on camera makes screen direction match cup direction (above), and the camera no longer sways under a still pointer.
- **Control boundaries.** The aim is clamped to 1.6 rim radii, which is past the rim (a careless pour still lands on the bench) but never off the mat or out of the close-up. Height stays within 0.4–10 cm for scroll, keys and presets.
- **Intuitive height, clear flow.** The lesson strip's "hands" row shows the 1/2/3 preset the jug is nearest (lit), the height in cm, the jug's motion (*steady / ↑ forward / ↓ back / ← →*), a flow bar and the cup fill. The aim-ring shadow and plumb line show height in the scene itself.
- **Accessible instructions.** Each step's text names its keys as keycaps; touch screens get touch wording. The current step is announced through an `aria-live` region, the guide toggle is a real button with `aria-pressed`, and the side buttons show their keys (Enter / R / D / G).
- **Predictable reset and retry.** Practice uses R for a fresh cup at any time (no judging) and Space/Enter/R to pour again after a review. Day 1's three-attempt flow is unchanged.

## 3. Gaz's demonstration

`sim/latte/demo.ts` (`DEMO_CHAPTERS`, `DemoPlayer`), wired into Day 1 (`core/trial.ts`) and practice.

- The same control track through the same physics, now in **four narrated chapters**: *pour high to fill → drop low to lay foam → hold steady: grow the lobes → lift and pull through.*
- **Teaching pace.** While Gaz narrates a chapter, playback slows so the chapter lasts as long as his line (never below 0.3×), and it waits at a chapter boundary until he has finished. Before, `demo.pull` cut `demo.drop` off **2.55 s into a 4.08 s line**; now every line plays out.
- The sim always steps in fixed track steps, so the heart is **bit-identical** whether the lines run long or short, are skipped, or the game runs at 30 fps (tested against the headless `runTrack`).
- **Shows how the controls make the pattern.** During the demo the lesson strip reads *Gaz's hands* and follows his chapters. It shows the Space key lit while he pours, the 1/2/3 height key he is on with the height in cm, "↑ forward" on the pull-through, and the pace (*slow-mo ×0.4*, *Gaz is talking*).
- **Interactive.** Click or Space hurries him along: it skips the current line and the pour speeds back up. Repeat viewings can be skipped, and practice offers Watch Gaz at any time.
- **Voice.** Only existing recorded lines are used: `demo.fill`, `demo.drop`, `pour.bloom` for the lobes (*"That's it... that's it..."*) and `demo.pull`. Nothing in `src/audio/`, `src/data/voice/` or `scripts/voices*` changed. A test checks that every line practice can say has a recording.

## 4. Practice mode

Title screen → **Latte art practice** (`core/practice.ts`, `ui/practiceHud.ts`, `data/coaching.ts`).

- You go straight to a cup with silky milk: no steaming, no attempt limit, no pressure lines. Gaz only speaks when asked to demonstrate.
- **Pour repeatedly / reset the cup.** R resets mid-pour. The last 12 attempts (with their foam fields) are kept, and the count keeps running.
- **Heart guide** (G, or the Guide button). A dashed gold heart is drawn on the coffee where a textbook heart sits. It is the scorer's own reference: `GUIDE_SCALE`, now shared by the scorer, the shader and the card.
- **Review card**, scored **only from the foam field** (`scorePattern`):
  - the pattern as you poured it (far side up, matching the 3D view), with the guide (white), the closest-fitting heart (gold) and a line from the cup centre to the white's centre;
  - art %, plus bars for heart shape, symmetry, centred, crisp and white coverage, each with ▲▼ change since the previous pour;
  - **why it failed**: up to three findings, worst first (`sim/latte/coach.ts: diagnose`). Each states what the field shows with a number, the likely cause in terms of the controls (from the pour log: drop-in fill, drawing height, pull reach, sideways drift, pull flow), and the fix with keys;
  - thumbnails of the last six pours.

  Example (blob): *"✗ Blob, no pull-through — Nothing was dragged through the white, so there's no dip and no point. You stayed low and stopped, without lifting and sweeping forward. → Finish with [2], ease off, and sweep forward across the white."*
- Pause → *Back to title*. Day 1 and Day 2 are untouched by practice; it is a separate state machine.

## Before / after screenshots

`docs/verification/2026-10-14-latte-v2/` (`README.md` there lists every frame). Desktop frames are 1280×800, Apple Metal GPU. The same driver plays Day 1 with the demo's own control track on the mouse.

| Moment | Before | After |
|---|---|---|
| Pour start | `before/pour-0-start.jpg` | `after/pour-0-start.jpg` |
| Filling from high | `before/pour-1-fill.jpg` | `after/pour-1-fill.jpg` |
| Laying foam | `before/pour-2-low.jpg` | `after/pour-2-low.jpg` |
| Pull-through | `before/pour-3-pull.jpg` | `after/pour-3-pull.jpg` |
| Gaz's demo at 4.6 s / 7.1 s | `before/demo-at-*.jpg` | `after/demo-at-*.jpg` (teaching pace: at 7.1 s he is still on step 2, still talking) |
| Inspection close-up | `before/inspect.jpg` | `after/inspect.jpg` |
| Practice: guide, steps, review | — | `after/p1-start-guide.jpg`, `p2…p5`, `p6-review-heart.jpg`, `p7-review-blob.jpg` |
| Practice: Gaz's chapters | — | `after/p8…p11-demo-*.jpg` |
| Pour gate (held through restart) | — | `after/e2e-practice-03-held-through-restart.jpg` |
| Phone 390×844 | — | `after-phone/*.jpg` |

## Test evidence

All run on this worktree at the final code, except where noted.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` (eslint + prettier) | pass |
| `npm test` | **264 passed / 27 files** (base `7663b80`: 210 / 23) |
| `npm run build` | pass. Audio gate ok. Main chunk 998 kB / 243 kB gzip (base 968 kB / 233 kB; the >900 kB warning already fired on base) |
| `E2E_PORT=5197 npx playwright test tests/e2e/trial.spec.ts` | pass: full Day 1 (both hearts ≥ 75, the counter pour invalid, verdict, both restarts), now also checking the lesson strip and button placement |
| `… rush.spec.ts` | pass (Day 2 full shift; shares the station, camera and pour input), re-run after `f180e62` with the new button check |
| `… practice.spec.ts` (new) | pass: heart via mouse, review, Space held through restart pours nothing, reset, guide toggle, blob with "Blob, no pull-through", Gaz's demo, back to title |
| `… ibis.spec.ts`, `music.spec.ts` | pass |
| `… audio*.spec.ts` | 1 pass / 8 fail. **Identical on base `7663b80`** (re-run in a scratch clone): this worktree has no `voice-cache/` (gitignored, made by `npm run voices`, which this task must not touch), so the game falls back to browser speech ("expected clip, received tts"). Not caused by this branch. |

New unit tests:
- `tests/sim/pitcher.test.ts`: control boundaries; no accidental pouring (held-through press, 0.1 s tap); deterministic pouring, bit for bit, through the real input path.
- `tests/sim/coach.test.ts`: the four steps tick in order on Gaz's pour and line up with his chapters. The demo player gives a **bit-identical** heart under any narration timing, including 30 fps. It also covers diagnosis findings with direction, height and side, and determinism.
- `tests/core/practice.test.ts`: pour → review → again/reset transitions; gate after reset; done; guide; history cap; reproducible attempts; demo narration order; skip; every spoken line has a recording.
- `tests/world/camera.test.ts`: smooth ≤ 1 s transitions, the pour shot stays still, demo → pour doesn't move, forward is screen-up, the cup and its surroundings stay on screen at 16:10, 4:3 and iPhone portrait, and the review shot.

Full Day 1 completion is covered headless (`tests/core/trial.test.ts`, *"a good barista … is hired"*, unchanged and passing) and in the browser (`trial.spec.ts`).

## Performance observations

The same scene, Gaz's demo pour, on both builds: Chromium with the Apple Metal GPU at 1440×900 and devicePixelRatio 2 (the game caps it at 1.75), vsync and the frame cap disabled, 5 s windows, two runs each. Machine: Apple M5 Pro, 24 GB.

| | before (`7663b80`) | after |
|---|---|---|
| mean frame time | 2.17 / 2.36 ms (461 / 424 fps) | 2.59 / 2.76 ms (385 / 363 fps) |
| p95 frame time | 3.4 / 4.0 ms | 4.1 / 4.2 ms |
| draw calls | 92 | 89 (practice review: 84) |

- That's about **+0.4 ms/frame**, from the heavier coffee shader (bump, ripples, guide, noise) now covering about 2× the screen pixels, plus the jug's fade shader. It leaves about 6× headroom under the 16.7 ms (60 fps) budget, with draw calls well under 150.
- No allocations were added to the sim tick or the 3D update/render path (the station reuses vectors). The HUDs, like the existing ones, build a few small strings per frame, but they touch the DOM only when a value changes.
- The guide's distance field is built once, the first time the guide is shown.
- The pour log counts white coverage only when the foam field changes (16k reads).

## Known limitations

- **No new Gaz lines.** The voice manifest is frozen for this task, so the lobes chapter borrows `pour.bloom`, and the new teaching copy (steps, hints, review reasons) is on-screen text, not speech.
- **Not tried on real hardware input.** There was no MacBook trackpad or iPhone Safari session; all input was synthetic, through Playwright and headless tests. In particular, trackpad scroll *direction* for height (macOS natural scrolling) is unverified: scroll is unchanged from before, and the 1/2/3 presets remain the trackpad-friendly route. Roadmap D1.8 (real-device playtest) stays open.
- The **lobes** step is taught as "hold steady and let the white spread". In this sim the two lobes appear when the pull-through cuts the bloom, which the copy explains. The sim has no lobe-shaping wiggle, and the demo track was deliberately not retuned.
- Day 2 gets the camera, visuals and pour gate, but **not the lesson strip**: the rush HUD is busier, so it keeps its own instruction panel.
- Practice history lives in memory only (not saved). Practice always uses silky milk; steaming isn't practised here.
- On phones, practice hides the pour gauge panel (the lesson strip mirrors height, flow and cup). Only **practice** was checked at 390×844, in the browser. Day 1's phone placement of the lesson strip and of "Hand it over" (bottom-left on narrow screens) is unverified.
- `pour.bloom` (the lobes narration) has a 12 s cooldown in Gaz's line book. If the demo is replayed within 12 s of him last saying it, that chapter plays without narration, at 1× speed; this is graceful, and the pattern is unaffected.
- The audio e2e specs need the placeholder clips (`npm run voices`) to pass, here as on base.

## Manual playtest

```bash
cd ~/Desktop/no-wukkas-cafe-latte-v2
npm run dev                     # → http://localhost:5183 (or: npx vite --port 5197 if 5183 is taken)
npm run voices                  # optional, macOS: placeholder voices so Gaz is heard
```

1. **Practice first** (title → *Latte art practice*):
   - Hold Space or the mouse to pour from high (key 1). Watch the stream dimple the crema, and the lesson strip move to step 2 at about half full.
   - Press 3 to drop to the surface: the white comes up, and the aim ring shrinks like a shadow.
   - Let it spread, then press 2, let go of the button, and push the mouse **up**: the point grows up the screen.
   - Read the review: the bars, the why/cause/fix, and the change since the last pour. Press Space to go again.
   - Try a deliberate blob, an off-centre pour and a pour from too high, and check that each explanation makes sense.
   - Press R mid-pour (fresh cup) and G (guide off/on).
   - Press Space in the review and *keep holding it*: it must not pour until you let go and press again.
2. **Watch Gaz** (D, or the button): four steps, slow motion while he talks, with "Gaz's hands" showing the keys. Click to hurry him along.
3. **Day 1** (title → *Start the trial*):
   - Gaz's demo should never cut himself off mid-sentence.
   - During your pour, *Hand it over* is at the right edge.
   - A click to skip his "Your go…" line must not start pouring.
4. **On a MacBook trackpad**:
   - Hover to steer, Space to pour, 1/2/3 for height. Then try two-finger scroll for height and note whether the direction feels right.
   - Steer the pull-through with a single upward stroke.
5. **On iPhone** (`npm run dev -- --host`): practice in portrait. Drag to steer, ▲▼ for height. Check that the lesson strip sits below the top bar and the buttons don't cover the cup.
6. **Day 2**: make a flat white and check the pour feels the same as on Day 1.

For Codex review, look closely at:
- `stepDemoPlayer` (fixed track steps vs the real-time rate);
- `applyPourInput` (gate semantics shared by Day 1 and Day 2);
- the ghost/stream `onBeforeCompile` patches against three r186 chunk names;
- the lesson strip's id-per-HUD (two HUDs live in the DOM at once).
