Run once per milestone change: `claude -p "$(cat docs/agents/PLAN_REVIEW.md)"` from the repo root. Read-only except docs/.

Read docs/MILESTONES.md, docs/TODO.md, docs/ROADMAP.md, docs/DECISIONS.md, the latest docs/reviews/*.md and
docs/integration/RUN*_REPORT.md. Then:
1. Does the current milestone's "Done when" match what TODO.md actually lists? List mismatches.
2. Are any items in the current milestone really HUMAN-gated but not marked? List them.
3. Fact-check external claims with the web (Steam/Tauri requirements, Google TTS terms, Playwright/Vite versions used)
   and record corrections in docs/MILESTONES.md "Notes" with the source URL.
4. Write the next milestone's TODO.md section at the same detail as the current one, each item with its test.
Commit as `docs(plan): milestone review <date>` on branch `docs/plan-<date>`; do not push main. Print what changed.
