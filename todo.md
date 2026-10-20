# todo.md — No Wukkas Café

Planning file for the `/next` autopilot. Replaces `docs/TODO.md` as the plan; that file stays as the
**evidence archive** (every sha, count and screenshot path quoted below is written out there in full).
`docs/MILESTONES.md` numbers milestones differently (its M1 "Codex re-review" = this file's T2.1).

## Rules

- `AGENTS.md` applies in full. Korean to Edward; English code, commits, PR text, in-game copy (Australian spelling).
- Loop per task: implement → run `verify:` **by exit code** (never pipe a test run through `grep`/`tail`; a
  `grep -q` assertion on a file is fine) → tick → commit
  `M<n> T<n.m>: <summary>` (Conventional Commits body allowed). `[simple]` tasks go to the `lite` subagent; the
  caller still runs the verify.
- Branches: each milestone works on `feat/m<n>-<slug>` cut from `main` (T2.1 is the exception: it lands an
  existing branch). The milestone gate merges `--no-ff` into `main`, runs the full E2E, pushes `main`
  **fast-forward only**. Never force-push, never delete branches, never `pull --rebase` onto main.
- Hook-denied paths (`.claude/hooks/guard-review-tests.mjs`): `tests/review/independent*.ts`,
  `tests/review/*.browser.ts`, `tests/review/playwright.*.config.ts`, `tests/fuzz/**`. Make them green from
  `src/`; if one asserts something `docs/DECISIONS.md` now makes false, `SendMessage` the `review` session.
- **HUMAN work is never a checkbox.** Edward's items are `Gate (Edward):` lines under each milestone and in
  `## Gates` at the end. An unanswered decision is not built on an assumption: leave it, note it under
  `Discovered`, move on.
- Checks before every commit: `npm run typecheck && npm run lint && npm test` exit 0. Full E2E once per
  milestone gate: `E2E_PORT=5202 npm run test:e2e -- --config tests/review/playwright.ipv6.config.ts`
  (~30 min, run in the background; 127.0.0.1:5196 is held by a foreign server; never edit `src/` while it runs).
  The task that started the E2E waits for it to finish before merging or ticking; the next task never starts while it runs.
- `npm run build` in this checkout fails on nine stale untracked renders in `public/assets/voice/` (Q3). A build
  verify uses a clean export (`git archive HEAD | tar -x -C <scratch>` + symlinked `node_modules`) until Q3 is
  answered; T3.1 scripts that.
- Voice placeholders: any task that edits a spoken line (`src/data/ownerLines.ts`, `src/data/customers.ts`,
  `src/data/dialogue/gazEvents.ts`, `src/data/voice/script.ts`) puts the new key in `AWAITING_RENDER` and is
  followed by a `[simple]` task: `npm run voices -- --only <speaker>` (macOS), commit the **manifest only**
  (never audio), empty `AWAITING_RENDER`, verify `npm run voices:check`.
- `sim/` and `core/`: no `Math.random`, `Date.now`, timers (`tests/lint/corePurity.test.ts` enforces); money in
  integer cents; a save-shape change needs a migration + a test, so new persistent state prefers its own
  versioned localStorage key (pattern: `src/core/save/telemetry.ts`).
- Balance: a change to patience, arrivals, prices or events ships a before/after `npm run balance` table in
  the commit body (first-try pass per profile × day).
- When `docs/playtests/<date>.md` lands, run `/plan replan`: its findings become tasks at the top of M5.

## Status

current_milestone: M6
needs_replan: false
pause_at_gate: true
branch: `main` = origin/main = 87c3f09 (M5 merge a402c2a + the M5 note), pushed.
M5 done 2026-10-20 (T5.1–T5.6, gate review a821fae fixed). M6: Q2, Q3, Q4, Q5, Q7 answered in `docs/DECISIONS.md`
(2026-10-20), so T6.1–T6.5 go on `feat/m6-decisions` cut from the commit that records them. Playtest findings still arrive by
`/plan replan`. One implementer session only, in this checkout; the review session lives in
`~/Desktop/nwc-review-2` and never edits `src/`.

---

## M1 — Core loop: order → make → serve → score, headless  `[x]`

Goal: the thinnest playable slice, with its logic running without a browser. Assumption: **nothing here is
rebuilt**; this milestone records what the walking skeleton is, so later work extends it instead of
re-deriving it. Riskiest thing about it: it only exists on `main`, and the branch in Status is not on main yet.

- [x] T1.1 Pure serve evaluation: `src/sim/rush.ts` (`evaluateServe`, `reactionFor`, grades, cooling on the pass,
      extra-hot 68–74 °C), tests `tests/sim/rush.test.ts` (Day 2 D2.1–D2.2).
- [x] T1.2 Rush state machine: `src/core/rush/{machine,register,serve,customers,events,speech,state}.ts` (orders by
      ear, tickets with patience, hand-backs, shift events, one subtitle channel), report `ShiftSummary`
      (D2.3–D2.5; Phase 4 fixes d2cd928…497e2ee).
- [x] T1.3 Day 1 trial and the latte sim: `src/core/trial.ts`, `src/sim/latte/*` (foam field, judge, demo), practice
      mode (D1.1–D1.9, `LATTE_V2_REPORT.md`).
- [x] T1.4 Listening: 30 curated orders + generated orders from segments, replay / repeat / clarify with costs,
      Easy/Normal/Hard (`src/sim/listening*`, `src/data/orders.ts`; V.4, Phase 2 of ROADMAP).
- [x] T1.5 Headless play: `tests/helpers/rushBot.ts playRush` (novice/average/expert), `tests/helpers/pace.ts playWeek`,
      `npm run pace`, `npm run balance` → `docs/balance/2026-10-16.csv`; curve guards
      `tests/core/week/curve-{novice,average,expert}.test.ts` (Phase 2, dd40dba).
- [x] T1.6 The week: `src/data/week.ts`, `src/core/week/*`, shop and upgrades, Endless Rush, save v3 with v2→v3
      migration + test (`integrate/week1`; keys in c1b6f17).
- [x] T1.7 Determinism: `src/core/rng.ts`, `src/core/clock.ts`; `tests/lint/{corePurity,simPurity}.test.ts` (f5ebe60);
      seed fuzz over 500 seeds `tests/fuzz/*` (b7c2fdc), rushTrace hashes `tests/core/rushTrace.test.ts`.
- [x] T1.8 Code shape: `src/main.ts` split into `src/app/*` (f4c185e), styles split (f4b3bae), frame driver
      `src/app/frame.ts` (9f05502), audio manager split (2dd94b1).

Done when: `npm run balance -- --seeds 3` exits 0 and
`npx vitest run tests/sim/rush.test.ts tests/core/rush.test.ts tests/core/week/curve-expert.test.ts` is green,
with no browser open. (Run 2026-10-18 on d8be91a while planning: 3 files / 49 tests green, `balance -- --seeds 3`
exit 0.)

---

## M2 — Land the review fixes, then the decision-free leftovers

Goal: `main` is green on every reviewer test including F4, pushed, and the review session told; then the
small sim/UI leftovers from the reviews and runs that need **no decision from Edward**. Risks: (1) T2.1 pushes
`main`, so its E2E must be the full suite, not the three audio files; (2) the two phone-HUD fixes can only be
measured in a real layout, so their verify is a Playwright spec at 390×844 (the `polishEvidence` pattern), not
jsdom.

- [x] T2.0 Review fixes 6.1–6.11 on main (a3ff4e5, a16fde9, ef9071d, 66283fe, 14827e0, 7586668, cd28b37, 59b1c47,
      1e34e0c, 0a52ec4, 4d33c22, 8ca1287); Phase 1.5 polish 1.5.1–1.5.5, 1.5.7 (6c10050, 47c51f4, 7312c5a, 48bd0b1,
      2a6fe94); independent review Phase 4 (599c84f, b7c2fdc, f5ebe60) with fixes 4.F1–4.F7.
- [x] T2.1 Land F4 (`fix/review-0cae2cf` @ d8be91a: a line cancelled on a suspended AudioContext is cut, not faded
      on resume). On that branch: `npm run typecheck && npm run lint && npm test` exit 0; full E2E in the background
      (command in Rules); append "6.12 (d8be91a) P2 F4 …" plus an Evidence line (unit count, e2e count, reviewer
      tests green) to `docs/TODO.md` Phase 6; `git checkout main && git merge --no-ff fix/review-0cae2cf`; push
      `main` fast-forward; `SendMessage` `review`: "main <sha>, unit N/N, e2e N passed, ready for review". Then
      cut `feat/m2-leftovers` from `main` for the rest of M2.
      verify: `git fetch -q origin && git merge-base --is-ancestor d8be91a origin/main && npx vitest run tests/review/independentSuspendedCancellation.test.ts tests/review/independentKeys.test.ts tests/review/independentPausedCaptions.test.ts`
- [x] T2.2 `RegularMemory.visits` is finally written: every serve to a regular in a week shift counts one visit
      (correct or not). Hook: `src/core/rush/serve.ts:93` calls `regularServed` (`src/core/rush/events.ts:182`)
      only when `result.correct`; add a visit counter beside it that runs on every serve to a regular, carried
      into the save by `finishShift` like affinity. Affinity rules unchanged. Nothing reads `visits` yet, so the
      event mix is unchanged: confirm the `npm run balance` first-try table is identical and say so in the
      commit body.
      verify: `npx vitest run tests/core/regularAffinity.test.ts` (new case: two visits, one wrong → visits 2, affinity 1; red before)
- [x] T2.3 Week 2+: `shiftRows` in `src/core/week/progress.ts` reports the current playable shift as `done` when it
      has a non-disaster best from week 1. Rule, every week: `index === save.shift` → `open`; `index < save.shift`
      → `done` (the week only advances on a pass); `index > save.shift` → `locked`, even when a week-1 best
      exists (`best` still carries the grade). The UI's `shiftCells` already uses `canPlay`; make the data agree.
      verify: `npx vitest run tests/core/week/progress.test.ts` (new case: week 2, shift 2 with week-1 bests → index 2 is `open`; red before)
- [x] T2.4 Phone HUD (390×844): the register panel (`src/ui/pos.ts`, styles in `src/ui/styles/rush.css`) no longer
      covers the instruction line `#rinstr` while a customer is ordering. New spec `tests/e2e/phoneHud.spec.ts`
      (seed 7, Day 2, drive with `window.__trial` like `polishEvidence.spec.ts`): the two bounding boxes do not
      intersect, in the register state, at 390×844 and 375×667. Keep 1024×640 unchanged (assert the register's
      box there is as before, within 2 px).
      verify: `E2E_PORT=5202 npx playwright test tests/e2e/phoneHud.spec.ts --config tests/review/playwright.ipv6.config.ts`
- [x] T2.5 Subtitle box (`#subs`, `src/ui/styles/base.css` large-text rules) at text size Medium and Large on a
      390-px phone stays inside the viewport (today 1 px over each side at Medium). Add the case to
      `tests/e2e/phoneHud.spec.ts`: for each text size, `#subs` left ≥ 0 and right ≤ 390 while a line shows.
      verify: `E2E_PORT=5202 npx playwright test tests/e2e/phoneHud.spec.ts --config tests/review/playwright.ipv6.config.ts -g "subtitle"`
- [x] T2.6 Review-harness drift: `tests/review/harness.ts` lines ~390–430 copy boot's `setPaused` / `resumeAll` /
      `replay`. Move those three into a small exported module under `src/app/` (B1 did the same for the frame in
      `src/app/frame.ts`), have `boot.ts` and the harness both import it, delete the copy and its "copied, not
      shared" comment. Behaviour identical: rushTrace's seven hashes unchanged
      (`node --import ./tests/review/nodeReviewLoader.mjs tests/review/recomputeRushTrace.ts`).
      verify: `npx vitest run tests/review tests/core/rushTrace.test.ts tests/app/pauseShared.test.ts tests/review/independentAcceptanceContracts.test.ts && ! grep -q "copied, not shared" tests/review/harness.ts`
      (acceptance F4: `pauseShared` resolves boot's and the harness's imports to the same module; the
      independent contract test is named so a narrowed `tests/review` filter cannot drop it)
- [x] T2.7 [simple] Docs pointers: a two-line banner at the top of `docs/TODO.md` ("Planning moved to `todo.md`
      on 2026-10-18; this file is the evidence archive, Evidence lines still get appended here") and a Notes line
      in `docs/MILESTONES.md` mapping its M1–M7 to this file's M2–M5. No other text changes.
      verify: `grep -q "Planning moved to" docs/TODO.md && grep -q "todo.md" docs/MILESTONES.md`

Discovered:
- (resolved 2026-10-18 23:40: Edward approved, `main` 3aa0828 pushed) T2.1 push pending: everything else in T2.1 is done (checks 813/813, E2E 28 passed, 6.12 in docs/TODO.md,
      `main` = 157329e merged locally, `review` messaged) but `git push origin main` was denied by the auto-mode
      permission classifier ("Modify Shared Resources"; AGENTS.md §2 also says never push to main directly).
      Edward: push it yourself (`! git push origin main`) or allow it, then T2.1's verify can pass.
      Gate state 2026-10-18 23:30: every other M2 task ticked, `feat/m2-leftovers` merged `--no-ff` into local
      `main` = c05d257 (22 ahead of origin/main 0cae2cf); on it E2E `34 passed (29.7m)`, `17 skipped`, exit 0;
      `npm test` 100 files / 824; Codex review 1 finding (lastOrder dropped, fixed b39ca28); M1 Done-when green
      (balance --seeds 3 exit 0, 49/49). Only the push is left: then tick T2.1, Log line, current_milestone M3.
- (review, resolved: re-issued in 0b72172, merged 1f0bfa8) T2.3 waited on a reviewer re-issue: implemented and green on its own verify, but the reviewer's oracle
      `tests/helpers/fuzzRules.ts:151-161` (used by `tests/fuzz/week*.test.ts`) asserts the old week-2+ rule (every
      row `done`, none `locked`), so `npm test` had 4 red fuzz tests. Reverted, not committed; patch kept at
      `<scratchpad>/t2.3-shiftrows.patch` (session cd44c8ae). `review` asked to re-issue the rule 2026-10-18; when
      it lands, `git apply` the patch (or redo: ~15 lines in `shiftRows`) and tick T2.3.
- [x] T2.8 Review 157329e F5 (P2): merge the local branch `chore/review-main-157329e` (5b675ce, unpushed) `--no-ff`
      into this branch, then in `src/audio/voiceLines.ts` (`stopSource`, ~lines 88-106) a cancel while the
      AudioContext is not running also cuts every source still in the `fading` Set (stop/disconnect or mute), not
      only the current one. Keep: uncancelled resume, onStart exactly once, no later segment starts; cutting
      instead of fading is accepted. Report: `docs/reviews/2026-10-18-main-157329e.md`. Add `6.13` + Evidence to
      `docs/TODO.md` Phase 6.
      verify: `npx vitest run tests/review/independentSuspendedCancellation.test.ts tests/audio/manager.test.ts`

Gate (Edward): answer `docs/DECISIONS.md` Q2 (delete 21 merged branches?), Q3 (stale renders in
`public/assets/voice/`), Q4 (milk gauge target 68–74 °C on extra-hot tickets), Q5 (Day 1 / practice captions
start with the voice), Q7 (captions while the browser suspends audio); feel-test `feat/latte-feel`
(`cd ../nwc-p1c && npx vite --port 5195 --strictPort`) so 1C can merge; 1.5.6 pull-through threshold.
Done when: `git fetch -q origin && git diff --quiet main origin/main && npm test` exits 0 on `main`.

---

## M3 — Playtest-ready build

Goal: anyone with a URL can play the Trial and Mon–Wed on a phone and send a log back, and the numbers can be
read without a browser. Risks: (1) **deploy target assumed GitHub Pages** (`origin/gh-pages` exists, ROADMAP says
CI-free), done by a local script with a dry run, publishing itself is Edward's; a custom domain changes Vite's
`base`, so the script takes it as an option; (2) **performance is a proxy**, draw calls from `window.__trial`
in headless Chromium, not a device; frame times there mean nothing and are only logged.

- [x] T3.0 Shell screens, service HUD, settings (71df0e5, 58d729c); local playtest log `nwc.telemetry.v1` with
      Export/Clear (4c08363); accessibility: captions, text size, milk shape + name, reduced motion, remappable
      keys (c1b6f17); Phase 1.5 evidence captures (1e34e0c).
- [x] T3.1 `scripts/build-clean.ts` → `npm run build:clean`: export `HEAD` with `git archive` into a scratch dir,
      symlink `node_modules`, run the production build there, copy `dist/` back, print the audio-gate line and the
      total bytes of non-audio files; exit with the build's code; `--budget <bytes>` (default 3,000,000) fails
      over budget. Add the script to `package.json` and one line to `AGENTS.md` §3.
      verify: `npm run build:clean` exits 0 (no script today) and `npm run build:clean -- --budget 1` exits 1
      and `npx vitest run tests/scripts/buildClean.test.ts tests/review/independentAcceptanceBuild.test.ts -t "build:clean"`
      (acceptance F5: the first two commands stay green when working-tree files leak into the HEAD export;
      these tests fail on an uncommitted-file sentinel)
- [x] T3.2 `index.html` for sharing: `<title>No Wukkas Café</title>` (today "Day 1: The Trial"), description that
      names the week, `og:title` / `og:description` / `og:image` / `og:type`, `twitter:card`. OG image
      `public/og.png` 1200×630: a Playwright script `scripts/og-image.ts` screenshots the title screen at that
      size (dev server on a free port, `?voice=0`); commit the PNG (≤ 300 kB). Test `tests/scripts/indexMeta.test.ts`
      parses `index.html` and checks the tags and that the file exists.
      verify: `npx vitest run tests/scripts/indexMeta.test.ts`
- [x] T3.3 Draw-call budget: `tests/e2e/perf.spec.ts` at 1024×640 and 390×844, Day 2 seed 7 with three customers
      in the café, read `drawCalls` from the `window.__trial` state (`src/app/debug.ts` already exposes
      `renderer.info.render.calls`) and assert < 150; log frame-time median to a JSON sidecar next to the
      evidence dirs. Opt-in like `polishEvidence` is **not** wanted: this runs in the normal suite. If the first
      measurement is already over 150, do **not** start merging geometry here: commit the spec as `.fixme`
      with the numbers, note it under `Discovered`, and let the replan size the `world/` work.
      verify: `E2E_PORT=5202 npx playwright test tests/e2e/perf.spec.ts --config tests/review/playwright.ipv6.config.ts`
      (a `.fixme` commit with numbers under Discovered counts as this task done)
- [x] T3.4 `scripts/deploy.ts` → `npm run deploy`: runs `build:clean`, then in a temporary worktree of
      `origin/gh-pages` replaces the contents with `dist/` plus `.nojekyll` and (with `--domain <host>`) a `CNAME`,
      commits "deploy <sha>", and prints what it would push; **dry run by default**, `--push` publishes. `base`
      for Vite: `/<repo name from the origin URL>/` (today `/no-wukkas-cafe/`) without a domain, `/` with one
      (read from an env the script sets). No new
      dependency. Test `tests/scripts/deploy.test.ts` on a temp bare repo (pattern: temp dirs in
      `tests/scripts/voicesRender.test.ts`): dry run writes nothing to the remote, `--push` updates the branch.
      verify: `npx vitest run tests/scripts/deploy.test.ts && npx vitest run tests/review/independentAcceptanceBuild.test.ts -t "deploy passes the actual build" && npm run deploy`
      (acceptance F6: `--dist` fixtures never start the build; these cases read the NWC_BASE / NWC_SITE_URL
      the build subprocess receives: `/<repo>/` for a repository deploy, `/` with `--domain`)
- [x] T3.5 [simple] Playtest kit: `docs/playtests/README.md` (how to run a 30-min session: `npm run dev -- --host`
      or the deployed URL, Settings → Playtest log → Clear between testers, Export log at the end, where to put
      the file) and `docs/playtests/TEMPLATE.md` (per tester: device/browser, Trial result, shifts played, where
      they got stuck, pardons per order, walk-outs, "one more shift?" yes/no, quotes). Copy for testers only;
      the metrics list is ROADMAP "Success metrics" + `docs/TODO.md` Phase 5.
      verify: `test -f docs/playtests/README.md && test -f docs/playtests/TEMPLATE.md`
- [x] T3.6 `npm run playtest:summary -- <log.json …>`: pure aggregation `src/sim/telemetrySummary.ts` over
      exported logs (`{version: 1, records}` from `src/sim/telemetry.ts`): sessions, shifts, served, walk-outs by
      stage, accuracy per field, pardons per order, register wait median/max, quit points, trial verdicts; a
      Markdown table from `scripts/playtest-summary.ts`. Fixture `tests/fixtures/telemetry/sample.json` written
      from headless `playRush` records (as `tests/sim/telemetry.test.ts` builds them). Rejects other versions
      with a message, exit 1.
      verify: `npx vitest run tests/sim/telemetrySummary.test.ts && npm run playtest:summary -- tests/fixtures/telemetry/sample.json`
- [x] T3.7 [simple] README: how to play (URL once deployed, controls, Space/1–3, phone), the playtest kit link,
      the commands table pointer to `AGENTS.md` §3, architecture pointer to `docs/DEVLOG.md`. Keep the existing
      sections; add, don't rewrite.
      verify: `grep -q "docs/playtests" README.md && grep -q "DEVLOG" README.md`

Discovered:
- [x] T3.8 Gate review (Codex, 3aa0828..7192583, `docs/reviews/2026-10-19-main-7192583.md`): F1 a duplicated record
      keeps the copy that closed last; F2 `readExport` validates every record. 7 red reviewer tests → green
      (`tests/review/independentM3.test.ts`); docs/TODO.md 6.14, 6.15.
      verify: `npx vitest run tests/review/independentM3.test.ts tests/sim/telemetrySummary.test.ts`
- (fixed at the M4 gate: 480 s wait, 600 s test timeout) `tests/e2e/week.spec.ts:68` waited 240 s of wall clock at 4x for Monday's report; at
      load average ~19 (Finder + Spotlight busy) it timed out in the M3 gate run (35 passed / 1 failed) and passed
      alone in 3.6 min. Give it a game-time budget instead of a wall-clock one (a replan item; not done tonight).

Gate (Edward): `npm run deploy -- --push` (or pick another host / a domain); privacy-friendly analytics
provider (none wired until chosen); iPhone Safari + mid-range Android pass (audio unlock, pinch, key remap,
Export log download); recruit 3–5 testers → `docs/playtests/<date>.md` (then `/plan replan`).
Done when: `npm run build:clean` exits 0 (under budget, audio gate ok) and
`npm run playtest:summary -- tests/fixtures/telemetry/sample.json` prints the table.

---

## M4 — Leaderboard (local)

Goal: best results per week shift and an Endless Rush top list, a Scores screen from the title, "New best" on
the report, Gaz noticing. Decisions taken here: **stored outside the save** under its own versioned key
`nwc.scores.v1` (AGENTS §4.6 would otherwise mean save v4 + migration); **local only**: the game is a static
site with no backend, an online board is Edward's call and a different milestone. Ranking: week shift =
grade band, then served, then tips, then fewer walk-outs; Endless = served, then tips; ties keep the earlier
entry; top 10 per board. No names or initials (one device, one player).

- [x] T4.1 `src/sim/scores.ts`: `ScoreEntry` (mode day2 | week | endless, week, shiftIndex, seed, difficulty, grade,
      served, walkouts, tipsCents, `at` ISO passed in), board key per shift/difficulty and per Endless difficulty,
      `emptyScores`, `parseScores` (corrupt or other version → empty), `insert` (ranking above, cap 10),
      `isNewBest`, `fromSummary(ShiftSummary, ctx)`. Tests `tests/sim/scores.test.ts`: ordering, tie order, cap,
      parse corrupt, Endless vs shift keys.
      verify: `npx vitest run tests/sim/scores.test.ts`
- [x] T4.2 [simple] `src/core/save/scores.ts`: `ScoresStore` (`read` / `put` / `clear`, `memoryOnly`) copying
      `src/core/save/telemetry.ts` line for line with the new key and types; tests
      `tests/core/save/scores.test.ts` copying `tests/core/save/telemetry.test.ts`.
      verify: `npx vitest run tests/core/save/scores.test.ts`
- [x] T4.3 Wire it: `App` gets `scores` (`src/app/context.ts`; the review harness builds `App` by hand, so
      `tests/review/harness.ts` gets a memory store too); on every shift summary (`src/app/weekWiring.ts
      onShiftSummary`, the Day 2 and Endless paths in `src/app/rushWiring.ts`) `put(fromSummary(...))` **before**
      the report renders; `renderShiftReport` (`src/ui/screens/shiftReport.ts`) shows one line: "New best!" or
      "Best so far: <grade>, N served". Tests: `tests/app/scores.test.ts` (pattern `tests/app/telemetry.test.ts`):
      a summary writes one entry, a worse second run doesn't change the best; `tests/ui/shiftReport.test.ts`:
      the line for new / not new.
      verify: `npx vitest run tests/app/scores.test.ts tests/ui/shiftReport.test.ts tests/app/rushSummaryScores.test.ts && npx vitest run tests/review/independentAcceptanceContracts.test.ts -t "production summary dispatch"`
      (acceptance F7: the first two files call `recordScore` directly; `rushSummaryScores` and the independent
      dispatch test push real summary events through `createRushFrame`, one score each for Day 2 / week / Endless)
- [x] T4.4 Scores screen: `src/ui/screens/scores.ts` (Mon–Fri best per difficulty, Endless top 10 with served and
      tips, "Clear scores" asking twice like Clear log), a "Scores" entry in `MODES` of `src/ui/screens/title.ts`
      wired in `src/app/title.ts`, Esc/Tab loop via `menuKeys` like Settings, no horizontal scroll at 390 px.
      Tests `tests/ui/scores.test.ts` (render from a fixture, rows and cents formatting) and the title button in
      `tests/ui/screens.test.ts`.
      verify: `npx vitest run tests/ui/scores.test.ts tests/ui/screens.test.ts`
- [x] T4.5 Gaz on a new best in a **week** shift: one line key `rush.end.newBest` in `src/data/ownerLines.ts`,
      picked in `src/sim/owner.ts` after the grade line, count-agnostic copy, never in Endless or Day 2, never on
      the first play of a shift (nothing to beat). Put the key in `AWAITING_RENDER` (`src/data/voice/script.ts`).
      Test in `tests/sim/owner.test.ts`.
      verify: `npx vitest run tests/sim/owner.test.ts tests/data/voice.test.ts`
- [x] T4.6 [simple] Placeholder clip for T4.5: `npm run voices -- --only gaz`, commit `src/data/voice/manifest.json`
      only (no audio), empty `AWAITING_RENDER`.
      verify: `npm run voices:check`
- [x] T4.7 E2E: after the Monday pass in `tests/e2e/weekUi.spec.ts`, open Scores from the title and assert
      Monday's row shows the grade the report showed; screenshot `10-scores.png` into the week-UI evidence dir.
      verify: `E2E_PORT=5202 npx playwright test tests/e2e/weekUi.spec.ts --config tests/review/playwright.ipv6.config.ts`

Discovered:
- (M4 gate) `tests/e2e/week.spec.ts:68` timed out again in the full run (35 passed / 1 failed, load ~19); its
      wall-clock wait went from 240 s to 480 s (test timeout 600 s); alone it passes in 3.7 min. A game-time
      budget would be sturdier (replan item).
- [x] T4.8 Gate review (Codex, 7192583..eba0ec7, `docs/reviews/2026-10-19-main-eba0ec7.md`): F1 a restart after a
      difficulty change refreshes Gaz's best (`app/scores.ts weekBest`); F2 `parseScores` own-key grades and entries
      on their own board; F3 the scores store keeps its last good read. 5 red reviewer tests → green; docs/TODO.md
      6.16–6.18.
      verify: `npx vitest run tests/review/independentM4.test.ts`
- (replan) F3's flaw is also in `src/core/save/telemetry.ts` and `src/core/save/storage.ts` (the save): after a good
      read, a later `getItem` failure returns the empty memory copy (a fresh save for the rest of the session). Not
      flagged by the review; same fix (keep the last good read), each with a regression test.

Gate (Edward): online leaderboard yes/no (needs a backend; out of scope for the static site).
Done when: `npx vitest run tests/sim/scores.test.ts tests/core/save/scores.test.ts tests/app/scores.test.ts tests/ui/scores.test.ts`
is green and the weekUi E2E passes with the Scores step.

---

## M5 — Release prep (v0.1.0)

Goal: everything for the first public web release that does not need Edward's hands, and the gates that do.
Risks: `npm run release:check` cannot pass until the licensed clips exist (paid render + actors), so the
agent-side work is making that gate readable and the release mechanics ready, not forcing it green; playtest
findings arrive by `/plan replan` and go **above** T5.1.

- [x] T5.0 Voice pipeline: provenance + build gate (4cdb399), cast + budget (fdda4a6), Google adapter (6d26a90),
      `voices:estimate` / `voices:render` / `voices:sheet` (6428542, 230d7de, e9d9c67), ship segments
      (`feat/ship-segments`); `docs/STEAM.md` research (cbd465b); `docs/DEVLOG.md` architecture (e2c9c94).
- [x] T5.1 `npm run release:check` ends with a readable summary instead of 1,026 raw errors: per speaker, how many
      clips are placeholders and which HUMAN step clears them (paid render for the TTS cast, `--import` of takes
      for Gaz/Jiwoo/Mei), then the build line. Errors stay listed above it; exit code unchanged.
      (`scripts/voices-check.ts`; test case in `tests/scripts/voicesCheck.test.ts`.)
      verify: `npx vitest run tests/scripts/voicesCheck.test.ts`
- [x] T5.2 Version and changelog: `package.json` version `0.1.0`; `CHANGELOG.md` with one section
      "0.1.0 (unreleased)" listing the user-visible items of M2–M4 and the Phases in `docs/TODO.md` (one line
      each, no shas; curating that list is judgement, so not `[simple]`). Test `tests/scripts/version.test.ts`:
      version matches `^\d+\.\d+\.\d+$` and the changelog names it.
      verify: `npx vitest run tests/scripts/version.test.ts`
- [x] T5.3 Devlog: `docs/DEVLOG.md` gains "What the bots got wrong" from the data already in the repo: the
      balance curve vs the Phase 2 findings (QUEUE_JUMP never fires for instant bots, novice drop-off, failed
      shifts still pay tips) and how `npm run playtest:summary` closes the loop; playtest numbers are added by
      the replan when they exist.
      verify: `grep -q "What the bots got wrong" docs/DEVLOG.md`
- [x] T5.4 Release tag script: `npm run release:tag` refuses unless `release:check` passes, the tree is clean and
      `main` equals `origin/main`, then tags `v<package version>` locally and prints the push command (never
      pushes). Test on a temp repo.
      verify: `npx vitest run tests/scripts/releaseTag.test.ts`
- [x] T5.5 `tests/e2e/week.spec.ts:68` waits 480 s of wall clock for Monday's report (flaked twice under load ~19).
      Replace with a game-time budget: poll the sim clock exposed on `window.__trial` and stop when Monday's shift
      time is spent, not when the wall clock is; the test timeout stays 600 s as a backstop. Same assertion as today.
      verify: `E2E_PORT=5202 npx playwright test tests/e2e/week.spec.ts --config tests/review/playwright.ipv6.config.ts`
- [x] T5.6 F3's second register rule ("drink on the pass while someone orders", `src/ui/styles/rush.css` second
      phone `#pos` block) was fixed with the same formula but never measured. Add that state to
      `tests/e2e/phoneHud.spec.ts` (both phones × three text sizes): `#pos` top ≥ `#rinstr` bottom.
      verify: `E2E_PORT=5202 npx playwright test tests/e2e/phoneHud.spec.ts --config tests/review/playwright.ipv6.config.ts`

Discovered:
- (2026-10-20) Acceptance audit eea9fe8 (Codex, M2–M4 vs todo.md): FIX, P1 1 / P2 7 / P3 2, red 4 → fixed on
  `fix/acceptance-eea9fe8`, merged 731274f: save + telemetry keep the last good read, phone Small-text register,
  Endless "Best so far" wording, four verifier guards (T2.6/T3.1/T3.4/T4.3 verify lines strengthened), audio
  preflight requires `audio/*`. Report `docs/fixes/2026-10-19-acceptance-fix.md`. Still Edward's: iPhone Safari
  check of the Small-text register (AGENTS §10), `release:check` with licensed audio.
- (2026-10-20) M5 gate review a821fae (Codex, `docs/reviews/2026-10-20-main-a821fae.md`): FIX, P2 2 / P3 2, red 6 →
  fixed on `feat/m5-release-prep` (a852c10 F1 `release:tag` re-checks its gates after the slow check and tags the
  checked sha; b52754c F2 summary says `ready` only when the speaker has no release errors; e857d88 F3 devlog 599
  events; 5de40ef F4 changelog caption line scoped to the rush). Its `*.log` evidence is gitignored (only the JSON
  evidence is committed). Left as written: `docs/integration/balance-hook.md` and `docs/TODO.md` Phase 2 also say
  "509 events" (the CSV holds 599).
- (2026-10-20) `npm run release:tag` refuses in this checkout today because of untracked files (OVERNIGHT_TODO_3.md,
  WEEK1_TODO_2.md, docs/agents/ACCEPTANCE_AUDIT_PROMPT.md, docs/integration/RUN2_REPORT.md, RUN3_REPORT.md,
  `.claude/settings.json.pre-agent-office.bak`) and an uncommitted `.claude/settings.json` change made by an outside
  tool (agent-office hooks posting to 127.0.0.1:4178). Edward: commit, move or ignore them before tagging.

Gate (Edward): paid Google TTS render (`npm run voices:render -- --allow-paid`, AU$20 cap) + listen-through with
Korean / Mandarin / Indian-English speakers; actors' takes for Gaz, Jiwoo, Mei imported with
`voices:render -- --import`; Google Service Terms §20(d) check; Q6 Steam decision; domain + analytics;
device pass; press go (`git push origin v0.1.0`).
Done when: `npm run release:check` exits 0 (only after the voice gate) — until then, `npm run build:clean`
exits 0 and `npm run release:check` prints the per-speaker summary and exits 1 for the voice reason only.

---

## M6 — Decision fixes (each task starts only when its Q in `docs/DECISIONS.md` is answered)

Goal: the small src/ changes that have waited on one-line answers since 2026-10-18. Each task names its Q; an
unanswered Q means the task is skipped this run, not guessed. All on `feat/m6-decisions`, one commit per task.

- [x] T6.1 (Q4 = yes) Milk gauge target follows the ticket: extra-hot orders show 68–74 °C in `src/ui/gauges.ts`
      instead of the flat-white `TARGET_TEMP`; scoring in `src/sim/rush.ts` already uses 68–74, so only the card
      changes. Test in `tests/ui/gauges.test.ts` (extra-hot ticket → 68–74 label; normal → 55–65).
      verify: `npx vitest run tests/ui/gauges.test.ts`
- [x] T6.2 (Q5 = yes) Day 1 trial and practice captions start with the voice (the rush rule from A2):
      `src/app/trialWiring.ts` hud.onSay and `src/app/practiceWiring.ts` practiceHud.onSay bind the subtitle to the
      confirmed clip/TTS start and cancel with it. Add the trial case to the caption probes
      (`tests/review/playwright.probes.config.ts` pattern, implementer-owned copy under `tests/e2e/`).
      verify: `E2E_PORT=5202 npx playwright test tests/e2e/trial.spec.ts --config tests/review/playwright.ipv6.config.ts`
- [ ] T6.3 (Q7) Captions while the browser suspends audio: implement the answer Edward writes in DECISIONS Q7
      (pause the game until sound resumes / show captions at once / keep waiting). Keep one caption authority
      (`src/audio/voiceLines.ts`); `independentPausedCaptions` and `independentSuspendedCancellation` stay green.
      verify: `npx vitest run tests/review/independentPausedCaptions.test.ts tests/review/independentSuspendedCancellation.test.ts tests/audio`
- [ ] T6.4 [simple] (Q3 = delete) Remove the nine stale untracked renders in `public/assets/voice/` **only if Q3 says
      so** (they are gitignored; `voice-cache/` holds all 597 manifest clips, verified 2026-10-19). Then `npm run
      build` in this checkout must pass without `build:clean`. Update AGENTS.md §3 and the Rules line above.
      verify: `npm run build`
- [ ] T6.5 [simple] (Q2 = yes) Delete only the merged local branches listed in `docs/integration/RUN3_REPORT.md`
      that are **not** checked out in a worktree (`git worktree list` first). Record the list in the commit body.
      Never touch `origin`. Lift the "never delete branches" rule in Rules to "never delete an unmerged branch".
      verify: `git branch --merged main | wc -l` smaller than before, every remaining branch either unmerged or in a worktree

Discovered:
- (2026-10-20) Skipped this run, nothing built: T6.1 (Q4), T6.2 (Q5), T6.3 (Q7), T6.4 (Q3), T6.5 (Q2). Every one of
  those Qs is still `[ ]` in `docs/DECISIONS.md`.

Gate (Edward): answer Q2–Q5, Q7 in `docs/DECISIONS.md` (Q6 Steam is M7+).
Done when: every T6.x whose Q is answered is ticked and `npm test` is green.

---

## Gates (Edward) — in the order they unblock work

Every item here is Edward's; none is a checkbox for the autopilot. State on 2026-10-20 21:40.

1. Decisions (`docs/DECISIONS.md`, all still open): Q2 delete the 21 merged local branches; Q3 the nine stale untracked
   renders in `public/assets/voice/` (until then use `npm run build:clean`); Q4 milk gauge target 68–74 °C on
   extra-hot tickets; Q5 Day 1 / practice captions start with the voice; Q7 captions while the browser suspends audio.
2. Feel-test `feat/latte-feel` (`cd ../nwc-p1c && npx vite --port 5195 --strictPort`) so 1C can merge; decide 1.5.6
   (pull-through thins only at ≥ 3.0 cm).
3. Publish the playtest build: `npm run deploy -- --push` (dry run prints https://edwardh-jedi.github.io/no-wukkas-cafe/;
   `origin/gh-pages` today is the old db4c056 site) — or pick another host / a custom domain (`-- --domain <host>`).
4. Privacy-friendly analytics: which provider, or none (nothing is wired).
5. Device pass: iPhone Safari + a mid-range Android (audio unlock, pinch, key remap, Export log download, the phone
   register and subtitle layout from M2, the Scores screen).
6. Playtest: 3–5 testers with `docs/playtests/README.md`; notes in `docs/playtests/<date>.md`, logs in
   `docs/playtests/logs/`; then `npm run playtest:summary -- docs/playtests/logs/*.json` and `/plan replan`.
7. Online leaderboard yes/no (needs a backend; M4 is local only).
8. Voice for release: paid Google TTS render (`npm run voices:render -- --allow-paid`, AU$20 cap) + listen-through with
   Korean / Mandarin / Indian-English speakers; actors' takes for Gaz, Jiwoo, Mei (`voices:render -- --import`);
   Google Service Terms §20(d) check.
9. Q6 Steam (first release or later port; Tauri or Electron; Steam features).
10. Domain, then press go on v0.1.0 (`git push origin v0.1.0` once M5's tag script exists).
11. iPhone Safari check of the Small-text register fix (acceptance F3, `rush.css` `#pos` / `--text-scale`): open Day 2
    on a phone at Settings → Text size Small and confirm the register sits under the instruction line (AGENTS §10;
    measured only in Chromium emulation so far).

## Parked (not before v0.1.0)
- Jasmine Rush / tea queue, branches as levels, Karen as recurring boss, rival café, staff, seasonal events,
  extra endings (ROADMAP 3–4). Economy port from the prototype (cars/homes/Mosman): superseded by tips + upgrades.
- Online leaderboard (needs a backend). Steam wrapper (Q6).

## Log
- 2026-10-18 plan written from `docs/TODO.md` (Phases 0–7) + `docs/MILESTONES.md` + review 0cae2cf; M1 recorded
  as done; current = M2 (first task lands `fix/review-0cae2cf`).
- M2 done 2026-10-18: F4 + F5 audio fixes, RegularMemory.visits, week-2+ shift rows, phone register under the
  tickets, subtitle box inside 390 px, shared src/app/pause.ts; main 3aa0828 pushed (unit 824, E2E 34 passed at
  c05d257). Discovered: the push of main needs Edward's go (permission classifier), a reviewer oracle encoding old
  behaviour is re-issued by review (fuzzRules), Codex caught lastOrder being dropped (b39ca28).
- M3 done 2026-10-19: npm run build:clean (HEAD via git archive, 1.56 MB without audio), share tags + og.png,
  draw-call spec (114 / 102 < 150), npm run deploy (dry run → https://edwardh-jedi.github.io/no-wukkas-cafe/, push
  is Edward's), playtest kit + npm run playtest:summary, README; main 7192583 pushed (E2E 35 passed + 1 load flake
  re-run green). Discovered: gate review F1/F2 in the summary (fixed, 7 reviewer tests), week.spec.ts:68 wall-clock
  budget flakes under load.
- M4 done 2026-10-19: local Scores board (nwc.scores.v1, outside the save), report "New best!" / "Best so far",
  Scores screen from the title, Gaz's new-best line (+ placeholder clip), weekUi e2e step. Discovered: gate review
  F1–F3 (restart board, score parsing, last good read; fixed, 5 reviewer tests), week.spec wall-clock budget widened,
  the telemetry and save stores share F3's read flaw (replan). Main pushed; M5 not started (Edward).
- 2026-10-20: acceptance audit of M2–M4 against this file (Codex, eea9fe8): FIX → all ten findings fixed on
  `fix/acceptance-eea9fe8` and merged 731274f (unit 954/954, E2E 46 passed / 0 failed / 17 opt-in skipped, rushTrace
  unchanged, gh-pages untouched). M5 released to the agent; M6 added for the DECISIONS-gated fixes; Gates #11 is now
  the Safari check.
- M5 done 2026-10-20: release:check ends with a per-speaker voice gate summary, CHANGELOG.md 0.1.0, devlog "What the
  bots got wrong", npm run release:tag (local tag after the gates, never pushes), week.spec Monday on a game-time
  budget, phone register measured with a drink on the pass; gate review a821fae (Codex) P2 2 / P3 2, 6 red, all
  fixed; merged --no-ff into local main a402c2a (unit 124 files / 973 tests, full E2E 52 passed / 17 opt-in skipped /
  0 failed in 38.0 min), not pushed. Discovered: the slow check left a tag race (fixed), "ready" needed the release
  errors (fixed), balance-hook.md and docs/TODO.md say 509 events where the CSV has 599, release:tag refuses here
  until the untracked reports and the outside .claude/settings.json change are dealt with. M6 skipped whole: Q2, Q3,
  Q4, Q5, Q7 still open.
