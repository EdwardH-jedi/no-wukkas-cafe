You are the independent acceptance auditor for No Wukkas Café (EdwardH-jedi/no-wukkas-cafe) at `main` 6bc2b4d.
Question to answer: **was everything in `todo.md` M2–M4 implemented as written, and is M5 honestly not done?**
The implementing agent wrote the code, the tests and the ticks. Do not trust a tick, a `verify:` line or a number in
`todo.md` / `docs/TODO.md`; check each against the code. You may edit only `tests/` and `docs/`. Never `src/`, never
push, never merge, never delete. Write new tests only as `tests/review/independentAcceptance*.test.ts`, written to pass
once the defect is fixed.

## Setup
Read AGENTS.md, todo.md (all of it), docs/DECISIONS.md, docs/reviews/2026-10-19-*.md (what the last gates already
found: do not re-report those), docs/QA_SCENARIOS.md. Run `npm run typecheck && npm run lint && npm test`; record
exact file/test counts by exit code (never pipe a test run through grep or tail).

## A. Task-by-task spec audit (the core of this review)
For every task T2.1–T2.8, T3.1–T3.7, T4.1–T4.7 (and T3.8 / T4.8 as the gate reviews): split the task text into its
individual clauses (each "must", each file path, each named behaviour, each "never", each number) and mark every
clause PASS / FAIL / UNVERIFIED with the file:line or command that proves it. A clause nobody tested is UNVERIFIED,
not PASS. Pay special attention to these clauses, which are easy to miss:
- T2.2 `visits` counts every serve to a regular, correct or not, and affinity rules are unchanged; balance first-try
  table identical before/after (re-run `npm run balance -- --seeds 3` on 3aa0828^ and 6bc2b4d and diff).
- T2.3 rule for `index === save.shift` / `<` / `>` holds in week 1 as well as week 2+, including `best` on locked rows.
- T2.4/T2.5 phone layout at 390×844 AND 375×667, register vs `#rinstr`, `#subs` inside the viewport at Small, Medium,
  Large; 1024×640 register box unchanged within 2 px.
- T2.6 `setPaused` / `resumeAll` / `replay` exist once, boot and the harness import it, "copied, not shared" is gone,
  rushTrace's seven hashes are identical to the ones in docs/reviews/2026-10-17-main-1a54a00.md.
- T3.1 `build:clean` exports HEAD (not the working tree: prove it by building with an uncommitted change that must
  NOT appear), `--budget 1` exits 1, audio gate line printed.
- T3.2 title, description names the week, og:title/description/image/type, twitter:card, og.png is 1200×630 and
  ≤ 300 kB, og:image URL is absolute or correctly relative for the deploy base.
- T3.3 perf spec runs in the normal suite (not opt-in), both viewports, asserts < 150, reads real `drawCalls`.
- T3.4 `deploy` is dry-run by default: prove with `git ls-remote origin gh-pages` before and after a dry run that
  nothing was pushed (today's gh-pages sha must be unchanged). Check `base` with and without `--domain`, `.nojekyll`,
  `CNAME`, and that `--push` was only exercised against a temp bare repo.
- T3.6 summary rejects other versions with a message and exit 1, handles an empty log, a corrupt record, two logs
  from the same session.
- T4.1–T4.5 ranking order (grade band, served, tips, fewer walk-outs; ties keep the earlier entry; cap 10), Endless
  keys separate from shift keys, scores live under `nwc.scores.v1` and NOT in the save, Scores screen has no
  horizontal scroll at 390 px, "Clear scores" asks twice, Gaz's `rush.end.newBest` is never said in Endless, never in
  Day 2, never on the first play of a shift, and `AWAITING_RENDER` is empty again after T4.6.
- T4.7 the Scores row grade equals the report's grade in the E2E (read the assertion, do not trust the name).

## B. Do the `verify:` lines have teeth?
For the eight tasks where a silent regression would hurt most (T2.2, T2.3, T2.6, T3.1, T3.4, T4.1, T4.3, T4.5) make a
scratch mutation in a throw-away `git worktree` (never in the review worktree, never committed): revert or break the
feature in `src/`, run that task's `verify:` command, and record whether it goes red. A verify that stays green under
the mutation is a finding (P2) with a test that would catch it.

## C. Numbers and claims
Recompute every number quoted in todo.md's Log and docs/TODO.md Phase 6 Evidence (unit counts, E2E counts, draw calls
114/102, build size 1.56 MB, balance rows, rushTrace hashes, ibis and THE_USUAL rates). Run the full E2E **once**, last,
alone on the machine: `E2E_PORT=5203 npx playwright test --config tests/review/playwright.ipv6.config.ts`
(~30 min; `tests/e2e/week.spec.ts` is a known load flake: if it alone fails, re-run it alone and report both results).
Every claim that does not reproduce is a finding.

## D. Honesty of the gates
1. M5: T5.1–T5.4 are unticked. Confirm nothing of them is half-present (version bump, CHANGELOG, release:tag,
   "What the bots got wrong"); report if there is.
2. Edward's gates must not be silently built: no analytics provider wired, no online leaderboard code, no paid TTS
   call, no audio file in git (`git ls-files | grep -Ei '\.(mp3|wav|aif|aiff|caf|ogg|m4a)$'` must be empty), no
   `deploy --push` ever run (gh-pages still db4c056), no DECISIONS.md answer invented.
3. `todo.md` "Discovered (replan)": the `getItem`-failure-returns-empty flaw in `src/core/save/storage.ts` and
   `telemetry.ts`. Is it a P1 (a player's save replaced by a fresh one in the same session)? Reproduce with a test.
4. Determinism: `grep -rnE 'Math\.random|Date\.now|setTimeout' src/sim src/core` is 0; no file in `src/` over 600 lines
   that was not already listed in the previous review.

## Output (write to docs/reviews/2026-10-19-acceptance-6bc2b4d.md, in English except the last section)
1. Verdict line: PASS / FIX, P1/P2/P3 counts, reviewer red count.
2. Clause table per task: task | clauses | PASS | FAIL | UNVERIFIED (then the FAIL/UNVERIFIED clauses listed).
3. Mutation results (section B) as a table: task | mutation | verify result.
4. Claims that did not reproduce (section C), with both numbers.
5. Ranked findings (P1/P2/P3, file:line, one sentence each); every FAIL has a red test or an exact reproduction.
6. `## Edward에게 (한국어)`: only decisions he must make, max 5 lines; nothing you can verify yourself.
Commit tests + report on branch `chore/review-acceptance-6bc2b4d` (do not merge) and print the sha and red count.
