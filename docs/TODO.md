# No Wukkas Café — TODO (docs/TODO.md)

> Planning moved to `todo.md` (repo root) on 2026-10-18; this file is the evidence archive.
> Evidence lines still get appended here; tasks, checkboxes for new work and the milestone status live in `todo.md`.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (only when checks ran) · `[!]` blocked (one line why)

How this file is used: one Claude Code session owns it at a time. The session reads this file,
picks the first unchecked phase, decides itself how to split the phase across subagents or
worktrees (file ownership per task is listed, so parallel work does not collide), updates the
checkboxes and Evidence lines, and commits this file with the work. Human-gated items are marked
**HUMAN** and are never done by Claude; they are reported instead.

Global rules for every task:
- Read AGENTS.md first. English code, commits and game text; Australian spelling; cents as integers.
- Before every commit: `npm run typecheck && npm run lint && npm test` exit 0. E2E once per phase.
- Conventional Commits, small commits, never force/reset/clean/stash, never delete branches.
- Never stage .env*, voice-cache/, voice-auditions/, public/assets/voice/, node_modules/, dist/,
  logs, screenshots with personal data, or any audio. Never run a paid API without `--allow-paid`
  and the human's own key.
- No Math.random / Date.now / setTimeout in src/sim or src/core.
- Push only as a fast-forward. If rejected, stop and report; never pull --rebase onto main.

---

## Phase 0 — Consolidate (sequential, do first)  `[x]`
Goal: one branch, one build, no large files that every task must touch.

- [x] 0.1 Merge `origin/chore/merge-day1-pull-through` into `main` (no-ff), run unit + e2e, push.
- [x] 0.2 Split `src/main.ts` (≈1,180 lines) into `src/app/{boot,title,trialWiring,rushWiring,weekWiring}.ts`,
      each ≤ 300 lines; `src/main.ts` ≤ 60 lines. Pure refactor, exported names unchanged.
- [x] 0.3 Split `src/ui/styles.css` (≈1,600 lines) into `src/ui/styles/{base,title,hud,rush,latte,shop,screens}.css`
      with one index import. Pure refactor; screenshot diff before/after at 1024×640.
