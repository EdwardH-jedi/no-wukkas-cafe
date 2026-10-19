# Acceptance audit fixes: F1–F10

Audit: `eea9fe8` on `chore/review-acceptance-6bc2b4d` (parent `6bc2b4d` = main), report
`docs/reviews/2026-10-19-acceptance-6bc2b4d.md`, verdict FIX (P1 1, P2 7, P3 2, independent red 4).
Fix branch: `fix/acceptance-eea9fe8` (worktree `~/Desktop/nwc-fix-acceptance`), built on `eea9fe8`.
Raw outputs of every command below are in `docs/fixes/2026-10-19-acceptance-fix-evidence/`.
Node v26.7.0 (the documented target is Node 24).

## Status per finding

| # | Sev | Change | Evidence | Status |
| --- | --- | --- | --- | --- |
| F1 | P1 | `src/core/save/storage.ts`: `load()` keeps the migrated save it read from disk in the memory fallback. | `independentAcceptanceStorage` save case green; new regression in `tests/core/save/storage.test.ts`. Same-session progress loss only; disk data untouched, permanent deletion was never reproduced and is not claimed. | FIXED |
| F2 | P2 | `src/core/save/telemetry.ts`: `read()` keeps the last good log (as the scores store does). Key, version, cap, no-transport unchanged. | `independentAcceptanceStorage` telemetry case green; five records read, `getItem` fails, one `put` leaves six (`tests/core/save/telemetry.test.ts`). | FIXED |
| F3 | P2 | `src/ui/styles/rush.css`: both phone `#pos` rules divide `top` and `max-height` by `--text-scale`, because `#pos` is zoomed and `zoom` scales its own offsets. | Gap `#pos.top − #rinstr.bottom` was −4.78 px at Small on 390×844 and 375×667; now +7.9 px (Small), +7.7 (Medium), +8.2 (Large). Both independent Small cases green, Medium/Large and Day 1 `#subs` green, 1024×640 register delta 0 px. `phoneHud.spec.ts` now measures all three sizes on both phones and goes **red on the old CSS** (`#pos` y 129.6 over `#rinstr` bottom 136.0), green on the fix. | FIXED (see limits) |
| F4 | P2 | New `tests/app/pauseShared.test.ts`: boot and the harness must import `setPaused`/`resumeAll`/`replayLast` from the same resolved module, one exported definition each under `src/app/`. T2.6 verify line in `todo.md` extended. | Mutation below. | FIXED |
| F5 | P2 | New `tests/scripts/buildClean.test.ts`: runs the real `scripts/build-clean.ts` on a fixture repo; uncommitted edit, uncommitted `index.html` and an untracked `src` file must not reach `dist/`; budget, audio-bytes and exit-code cases. T3.1 verify line extended. | Mutation below. | FIXED |
| F6 | P2 | `tests/scripts/deploy.test.ts`: three cases run a copy of the real `deploy.ts` beside a stub `build-clean` and read the `NWC_BASE`/`NWC_SITE_URL` the build receives (`/no-wukkas-cafe/` + Pages URL, `/no-wukkas-cafe/` with no address, `/` + `https://<host>/` with `--domain`). T3.4 verify line extended. | Mutation below. | FIXED |
| F7 | P2 | New `tests/app/rushSummaryScores.test.ts`: summary events of a Day 2, week and Endless shift go through `createRushFrame`; exactly one entry, on that mode's board, before the report draws, still one after a second frame. T4.3 verify line extended. | Mutation below. | FIXED |
| F8 | P3 | `tests/e2e/helpers/voiceProbe.ts` (status 200 **and** `audio/*`) used by the preflights in `audio.spec.ts`, `audioSmoke.spec.ts`, `audioState.spec.ts`; unit test `tests/helpers/voiceProbe.test.ts`. | See "F8 detail". | Preflight FIXED; real-clip acceptance VERIFIED here with development placeholder clips only (not release audio) |
| F9 | P2 | `phoneHud.spec.ts`: literal Day 1 `#subs` check, 390×844 and 375×667 × Small/Medium/Large, inside the viewport. The `#rsubs` test stays. | 6/6 green; with the Large `#subs` width rule removed the 390×844 Large case fails (`#subs left −39.98`). T2.5's named verify (`-g "subtitle"`) first selected only the 3 `#rsubs` cases, so the Day 1 titles were changed (`2cde948`); it now selects and passes 9 (6 Day 1 `#subs` + 3 `#rsubs`), exit 0. | FIXED |
| F10 | P3 | `src/ui/screens/shiftReport.ts` and `tests/ui/shiftReport.test.ts`: a non-new-best Endless report reads `Best so far: Good, 14 served`. Endless ranking untouched. | `shiftReport` tests green. | FIXED |

