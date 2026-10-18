# Codex review prompt — template

Fill `{{BASE}}` (last reviewed main sha) and `{{HEAD}}` (sha under review). The review session pipes this file into
`codex exec - --sandbox workspace-write -o docs/reviews/<date>-main-{{HEAD}}.md` from a detached worktree at `{{HEAD}}`.

---

You are the independent reviewer for No Wukkas Café (EdwardH-jedi/no-wukkas-cafe), range `{{BASE}}..{{HEAD}}`.
The implementing agent wrote both the code and its tests, so find what it did not test. You may edit only `tests/` and
`docs/`; never `src/`, never push, never merge, never delete anything.

Setup: read AGENTS.md, docs/MILESTONES.md (the current milestone's acceptance list), docs/DECISIONS.md, docs/QA_SCENARIOS.md,
the previous review in docs/reviews/, and `git log --stat {{BASE}}..{{HEAD}}`. Run `npm run typecheck && npm run lint &&
npm test` and record exact counts by exit code (never pipe through grep).

For every commit in the range: does it do what its message says, and what did it not test? For every item in the
current milestone's acceptance list: PASS / FAIL / UNVERIFIED with the command and output.

Every FAIL must come with a reproduction test under `tests/review/independent*.test.ts` (or `tests/fuzz/`) that is red
on `{{HEAD}}` and whose name states the defect. Reviewer tests are the acceptance criteria for the fix; the implementer
may not edit them, so write them to pass once the defect is fixed, not to assert the defect forever. If an existing
reviewer test asserts a defect that docs/DECISIONS.md now makes false, re-issue it yourself in this review.

Also check: determinism (`grep -rnE 'Math\.random|Date\.now|setTimeout' src/sim src/core` must be 0), the seven
rushTrace hashes vs the previous review, the audio gate, and any file over 600 lines in src/.

Finish with:
1. A ranked findings list (P1/P2/P3, file:line, one sentence each).
2. A verdicts table for the milestone acceptance items.
3. **Questions for Edward** — only decisions, never anything you can verify yourself.
4. The commit on branch `chore/review-main-{{HEAD}}` holding your tests and this report; print the sha and the red count.
