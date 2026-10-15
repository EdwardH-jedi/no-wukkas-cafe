# No Wukkas Café — TODO (docs/TODO.md)

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

## Phase 2 — Balance  `[ ]`
Goal: `npm run balance` is real and the week has a curve. Owns `src/data/{week,upgrades,events}.ts` (numbers only), `scripts/balance.ts`, `tests/helpers/{rushBot,pace}.ts`, `reports/` (gitignored).
- [ ] `scripts/balance.ts`: week 1 × {novice, average, expert} × 30 seeds headless → `reports/balance.csv` (grade, tips, walk-outs, serve time, events fired, misheard rate per field).
- [ ] Targets: average passes Mon–Wed first try, Thu ≈ 70 %, Fri ≈ 50 %; expert never fails; novice fails Fri. Tune patience/arrivals/prices; one commit per change with before/after rows in the body.
- [ ] Event rates: no event twice in a row across 1,000 seeds; THE_USUAL only with affinity.
- [ ] Unit test guards the targets with wide tolerances.
- [ ] If a target needs a core change, write it to `docs/integration/balance-hook.md` and stop that item.
- Exit: CSV committed as `docs/balance/<date>.csv`; test guards in place.
- Evidence:

## Phase 3 — Voice (licensed)  `[ ]`
Goal: the day auditions are approved, a full pass renders with one command.
**HUMAN first (blocks this phase):** PROVIDER = ____ · BUDGET_CAP_AUD = ____ · GAZ = recorded | licensed_tts.
Owns `scripts/voices*`, `scripts/tts-*.ts`, `src/audio/**`, `src/data/voice/**` (not segments.ts), `src/dev/**`, `docs/VOICE_*.md`, `docs/AUDIO_PROVENANCE.md`.
- [ ] Provider adapter: listVoices / render / estimateCost; dry-run default; refuses without `--allow-paid` + env creds.
- [ ] casting.ts: one candidate per speaker, provenance `licensed_tts`, licence reference.
- [ ] `npm run voices:estimate`: chars + AUD per speaker; refuses above cap.
- [ ] `npm run voices:render --segments`: segments.ts + gazEvents keys → voice-cache/ (gitignored); manifest carries provenance + licence; gate accepts only licensed_tts|recorded.
- [ ] Review sheet export (JSON + md) to voice-auditions/.
- [ ] **HUMAN**: listen-through with Korean / Mandarin / Indian-English speakers; caricature check; approve or re-cast.
- [ ] **HUMAN**: run the paid render once; commit the manifest only (never audio); `npm run release:check` passes.
- Exit: release:check green with 0 placeholders.
- Evidence:

## Phase 4 — Independent review  `[ ]`
Goal: nothing shipped has only been graded by the agent that wrote it. Owns `tests/**` only.
- [ ] Codex (or a fresh Claude subagent that has not seen the diffs) reviews main against the bible §20 scenarios and writes regression tests for: pause → title → new game audio; audio 404 / 10 s / 25 s never skips an order; no speech after a customer leaves; wrong milk hand-back and remake; BGM ducking and 4 sliders independent; ibis/events deterministic and never interrupt an order line; latte scored from the foam field; build with unlicensed audio fails.
- [ ] Seed fuzz: week progression, generator, scheduler over 500 seeds; invariant violations reported with the seed.
- [ ] Determinism grep: Math.random / Date.now / setTimeout under src/sim and src/core = 0 hits.
- [ ] Verdict per area: MERGE / FIX (list) / BLOCK; fixes become ordinary tasks appended here.
- Evidence:

## Phase 5 — Playtest #1  `[ ]`
- [ ] **HUMAN**: 3–5 people (working-holiday makers / international students ideal), Trial + Mon–Wed, 30 min each. Notes in `docs/playtests/<date>.md`: where they got stuck, pardons per order, walk-outs, "one more shift?" yes/no.
- [ ] Local telemetry (ROADMAP 0.8): served, accuracy per field, pardons, walk-outs, time-to-serve, quit point; "Export log" in settings. No network.
- [ ] Fix list from the notes becomes Phase 6 tasks.
- Evidence:

## Phase 6 — Fixes from playtest  `[ ]`
- [ ] (filled from Phase 5)
- Evidence:

## Phase 7 — Ship prep  `[ ]`
- [ ] Performance pass against AGENTS.md §7 on a mid-range Android and an iPhone (Safari audio unlock, pinch).
- [ ] Accessibility: subtitle toggle, text size, colour-blind-safe milk labels, reduced motion, remappable keys.
- [ ] Steam wrapper spike (Tauri): Windows build, save path, controller/Steam Deck input map; go/no-go note in `docs/STEAM.md`.
- [ ] Deploy: static host + custom domain, OG image, privacy-friendly analytics.
- [ ] Devlog: architecture (pure sim + seeded RNG + headless balance) and playtest learnings.
- Evidence:

---

## Parked (not before Phase 7)
- Jasmine Rush / tea queue, branches as levels, Karen as recurring boss, rival café, staff hiring, seasonal events, extra endings (bible ch. 12+, ROADMAP 3–4).
- Economy port from the prototype (cars/homes/Mosman) — superseded by tips + upgrades.

## Open questions for the human
- Event cooldowns across sessions: currently page-only (decision 2-A). Revisit after Phase 5.
- Upgrade prices are TODO(balance) until Phase 2.
- Segment clips: generated orders fall back to browser speech until Phase 3 renders them.