Commits (one per finding, F1 first):
`9e953ff` F1 · `ec44c4f` F2 · `45d7082` F3 · `d480ef5` F9 · `7312acc` F10 · `805833d` F4 · `dcb05a1` F5 ·
`6d4b229` F6 · `d5511a4` F7 · `7722499` F8 · `2cde948` F9 follow-up (test titles) · then this report and the evidence folder.

## F8 detail

The two clip folders were symlinked from the main checkout into this worktree (`ln -s`; nothing copied
into git, originals untouched, `docs/DECISIONS.md` Q3 not answered): `voice-cache` (783 mp3) and
`public/assets/voice` (490 files). Both symlinks are untracked and not committed.

- `npm run voices:check`: exit 0, "597 clips, status placeholder, 0 error(s), 5 warning(s)" (5 `orphan-file`),
  segments 0/181 with a release clip. An independent check of every manifest key found **0 missing and 0
  empty** files in `voice-cache`. (116 manifest keys have no file under `public/assets/voice`; the dev server
  serves them from `voice-cache`, so this does not matter in dev.) The 186 mp3 files not in the line
  manifest are 181 segment clips and 5 older renders (`dazza` 2, `gaz` 2, `jiwoo` 1).
- Dev-server probe on port 5220: a manifest clip returns `200 audio/mpeg`; a missing clip returns
  `200 text/html`. This is the false-available trap: `response.ok()` is true for both.
- The hardened preflights then let the audio specs run. In the final E2E they pass: audio 2/2,
  audioSmoke 3/3, audioState 4/4, listening 2/2 (the audit saw 9 failures from these files without clips).
  None skipped, so these are real-clip passes, not skip or TTS-fallback passes.
- **Limits:** the clips are macOS-voice placeholders (personal use only). `npm run release:check` was not
  run here and is expected to fail until licensed audio replaces them. This is dev-asset acceptance, not
  release-audio acceptance. T4.6.01 (that `voices --only gaz` was the command that rendered the Gaz new-best
  clip) cannot be proved from files and stays unproved; the file and its duration are now present and valid.

## Mutations (verify RED under mutation, GREEN after revert)

Throw-away worktrees at branch commit `d5511a4` (all F4–F7 tests and `todo.md` lines present; F8 touches none
of them), `node_modules` cloned (`cp -c`) so fonts load, the audit's patches applied verbatim with
`git apply`, the new verify line from `todo.md` run verbatim, then `git checkout -- .` and the line run
again, then the worktree removed (none remain). Nothing was committed from them.

| Task | Mutation (audit patch) | New verify under mutation | After revert |
| --- | --- | --- | --- |
| T2.6 | boot imports `./pauseDuplicate` (copy of `pause.ts` created) | **exit 1**: 7 failed (6 in `pauseShared`: different module, two definitions in `src/app`; 1 independent contract test) of 149 | exit 0: 26 files, 149 passed |
| T3.1 | `build-clean.ts` overlays working-tree `src/` and `index.html` | **exit 1**: plain `npm run build:clean` still builds (exit 0) and `--budget 1` still exits 1, so the original two commands stay blind, but `buildClean.test.ts` and the independent build test fail on the sentinel | exit 0: 2 files, 7 passed, 2 skipped by `-t` |
| T3.4 | `deploy.ts` passes `NWC_BASE: "/"` | **exit 1**: two new `deploy.test.ts` cases (`base: '/'` vs `/no-wukkas-cafe/`); the `&&` stops there, so the independent deploy case was not reached in this run | exit 0: 10 passed, then independent 2 passed, then the real `npm run deploy` dry run exited 0 |
| T4.3 | `rushView.ts` sets `scoreNote = null` | **exit 1**: all 3 `rushSummaryScores` cases (`expected [] to deeply equal [ObjectContaining…]`) | exit 0: 9 passed, then independent dispatch 3 passed |

The original (unstrengthened) verify lines were not re-run on this branch. On this branch the T2.6 line's
`tests/review` argument would discover `independentAcceptanceContracts` anyway; the file is named explicitly
in the line so a narrowed filter cannot drop it.

## Final verification

