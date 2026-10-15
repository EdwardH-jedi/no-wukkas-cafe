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

## Phase 0 — Consolidate (sequential, do first)  `[ ]`
Goal: one branch, one build, no large files that every task must touch.

- [ ] 0.1 Merge `origin/chore/merge-day1-pull-through` into `main` (no-ff), run unit + e2e, push.
- [ ] 0.2 Split `src/main.ts` (≈1,180 lines) into `src/app/{boot,title,trialWiring,rushWiring,weekWiring}.ts`,
      each ≤ 300 lines; `src/main.ts` ≤ 60 lines. Pure refactor, exported names unchanged.
- [ ] 0.3 Split `src/ui/styles.css` (≈1,600 lines) into `src/ui/styles/{base,title,hud,rush,latte,shop,screens}.css`
      with one index import. Pure refactor; screenshot diff before/after at 1024×640.
- [ ] 0.4 `vitest` `testTimeout` is 20 s (done in run #2) — confirm it is in the config, not per-test.
- [ ] 0.5 Delete nothing, but list stale branches in the report (feat/voice-listening, old fix/*).
- Exit: `npm run build` ok, e2e green, main pushed.
- Evidence:

## Phase 1 — Playable week (UI pass)  `[ ]`
Goal: Trial + 5 shifts + shop + Endless feel like one game. Parallel-safe split below.

**1A Shell screens** — owns `src/ui/screens*`, `src/ui/styles/{base,title,screens,shop}.css`, `src/app/title.ts`, `src/app/weekWiring.ts`, `src/ui/settings.ts`, `src/ui/audioPanel.ts`
- [ ] Title: one layout for Trial / The week / Practice / Endless / Settings; keyboard + trackpad; no scroll trap at 1024×640 or phone width.
- [ ] Shift select: Mon–Fri grid with locked/open/done + best grade; shop entry; "progress won't be saved" note.
- [ ] Shop: list, cents, buy/refuse, owned state, one-line effect; back.
- [ ] Shift report: one component for Day 2 / week / Endless; "Next shift" / "Try again" / "Served N"; keep listening and event rows.
- [ ] Settings: 4 volume buses, subtitles, learning mode, `settings.pourSensitivity` slider (default 1.0; shared key with 1C).

**1B In-service HUD** — owns `src/ui/rushHud.ts`, `src/ui/pos.ts`, `src/ui/gauges.ts`, `src/ui/hud.ts`, `src/ui/styles/{hud,rush}.css`, `src/app/rushWiring.ts`
- [ ] Docket rail: arrival order, patience bar per ticket, misheard fields marked after hand-back, returning regulars by name only.
- [ ] Register panel: replay / repeat / clarify with costs shown (from data tables, not hard-coded).
- [ ] Event card: prompt + choices with cost; never covers the cup; keys 1–3.
- [ ] Gauges: shot timer, steam temperature, two-hands state; milk label as text + icon.
- [ ] Top chip: week/day or Endless, served, walk-outs.
- [ ] HUD-only: no timing, cost or sim change.

**1C Latte feel** — owns `src/world/{camera,station,coffeeSurface}.ts`, `src/ui/{lesson,practiceHud,pattern}.ts`, `src/ui/styles/latte.css`, `src/sim/latte/feedback.ts` (new)
- [ ] **HUMAN** feel-test loop: each change ships with a dev URL and one line "feel-test this"; commit only after approval.
- [ ] Input: `settings.pourSensitivity` curve; Space ramps flow over ~300 ms; pinch/scroll never zooms the page.
- [ ] `src/sim/latte/feedback.ts`: score breakdown → one actionable tip; pure; unit-tested; shown on inspect.
- [ ] Regression: Playwright replays a recorded perfect pour and asserts the score band is unchanged.
- [ ] Do not change foam physics or the judge.

- [ ] 1.E E2E: title → week → shop → Monday → report → next shift; Day 2 bot shift; event via keyboard; screenshots to `docs/verification/<date>-week-ui/`.
- Exit: **HUMAN** plays Mon–Wed in one sitting without asking "what do I press"; e2e green; main pushed.
- Evidence:

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
