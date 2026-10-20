# Milestones to first release

The plan lives in `todo.md` (repo root): milestones M1–M7, each with its tasks, verify lines, `Gate (Edward):` line and
`Done when:`. This file keeps a one-line status per milestone and the rules below; `docs/TODO.md` is the evidence
archive. Sessions: `impl` (src/), `review` (tests/, docs/; runs Codex), `plan` (run once per milestone change: `claude -p docs/agents/PLAN_REVIEW.md`).

Status on 2026-10-21, in todo.md's numbering:

- M1 Core loop, headless: done.
- M2 Review fixes + decision-free leftovers: done. Edward gate open: feel-test `feat/latte-feel` (1C), 1.5.6 pull-through threshold.
- M3 Playtest-ready build: done. Edward gate open: `npm run deploy -- --push`, analytics provider, iPhone Safari + Android pass, 3–5 testers → `docs/playtests/<date>.md`.
- M4 Leaderboard (local): done. Edward gate open: online leaderboard yes/no.
- M5 Release prep (v0.1.0): done. Edward gate open: paid TTS render + listen-through, actors' takes, Q6 Steam, domain + analytics, device pass, `git push origin v0.1.0`.
- M6 Decision fixes (Q2–Q5, Q7): done.
- M7 Housekeeping before the playtest build: **current**, merged except T7.1 (branch deletes wait on Edward). Edward gate: push `main`.

Rules: a milestone starts only when its HUMAN gate is cleared or explicitly waived in DECISIONS.md. The review session
never starts a milestone; it only closes one.

Notes: the old M0–M7 table (M0 review fixes from 2026-10-17 … M7 first public web release) numbered milestones
differently from todo.md and is retired; `git log -p -- docs/MILESTONES.md` has it.