| Command | Exit | Counts |
| --- | ---: | --- |
| `vitest run tests/review/independentAcceptanceStorage.test.ts tests/review/independentAcceptanceBrowser.test.ts` | 0 | 2 files, 16 passed, 0 failed (the 4 former reds included) |
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | eslint + prettier clean |
| `npm test` | 0 | **120 files, 954 passed, 0 failed** (audit: 116 files, 927 passed, 4 failed) |
| `git diff eea9fe8 -- 'tests/review/independent*' docs/reviews` | 0 | empty (0 bytes, 0 files) |
| `git diff --name-only 6bc2b4d eea9fe8 \| xargs git diff --quiet eea9fe8 --` | 0 | all 187 files the audit commit added or changed are identical to `eea9fe8` |
| `E2E_PORT=5202 npx playwright test tests/e2e/phoneHud.spec.ts --config tests/review/playwright.ipv6.config.ts -g "subtitle"` (T2.5 verify, run after the title change `2cde948`) | 0 | 9 passed, 0 failed |
| rushTrace recompute | 0 | 7 of 7 SHA-1s equal the table in `docs/reviews/2026-10-17-main-1a54a00.md` |
| `npm run build:clean` | 0 | HEAD 7722499; `[audio-gate] ok: 0 licensed audio file(s) in the build`; 1,562,596 bytes without audio (budget 3,000,000) |
| `npm run build:clean -- --budget 1` | 1 | over budget by 1,562,595 bytes |
| `npm run deploy` (dry run) | 0 | "deploy 7722499" on `origin/gh-pages`, 19 files, base `/no-wukkas-cafe/`, nothing pushed |
| `E2E_PORT=5203 npx playwright test --config tests/review/playwright.ipv6.config.ts` | 0 | **63 discovered; 46 passed, 0 failed, 17 skipped**, 30.6 min (16:33–17:03 AEDT) |

`gh-pages` on `origin` before and after the dry run: `db4c0567f5ba00ec9bf6078da44a8c78b5a17ef0` both times,
equal to the audit's value (no external change). `--push` was exercised only against temporary bare
repos by `tests/scripts/deploy.test.ts`, never against `origin`.

E2E preflight: `lsof -i :5203` showed 0 listeners; no other `playwright`/`vitest`/`vite build` process.
Three vite servers not started by this session were running (5183 dev, 5196 and 5207 previews) and were
left alone. Discovered count rose from 53 to 63: `phoneHud.spec.ts` went from 6 to 16 tests (register ×
3 sizes × 2 phones, Day 1 `#subs` × 6). Skips: `a11yEvidence` 10 and `polishEvidence` 7, the opt-in
evidence specs. Per file (pass/fail/skip): audio 2/0/0, audioSmoke 3/0/0, audioState 4/0/0, casting 1/0/0,
ibis 2/0/0, latteRegression 1/0/0, listening 2/0/0, music 1/0/0, perf 2/0/0, phoneHud 16/0/0,
practice 1/0/0, rush 1/0/0, segments 1/0/0, trial 1/0/0, week 5/0/0, weekUi 3/0/0. `week.spec.ts` passed in
this run, so no separate re-run was needed. The full run predates `2cde948`, which only renamed six test
titles; the 9-test T2.5 subset above is the evidence after it.

## Remaining limits and decisions for Edward

- **F3 coverage:** the browser runs measure the first customer ordering. The second changed `#pos` rule
  ("drink on the pass while someone orders") uses the same formula but was not measured separately.
  `max-height` now keeps the register's bottom edge at `100vh − 170px` at every size; at Large it ends
  earlier than before, deliberately. The register's `left`/`right` 16px are still zoomed (not part of the
  finding).
- **F8 / release:** dev placeholder clips only; licensed voices, `release:check`, and the question in
  `docs/DECISIONS.md` Q3 (the stale `public/assets/voice` renders) are still yours.
- **F10:** the Endless report line no longer shows tips (the Scores screen still ranks and shows them).
- **iPhone Safari (open, yours to do):** AGENTS.md §10 requires a Safari check for layout changes. F3 is a
  layout change and was measured only in Chromium CSS-viewport emulation (and `zoom` behaves differently
  across engines), so on-device Small-text register placement is UNVERIFIED.
- **Environment:** Node 26.7.0 rather than 24; no iPhone Safari or Android hardware.
- **Worktree:** the `voice-cache` and `public/assets/` symlinks are still in `~/Desktop/nwc-fix-acceptance`,
  untracked (the `.gitignore` directory patterns do not match symlinks). A `git add -A` there would stage them.
- **Not touched, by instruction:** M5 work, version, analytics, online leaderboard, paid TTS, audio in git,
  `docs/DECISIONS.md`, save schema/version/key, balance (no `sim/` or economy change, so no balance table).
  `todo.md`: only the four verify lines (T2.6, T3.1, T3.4, T4.3) were edited; no checkbox was ticked.
- Merge and push are your call; the branch is local only.

## Confirmation

Nothing was pushed, merged, deployed or tagged. `npm run deploy` ran as a dry run only (`origin/gh-pages`
unchanged; the script's `git fetch` updates only the local `refs/remotes/origin/gh-pages`). No file of
`tests/review/independent*`, the audit report or its evidence was modified, and no test was skipped,
weakened or removed. Throw-away worktrees were removed. Local branch `fix/acceptance-eea9fe8`.