- [x] 0.4 `vitest` `testTimeout` is 20 s (done in run #2) — confirm it is in the config, not per-test.
- [x] 0.5 Delete nothing, but list stale branches in the report (feat/voice-listening, old fix/*).
- Exit: `npm run build` ok, e2e green, main pushed.
- Evidence:
  - 0.1 (2026-10-16): `git merge --no-ff origin/chore/merge-day1-pull-through` → 6b05ba7, no conflicts.
    `npm run typecheck && npm run lint && npm test` exit 0: `Test Files  55 passed (55)` · `Tests  493 passed (493)`.
    `E2E_PORT=5179 npm run test:e2e`: `22 passed (16.4m)`, exit 0.
  - 0.4: `vite.config.ts` → `test: { …, testTimeout: 20_000 }` (config-wide). Per-test values that remain are
    only longer runs that need more than 20 s: `tests/core/rushPace.test.ts` 120_000 ×3, `tests/core/rush.test.ts:330`
    60_000, `tests/core/rushEvents.test.ts:88` 30000, `tests/scripts/voices.test.ts:32` 60_000. None sets 20 s per test.
  - 0.2 (f4c185e, merged 8faedbc): `src/main.ts` 11 lines (fonts + `./ui/styles/index.css` + `void boot()`).
    `src/app/`: boot 288 · rushWiring 299 · debug 255 · practiceWiring 165 · input 152 · context 124 ·
    trialWiring 111 · weekWiring 73 · shared 39 · title 38 (all ≤ 300). Five named files plus context.ts (shared
    `App` state + late-bound `nav`), debug.ts (`window.__trial`, 240 lines alone), input.ts, practiceWiring.ts,
    shared.ts — the caps could not hold with five. Week autosave moved out of rushFrame into
    `weekWiring.onShiftSummary`. All 14 `__trial` keys kept with lazy getters; browser smoke 21/21 (title, week,
    Day 2, pause, practice, Endless, Enter at title). Unit: `Test Files  55 passed (55)` · `Tests  493 passed (493)`.
  - 0.3 (f4b3bae, merged 3e6bc85): `src/ui/styles/` base 121 · title 67 · hud 357 · screens 449 · shop 21 ·
    rush 338 · latte 281 · index 10 (imports base, title, hud, screens, shop, rush, latte). Concat diff vs the old
    file = moved blocks only (pause, Day 2 rush block, `.titleBtns`, `.paper kbd`, one `@media (max-width:720px)`
    wrapper split in two). Built CSS: same 270-rule multiset; not byte-identical (+26 bytes, the second @media
    wrapper); every reordered same-specificity pair checked: never on one element. Screenshots 1024×640 with `#gl`
    hidden, before/after byte-identical 4/4 (title, shift-select, rush-hud, practice):
    `docs/verification/2026-10-16-css-split/`. Built CSS `index-DWo1Jx3E.css` 26.66 kB.
  - 0.5 Stale branches (nothing deleted). Merged into main, safe to prune when Edward wants: local
    claude/recursing-perlman-d9d838, chore/merge-day1-pull-through, feat/{audio-qa-hardening, bin-chicken, cafe-bgm,
    day1-barista-trial, day2-morning-rush, latte-art-polish, voice-audition-v2, voice-casting, voice-listening},
    fix/{audio-integration, day1-pull-through, day2-first-shift}, integrate/week1, and the same names on origin.
    NOT merged (local only, all at 4666ce9, +15 over main): overnight/2026-10-15, feat/day1-replay, feat/day2-orders,
    feat/voice-release, fix/review03, qa/cross-browser (Chapter 1 card, playtest copy, Azure voice prep, review-03
    fixes; 350b027 duplicates a commit already on main). origin/gh-pages +1 is the deploy branch.
  - Exit: on fc47916 `npm run typecheck && npm run lint && npm test` exit 0 (`Tests  493 passed (493)`).
    `npm run build` from a clean `git checkout-index` copy: exit 0, `✓ built`, `[audio-gate] ok: 0 licensed audio
    file(s) in the build`. (In this checkout the build stops at the audio gate: `7 audio file(s) in the build have no
    verified licence` — stale gitignored mp3s in `public/assets/voice/`; left for Edward, not deleted.)
    `E2E_PORT=5179 npm run test:e2e`: `22 passed (17.6m)`, exit 0. main pushed (see git log).

## Phase 1 — Playable week (UI pass)  `[!]` all agent work done; HUMAN-gated: 1C feel-test approval, Mon–Wed playtest
Goal: Trial + 5 shifts + shop + Endless feel like one game. Parallel-safe split below.

**1A Shell screens** — owns `src/ui/screens*`, `src/ui/styles/{base,title,screens,shop}.css`, `src/app/title.ts`, `src/app/weekWiring.ts`, `src/ui/settings.ts`, `src/ui/audioPanel.ts`
- [x] Title: one layout for Trial / The week / Practice / Endless / Settings; keyboard + trackpad; no scroll trap at 1024×640 or phone width.
- [x] Shift select: Mon–Fri grid with locked/open/done + best grade; shop entry; "progress won't be saved" note.
- [x] Shop: list, cents, buy/refuse, owned state, one-line effect; back.
- [x] Shift report: one component for Day 2 / week / Endless; "Next shift" / "Try again" / "Served N"; keep listening and event rows.
- [x] Settings: 4 volume buses, subtitles, learning mode, `settings.pourSensitivity` slider (default 1.0; shared key with 1C).

**1B In-service HUD** — owns `src/ui/rushHud.ts`, `src/ui/pos.ts`, `src/ui/gauges.ts`, `src/ui/hud.ts`, `src/ui/styles/{hud,rush}.css`, `src/app/rushWiring.ts`
- [x] Docket rail: arrival order, patience bar per ticket, misheard fields marked after hand-back, returning regulars by name only.
- [x] Register panel: replay / repeat / clarify with costs shown (from data tables, not hard-coded).
- [x] Event card: prompt + choices with cost; never covers the cup; keys 1–3.
- [x] Gauges: shot timer, steam temperature, two-hands state; milk label as text + icon.
- [x] Top chip: week/day or Endless, served, walk-outs.
- [x] HUD-only: no timing, cost or sim change.

**1C Latte feel** — owns `src/world/{camera,station,coffeeSurface}.ts`, `src/ui/{lesson,practiceHud,pattern}.ts`, `src/ui/styles/latte.css`, `src/sim/latte/feedback.ts` (new)
- [!] (HUMAN-only, not done by Claude: awaiting Edward's feel-test of `feat/latte-feel`, recipe in Evidence) **HUMAN** feel-test loop: each change ships with a dev URL and one line "feel-test this"; commit only after approval.
- [!] (awaiting HUMAN feel-test; built on `feat/latte-feel`, not on main) Input: `settings.pourSensitivity` curve; Space ramps flow over ~300 ms; pinch/scroll never zooms the page.
- [!] (awaiting HUMAN feel-test; built on `feat/latte-feel`, not on main) `src/sim/latte/feedback.ts`: score breakdown → one actionable tip; pure; unit-tested; shown on inspect.
- [x] Regression: Playwright replays a recorded perfect pour and asserts the score band is unchanged.
- [x] Do not change foam physics or the judge.

- [x] 1.E E2E: title → week → shop → Monday → report → next shift; Day 2 bot shift; event via keyboard; screenshots to `docs/verification/<date>-week-ui/`.
- Exit: `[!]` (HUMAN-only part not done by Claude: Edward's Mon–Wed playtest; e2e green and main pushed are done) **HUMAN** plays Mon–Wed in one sitting without asking "what do I press"; e2e green; main pushed.
- Evidence:
  - Setup (85b5ff3, 13f11a3): title wiring → `src/ui/screens/title.ts`, shift report → `src/ui/screens/shiftReport.ts`
    (pure moves so 1A and 1B never shared a file); `ListenSettings.pourSensitivity` (default 1, 0.5–2) + tests.
    Lanes ran in worktrees: 1A `feat/shell-screens`, 1B `feat/service-hud`, 1C `feat/latte-feel`, 1.E `test/week-ui-e2e`.
  - 1A (merged 71df0e5; 6 commits): title lists Day 1 / Day 2 / The week / Endless (locked with a reason until Monday
    is passed) / Practice / Settings; `menuKeys` makes Space/Enter press the focused button, Esc + Tab loop in modal
    screens, 3 px focus ring; 1024×640 no scroll, 390×844 `#title` the only scroller. Shift select: Mon–Fri grid
    (Play now / Play again / Done / Locked, best grade), café upgrades door with the till, memory-only note. Shop
    screen: price via formatCents, one-line effect, Buy/Owned, refused buy says why ("Not enough in the till: Docket
    rail costs $150.00, you have $0.00."). Report: one `renderShiftReport` for Day 2 / week / Endless, "Next shift" /
    "Try again" / "Served N", listening + event rows kept; long receipts scroll. Settings: Sound (4 buses + voices),
    Listening, Latte art (pour sensitivity slider 0.5–2 step 0.1). Lane checks: `Tests  511 passed (511)`.
  - 1B (merged 58d729c; 7 commits): rail in ticket order with a `role=meter` patience bar, misheard hand-backs marked
    (`<mark>` + "↩ Misheard: ~~soy~~ → oat"), "+N more behind the rail"; regulars (back again this shift, or in the
    save's `regulars`) show the name without the tag. Register costs from `LISTEN_COST`/`MAX_REPEATS` ("−1 s",
    "−6 s · N left", "−3 s each"). Event card: choices with key hints and `costSeconds`, keys 1–3, placed clear of
    the cup (measured at 1024×640, 390×844, 1280×800, 1024×768 × six station phases). Gauges: two-hands strip, milk as
    text + icon. Top chips: shift, served, walk-outs (clock now rolls 7:59 → 8:00). `git diff --stat
    chore/p1-ownership..feat/service-hud -- src/sim src/core src/data` → empty. Lane checks: `Tests  520 passed (520)`;
    `E2E_PORT=5202 npx playwright test tests/e2e/rush.spec.ts tests/e2e/ibis.spec.ts` → `3 passed (9.4m)`.
    Integration fix 3f96d4f: during the pour 1–3 stay the jug heights (3 = low would have picked CALL_MANAGER's
    "refuse"); regression test in `tests/ui/eventCard.test.ts`.
  - 1C (`feat/latte-feel` @ 57f3304, 8 commits, NOT merged — feel-test gate). On main: only the test commits
    85a7551 (recorded perfect pour replay, band art 0.86–0.93, findings `["textbook"]`) and addb0c4 (practice spec
    closed-loop wheel: the open-loop wheel stopped at 2.9999 cm and failed 1 run in 2). Baseline 3 runs: art
    0.8906 / 0.8952 / 0.8898. On the branch: e4eeb49 `pourTip` (pure, 18 tests), ee4797c tip on the practice review
    + lesson strip, cef4185 pinch never zooms the page, e88ea87 sensitivity gain (bit-identical at 1.0), edfaa37
    Space ramps over 300 ms. `git diff --stat chore/p1-ownership..feat/latte-feel -- src/sim/latte src/core` →
    feedback.ts (new) + pitcher.ts (input gain only); main: `git diff --stat e8ee6f6..HEAD -- src/sim src/core
    src/data` → empty. Feel-test: `cd ../nwc-p1c && npx vite --port 5195 --strictPort` → http://localhost:5195/
    (practice; `?pour=0.5` / `?pour=2`; Space vs mouse). At merge: 2-line Day 2 hook in `src/app/rushWiring.ts`
    (`pourGain`), Day 1 inspect card hook in `src/ui/screens.ts` (`pourTip`), move 3 tip strings to
    `src/data/coaching.ts`. Until then the Settings slider is saved but has no effect on main.
  - 1.E (24e6a89, 29ad2b8): `tests/e2e/weekUi.spec.ts` + `helpers/weekBot.ts` (bot reads `__trial`, acts only by
    keys/clicks/held mouse): fresh save → shop refused buy → Monday passed (seed 20: 6/6, "Cracker of a shift") →
    "Next shift" → Tuesday; Day 2 bot shift to its report (seed 7); Tuesday save (seed 1) THE_NAME answered with key
    1. Lane runs: `3 passed (8.4m)`, `3 passed (8.1m)`. Screenshots: `docs/verification/2026-10-16-week-ui/` (01–09).
  - Exit on addb0c4: `npm run typecheck && npm run lint && npm test` exit 0: `Test Files  61 passed (61)` ·
    `Tests  537 passed (537)`. `E2E_PORT=5179 npm run test:e2e`: `28 passed (24.2m)`, exit 0. main pushed. HUMAN Mon–Wed
    playtest not done (Edward).
  - Follow-ups found, not done: (1) Day 2 HUD on a phone (390×844): `#rinstr` sits on the rail, the gauge column
    clips the cup during a flat white's shot, `#ractions` hides behind the gauges (pre-existing). (2) "Bin it" sits
    under the register's "Ring it up" when a drink is on the pass and a customer is ordering. (3) Every week shift
    replays `RUSH_INTRO` ("your first paid shift") — `src/data/ownerLines.ts:38`. (4) `rush.end.excellent` says
    "Five for five" after 6/6 — `src/data/ownerLines.ts:824` (both voice lines: re-render needed). (5) Saved
    regulars never fire: nothing writes `regulars` except THE_USUAL, which needs affinity ≥ 2 (ROADMAP 3.1). (6) The
    pull-through only thins at ≥ 3.0 cm, so a wheel stop at 2.99 cm sweeps at full flow (`pitcher.ts`, Edward's
    call). (7) `src/app/input.ts` Space handler `preventDefault`s on focused buttons (worked around by `menuKeys`).

## Phase 1.5 — Polish  `[x]` five fixed; 1.5.5 and 1.5.6 `[!]` (Edward's design calls)
Goal: the seven follow-ups found in Phase 1 (Evidence above), each fixed or marked `[!]` with the reason.
Owns `src/ui/styles/{hud,rush}.css`, `src/ui/{rushHud,pos}.ts`, `src/data/ownerLines.ts` + `src/sim/owner.ts`
(copy and line keys), `src/app/input.ts`, `src/data/voice/manifest.json` (placeholder re-render, never audio).
- [x] 1.5.1 Day 2 HUD on a phone (390×844): `#rinstr` off the rail, the gauge column never clips the cup during a
      flat white's shot, `#ractions` visible beside the gauges. Screenshots before/after.
- [x] 1.5.2 "Bin it" never sits under the register's "Ring it up" (drink on the pass + a customer ordering).
- [x] 1.5.3 Week shifts after the first don't replay `RUSH_INTRO` ("your first paid shift", `src/data/ownerLines.ts:38`).
- [x] 1.5.4 `rush.end.excellent` doesn't say "Five for five" after 6/6 (or 9/9, 10/10): count-agnostic copy; Gaz
      placeholder clips re-rendered, manifest only committed.
- [x] 1.5.5 Saved regulars fire: something besides THE_USUAL (affinity ≥ 2, ROADMAP 3.1) writes `regulars`. Edward
      decided AFFINITY_RULE = yes (2026-10-18): a correct serve to a regular in a week shift adds +1 affinity
      (`core/rush/events.ts` `regularServed`, from `serve.ts`); THE_USUAL fires 888 times in 1,000 seeds × 5 saved
      shifts (overnight run #3 A5, balance diff in its commit). `RegularMemory.visits` is still never written.
- [!] (Edward's call, as Phase 1 said: it changes pour physics, which 1C says not to touch without his feel-test) 1.5.6 Pull-through thins only at ≥ 3.0 cm, so a wheel stop at 2.99 cm sweeps at full flow (`pitcher.ts`).
- [x] 1.5.7 `src/app/input.ts` Space handler no longer `preventDefault`s on focused buttons (today worked around by `menuKeys`).
- Exit: typecheck, lint, test exit 0; rush + weekUi e2e green; main pushed.
- Evidence:
  - Exit: on 44de38b (Phase 4 + 1.5 merged) `E2E_PORT=5179 npx playwright test tests/e2e/rush.spec.ts
    tests/e2e/weekUi.spec.ts` → `4 passed (12.7m)`, exit 0; full e2e on 4c08363 `28 passed (24.5m)`; main pushed.
  - 1.5.3 + 1.5.4 (47c51f4, 7312c5a): `WEEK_INTRO` (one per row of `data/week.ts`; its Monday is for week 2 on)
    and `ENDLESS_INTRO` in `src/data/ownerLines.ts`, picked by `introLines()` in `core/rush/machine.ts`; Day 2 and the
    first Monday keep `RUSH_INTRO`. Intros name no drink the station can't make (cappuccino, latte, piccolo and iced
    long black are unlocks with `playable: false`) and no head counts. Excellent needs zero walk-outs, so the line is
    "Bloody oath. Not one walked out. You might actually be good at this." `npm run voices -- --only gaz`: 13 rendered,
    manifest +13 / −1 (three Priya re-measurements put back: unrelated drift of a non-deterministic voice), no audio
    committed. `tests/core/rushIntro.test.ts` (7). Mistake: 47c51f4 went in with `rushTrace` stale (the check's exit code
    was grep's); a diff of the seed-3 event log against 1796120 showed only the excellent line's text, its clip length
    (4.032 → 4.366 s) and the wrap-up times after it changed, so 7312c5a re-recorded it. Every later commit ran a check
    script that keeps the real exit code.
  - 1.5.7 (48bd0b1, 2a6fe94): `controlOwnsSpace` (`ui/screens/keys.ts`): Space belongs to a visible focused control
    outside the play HUD; the play HUD's containers (top bars, action bars, gauges, tickets, register, event card, jug
    buttons) and the practice review's "Pour again (Space)" carry `data-play`. `tests/ui/keys.test.ts` (4). Browser
    check (scratch script, 1024×640): practice review, Tab to "Watch Gaz", Space → phase `demo`; on 1796120 the same
    keys → `pour`. Overlap for the 1C merge: `feat/latte-feel` edfaa37 edits the same Space branch (300 ms ramp).
  - 1.5.1 + 1.5.2 (6c10050): wrappers `#rtl` (tickets + instruction) and `#rbl` (gauges + buttons + jug buttons),
    `display: contents` above 720 px. Phone: instruction under the tickets, gauges in a row above the bottom line,
    buttons and jug buttons on the bottom line, clear of the middle of the screen where a finger steers the steam jug
    (a first layout put "Bin it, start again" there and the pump tap binned the drink). Desktop: while the side buttons
    show, the register moves to the top (scrolls if taller). Measured with a scratch Playwright run (seed 7, Priya's
    almond flat white, element boxes per state): 390×844 before: instruction on tickets in all 8 states, gauges over
    the buttons in grind/shot/two-hands/pour, gauges over the cup in shot/pour; after: none in ticket/grind/shot/
    two-hands. 375×667 shot/two-hands: none (before: gauges over the cup by ~29 px). 1024×640 pass + register: "Bin it"
    vs "Ring it up" gone, every other overlap as before. Left: the pour close-up still has HUD over the cup's rim (the
    cup fills the screen). Shots: `docs/verification/2026-10-17-polish/`, replaced on 2026-10-18 by exact 390×844 /
    1024×640 captures of all five items with JSON sidecars (`tests/e2e/polishEvidence.spec.ts`, Phase 6.8); the
    earlier before/after JPGs are in git history at 59b1c47.
  - 1.5.5 not done: only THE_USUAL writes `regulars`, and it needs affinity ≥ 2 that only it can raise (the Phase 4
    fuzz confirms it never fires from a fresh save; `RegularMemory.visits` is never written). Proposal for Edward:
    count a visit and +1 affinity for each correct serve to a regular, so THE_USUAL can fire from about Wednesday;
    that changes the event mix the Phase 2 curve was tuned on, so it needs a balance diff.
  - 1.5.6 not done: pour physics (Phase 1C rule: no foam-physics change without the feel-test).
  - Also: `.claude/` (subagent worktrees) is now ignored by prettier and eslint (1e9da79).

## Phase 2 — Balance  `[x]`
Goal: `npm run balance` is real and the week has a curve. Owns `src/data/{week,upgrades,events}.ts` (numbers only), `scripts/balance.ts`, `tests/helpers/{rushBot,pace}.ts`, `reports/` (gitignored).
- [x] `scripts/balance.ts`: week 1 × {novice, average, expert} × 30 seeds headless → `reports/balance.csv` (grade, tips, walk-outs, serve time, events fired, misheard rate per field).
- [x] Targets: average passes Mon–Wed first try, Thu ≈ 70 %, Fri ≈ 50 %; expert never fails; novice fails Fri. Tune patience/arrivals/prices; one commit per change with before/after rows in the body.
- [x] Event rates: no event twice in a row across 1,000 seeds; THE_USUAL only with affinity.
- [x] Unit test guards the targets with wide tolerances.
- [x] If a target needs a core change, write it to `docs/integration/balance-hook.md` and stop that item.
- Exit: [x] CSV committed as `docs/balance/<date>.csv`; test guards in place.
- Evidence:
  - Branch `balance/week1`, 10 commits: f668628 harness · ef903a5 JUST_COFFEE cooldown · cfaeabe Thursday ·
    52ae6e0 Friday · 2b323a0 prices · fab2636 curve guards · 6af8048 CSV + hook doc · 2ae2cbf e2e shop spec at
    the new prices · 692c380 scheduler remembers the last event (hook §1) · dd40dba hook doc + CSV on HEAD.
  - `npm run balance` (f668628): `playWeek` in `tests/helpers/pace.ts` plays week 1 from a fresh save the way the game
    does (weekFor → rush → finishShift, cooldowns carried, a failed shift replayed up to 3 times, the cheapest
    affordable upgrade bought between shifts) for `SKILLS` in `tests/helpers/rushBot.ts`: novice = the measured
    first-timer latency, no two hands, mishear 0.12; average = 3 s / 0.8 s, two hands, mishear 0.06; expert =
    1 s / 0.3 s, mishear 0.02 (average/expert are guesses until Phase 5). Mishear scales with the order's
    difficulty score; noticing → clarify; a missed heart pours `BOT_POUR_BLOB` (art 0.16). ~3 min, 3 workers.
    CSV columns: profile, seed, shift, day, attempt, customers, served, walkouts, refused, grade, pass,
    satisfaction, tips_cents, avg_serve_s, wasted, events, orders, misheard_drink/milk/temp/heart, cents_after,
    upgrades. Determinism: two runs → `cmp reports/balance.csv docs/balance/2026-10-16.csv` → identical (650 rows).
  - First-try pass, 30 seeds (Mon Tue Wed Thu Fri), baseline → final:
    novice 90 63 37 0 0 → 90 63 37 0 0 · average 100 100 100 97 87 → 100 100 100 80 60 · expert 100 ×5 → 100 ×5.
    Final rows (`docs/balance/2026-10-16.csv`): average Thu walk-outs 1.8 / worst 5, satisfaction 65, tips $8.33;
    Fri 2.1 / 6, 63, $8.80, tries to pass 1.6; expert Fri 0.1 / 1, 82, $12.33. Misheard (average): drink 1–4 %,
    milk 0–2 %, temp 0–1 %, heart 0–1 %. Thu 80 % = 24/30 (one standard error at 30 seeds is ~8 %); nine
    customers can't go lower without the expert failing (15→10 s: expert 97 %). Friday is steep: 15→10 s = 23 %.
  - Changes, each with before/after rows in its body: Thursday gaps 20→14 to 16→10 s (cfaeabe), Friday 18→12 to
    16→10 s (52ae6e0), prices (2b323a0): docket rail $150 → $15 (average buys it after Tue 26/30), grinder $450 →
    $30 (after Fri 27/30), steam wand $600 → $50, second group head $1,200 → $100 (inert: one group head).
    Patience (`PATIENCE_SCALE`) untouched; Monday–Wednesday rows untouched (Phase 1 e2e + the HUMAN playtest sit on them).
  - Events (ef903a5): JUST_COFFEE `cooldownShifts` 0 → 1 (every event ≥ 1 now). Baseline CSV had 20 back-to-back
    repeats in 577 pairs, all JUST_COFFEE in adjacent shifts; final CSV 0 in 509. `tests/sim/events/scheduler.test.ts`
    (1,000 seeds): no repeat in one shift or the next, every cooldown ≥ 1, THE_USUAL never without affinity and only
    for the regular who has it; failed before the fix (`seed 2, shift 4: expected 'JUST_COFFEE' not to be
    'JUST_COFFEE'`). After a shift with no events it still happened (1 week in 1,000: seed 275, QUEUE_JUMP Wed →
    none Thu → QUEUE_JUMP Fri), so with Edward's go-ahead 692c380 adds `EventLog.lastId` (carried by
    `startShiftLog`, left out of the next pick; `RushWeek.lastEvent`, `weekFor(save, cooldowns, lastEvent)`,
    `App.lastEvent` beside the page-only cooldowns). Now strict: `never fires the same event twice in a row, even
    across a quiet shift (1000 seeds)` passes (failed on seed 275 before), plus "a week shift never opens with the
    last event of the one before" (16 seeds). Balance after it: summary table unchanged (one novice run reordered).
  - Guards (fab2636): `tests/core/week/curve-{expert,average,novice}.test.ts`, seeds 1–10, first tries, ~40 s side by side:
    expert 100 ×5; average Mon–Wed ≥ 90 %, Thu 50–90 %, Fri 20–80 % and ≤ Thu; novice Fri ≤ 30 %. Today:
    expert 100 100 100 100 100 · average 100 100 100 80 50 · novice 90 70 20 0 0.
  - Exit on dd40dba: `npm run typecheck && npm run lint && npm test` exit 0: `Test Files  64 passed (64)` ·
    `Tests  544 passed (544)`. `E2E_PORT=5179 npm run test:e2e` on 6af8048: `1 failed · 27 passed (29.2m)`, the
    shop spec still buying at $450/$150 (`week.spec.ts:210`), fixed in 2ae2cbf. On dd40dba: `28 passed (24.1m)`, exit 0.
  - Findings, not done: (1) QUEUE_JUMP fired 0 times in 509 events. Not the cap (an extra poll slot was tried
    and changed nothing, so it wasn't shipped): the bots press "Take order" the moment someone steps up, so no
    line forms (`queue` ≥ 2 at 0 of 347 polls). A bot that doesn't take orders mid-drink sees it in ~10–15 % of
    events. Edward's call, balance-hook.md §2: bot register reaction time + retune, or wait for playtest numbers
    (recommended). Until then the balance runs never exercise a line at the register. (2) A failed shift still pays its tips, so a novice who retries has
    more in the till by Friday ($67) than an average player ($52). (3) The novice curve drops fast (Wed 37 %,
    Thu 0 %); with the HUMAN playtest that tells whether the novice guess or the week is off. (4) WRONG_MILK fired 2
    times: hand-backs for milk are rare when the bots hear milk 98 % right.

## Phase 3 — Voice (licensed)  `[!]` agent work done; HUMAN-gated: listen-through, paid render, actors' recordings
Goal: the day auditions are approved, a full pass renders with one command.
**HUMAN first (blocks this phase):** PROVIDER = Google Cloud TTS (Chirp 3 HD) · BUDGET_CAP_AUD = 20 · GAZ = recorded (Jiwoo and Mei recorded too, by native-speaker actors). Edward, 2026-10-16.
Owns `scripts/voices*`, `scripts/tts-*.ts`, `src/audio/**`, `src/data/voice/**` (not segments.ts), `src/dev/**`, `docs/VOICE_*.md`, `docs/AUDIO_PROVENANCE.md`.
- [x] Provider adapter: listVoices / render / estimateCost; dry-run default; refuses without `--allow-paid` + env creds.
- [x] casting.ts: one candidate per speaker, provenance `licensed_tts`, licence reference.
- [x] `npm run voices:estimate`: chars + AUD per speaker; refuses above cap.
- [x] `npm run voices:render --segments`: segments.ts + gazEvents keys → voice-cache/ (gitignored); manifest carries provenance + licence; gate accepts only licensed_tts|recorded.
- [x] Review sheet export (JSON + md) to voice-auditions/.
- [!] (HUMAN-only, not done by Claude: needs the paid render first, then reviewers; sheet from `npm run voices:sheet`) **HUMAN**: listen-through with Korean / Mandarin / Indian-English speakers; caricature check; approve or re-cast.
- [!] (HUMAN-only, not done by Claude: Edward's Google credentials and spend; release:check also needs the actors' recordings for Gaz, Jiwoo and Mei, imported with `voices:render -- --import`) **HUMAN**: run the paid render once; commit the manifest only (never audio); `npm run release:check` passes.
- [x] Ship segments: a committed segment manifest (`src/data/voice/segments.manifest.json`, provenance + licence per segment clip) that the build gate (`scripts/audio-gate.ts` via `scripts/vite-voice.ts`) keeps, `src/audio/manager.ts` (`segmentServed`, was `SEGMENTS_SERVED`) reads in production, `voices:check` covers, and `voices:render --promote` / `--import` write. It lists 0 clips today, so generated orders still use the browser voice in builds until the HUMAN steps above land; slow repeats of generated lines stay browser voice either way.
- Exit: [!] (HUMAN-only part not done by Claude: paid render, listen-through, recordings; today `voices:check --release` = 1026 errors, all placeholders) release:check green with 0 placeholders.
- Evidence:
  - Branch `voice/phase3`, 11 commits: 4cdb399 provenance (validator + build gate) · fdda4a6 CAST + TTS_BUDGET ·
    6d26a90 Google adapter + guard · 6428542 voices:estimate (+ d0616d6 lint fix) · 230d7de voices:render ·
    e9d9c67 voices:sheet · 84425bd Gaz event lines in the script · 043a2f7 docs · TODO.
  - Provenance (4cdb399): `source.provenance` 'placeholder' | 'licensed_tts' | 'recorded' (absent = placeholder, so the
    committed clips needed no rewrite). Validator: release needs licensed_tts|recorded + licence; `fake-tts`/`macos-say`
    can never be release. Gate (`scripts/audio-gate.ts`, outside the owned paths, needed by this item): keeps a release
    clip only with a licence AND provenance licensed_tts|recorded. Both new tests failed on the old code.
  - Cast (fdda4a6): Dazza en-AU-Chirp3-HD-Fenrir 1.1×, Beryl en-AU-Chirp3-HD-Gacrux 0.9×, Karen en-AU-Chirp3-HD-Kore,
    Priya en-IN-Chirp3-HD-Leda 0.95× (licensed_tts, Google Cloud terms, provisional until the listen-through); Gaz, Jiwoo,
    Mei recorded (licence pending a signed buyout). TTS_BUDGET: AU$20, US$30/1M chars, AUD/USD 1.6, free tier ignored.
  - Adapter (6d26a90): request/response shapes checked on Google's public docs 2026-10-16 (no account, no call):
    text:synthesize {input.text, voice, audioConfig MP3 + speakingRate}, no pitch (Chirp 3 HD), 5000-byte input; auth =
    OAuth token + x-goog-user-project (API key accepted but unverified). Guard: `--allow-paid` AND credentials, else a dry
    run. `voices:audition --provider google` uses it. Untested against the live service.
  - `npm run voices:estimate -- --segments`: TTS dazza 1,579 · priya 2,218 · beryl 2,464 · karen 1,338 chars →
    `total  7,599 chars  US$0.23  AU$0.36 (cap AU$20.00)`; actors: gaz 379 lines (3,262 words), mei 39 + 23 segments,
    jiwoo 35 + 31. `--cap 0.05` → `refused: AU$0.27 is over the AU$0.05 cap`, exit 1.
  - `npm run voices:render` (dry run): `131 TTS clip(s) wanted, 0 already staged, 131 to render: 5536 characters,
    ~AU$0.27 (cap AU$20.00)` / `Not rendering: dry run: add --allow-paid…`. Tests with the ffmpeg stand-in (temp manifest,
    cache, public): paid refusal writes nothing; staging + resume; promote refuses fake-tts; licensed staging promoted and
    accepted by the validator; import refused without licence + performer, recorded with them.
  - `npm run voices:sheet` → voice-auditions/review-sheet.{json,md}: 7 speakers, 258 TTS and 432 recorded lines and
    segments; actors get a file per line (`7aa0d65c.wav`, `…-slow.wav`) that `--import` accepts.
  - gazEvents (84425bd): the 75 event lines join `voiceScript()`; `npm run voices -- --only gaz` rendered 76/76
    placeholders; manifest +76 Gaz, −1 (demo.pull's old words), nothing else; `voices:check`: 584 clips, 0 errors.
    AWAITING_RENDER emptied (every line has a clip).
  - `npm run voices:check -- --release --manifest-only`: `1026 error(s)` (placeholder-in-release 584, pitch-shift 441,
    shared-voice 1): the release rules bite until the HUMAN steps land.
  - Exit checks on the TODO commit: typecheck, lint, test exit 0 (`Test Files  68 passed (68)` · `Tests  563 passed
    (563)`). `E2E_PORT=5179 npm run test:e2e`: `28 passed (24.0m)`, exit 0.
  - Mistake: 6428542 was committed with a lint error (`no-regex-spaces`); my check printed only lint's last line. Fixed in
    d0616d6; every later commit ran `typecheck && lint && test` chained to the commit.
  - Ship segments (branch `feat/ship-segments`): ecc0d4d manifest + validator · 9e7123b build gate · 20d5c54 manager ·
    61e37f2 voices:check · 05c81e7 promote/import · 3293034 `voices --prune` fix · docs.
  - Format: `{ "version": 1, "clips": [] }`; a clip is `SegmentClip` (`src/data/voice/manifest.ts`): id, characterId,
    voiceId, transcript (the segment's trimmed words), file = `segmentFile(id)`, duration, meanDb, and the line clips'
    `source`. A separate file: the line manifest's version and shape are unchanged. Validator:
    `src/data/voice/validateSegments.ts` (segment exists with the same words, file path, release-only source, no pitch
    shift or shared voice, > 0.05 s, not silent). Production serves `releaseSegmentIds()` only; development tries every
    segment. The gate change (`gateManifests()` in `scripts/vite-voice.ts`, lines ∪ segments into the unchanged
    `classifyAudio`) is outside the owned paths, needed by this item.
  - Tests (temp dirs and the ffmpeg stand-in; no audio committed): validator and serving set
    (`tests/data/segmentManifest.test.ts`); gate keeps a listed licensed segment, rejects an unlisted or unlicensed one,
    still strips only placeholders, and the build plugin on a temp project (`tests/scripts/audioGate.test.ts`); manager
    with `DEV` false: listed release segments are fetched and played, an unlisted or unlicensed one sends the whole line
    to the browser voice without a fetch, slow repeats stay browser voice; with `DEV` every segment is tried
    (`tests/audio/manager.test.ts`, the two rejection tests fail on the old manager); `voices:check` catches changed
    words, no licence, a placeholder, a missing or drifting file and an unlisted file (`tests/scripts/voicesCheck.test.ts`);
    `--promote` refuses fake-tts segments and writes licensed ones, `--import` writes Jiwoo's segment takes as recorded
    (`tests/scripts/voicesRender.test.ts`).
  - Checks: `Test Files  72 passed (72)` · `Tests  596 passed (596)`. `npm run voices:check -- --manifest-only`:
    `voices:check segments: 0/181 segments have a release clip in src/data/voice/segments.manifest.json, 0 error(s),
    0 warning(s)` (plain `voices:check` in this worktree: 596 missing-audio, as it has no voice-cache/). `npm run build`:
    `[audio-gate] ok: 0 licensed audio file(s) in the build`. e2e: not run by Claude (the maintainer runs it).
  - Found on the way: `npm run voices -- --prune` deleted voice-cache/segments/ and the paid staging in
    voice-cache/licensed/ (both look like orphans of the line manifest); fixed in 3293034. The prune pass needs macOS
    voices and has no automated test; its rule (`ownIndex`) is tested through `voices:check`.

## Phase 4 — Independent review  `[x]`
Goal: nothing shipped has only been graded by the agent that wrote it. Owns `tests/**` only.
- [x] Codex (or a fresh Claude subagent that has not seen the diffs) reviews main against the bible §20 scenarios and writes regression tests for: pause → title → new game audio; audio 404 / 10 s / 25 s never skips an order; no speech after a customer leaves; wrong milk hand-back and remake; BGM ducking and 4 sliders independent; ibis/events deterministic and never interrupt an order line; latte scored from the foam field; build with unlicensed audio fails.
- [x] Seed fuzz: week progression, generator, scheduler over 500 seeds; invariant violations reported with the seed.
- [x] Determinism grep: Math.random / Date.now / setTimeout under src/sim and src/core = 0 hits.
- [x] Verdict per area: MERGE / FIX (list) / BLOCK; fixes become ordinary tasks appended here.
- [x] 4.F1 (S2) An order clip that loads in 25 s is never voiced: the hold releases at 6 s, Gaz's nag is said,
      the late clip is dropped (`src/app/boot.ts` hold, `src/audio/manager.ts` no load timeout / newer-line drop).
- [x] 4.F2 (S3) A slow or failing reaction/walk-out clip starts after the customer has left (`manager.ts` gates
      only on `gen`; `core/rush/customers.ts` drops queued lines on `gone`, not the one in flight).
- [x] 4.F3 (S1) After pause → title, R / "Replay last line" replays the old customer's order (`stopVoice` keeps
      `lastLine`).
- [x] 4.F4 (S1) After a Hard shift the café murmur stays at the shift's level (0.034, default 0.012) on the title
      and the next Day 1 (`toTitle` never resets `setNoise`).
- [x] 4.F5 (S6) The bin chicken walks in (and honks) while a customer is mid-order on 4 of 8 bird seeds of
      Wednesday (`core/rushIbis.ts` `doorOpen` isn't gated; `sim/events/defs.ts` says "only while nobody is mid-order").
- [x] 4.F6 (S8) An unlicensed `.aiff`/`.aif`/`.caf` in `public/` builds: `scripts/audio-gate.ts` `AUDIO_FILE` lacks them.
- [x] 4.F7 (S8, latent) An mp3 imported from JS is inlined as `data:audio/…` and never reaches the gate
      (`scripts/vite-voice.ts` scans emitted files only). Nothing imports audio today.
- Evidence:
  - The "bible §20" isn't in the repo or on the Desktop; the eight scenarios listed in the item are the spec.
  - Reviewers: two fresh Claude subagents (general-purpose, own worktrees, told not to read git history, diffs or
    this file's Evidence), `tests/**` only. Both hit a network drop mid-run and were resumed with their context.
  - Scenarios (599c84f, `tests/review/`, 8 test files + 5 helpers): `harness.ts` runs the real startRush / toTitle /
    createRushLoop / rushView, audio manager, music and sfx on a recording fake AudioContext with test-controlled
    fetch timing; it copies boot.ts's frame body (voice hold, `MAX_VOICE_HOLD = 6`), so a change there must follow.
    Table — already covered → new: (1) pause→title→new game: e2e/audioState.spec.ts:89 (skips without clips) →
    pauseTitleAudio PASS (context runs, stale clip never plays, one voice, one mood, no doubled loops) + 2 FAIL
    (4.F3, 4.F4). (2) 404/10 s/25 s: audioContract.test.ts:47 (sim hold only), e2e/audioSmoke.spec.ts:237 → slowOrderAudio
    PASS for 404, 10 s, 404-after-10 s; 25 s FAIL (4.F1). (3) after leaving: audioContract.test.ts:172/:200 (sim
    only) → leftCustomerSilent PASS on time, 3 FAIL slow/failing (4.F2). (4) wrong milk: rush.test.ts:446,
    rushListening.test.ts:134 → wrongMilkRemake PASS (adds the making-mistake path). (5) ducking + 4 buses:
    e2e/music.spec.ts:25 (duck only; bus independence untested anywhere) → busesAndDuck PASS (5 tests).
    (6) events: scheduler.test.ts:59/:83, rushEvents.test.ts:76 (seed 1) → eventsDeterministic PASS + bird
    entrance FAIL (4.F5). (7) latte from the field: sim/latte.test.ts:104/:188 → latteFieldScore PASS (practice,
    Day 1, Day 2, source guard). (8) build gate: audioGate.test.ts (classifier only) → audioGateBuild PASS (real Vite
    build with the gate plugin) + 2 FAIL (4.F6, 4.F7). Failing tests were left out of the commit and handed to the
    fixes. Lane run: `Test Files 76 passed (76)` · `Tests 591 passed (591)`.
  - Fuzz (b7c2fdc, `tests/fuzz/` + `tests/helpers/fuzzRules.ts`, ~22 s): every violation collected with its seed.
    Week progression in four layers (full bot play is ~3 s per seed-week): 500 seeds × 15–25 synthetic reports
    through finishShift/nextShift/the store; 500 seeds × 5 shifts with an idle player (weeks 1–2, 3 difficulties,
    Endless every 5th); 500 seeds × 1 shift expert bot on a long-black menu (+160 Thu/Fri for CALL_MANAGER→refuse);
    12 seeds novice on the real menu. Invariants: save never mutated, one report per step; till += tips, whole
    cents, ≥ 0; pass moves one shift, disaster stays; menu only grows; only the current shift playable; served +
    walk-outs + refused = the table's count; report = what happened; events ≤ cap, ≥ 45 s apart, cooldowns, none
    while an order is said; deterministic re-runs. Generator: 500 seeds over the u32 range × 3 difficulties ×
    shifts 0–9: valid playable recipes, segments from the speaker's own phrasebook, text = joined segments, segment
    order, a/an, change-of-mind consistency, no repeat transcript in a week shift. Scheduler (new rules beside the
    1,000-seed test): each event only under its own rule (written from data/events.ts, checked against
    canTrigger), log = picks, caps over two weeks, every choice resolves to a sound outcome, bird booking never on
    Monday/Endless. Result: 0 violations.
  - Determinism (f5ebe60): `grep -rn "Math\.random\|Date\.now\|setTimeout\|setInterval\|performance\.now\|new
    Date" src/sim src/core` → no output, exit 1 (0 hits). `tests/lint/corePurity.test.ts`: 54 lint probes over 9
    locations in src/sim and src/core, plus a TypeScript-AST scan of every file (comments can't hide a call; also
    catches `Date['now']`, `performance.now`, `new Date()`, `globalThis.setTimeout`, `requestAnimationFrame`,
    `queueMicrotask`, `crypto.getRandomValues`, which lint alone misses) with a planted-hit self-test: 0 hits.
  - Integrated on test/phase4-review: `Test Files  82 passed (82)` · `Tests  663 passed (663)` (62.8 s).
  - Verdicts: week progression, generator, scheduler, determinism MERGE. S4 wrong milk, S5 buses/ducking, S7 latte
    MERGE. S1 pause→title MERGE with two low fixes (4.F3, 4.F4). S2 slow audio FIX (4.F1). S3 after leaving FIX
    (4.F2). S6 events FIX, low-medium (4.F5; determinism and the shift-event order window hold). S8 build FIX
    (4.F6, 4.F7). No BLOCK: no unlicensed audio is in the repo today.
  - Fixes (two more fresh subagents, worktrees `fix/p4-audio`, `fix/p4-gate`, each starting from the reviewer's failing
    tests; merged 068c55a, 933e633). 4.F1 d2cd928: a clip still loading after `LOAD_TIMEOUT` 12 s (audio clock, so
    paused time doesn't count) goes to the browser voice like a 404 and the late clip is dropped (the 10 s case
    still plays its clip; the nag comes at ~24 s). 4.F2 a3e0bdb: core emits `gone` as a customer leaves, rushView
    calls `audio.stopSpeaker(id)` (stops their line only if it's current); rushTrace re-recorded — with `gone` filtered
    out the old hashes reproduce, so no behaviour moved. 4.F3 2c7f23d: `stopVoice({ forget: true })` from `toTitle`.
    4.F4 f5fb955: `toTitle` restores `DEFAULT_NOISE`. 4.F5 1497280: `IbisInput.midOrder` from `orderLineDue(r)`
    (an order or answer being said or queued) keeps the bird outside; on the instant bot some entrances move later
    (≤ 17 s, 30.6 → 47.8 s); the balance sim never steps the bird, so `reports/balance.csv` is byte-identical to
    `docs/balance/2026-10-16.csv` (first-try pass unchanged: novice 90 63 37 0 0, average 100 100 100 80 60,
    expert 100 ×5). 4.F6 323b1e5: `AUDIO_FILE` adds `aif|aiff|aifc|caf`. 4.F7 497e2ee: the gate plugin never inlines
    audio (an audio import becomes a file the gate checks; a hashed name has no licence entry, so audio imported
    from code is rejected and shippable audio lives in `public/`) and fails the build on `?inline`/`?raw` audio.
    All `.failing` tests merged into their passing files. On 933e633: `Test Files  82 passed (82)` ·
    `Tests  686 passed (686)`. Lane e2e (audio/rush/ibis/week specs) failed under load averages 22–50 from four
    parallel lanes (frame-rate and time-limit failures, "Dazza never reached the register" in 15 s). Run alone on
    main 4c08363 (all four lanes merged): `E2E_PORT=5179 npm run test:e2e` → `28 passed (24.5m)`, exit 0.
  - Left: while foraging, the bird's honk every 5 s can still land over an order line (the reviewer's test covers the
    entrance only). With the test-only `timeScale` above ~2×, the 12 s audio fallback can come after Gaz's nag.
  - Not failures, noted by the fuzz: THE_USUAL can never fire from a fresh save (only THE_USUAL raises affinity,
    and `RegularMemory.visits` is never written; see 1.5.5); WRONG_MILK fired 0 times in 12 novice seeds; in week 2+
    `shiftRows` reports the playable shift as `done` (cosmetic: `shiftCells` uses `canPlay`).

## Phase 5 — Playtest #1  `[~]` local telemetry done; HUMAN playtest next
- [ ] **HUMAN**: 3–5 people (working-holiday makers / international students ideal), Trial + Mon–Wed, 30 min each. Notes in `docs/playtests/<date>.md`: where they got stuck, pardons per order, walk-outs, "one more shift?" yes/no.
- [x] Local telemetry (ROADMAP 0.8): served, accuracy per field, pardons, walk-outs, time-to-serve, quit point; "Export log" in settings. Telemetry has no transport; the game fetches its own static assets.
- [ ] Fix list from the notes becomes Phase 6 tasks.
- Evidence:
  - Telemetry (branch `feat/telemetry`, a fresh subagent; merged 4c08363): cc443b7 `takenAt` on each rush customer
    (`core/rush/register.ts`, the only core change; trace hashes unchanged) · f0f6eb4 pure records
    (`src/sim/telemetry.ts`) · e552167 store · de68a89 recorder + Settings · d9c8b35 docs.
  - Record (`{version: 1, records}`, one list): every record has `id`, `session` (page load), `startedAt`/`endedAt`
    (ISO, passed in from `src/app`), `ending` finished | restarted | title | closed. Shift: mode (day2 | week |
    endless), week, shiftIndex, seed, difficulty, customers, served, walk-outs (and where: queue / register /
    ordering / ticket), refused, hand-backs, accuracy per field (drink, milk, temp, heart: total/correct, from what
    was rung up), pardons (replays, repeats, questions), time-to-serve and register wait (each value + mean, median,
    max; game seconds), events (id, at), grade, satisfaction, tips (integer cents), quit point (phase, service time,
    served, walk-outs, in the café, station) and one row per visit. Trial: attempts (art, valid, band, fault),
    verdict, score, seconds, quit point (phase, attempt). Register wait answers the open question on QUEUE_JUMP.
  - Storage: `nwc.telemetry.v1` (`src/core/save/telemetry.ts`), outside SaveV2 (no migration), capped at 200,
    corrupt JSON → empty log, memory-only if storage is blocked. Recorder `src/app/telemetry.ts`: opens on shift /
    trial start, closes on summary, restart, "Title screen", and `pagehide` / hidden (written as `closed`, replaced if
    the player comes back). Settings → "Playtest log": "Saved on this device only; nothing is sent anywhere.", a
    count, Export log (Blob download `no-wukkas-log-YYYY-MM-DD.json`), Clear log (asks twice). Telemetry has no transport (no fetch,
    XMLHttpRequest, sendBeacon or WebSocket in any telemetry file); the game fetches its own static assets
    (voice clips in `audio/manager.ts`; the dev-only review pages fetch their own files). Dev handle `window.__trial.telemetry`.
  - Tests: `tests/sim/telemetry.test.ts` (19: misheard milk counts against milk only, pardons of a walk-out,
    time-to-serve, register wait, walk-outs by stage, quit point, week + events, Endless, trial, log cap/corrupt/
    version; headless rushBot shifts whose totals equal `r.summary`), `tests/core/save/telemetry.test.ts` (6),
    `tests/app/telemetry.test.ts` (7), `tests/core/rushRegisterWait.test.ts` (1). Lane: `Tests  607 passed (607)`.
    The subagent checked it in a browser (quit to title and page close wrote the right records; 390 px no
    horizontal scroll; export saved the file; Tab order). Not checked: iOS Safari's download (some versions open the
    JSON in a tab). One log per browser: Clear between testers, or one device each. A customer who walks out at the
    register is counted, but their wait isn't in the register-wait numbers.
  - Run checks on main 4c08363 (Phase 4 fixes, 1.5, ship segments, telemetry merged): `npm run typecheck && npm run
    lint && npm test` exit 0, `Test Files  90 passed (90)` · `Tests  752 passed (752)`. `E2E_PORT=5179 npm run
    test:e2e` → `28 passed (24.5m)`, exit 0. `npm run build` from a clean `git checkout-index` copy: exit 0,
    `[audio-gate] ok: 0 licensed audio file(s) in the build`. `npm run voices:check -- --manifest-only`: 596 clips,
    0 errors; segments 0/181 with a release clip, 0 errors. Merge notes: the review harness builds `App` by hand, so
    it gained the telemetry (memory store) at the merge; rushTrace re-recorded once at the 1.5 merge (hashes with
    `gone` filtered out equal the 1.5 branch's).

## Phase 6 — Fixes: review 2026-10-17, then playtest  `[~]` review fixes done (overnight run #3, review 2026-10-18); playtest fixes wait for Phase 5
Source: `docs/reviews/2026-10-17-main-1a54a00.md` (its ten red tests were the acceptance criteria; merged into main as
8333240) and `docs/QA_SCENARIOS.md`. Decisions (Edward, 2026-10-18): AFFINITY_RULE = yes, SEGMENT_GATE = yes.
- [x] 6.1 (a3ff4e5) P1 `voices --prune` never follows symlinks out of the cache: `listClips` uses lstat, skips links, and
      lists only files whose real path is inside the cache's real path (review §10).
- [x] 6.2 (a16fde9, ef9071d) P2 subtitles start when the voice does (a clip's first sample, the browser voice's start
      event, or at once when nothing will be heard) and stop with it; voices off mid-line keeps the words (review §2).
- [x] 6.3 (66283fe) P2 one deadline on the AUDIO clock for a loading line: sim hold = `audio.loading` (LOAD_TIMEOUT 12 s
      of AudioContext time); the 6 s game-clock cap is gone, in boot.ts and its review-harness copy (review §2).
- [x] 6.4 (14827e0) P2 ibis: honks and look-ups wait while an order or answer could start (someone entering, queueing,
      at the register or counter, or a listening line due); the week books the bird at `IBIS.chance` 0.30 (review §6).
- [x] 6.5 (7586668) THE_USUAL reachable: +1 affinity per correct serve to a regular in a week shift (1.5.5; review §7).
      The review's "THE_USUAL remains unreachable" test asserted the defect; Edward approved inverting it in place.
      DECISIONS Q1: the review session re-issued it as an AFFINITY_RULE test (28eb1b4), green on 6941c37.
- [x] 6.6 (cd28b37) a placeholder in the segment manifest fails the build instead of being stripped (review §5).
- [x] 6.7 (59b1c47) "telemetry has no transport; the game fetches its own static assets", not "no network" (review §8).
- [x] 6.8 (1e34e0c) Phase 1.5 evidence: all five items at exact 390×844 / 1024×640 with JSON sidecars (review §9).
- Review 2026-10-18 (`docs/reviews/2026-10-18-main-6941c37.md`, branch `chore/review-main-6941c37`, 4 red):
- [x] 6.9 (0a52ec4) P2 F1 closing Settings while a key change waits stops waiting: the next gameplay key is neither
      taken as the binding nor preventDefault'ed (`bindKeys` returns a cancel that `close()` calls).
- [x] 6.10 (4d33c22) P2 F2 a clip started on a suspended AudioContext (paused, or the browser stopped audio) fires its
      subtitle's onStart on the first frame the context runs, once; a line stopped meanwhile never starts.
- [x] 6.11 (8ca1287) P3 F3 "Usual keys" restores the three bindings (the generic Settings button loop no longer
      replaces its handler with close).
- Review 2026-10-18 of 0cae2cf (`docs/reviews/2026-10-18-main-0cae2cf.md`, branch `chore/review-main-0cae2cf`, 6 red):
- [x] 6.12 (d8be91a) P2 F4 a clip or segment line cancelled while the AudioContext is suspended (stopVoice, quit to
      title, a customer gone, a newer line) is cut at once instead of fading over 60 ms after resume (`stopSource`,
      `src/audio/voiceLines.ts`).
- Review 2026-10-18 of 157329e (`docs/reviews/2026-10-18-main-157329e.md`, branch `chore/review-main-157329e`, 4 red):
- [x] 6.13 (todo.md T2.8) P2 F5 a line a newer one was still fading out when audio stopped is taken off the output
      by a cancel on the suspended context (quit to title, stopVoice), so its fade's tail no longer plays on resume
      (`stopSource` disconnects every source in `fading` when the context isn't running, `src/audio/voiceLines.ts`).
- [ ] (playtest fixes, filled from Phase 5)
- Evidence:
  - Unit: `npm run typecheck && npm run lint && npm test` at ef9071d → exit 0, `Test Files  96 passed (96)` ·
    `Tests  787 passed (787)` (baseline on 8333240: 95 files, 10 failed / 765 passed). Never piped through grep.
  - Review acceptance, each green: independentPrune 2/2; independentSlowAudio 8/8 (25 s load heard at 1×/2×/3× via the
    browser voice at 18.05 s; 10 s clip and its caption both at 16.05 s); independentFuzz ibis 3/3 (Day 2 134/500 =
    26.8 %, week shift 3 and index 3 both 159/500 = 31.8 %, 0 overlaps, honks 634 / 427 / 408), PROPOSED RULE green,
    THE_USUAL 888 in 1,000 seeds × 5 saved shifts (4,112 shifts wrote affinity without it); independentGate 5/5.
  - Browser probes `E2E_PORT=5201 npx playwright test --config tests/review/playwright.probes.config.ts` (66283fe):
    3 passed; the caption follows the clip's start by 0.011 s (1×), 0.048 s (2×), 0.027 s (3×) (was 10.02 s ahead).
  - Balance (30 seeds): A4 moved events/shift by −0.1 in three rows and one satisfaction by −1; A5 raised Wed–Fri
    events/shift (e.g. average Thursday 1.3 → 1.8, THE_USUAL now fires). First-try pass, walk-outs and tries
    unchanged in every row. Full rows in the 14827e0 and 7586668 commit bodies.
  - rushTrace (`node --import ./tests/review/nodeReviewLoader.mjs tests/review/recomputeRushTrace.ts`) at ef9071d:
    all seven SHA-1s equal the review's 1a54a00 values (normal c565b78d…, hard 884d6e21…, easy f4065c58…, aids
    dbbb5640…, misheard 9cb0c129…, hurry d975462d…, idle 90a50992…).
  - Build: clean `git archive ef9071d` export (node_modules linked), `npm run build` exit 0, `[audio-gate] ok: 0
    licensed audio file(s) in the build`. The in-checkout build fails on nine old untracked placeholder renders in
    the gitignored `public/assets/voice/` (no provenance): the gate doing its job on local files, left for Edward.
  - E2E at ef9071d: `E2E_PORT=5202 npx playwright test --config tests/review/playwright.ipv6.config.ts` → exit 0,
    `28 passed (30.5m)`, `7 skipped` (tests/e2e/polishEvidence.spec.ts, which runs only with POLISH_SHOTS set).
    Serial, nothing else running beside it; the unrelated server on 127.0.0.1:5196 and the dev server on [::1]:5183
    were left alone.
  - Seen, not fixed: the milk gauge's target card reads 55–65 °C even for an extra-hot order (68–74 °C,
    `ui/gauges.ts` TARGET_TEMP); the register panel on a 390-px phone covers the instruction line behind it.
  - Not done (overnight run #3; full list and questions in `docs/integration/RUN3_REPORT.md`): Day 1 trial and
    practice subtitles still start on request, not with the voice (A2 covered the rush and Replay); the review harness
    still copies boot's setPaused/resumeAll/replay (B1 shared the frame); the in-checkout build stops on nine old
    untracked renders in `public/assets/voice/`; `RegularMemory.visits` is never written; the subtitle box at Medium
    on a 390-px phone is 1 px over each side. One reviewer test was edited, with Edward's in-session approval: the
    THE_USUAL "remains unreachable" test, inverted in 7586668.
  - Review 2026-10-18 fixes (6.9–6.11, on `fix/review-6941c37` after merging `chore/review-main-6941c37`): the four
    reviewer tests red before (independentKeys 2, independentPausedCaptions 2), green after; no reviewer test edited.
    One impl regression test added in `tests/audio/manager.test.ts` ("a clip landing while paused …"): red without
    4d33c22 (`expected [ 'start' ] to deeply equal []`), green with it. `npm run typecheck && npm run lint && npm
    test` at 4d33c22 → exit 0, `Test Files  99 passed (99)` · `Tests  803 passed (803)`. E2E at 4d33c22:
    `E2E_PORT=5202 npm run test:e2e -- --config tests/review/playwright.ipv6.config.ts` → exit 0, `28 passed
    (26.7m)`, `17 skipped` (the opt-in evidence specs). Not on a device: iPhone Safari key remap and an iOS audio
    interruption are untested. With the context suspended and the game running, a clip line's caption now waits for
    audio; boot.ts resumes audio on any pointerdown/keydown, as the "blocked sound" toast says.
  - 6.12 (todo.md T2.1, on `fix/review-0cae2cf` after merging `chore/review-main-0cae2cf`): the six reviewer tests in
    `tests/review/independentSuspendedCancellation.test.ts` red before, green after (8/8; with independentKeys and
    independentPausedCaptions 15/15); no reviewer test edited. `npm run typecheck && npm run lint && npm test` at
    b78c3a4 → exit 0, `Test Files  100 passed (100)` · `Tests  813 passed (813)`. E2E at b78c3a4:
    `E2E_PORT=5202 npm run test:e2e -- --config tests/review/playwright.ipv6.config.ts` → exit 0, `28 passed
    (27.8m)`, `17 skipped` (the opt-in evidence specs).
  - 6.13 (todo.md T2.8, on `feat/m2-leftovers` after merging `chore/review-main-157329e` 0b72172): the four F5 tests in
    `tests/review/independentSuspendedCancellation.test.ts` red before, green after (with `tests/audio/manager.test.ts`:
    39/39); no reviewer test edited. `npm run typecheck && npm run lint && npm test` → exit 0, `Test Files  100 passed
    (100)` · `Tests  823 passed (823)`. rushTrace's seven hashes unchanged (normal c565b78d…, idle 90a50992…).
    E2E: at the M2 gate.

## Phase 7 — Ship prep  `[ ]`
- [ ] Performance pass against AGENTS.md §7 on a mid-range Android and an iPhone (Safari audio unlock, pinch).
- [x] Accessibility: subtitle toggle, text size, colour-blind-safe milk labels, reduced motion, remappable keys
      (overnight run #3 B3, branch `feat/a11y`: dfc294c reduced motion, e94f7ff subtitles switch, b09615f text size,
      a163a66 milk shape + name, then the keys commit: save v3 with a v2 → v3 migration test). Evidence:
      `docs/verification/2026-10-18-a11y/` (exact 390×844 and 1024×640, a JSON sidecar per capture,
      `tests/e2e/a11yEvidence.spec.ts`, opt-in with A11Y_SHOTS). Not on a device: iPhone Safari is untested.
      Review 2026-10-18 found two key-remap defects (F1, F3), fixed in 6.9 and 6.11.
- [~] Steam wrapper spike (Tauri): Windows build, save path, controller/Steam Deck input map; go/no-go note in `docs/STEAM.md`.
      Research note written (overnight run #3 B4, sources cited, unverified points marked); no scaffold: `cargo`
      isn't installed and no toolchain was installed. The go/no-go waits on Edward's three questions at its end.
- [ ] Deploy: static host + custom domain, OG image, privacy-friendly analytics.
- [~] Devlog: architecture (pure sim + seeded RNG + headless balance) and playtest learnings.
      Architecture drafted in `docs/DEVLOG.md` with one Mermaid diagram (overnight run #3 B5); playtest learnings wait
      for Phase 5.
- Evidence:
  - Overnight run #3 (Part B): B1 frame driver 9f05502 · B3 accessibility c1b6f17 · B2 audio manager split 2dd94b1 ·
    B4 docs/STEAM.md cbd465b · B5 docs/DEVLOG.md e2c9c94 · B6 housekeeping 89e4214. Unit 97 files / 797 tests, 0
    failed; rushTrace's seven hashes unchanged through B1 and B2; final E2E and the report:
    `docs/integration/RUN3_REPORT.md`.
  - Not done: nothing on a device (iPhone Safari, Android, Steam Deck); Steam is research only (no `cargo`, no
    scaffold, no decision); the devlog has no playtest learnings; no branch was deleted in B6 (this file's "never
    delete branches" rule; the 21 merged branches are listed in the report); performance pass and deploy untouched.

---

## Parked (not before Phase 7)
- Jasmine Rush / tea queue, branches as levels, Karen as recurring boss, rival café, staff hiring, seasonal events, extra endings (bible ch. 12+, ROADMAP 3–4).
- Economy port from the prototype (cars/homes/Mosman) — superseded by tips + upgrades.

## Open questions for the human
- Event cooldowns across sessions: currently page-only (decision 2-A). Revisit after Phase 5.
- Register reaction time for the balance bots (QUEUE_JUMP never fires while they take orders instantly): decided (b),
  wait for Phase 5 numbers (balance-hook.md §2). Phase 5 should log how long players leave someone at the register.
- Upgrade prices: set in Phase 2 from an average player's tips (rule in `src/data/upgrades.ts`). Revisit with Phase 5 numbers.
- Segment clips: rendered (TTS) or scripted for the actors in Phase 3. They ship once promoted or imported into `src/data/voice/segments.manifest.json`; it lists 0 today, so generated orders use the browser voice in builds.
- Google's Service Terms §20(d) (Generative AI Services, under-18 restriction): does it cover Chirp 3 HD? Edward to check before shipping TTS clips (docs/VOICE_PROVIDERS.md).
