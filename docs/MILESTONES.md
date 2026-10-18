# Milestones to first release

One line per milestone, with the test that says it is done and the HUMAN gates in front of it. Detail lives in
docs/TODO.md for the **current** milestone only; later ones stay at this level until they are next.
Sessions: `impl` (src/), `review` (tests/, docs/; runs Codex), `plan` (run once per milestone change: `claude -p docs/agents/PLAN_REVIEW.md`).

| # | Milestone | Done when | HUMAN gate before it | Status |
| --- | --- | --- | --- | --- |
| M0 | Review fixes from 2026-10-17 | 0 red reviewer tests on main; rushTrace unchanged | — | done (ce38986) |
| M1 | Codex re-review of 1a54a00..ce38986 | new review on main, every FAIL has a red test, Q1 re-issued | Edward answers DECISIONS Q1–Q5 | **current** |
| M2 | Playtest-ready build | M1 green; in-checkout `npm run build` passes (Q3); dev URL on phone | feel-test of `feat/latte-feel` (Edward) | next |
| M3 | Playtest #1 | docs/playtests/<date>.md with 3+ sessions; Phase 6 list derived | 3–5 playtesters, 30 min each (Edward) | — |
| M4 | Fixes from playtest | Phase 6 items each with a test; Codex review green | — | — |
| M5 | Voice: licensed clips | `npm run release:check` passes with real clips; listen-through done | paid TTS render + actors' takes + listen-through (Edward) | — |
| M6 | Ship prep | Phase 7: perf on 2 devices, a11y done (partly ce38986), STEAM.md decision (Q6), deploy, devlog | device testing, domain, Steam decision (Edward) | — |
| M7 | First public web release | static host live; OG image; analytics; tag v0.1.0 | Edward presses go | — |

Rules: a milestone starts only when its HUMAN gate is cleared or explicitly waived in DECISIONS.md. The review session
never starts a milestone; it only closes one.
