# Independent acceptance audit — main 6bc2b4d

**FIX — P1: 1; P2: 7; P3: 2; reviewer red count: 4.**

M2–M4 are **not fully implemented and acceptance-verified as written**: Small-text phone registration still intersects its instruction box, four task verifiers accept a removed feature, the specified Day 1 subtitle test measures Day 2 instead, Endless report copy deviates from the literal task, and development audio cannot be verified in this checkout. The disclosed save/telemetry read-fallback flaws are reproduced separately. The previous M3/M4 gate findings are fixed and are not re-reported. M5 is honestly incomplete; its version value was already present before M2, so “nothing of M5 exists” would be too strong.

Target was established first by `git fetch -q origin && git checkout --detach origin/main`; `git rev-parse --short HEAD` printed **6bc2b4d**. Review branch: `chore/review-acceptance-6bc2b4d`. Only new `tests/review/independentAcceptance*.test.ts` files and `docs/` were authored in this checkout. Production mutations were confined to a temporary detached worktree, restored after every experiment, never committed. Build/deploy probes also used that disposable worktree. No project push or merge was run. Local bare-repository fixture pushes are the only `--push` exercises.

`E/` below means `docs/reviews/2026-10-19-acceptance-6bc2b4d-evidence/`. Every execution saved stdout/stderr without piping the test through a filter; JSON exit records retain actual process status. Exact commands and cwd are in `commands.json`, `build-exits.json`, `mutations.json` and the named exit files. A failing command is not silently treated as a pass.

## 1. Task clause verdicts

Each numbered clause is an independently checked acceptance obligation. PASS applies only to the observation cited, not untested devices, historical workflow order or human approvals. A source check can prove a file, import, tag or pure expression exists; it cannot prove a render, a past command or a paid-provider interaction. Verification quality is scored separately from the feature working today.

| Task | Clauses | PASS | FAIL | UNVERIFIED |
| --- | ---: | ---: | ---: | ---: |
| T2.1 | 10 | 6 | 0 | 4 |
| T2.2 | 11 | 11 | 0 | 0 |
| T2.3 | 7 | 7 | 0 | 0 |
| T2.4 | 7 | 5 | 2 | 0 |
| T2.5 | 9 | 8 | 1 | 0 |
| T2.6 | 8 | 7 | 1 | 0 |
| T2.7 | 4 | 4 | 0 | 0 |
| T2.8 | 7 | 7 | 0 | 0 |
| T3.1 | 12 | 11 | 1 | 0 |
| T3.2 | 20 | 20 | 0 | 0 |
| T3.3 | 12 | 12 | 0 | 0 |
| T3.4 | 16 | 15 | 1 | 0 |
| T3.5 | 17 | 17 | 0 | 0 |
| T3.6 | 22 | 22 | 0 | 0 |
| T3.7 | 7 | 7 | 0 | 0 |
| T3.8 | 6 | 6 | 0 | 0 |
| T4.1 | 30 | 30 | 0 | 0 |
| T4.2 | 10 | 10 | 0 | 0 |
| T4.3 | 15 | 13 | 2 | 0 |
| T4.4 | 10 | 10 | 0 | 0 |
| T4.5 | 9 | 9 | 0 | 0 |
| T4.6 | 4 | 2 | 1 | 1 |
| T4.7 | 4 | 4 | 0 | 0 |
| T4.8 | 9 | 9 | 0 | 0 |
| **Total** | **266** | **252** | **9** | **5** |

### FAIL / UNVERIFIED clauses

- **T2.1.03 UNVERIFIED** — Typecheck, lint and units exit 0 on the implementation branch before merge. Historical unit snapshot b78c3a4 is rerun; old branch timing and historical lint/typecheck execution cannot be recovered from source.
- **T2.1.04 UNVERIFIED** — Run the full E2E on that branch, before tick/merge. Historical outcome/timing not independently rerun; only current full E2E is authorised once.
- **T2.1.06.2 UNVERIFIED** — Historical main push was fast-forward only. Current ancestry proves inclusion, not the historical git push invocation or its flags.
- **T2.1.07 UNVERIFIED** — Send review the main SHA, unit/E2E counts and ready-for-review message. No independently accessible message receipt; a planning note is not a receipt.
- **T2.4.02 FAIL** — At seed 7 Day 2, register does not cover #rinstr at 390x844 while ordering. F3: independentAcceptanceBrowser Small case: POS top 114.296875 < instruction bottom 119.078125.
- **T2.4.03 FAIL** — The same non-intersection holds at 375x667. F3: same 4.78125px overlap; phone-small-reproduction.txt.
- **T2.5.04 FAIL** — phoneHud.spec.ts adds the specified #subs bounding-box assertion for each text size. F9: phoneHud.spec.ts:112-132 explicitly queries #rsubs only; phone-spec-contract.json literalSubsQuery=false. New independentAcceptanceBrowser covers actual Day 1 #subs and passes.
- **T2.6.05 FAIL** — The named verify detects drift back to a separate boot copy. F4: mutation-T2.6.txt exits 0 after boot imports pauseDuplicate; new contract test exits 1.
- **T3.1.10 FAIL** — Named two-command verify detects losing HEAD isolation. F5: mutation-T3.1 smoke=0 / budget=1 despite dirty-tree overlay; independent build sentinel red.
- **T3.4.11 FAIL** — Named verify detects a broken production build base. F6: mutation-T3.4.txt exit 0 with NWC_BASE="/"; independent child-environment test exit 1.
- **T4.3.07 FAIL** — The named verify detects removing actual report-path score recording. F7: mutation-T4.3 exit 0; independent dispatch tests3 red.
- **T4.3.08 FAIL** — Endless also uses the literal specified Best so far: <grade>, N served report line. F10: src/ui/screens/shiftReport.ts:33-35 instead emits served/tips; existing tests/ui/shiftReport.test.ts:34-39 actually verifies Best so far: 14 served, $21.50 in tips (task-verifiers.txt and final-test.txt both passed this test).
- **T4.6.01 UNVERIFIED** — Gaz placeholder new-best clip rendered with voices --only gaz. No local voice-cache; voices:check exits1 with597 missing files; renderer invocation cannot be proved from manifest alone.
- **T4.6.04 FAIL** — voices:check succeeds with actual file duration. F8 evidence gap: npm run voices:check exits1,597 missing-audio errors,0 warnings; no voice-cache in this checkout.

### Complete clause ledger

| Clause | Obligation | Verdict | Evidence |
| --- | --- | --- | --- |
| T2.1.01 | Land d8be91a / fix/review-0cae2cf in main | PASS | source-checks.json ancestry d8be91a=0; git show 157329e (merge parents) |
| T2.1.02 | A cancelled suspended-context line is cut rather than faded on resume | PASS | src/audio/voiceLines.ts:88; task-verifiers.txt: independentSuspendedCancellation and manager tests |
| T2.1.03 | Typecheck, lint and units exit 0 on the implementation branch before merge | UNVERIFIED | Historical unit snapshot b78c3a4 is rerun; old branch timing and historical lint/typecheck execution cannot be recovered from source |
| T2.1.04 | Run the full E2E on that branch, before tick/merge | UNVERIFIED | Historical outcome/timing not independently rerun; only current full E2E is authorised once |
| T2.1.05 | Append Phase 6 6.12 with d8be91a, P2 F4 and unit/E2E/reviewer evidence | PASS | docs/TODO.md:477,536; git show 8fe52d1 |
| T2.1.06.1 | Integration used a non-fast-forward merge (two-parent commit157329e) | PASS | 157329e has two parents; d8be91a ancestor of freshly fetched origin/main (historical push command itself is not inferable) |
| T2.1.06.2 | Historical main push was fast-forward only | UNVERIFIED | Current ancestry proves inclusion, not the historical git push invocation or its flags |
| T2.1.07 | Send review the main SHA, unit/E2E counts and ready-for-review message | UNVERIFIED | No independently accessible message receipt; a planning note is not a receipt |
| T2.1.08 | Cut feat/m2-leftovers from main for the remaining tasks | PASS | git merge-base 932563d 157329e = 157329e; c05d257 merge topology |
| T2.1.09 | The exact verify ancestry and three reviewer files succeed now | PASS | source-checks.json ancestry; task-verifiers.txt, 154/154 selected tests |
| T2.2.01.1 | Correct accepted regular serve increments visits in week mode | PASS | src/core/rush/serve.ts:93; src/core/rush/events.ts:184; tests/core/regularAffinity.test.ts |
| T2.2.01.2 | Incorrect accepted regular serve also increments visits in week mode | PASS | src/core/rush/serve.ts:93; src/core/rush/events.ts:184; tests/core/regularAffinity.test.ts |
| T2.2.02.1 | Hand-backs add no visits | PASS | src/core/rush/events.ts:185; regularAffinity author controls plus independentM2 controls in baseline |
| T2.2.02.2 | Day 2 adds no regular visits | PASS | src/core/rush/events.ts:185; regularAffinity author controls plus independentM2 controls in baseline |
| T2.2.02.3 | Non-regular customers add no regular visits | PASS | src/core/rush/events.ts:185; regularAffinity author controls plus independentM2 controls in baseline |
| T2.2.03 | finishShift carries visits into the save | PASS | src/core/week/session.ts:61; src/app/weekWiring.ts:108; regularAffinity two-shift test |
| T2.2.04 | Two visits, one wrong yields visits 2 and affinity 1 | PASS | task-verifiers.txt: regularAffinity two-shift assertion |
| T2.2.05 | Affinity rules are unchanged | PASS | events.ts:188; event-rates.txt: 35,113 correct serves + 888 usual points = 36,001, zero mismatches |
| T2.2.06 | Nothing reads visits to choose events; event mix / first-try table unchanged | PASS | balance3 comparison: requested 3aa0828^ versus 6bc2b4d, plus actual pre-change 932563d^; visits use search |
| T2.2.07 | Commit body records identical before/after first-try table | PASS | git show 932563d: novice 90/63/37/0/0, average 100/100/100/80/60, expert 100 each |
| T2.2.08 | Verify goes red without the feature | PASS | mutation-T2.2.txt exit 1, wrong-serve visits and saved total fail |
| T2.3.01.1 | Current index is open in week1 | PASS | src/core/week/progress.ts:80; independentAcceptanceContracts all 5 indices in weeks 1,2,9 |
| T2.3.01.2 | Current index is open in week2 and later | PASS | src/core/week/progress.ts:80; independentAcceptanceContracts all 5 indices in weeks 1,2,9 |
| T2.3.02 | Earlier index: done, irrespective of old best | PASS | same exhaustive row test; progress.ts:80 |
| T2.3.03 | Later index: locked, including rows with week-1 bests | PASS | same exhaustive row test and author week-2 case |
| T2.3.04 | best grade is retained even on locked rows | PASS | progress.ts:81; all 15 row arrays checked |
| T2.3.05 | shiftRows agrees with canPlay / shiftCells | PASS | src/core/week/session.ts:18; src/ui/screens/labels.ts:50; baseline UI screen tests |
| T2.3.06 | Verify goes red under old-best-based status | PASS | mutation-T2.3.txt exit 1 |
| T2.4.01.1 | Register implementation is src/ui/pos.ts | PASS | files inspected; rush.css:503 positions the register below measured rail |
| T2.4.01.2 | Register layout is in src/ui/styles/rush.css | PASS | files inspected; rush.css:503 positions the register below measured rail |
| T2.4.02 | At seed 7 Day 2, register does not cover #rinstr at 390x844 while ordering | FAIL | F3: independentAcceptanceBrowser Small case: POS top 114.296875 < instruction bottom 119.078125 |
| T2.4.03 | The same non-intersection holds at 375x667 | FAIL | F3: same 4.78125px overlap; phone-small-reproduction.txt |
| T2.4.04 | Retain a real Playwright phoneHud spec driven by __trial, rather than jsdom | PASS | tests/e2e/phoneHud.spec.ts:1-180; actual expanded Chromium probes |
| T2.4.05 | 1024x640 register box unchanged within 2px from its earlier box | PASS | independentAcceptanceBrowser measures actual ea6fdd4^ versus6bc2b4d at1024x640 after allowing identical bundled fonts: x662/y133.3046875/w346/h373.390625 both, all deltas0px; desktop-reproduction.txt |
| T2.4.06 | Named verify passes for its covered cases | PASS | e2e-full.txt: phoneHud6/6,perf2/2,weekUi3/3 pass; perf JSONs114/102, week-ui/10-scores.png exists and was inspected (whole suite exit 1 due9 audio scenarios) |
| T2.5.01 | Subtitle rules live in base.css / hud.css and #subs stays inside 390px at Medium | PASS | independentAcceptanceBrowser actual Day 1 #subs x16 width358 |
| T2.5.02 | Large #subs stays inside 390px | PASS | independentAcceptanceBrowser actual Day 1 #subs x16.21875 width357.5625 |
| T2.5.03.1 | #subs inside375x667 atSmall | PASS | final-test.txt: six actual Day 1 #subs assertions; recorded-rsubs-geometry.json independently computes all six Day 2 rectangles inside the viewport from logged measurements |
| T2.5.03.2 | #subs inside375x667 atMedium | PASS | final-test.txt: six actual Day 1 #subs assertions; recorded-rsubs-geometry.json independently computes all six Day 2 rectangles inside the viewport from logged measurements |
| T2.5.03.3 | #subs inside375x667 atLarge | PASS | final-test.txt: six actual Day 1 #subs assertions; recorded-rsubs-geometry.json independently computes all six Day 2 rectangles inside the viewport from logged measurements |
| T2.5.03.4 | #subs inside390x844 atSmall | PASS | final-test.txt: six actual Day 1 #subs assertions; recorded-rsubs-geometry.json independently computes all six Day 2 rectangles inside the viewport from logged measurements |
| T2.5.03.5 | #rsubs inside both phone widths atSmall/Medium/Large | PASS | final-test.txt: six actual Day 1 #subs assertions; recorded-rsubs-geometry.json independently computes all six Day 2 rectangles inside the viewport from logged measurements |
| T2.5.04 | phoneHud.spec.ts adds the specified #subs bounding-box assertion for each text size | FAIL | F9: phoneHud.spec.ts:112-132 explicitly queries #rsubs only; phone-spec-contract.json literalSubsQuery=false. New independentAcceptanceBrowser covers actual Day 1 #subs and passes |
| T2.5.05 | Named subtitle verify runs and passes | PASS | e2e-full.txt: phoneHud6/6,perf2/2,weekUi3/3 pass; perf JSONs114/102, week-ui/10-scores.png exists and was inspected (whole suite exit 1 due9 audio scenarios) |
| T2.6.01.1 | setPaused has one exported implementation under src/app/ | PASS | src/app/pause.ts:10,27,36 (replayLast); 51 lines; source-checks.json |
| T2.6.01.2 | resumeAll has one exported implementation under src/app/ | PASS | src/app/pause.ts:10,27,36 (replayLast); 51 lines; source-checks.json |
| T2.6.01.3 | replay (named replayLast) has one exported implementation under src/app/ | PASS | src/app/pause.ts:10,27,36 (replayLast); 51 lines; source-checks.json |
| T2.6.01.4 | Shared lifecycle module remains small (51lines) | PASS | src/app/pause.ts:10,27,36 (replayLast); 51 lines; source-checks.json |
| T2.6.02 | boot imports all three shared functions | PASS | src/app/boot.ts:29,101,175; independentAcceptanceContracts import test |
| T2.6.03 | review harness imports the same functions, copy/comment removed | PASS | tests/review/harness.ts:16,475; no copied, not shared match |
| T2.6.04 | All seven rushTrace hashes remain identical to 2026-10-17-main-1a54a00 | PASS | rush-trace.txt and artifact-checks.json: seven true equalities |
| T2.6.05 | The named verify detects drift back to a separate boot copy | FAIL | F4: mutation-T2.6.txt exits 0 after boot imports pauseDuplicate; new contract test exits 1 |
| T2.7.01 | Two-line top banner moves planning to todo.md on 2026-10-18 and preserves Evidence archive | PASS | docs/TODO.md:3-4; git show 0f30d16 |
| T2.7.02 | MILESTONES Notes maps its M1-M7 to the new M2-M5 including human gates | PASS | docs/MILESTONES.md:21; git show 0f30d16 |
| T2.7.03 | No other existing document text changed | PASS | 0f30d16 diff adds banner and Notes only; root todo tick is bookkeeping |
| T2.7.04 | Both grep predicates succeed | PASS | grep -q "Planning moved to" docs/TODO.md && grep -q todo.md docs/MILESTONES.md (both predicates true) |
| T2.8.01 | Merge local review branch 5b675ce with --no-ff | PASS | 1f0bfa8 merges descendant 0b72172; source-checks.json ancestry |
| T2.8.02 | Suspended cancellation also cuts every source in fading, not only current source | PASS | src/audio/voiceLines.ts:88; independentSuspendedCancellation F5 cases all green |
| T2.8.03.1 | Uncancelled suspended line resumes | PASS | task-verifiers.txt suspendedCancellation/manager controls |
| T2.8.03.2 | onStart runs exactly once | PASS | task-verifiers.txt suspendedCancellation/manager controls |
| T2.8.04 | No later segment starts after cancellation | PASS | task-verifiers.txt segment cancellation controls |
| T2.8.05 | Phase 6 contains 6.13 and Evidence | PASS | docs/TODO.md:481,542; historical-unit-4c4d72d.txt |
| T2.8.06 | Exact two-file verify succeeds | PASS | same two files included in task-verifiers.txt (39 tests combined) |
| T3.1.01 | scripts/build-clean.ts is exposed as npm run build:clean | PASS | package.json:13; scripts/build-clean.ts:1 |
| T3.1.02 | Export HEAD via git archive into scratch, never uncommitted source | PASS | build-clean.ts:75; independentAcceptanceBuild dirty source/HTML sentinel test passes |
| T3.1.03.1 | Scratch build symlinks node_modules | PASS | build-clean.ts:80-86; clean-build.txt |
| T3.1.03.2 | Production build runs in the exported scratch directory | PASS | build-clean.ts:80-86; clean-build.txt |
| T3.1.04 | Copy built dist back | PASS | build-clean.ts:93-95; actual output HTML inspected |
| T3.1.05 | Print the audio-gate line | PASS | clean-build.txt: [audio-gate] ok: 0 licensed audio file(s) in the build |
| T3.1.06.1 | Print total non-audio bytes | PASS | clean-build.txt: 1,562,576 bytes, budget 3,000,000 |
| T3.1.06.2 | Default budget is3,000,000bytes | PASS | clean-build.txt: 1,562,576 bytes, budget 3,000,000 |
| T3.1.07 | Preserve build failure exit code | PASS | independentAcceptanceBuild injects child npm exit23: script returns23 and retains previous dist; final-test.txt |
| T3.1.08 | --budget 1 exits 1 on excess | PASS | budget-one.txt exit 1; over by 1,562,575 |
| T3.1.09 | AGENTS section 3 documents the command | PASS | AGENTS.md:39 |
| T3.1.10 | Named two-command verify detects losing HEAD isolation | FAIL | F5: mutation-T3.1 smoke=0 / budget=1 despite dirty-tree overlay; independent build sentinel red |
| T3.2.01.1 | HTML title is No Wukkas Café | PASS | index.html:11-14; indexMeta.test.ts, 4 passed |
| T3.2.01.2 | HTML description names the week | PASS | index.html:11-14; indexMeta.test.ts, 4 passed |
| T3.2.02.1 | og:title exists and matches title | PASS | index.html:18-31; indexMeta.test.ts |
| T3.2.02.2 | og:description exists and matches description | PASS | index.html:18-31; indexMeta.test.ts |
| T3.2.02.3 | og:image exists | PASS | index.html:18-31; indexMeta.test.ts |
| T3.2.02.4 | og:type exists and is website | PASS | index.html:18-31; indexMeta.test.ts |
| T3.2.02.5 | twitter:card exists and is summary_large_image | PASS | index.html:18-31; indexMeta.test.ts |
| T3.2.03.1 | public/og.png exists | PASS | source-checks.json: 235,963 bytes and PNG dimensions |
| T3.2.03.2 | PNG width is1200 | PASS | source-checks.json: 235,963 bytes and PNG dimensions |
| T3.2.03.3 | PNG height is630 | PASS | source-checks.json: 235,963 bytes and PNG dimensions |
| T3.2.03.4 | PNG is at most300,000bytes | PASS | source-checks.json: 235,963 bytes and PNG dimensions |
| T3.2.04.1 | Generator lives at scripts/og-image.ts | PASS | scripts/og-image.ts:24-52 source; committed image visually inspected |
| T3.2.04.2 | Generator uses Playwright | PASS | scripts/og-image.ts:24-52 source; committed image visually inspected |
| T3.2.04.3 | Generator captures the title screen | PASS | scripts/og-image.ts:24-52 source; committed image visually inspected |
| T3.2.04.4 | Generator viewport is1200x630 | PASS | scripts/og-image.ts:24-52 source; committed image visually inspected |
| T3.2.04.5 | Generator chooses a free dev port | PASS | scripts/og-image.ts:24-52 source; committed image visually inspected |
| T3.2.04.6 | Generator uses ?voice=0 | PASS | scripts/og-image.ts:24-52 source; committed image visually inspected |
| T3.2.05 | A fresh run of the screenshot generator produces the claimed image | PASS | og-regenerated.json: generator rerun in throwaway worktree, exit 0, 1200x630 /242,869 bytes; committed original235,963 bytes restored |
| T3.2.06 | PNG is committed and metadata test parses tags / checks file | PASS | git ls-files public/og.png; task-verifiers.txt |
| T3.2.07 | og:image resolves correctly under repository base and domain base | PASS | artifact-checks.json actual deployed HTML: absolute github.io/no-wukkas-cafe/og.png and cafe.example.com/og.png |
| T3.3.01 | tests/e2e/perf.spec.ts runs in normal suite, no opt-in | PASS | perf.spec.ts has unconditional tests; final E2E discovery |
| T3.3.02.1 | Desktop viewport is1024x640 | PASS | perf.spec.ts:11-20 |
| T3.3.02.2 | Phone viewport is390x844 | PASS | perf.spec.ts:11-20 |
| T3.3.03.1 | Perf scenario starts Day 2 | PASS | tests/e2e/perf.spec.ts:48,59; final e2e-full.txt and both perf JSONs confirm3 customers at measurement |
| T3.3.03.2 | Perf scenario selects seed7 | PASS | tests/e2e/perf.spec.ts:48,59; final e2e-full.txt and both perf JSONs confirm3 customers at measurement |
| T3.3.03.3 | Perf sampling waits for at least3 customers in the cafe | PASS | tests/e2e/perf.spec.ts:48,59; final e2e-full.txt and both perf JSONs confirm3 customers at measurement |
| T3.3.04 | Reads real drawCalls from renderer.info.render.calls | PASS | src/app/debug.ts:213 drawCalls getter; perf.spec.ts:27,66 |
| T3.3.05.1 | Draw calls asserted strictly less than150 | PASS | perf.spec.ts:89-96 |
| T3.3.05.2 | Median frame time is logged | PASS | perf.spec.ts:89-96 |
| T3.3.05.3 | Frame time is not a pass/fail threshold | PASS | perf.spec.ts:89-96 |
| T3.3.06 | Writes JSON sidecars per viewport | PASS | e2e-full.txt: phoneHud6/6,perf2/2,weekUi3/3 pass; perf JSONs114/102, week-ui/10-scores.png exists and was inspected (whole suite exit 1 due9 audio scenarios) |
| T3.3.07 | Both runtime measurements meet budget (or fixme with recorded over-budget result) | PASS | e2e-full.txt: phoneHud6/6,perf2/2,weekUi3/3 pass; perf JSONs114/102, week-ui/10-scores.png exists and was inspected (whole suite exit 1 due9 audio scenarios) |
| T3.4.01.1 | npm run deploy maps to scripts/deploy.ts | PASS | package.json:14; deploy.ts:52-59; deploy-dry.txt |
| T3.4.01.2 | Deploy invokes build:clean | PASS | package.json:14; deploy.ts:52-59; deploy-dry.txt |
| T3.4.02 | Temporary worktree of origin/gh-pages replaces its content with dist | PASS | deploy.ts:72-77; artifact-checks.json and local bare-repo tests |
| T3.4.03 | Adds .nojekyll | PASS | actual dry-run commit trees and bare-repo --push test |
| T3.4.04 | --domain adds CNAME with host | PASS | artifact-checks.json domain commit: cafe.example.com newline |
| T3.4.05.1 | Deployment commit message is deploy <sha> | PASS | deploy-dry.txt: deploy 6bc2b4d, origin/gh-pages and URL |
| T3.4.05.2 | Dry run prints its would-push destination | PASS | deploy-dry.txt: deploy 6bc2b4d, origin/gh-pages and URL |
| T3.4.06.1 | Dry run is the default and does not push | PASS | pages-before/after/after-domain.txt same db4c0567f5ba00ec9bf6078da44a8c78b5a17ef0 |
| T3.4.06.2 | Remote gh-pages stays at db4c056 | PASS | pages-before/after/after-domain.txt same db4c0567f5ba00ec9bf6078da44a8c78b5a17ef0 |
| T3.4.07 | --push updates branch, exercised only against temporary bare repos in this audit | PASS | tests/scripts/deploy.test.ts:37-81 fixture and explicit --push tests; no project push invoked |
| T3.4.08.1 | No-domain build base is /no-wukkas-cafe/ | PASS | artifact-checks.json actual built script URLs; independentAcceptanceBuild environment controls |
| T3.4.08.2 | Custom-domain build base is / | PASS | artifact-checks.json actual built script URLs; independentAcceptanceBuild environment controls |
| T3.4.08.3 | Build receives base/site through its environment | PASS | artifact-checks.json actual built script URLs; independentAcceptanceBuild environment controls |
| T3.4.09 | No dependency added | PASS | git diff 83eadff^ 83eadff -- package.json package-lock.json adds only the deploy script; deploy-dependency-diff.txt |
| T3.4.10 | Temporary repo test covers unchanged dry-run remote / updated pushed branch | PASS | task-verifiers.txt: deploy 7/7 |
| T3.4.11 | Named verify detects a broken production build base | FAIL | F6: mutation-T3.4.txt exit 0 with NWC_BASE="/"; independent child-environment test exit 1 |
| T3.5.01.1 | Playtest guide specifies30minutes | PASS | docs/playtests/README.md:3,27,28 |
| T3.5.01.2 | Playtest guide explains npm run dev -- --host | PASS | docs/playtests/README.md:3,27,28 |
| T3.5.01.3 | Playtest guide supplies the deployment URL with publication caveat | PASS | docs/playtests/README.md:3,27,28 |
| T3.5.02.1 | Clear log between testers | PASS | docs/playtests/README.md:30,57,58,60 |
| T3.5.02.2 | Export log at the end | PASS | docs/playtests/README.md:30,57,58,60 |
| T3.5.02.3 | Guide specifies log/notes destination | PASS | docs/playtests/README.md:30,57,58,60 |
| T3.5.03.1 | Template includes device | PASS | docs/playtests/TEMPLATE.md:26,27,34,36,40 |
| T3.5.03.2 | Template includes browser | PASS | docs/playtests/TEMPLATE.md:26,27,34,36,40 |
| T3.5.03.3 | Template includes Trial result | PASS | docs/playtests/TEMPLATE.md:26,27,34,36,40 |
| T3.5.03.4 | Template includes shifts played | PASS | docs/playtests/TEMPLATE.md:26,27,34,36,40 |
| T3.5.03.5 | Template includes stuck points | PASS | docs/playtests/TEMPLATE.md:26,27,34,36,40 |
| T3.5.04.1 | Template includes pardons per order | PASS | docs/playtests/TEMPLATE.md:48,49,53,60 |
| T3.5.04.2 | Template includes walk-outs | PASS | docs/playtests/TEMPLATE.md:48,49,53,60 |
| T3.5.04.3 | Template includes one-more-shift yes/no | PASS | docs/playtests/TEMPLATE.md:48,49,53,60 |
| T3.5.04.4 | Template includes quotes | PASS | docs/playtests/TEMPLATE.md:48,49,53,60 |
| T3.5.05 | Metrics derive from ROADMAP Success metrics and TODO Phase5; copy instructions only | PASS | docs/playtests/README.md:14-22; TEMPLATE.md:3; no tester results fabricated |
| T3.5.06 | Both required files exist | PASS | test -f docs/playtests/README.md && test -f docs/playtests/TEMPLATE.md; both read |
| T3.6.01 | npm playtest:summary accepts multiple log.json arguments | PASS | scripts/playtest-summary.ts:38; summary-duplicate.txt |
| T3.6.02 | Pure src/sim/telemetrySummary.ts accepts version1 exported records | PASS | telemetrySummary.ts:100-120; purity baseline and task units |
| T3.6.03.1 | Aggregate distinct sessions | PASS | summary-sample/duplicate.txt; independentM3 duplicate checkpoint cases pass |
| T3.6.03.2 | Aggregate shifts | PASS | summary-sample/duplicate.txt; independentM3 duplicate checkpoint cases pass |
| T3.6.03.3 | Deduplicate repeated records from the same session | PASS | summary-sample/duplicate.txt; independentM3 duplicate checkpoint cases pass |
| T3.6.04.1 | Aggregate served | PASS | summary-sample.txt: 8 served, 6 register walk-outs; telemetrySummary tests |
| T3.6.04.2 | Aggregate walk-outs by stage | PASS | summary-sample.txt: 8 served, 6 register walk-outs; telemetrySummary tests |
| T3.6.05.1 | Aggregate accuracy for each field | PASS | summary-sample.txt and telemetrySummary tests |
| T3.6.05.2 | Aggregate pardons per order | PASS | summary-sample.txt and telemetrySummary tests |
| T3.6.06.1 | Compute pooled register-wait median | PASS | independentM3 pooled-median case and telemetrySummary tests |
| T3.6.06.2 | Compute register-wait maximum | PASS | independentM3 pooled-median case and telemetrySummary tests |
| T3.6.07.1 | Aggregate quit points | PASS | summary-sample.txt; telemetrySummary tests |
| T3.6.07.2 | Aggregate trial verdicts | PASS | summary-sample.txt; telemetrySummary tests |
| T3.6.08 | CLI emits Markdown tables | PASS | summary-sample.txt actual output |
| T3.6.09 | Fixture tests/fixtures/telemetry/sample.json was generated by headless playRush | PASS | tests/fixtures/telemetry/makeSample.ts regenerated in scratch: exit 0, byte-identical sample.json (fixture-regeneration.json) |
| T3.6.10.1 | Reject other log versions | PASS | summary-version.txt exit 1: log version2, reads version1 |
| T3.6.10.2 | Print a diagnostic for the rejected version | PASS | summary-version.txt exit 1: log version2, reads version1 |
| T3.6.10.3 | Return exit 1 for rejected version | PASS | summary-version.txt exit 1: log version2, reads version1 |
| T3.6.11.1 | Empty log handled without NaN | PASS | summary-empty exit 0; summary-corrupt exit 1; summary-duplicate and independentM3 tests |
| T3.6.11.2 | Corrupt record rejected | PASS | summary-empty exit 0; summary-corrupt exit 1; summary-duplicate and independentM3 tests |
| T3.6.11.3 | Two logs from one session do not inflate totals | PASS | summary-empty exit 0; summary-corrupt exit 1; summary-duplicate and independentM3 tests |
| T3.6.12 | Named verifier succeeds | PASS | task-verifiers.txt + summary-sample.txt |
| T3.7.01 | README adds how to play including URL pending publication and phone use | PASS | README.md:24-48; git show b62c41f -- README.md adds the section |
| T3.7.02 | Controls include Space and 1-3 | PASS | README.md:39-40 |
| T3.7.03 | Links playtest kit | PASS | README.md:142-144 |
| T3.7.04.1 | Command pointer targets AGENTS.md section3 | PASS | README.md:148-149 |
| T3.7.04.2 | Architecture pointer targets docs/DEVLOG.md | PASS | README.md:148-149 |
| T3.7.05 | Existing sections retained, not rewritten | PASS | git show b62c41f -- README.md (additions only) |
| T3.7.06 | Both grep predicates succeed | PASS | grep -q docs/playtests README.md && grep -q DEVLOG README.md (both predicates true) |
| T3.8.01 | Duplicate record keeps copy that closed last, independent of file order | PASS | src/sim/telemetrySummary.ts:164-170; independentM3 checkpoint reversal cases green |
| T3.8.02 | readExport validates every record before aggregation | PASS | telemetrySummary.ts:116-119; independentM3 five invalid-record controls green |
| T3.8.03 | All seven previous red tests now green | PASS | task-verifiers.txt independentM3 9/9, including seven previous reds |
| T3.8.04.1 | Phase 6 contains6.14 | PASS | docs/TODO.md:485,487,547 |
| T3.8.04.2 | Phase 6 contains6.15 | PASS | docs/TODO.md:485,487,547 |
| T3.8.05 | Exact gate verifier succeeds | PASS | task-verifiers.txt includes independentM3 + telemetrySummary: 17/17 |
| T4.1.01.1 | ScoreEntry exposes mode day2/week/endless | PASS | scores.ts:15; score tests and independent dispatch three modes |
| T4.1.01.2 | ScoreEntry exposes week | PASS | scores.ts:15; score tests and independent dispatch three modes |
| T4.1.01.3 | ScoreEntry exposes shiftIndex | PASS | scores.ts:15; score tests and independent dispatch three modes |
| T4.1.01.4 | ScoreEntry exposes seed | PASS | scores.ts:15; score tests and independent dispatch three modes |
| T4.1.01.5 | ScoreEntry exposes difficulty | PASS | scores.ts:15; score tests and independent dispatch three modes |
| T4.1.02.1 | ScoreEntry exposes grade | PASS | scores.ts:15,125; fromSummary test |
| T4.1.02.2 | ScoreEntry exposes served | PASS | scores.ts:15,125; fromSummary test |
| T4.1.02.3 | ScoreEntry exposes walkouts | PASS | scores.ts:15,125; fromSummary test |
| T4.1.02.4 | ScoreEntry exposes integer tipsCents | PASS | scores.ts:15,125; fromSummary test |
| T4.1.02.5 | ScoreEntry at is supplied externally as ISO timestamp | PASS | scores.ts:15,125; fromSummary test |
| T4.1.03.1 | Week boards separate shift indices | PASS | scores.ts:50; score key tests |
| T4.1.03.2 | Week boards separate difficulties | PASS | scores.ts:50; score key tests |
| T4.1.03.3 | Endless boards separate difficulties | PASS | scores.ts:50; score key tests |
| T4.1.03.4 | Endless keys never alias shift keys | PASS | scores.ts:50; score key tests |
| T4.1.04.1 | emptyScores returns an empty versioned store | PASS | scores.ts:46,164; author parser and independentM4 malformed-grade/cross-board controls green |
| T4.1.04.2 | parseScores recovers corrupt input | PASS | scores.ts:46,164; author parser and independentM4 malformed-grade/cross-board controls green |
| T4.1.04.3 | parseScores recovers another version | PASS | scores.ts:46,164; author parser and independentM4 malformed-grade/cross-board controls green |
| T4.1.05.1 | Grade is the primary week rank | PASS | scores.ts:57; scores.test.ts ordering cases; mutation T4.1 red |
| T4.1.05.2 | Served breaks equal-grade ties | PASS | scores.ts:57; scores.test.ts ordering cases; mutation T4.1 red |
| T4.1.05.3 | Tips break equal-grade/equal-served ties | PASS | scores.ts:57; scores.test.ts ordering cases; mutation T4.1 red |
| T4.1.05.4 | Fewer walk-outs break remaining week ties | PASS | scores.ts:57; scores.test.ts ordering cases; mutation T4.1 red |
| T4.1.06.1 | Endless rank uses served first | PASS | scores.ts:58,64; score Endless test |
| T4.1.06.2 | Endless rank uses tips second | PASS | scores.ts:58,64; score Endless test |
| T4.1.06.3 | Endless ignores grade and walk-outs | PASS | scores.ts:58,64; score Endless test |
| T4.1.07 | Ties keep earlier entry | PASS | scores.ts:77; author tie case + independentM4 reload control |
| T4.1.08 | Top ten cap per board | PASS | scores.ts:11,79; score cap test |
| T4.1.09.1 | insert preserves its input | PASS | scores.ts:69,104; score tests / independentM4 original equality |
| T4.1.09.2 | isNewBest preserves its input | PASS | scores.ts:69,104; score tests / independentM4 original equality |
| T4.1.10 | fromSummary maps summary and context fields | PASS | scores.ts:125; author fromSummary test |
| T4.1.11 | Named verifier detects a ranking regression | PASS | mutation-T4.1.txt exit 1 when fewer-walkouts tie-break removed |
| T4.2.01.1 | ScoresStore.read exists | PASS | src/core/save/scores.ts:11-18,45-55; tests/core/save/scores.test.ts (5/5) |
| T4.2.01.2 | ScoresStore.put exists | PASS | src/core/save/scores.ts:11-18,45-55; tests/core/save/scores.test.ts (5/5) |
| T4.2.01.3 | ScoresStore.clear exists | PASS | src/core/save/scores.ts:11-18,45-55; tests/core/save/scores.test.ts (5/5) |
| T4.2.01.4 | ScoresStore.memoryOnly exists | PASS | src/core/save/scores.ts:11-18,45-55; tests/core/save/scores.test.ts (5/5) |
| T4.2.02.1 | Storage key is nwc.scores.v1 | PASS | scores store:9; newSave contract has no scores; key isolation store test |
| T4.2.02.2 | Scores are outside the save object | PASS | scores store:9; newSave contract has no scores; key isolation store test |
| T4.2.02.3 | No save-schema migration introduced for scores | PASS | scores store:9; newSave contract has no scores; key isolation store test |
| T4.2.03 | Persistence, clearing and failed storage use telemetry-store pattern | PASS | score store tests5/5; copy intentionally differs after T4.8 caches last read |
| T4.2.04 | Tests at tests/core/save/scores.test.ts cover corresponding store operations | PASS | task-verifiers.txt |
| T4.2.05 | Named verifier succeeds | PASS | task-verifiers.txt score store5/5 |
| T4.3.01.1 | App context contains scores | PASS | src/app/context.ts scores; tests/review/harness.ts createScoresStore(null); independent dispatch controls |
| T4.3.01.2 | Review harness supplies a memory score store | PASS | src/app/context.ts scores; tests/review/harness.ts createScoresStore(null); independent dispatch controls |
| T4.3.02 | Every week summary is recorded | PASS | src/app/rushView.ts:64-65; independentAcceptanceContracts week |
| T4.3.03.1 | Day 2 summary writes a score | PASS | same event boundary; independentAcceptanceContracts day2/endless |
| T4.3.03.2 | Endless summary writes a score | PASS | same event boundary; independentAcceptanceContracts day2/endless |
| T4.3.04.1 | Score write precedes report render | PASS | src/app/rushView.ts:64-67; independentAcceptanceContracts three real frame dispatch cases and tests/app/scores.test.ts |
| T4.3.04.2 | One score is written per consumed summary transition | PASS | src/app/rushView.ts:64-67; independentAcceptanceContracts three real frame dispatch cases and tests/app/scores.test.ts |
| T4.3.05.1 | Beating an existing score shows New best! | PASS | src/ui/screens/shiftReport.ts:29-35; tests/ui/shiftReport.test.ts:23-31; separate Endless literal-copy exception is F10 |
| T4.3.05.2 | Week and Day 2 otherwise show Best so far: <grade>, N served | PASS | src/ui/screens/shiftReport.ts:29-35; tests/ui/shiftReport.test.ts:23-31; separate Endless literal-copy exception is F10 |
| T4.3.06.1 | Summary unit asserts one entry | PASS | tests/app/scores.test.ts; tests/ui/shiftReport.test.ts; 6 tests pass |
| T4.3.06.2 | Worse second summary does not change best | PASS | tests/app/scores.test.ts; tests/ui/shiftReport.test.ts; 6 tests pass |
| T4.3.06.3 | UI unit asserts new-best wording | PASS | tests/app/scores.test.ts; tests/ui/shiftReport.test.ts; 6 tests pass |
| T4.3.06.4 | UI unit asserts existing-best wording | PASS | tests/app/scores.test.ts; tests/ui/shiftReport.test.ts; 6 tests pass |
| T4.3.07 | The named verify detects removing actual report-path score recording | FAIL | F7: mutation-T4.3 exit 0; independent dispatch tests3 red |
| T4.3.08 | Endless also uses the literal specified Best so far: <grade>, N served report line | FAIL | F10: src/ui/screens/shiftReport.ts:33-35 instead emits served/tips; existing tests/ui/shiftReport.test.ts:34-39 actually verifies Best so far: 14 served, $21.50 in tips (task-verifiers.txt and final-test.txt both passed this test) |
| T4.4.01 | src/ui/screens/scores.ts displays Mon-Fri best per played difficulty | PASS | scores.ts:22; UI fixture tests + populated browser boards |
| T4.4.02 | Endless top10 includes served and AUD tips | PASS | scores.ts:43; browser has30 rows across3 difficulties |
| T4.4.03 | Clear scores asks twice and first click preserves stored scores | PASS | scores.ts:85; actual browser clicks and localStorage comparison |
| T4.4.04 | Scores title entry wired in title screen and app/title.ts | PASS | src/ui/screens/title.ts:61; actual browser title-to-Scores activation |
| T4.4.05.1 | Escape closes Scores | PASS | scores.ts:99; browser Tab/ShiftTab/Escape/focus assertions |
| T4.4.05.2 | Tab/ShiftTab wrap within Scores | PASS | scores.ts:99; browser Tab/ShiftTab/Escape/focus assertions |
| T4.4.05.3 | Closing returns focus to title Scores button | PASS | scores.ts:99; browser Tab/ShiftTab/Escape/focus assertions |
| T4.4.06 | No horizontal scroll at390px | PASS | browser actual full boards at Large: clientWidth=scrollWidth390, no child overflow |
| T4.4.07 | Fixture row/cents tests and title-button test exist and pass | PASS | task-verifiers.txt tests/ui/scores.test.ts + screens.test.ts7/7 |
| T4.4.08 | Local Scores adds no player name or initials input | PASS | src/sim/scores.ts:15-26 entry schema; src/ui/screens/scores.ts:22-54,61-103 renders only scores and buttons; populated Scores browser probe |
| T4.5.01 | One rush.end.newBest key in src/data/ownerLines.ts | PASS | ownerLines.ts:888; voice script coverage |
| T4.5.02 | src/sim/owner.ts places it after the grade line | PASS | owner.ts:138-139; endLines test |
| T4.5.03 | Copy is count-agnostic Australian English | PASS | ownerLines.ts:888; author content test |
| T4.5.04 | Never said in Endless | PASS | machine.ts:311; author + independentAcceptanceContracts real machine controls |
| T4.5.05 | Never said in Day 2 | PASS | same controls |
| T4.5.06.1 | Gaz never says new-best on first play | PASS | machine.ts:311-313; author + independent controls |
| T4.5.06.2 | Gaz says it only when beating an existing week best | PASS | machine.ts:311-313; author + independent controls |
| T4.5.07 | New key queued in AWAITING_RENDER before rendering | PASS | git show 09c6d64 -- src/data/voice/script.ts |
| T4.5.08 | Owner/voice tests detect violating mode/first-play restrictions | PASS | mutation-T4.5.txt exit 1; actual machine test catches always-true newBest |
| T4.6.01 | Gaz placeholder new-best clip rendered with voices --only gaz | UNVERIFIED | No local voice-cache; voices:check exits1 with597 missing files; renderer invocation cannot be proved from manifest alone |
| T4.6.02 | Manifest committed, no audio committed | PASS | f3d85b3 diff adds one gaz manifest clip; git ls-files audio empty |
| T4.6.03 | AWAITING_RENDER empty again | PASS | src/data/voice/script.ts:37 new Set([]); data voice tests |
| T4.6.04 | voices:check succeeds with actual file duration | FAIL | F8 evidence gap: npm run voices:check exits1,597 missing-audio errors,0 warnings; no voice-cache in this checkout |
| T4.7.01 | Monday pass in tests/e2e/weekUi.spec.ts followed by title -> Scores | PASS | weekUi.spec.ts:216-222 |
| T4.7.02 | Scores Monday grade equals grade displayed by report | PASS | weekUi.spec.ts:182-186 asserts report .best using s.grade; :226 asserts Scores uses same grade; neither assertion compares report .stamp wording directly |
| T4.7.03 | Screenshot10-scores.png into week-UI evidence dir | PASS | e2e-full.txt: phoneHud6/6,perf2/2,weekUi3/3 pass; perf JSONs114/102, week-ui/10-scores.png exists and was inspected (whole suite exit 1 due9 audio scenarios) |
| T4.7.04 | Named weekUi verifier completes successfully | PASS | e2e-full.txt: phoneHud6/6,perf2/2,weekUi3/3 pass; perf JSONs114/102, week-ui/10-scores.png exists and was inspected (whole suite exit 1 due9 audio scenarios) |
| T4.8.01 | Restart after difficulty change refreshes weekBest for Gaz | PASS | src/app/rushWiring.ts:64-67; independentM4 two restart scenarios green |
| T4.8.02.1 | parseScores requires an own-key grade | PASS | scores.ts:154,175; independentM4 parser scenarios green |
| T4.8.02.2 | parseScores rejects entries belonging to another board | PASS | scores.ts:154,175; independentM4 parser scenarios green |
| T4.8.03 | Scores store caches last good read | PASS | src/core/save/scores.ts:28-29; independentM4 late failure case green |
| T4.8.04 | All5 former red reviewer tests green | PASS | task-verifiers.txt independentM4 9/9 |
| T4.8.05.1 | Phase 6 contains6.16 | PASS | docs/TODO.md:490,492,494,551; task-verifiers.txt |
| T4.8.05.2 | Phase 6 contains6.17 | PASS | docs/TODO.md:490,492,494,551; task-verifiers.txt |
| T4.8.05.3 | Phase 6 contains6.18 | PASS | docs/TODO.md:490,492,494,551; task-verifiers.txt |
| T4.8.05.4 | T4.8 gate verify succeeds | PASS | docs/TODO.md:490,492,494,551; task-verifiers.txt |

## 2. Mutation results — do the verify lines have teeth?

One mutation at a time, in `scratch.json`’s detached worktree at 6bc2b4d; exact replacements and patches are retained. T3.1/T3.4 are script features, so their mutation necessarily changes `scripts/` in the disposable worktree, rather than unrelated `src/` code. The T2.6 copy additionally creates `src/app/pauseDuplicate.ts` with the original pause-module bytes. No source in the review checkout was changed.

| Task | Mutation | Original verify result | Independent detector |
| --- | --- | --- | --- |
| T2.2 | Count visits only for correct serves | exit 1 — rejected | Author verifier already catches it |
| T2.3 | Restore old-best-based done status | exit 1 — rejected | Author verifier already catches it |
| T2.6 | Make boot import a private duplicate pause module; harness still uses shared module | exit 0 — **SURVIVED** | new guard exit 1 |
| T3.1 | Overlay working-tree src/ and index.html onto the HEAD export | exit 0; budget exit 1 — **SURVIVED** | new guard exit 1 |
| T3.4 | Pass `/` to the real build even for repository Pages deployment | exit 0 — **SURVIVED** | new guard exit 1 |
| T4.1 | Remove fewer-walkouts tie-break | exit 1 — rejected | Author verifier already catches it |
| T4.3 | Replace report-phase recordScore call with null | exit 0 — **SURVIVED** | new guard exit 1 |
| T4.5 | Always emit new-best at wrap-up | exit 1 — rejected | new guard exit 1 |

Four surviving mutations are P2 findings F4–F7. Their new guards pass at the target and fail under mutation; these are **not four additional red tests on main**. T2.6 is a structural sharing contract, so its guard checks the actual imports. T3.1 tests dirty-output isolation, T3.4 observes the environment received by the build subprocess, and T4.3 dispatches real summary events through the production frame before inspecting the report callback. The existing T4.5 verifier does invoke the machine and correctly catches unconditional congratulations.

## 3. Claims, recomputed numbers and execution record

### Unit counts by exit code

Initial `npm run typecheck && npm run lint && npm test` (sequential stop-on-failure equivalent): **0 / 0 / 0; 111 files, 899 passed, 0 failed**. New tests were absent from that baseline.

Historical totals were recomputed from fresh `git archive` exports of the named commits with the same installed dependencies. Historical durations are observations of old runs, not deterministic acceptance numbers; the rerun durations are retained in the logs.

| Source claim / revision | Claimed files / passed / failed | Recomputed files / passed / failed | Exit |
| --- | --- | --- | ---: |
| 8333240 | 95 /765 /10 | 95 /765 /10 | 1 |
| ef9071d | 96 /787 /0 | 96 /787 /0 | 0 |
| 4d33c22 | 99 /803 /0 | 99 /803 /0 | 0 |
| b78c3a4 | 100 /813 /0 | 100 /813 /0 | 0 |
| 4c4d72d | 100 /823 /0 | 100 /823 /0 | 0 |
| c05d257 | 100 /824 /0 | 100 /824 /0 | 0 |
| 8320cad | 105 /861 /0 | 105 /861 /0 | 0 |
| 4282cf1 | 111 /899 /0 | 111 /899 /0 | 0 |

4c4d72d identifies the 823-test snapshot quoted without a SHA in Phase 6’s 6.13 Evidence; c05d257 adds the lastOrder guard for824. 8320cad and4282cf1 are the respective gate fixes for861 and899. The old 8333240 reds are the already-known defects, not new findings. Current selected task verifiers: **19 files /154 passed, exit 0**; M3 gate **9/9** and M4 gate **9/9** (formerly7 and5 red respectively) remain green.

Final reviewer-inclusive unit run (see `final-exits.json`; typecheck0, lint0, test1; Node26.7.0/npm11.19.0, newer than the documented Node24 target):

```text
Test Files  2 failed | 114 passed (116)
Tests  4 failed | 927 passed (931)
Duration  243.94s (tests 99%, import 1%)
```

### Numeric claim comparison

| Claim | Recomputed result / limit | Verdict |
| --- | --- | --- |
| 1.56 MB without audio | **1,562,576 bytes**, decimal1.56 MB; Pages1,562,923; custom domain1,562,626; budget3,000,000 | PASS at quoted precision |
| `--budget 1` exits1; audio gate printed | exit 1,1,562,575 bytes over; `[audio-gate] ok: 0 licensed audio file(s) in the build` | PASS |
| og.png1200x630 and <=300kB | committed235,963 bytes; freshly regenerated242,869 bytes; both1200x630 | PASS |
| gh-pages remains db4c056 | before/after both dry runs: db4c0567f5ba00ec9bf6078da44a8c78b5a17ef0 | PASS |
| Seven rushTrace SHA-1s equal1a54a00 | seven exact matches, `artifact-checks.json` | PASS |
| ibis134/500 Day 2;159/500 in both week interpretations | 26.8% /31.8% /31.8%; honks634 /427 /408; zero overlaps | PASS |
| THE_USUAL888 in1000 seeds x5 shifts;4112 no-usual affinity-writing shifts | **888 /4112**,27,371 writes over40,000 serves; independentAcceptanceRates passes | PASS |
| Phase 6 subset counts2/2,8/8,ibis3/3,gate5/5; suspended8/8 with related15/15; F5+manager39/39 | Exact historical sources expand to2,8,3,5;8+5+2=15;14+25=39, and each enclosing historical full suite passed | PASS; historical-subset-verification.json |
| Earlier red-before-fix counts4 /6 /4 /7 /5 | Historical reports claim these; this audit reran fixed snapshots, not every old red gate snapshot | UNVERIFIED as historical red executions |
| Slow-audio unit timings16.05s clip/caption;18.05s25-second-load fallback at1x/2x/3x | independentSlowAudio8/8; controlled fake clock, not audible device proof | PASS in stated model |
| Nine stale public voice renders in the old checkout | This review checkout has0; no files were removed; historical local-only inventory cannot be reconstructed from Git | Context differs; old local-file count UNVERIFIED |
| Three real caption probes:0.011 /0.048 /0.027s | Historical wall-clock observations; not reproduced here without voice assets | UNVERIFIED, not relabelled current |
| voices:check passed after T4.6 (597 clips,0 errors) | **exit 1,597 missing-audio errors,0 warnings**; manifest597 entries; segments0/181 | F8: file-backed claim not reproduced |
| Release voice checks / not ready | exit 1:1649 errors =597 missing+597 placeholder+454 pitch-shift+1 shared voice | Expected release rejection; no per-speaker HUMAN summary |
| E2E36 executed /17 opt-in skipped; perf114/102 | 26 passed /9 failed /18 skipped;35 executed,1 missing-segment skip beyond17 opt-in; perf114/102 exactly | F8: green E2E count not reproduced; perf PASS |

Historical E2E claims are scope-qualified:28 passed at ef9071d/4d33c22/b78c3a4,34 at c05d257,35 passed+1 failed at M3/M4 merges, and8 selected week/weekUi passes after the M4 fixes describe different test sets and revisions. They cannot be established as past executions by a current green run or by counting `test()` calls. This audit runs the **current full suite once, last**, preserving its own counts, skips and exit. The quoted3.6/3.7/11.0/26.7/27.8/29.7/30.5/32-minute durations and historical host load~19 are not asserted to reproduce.

### Balance rows

The required3-seed comparison is `3aa0828^` versus `6bc2b4d`; both are fresh archives and both run `npm run balance -- --seeds 3 --out <E/file>` (the actual argv contains one `--` separator, recorded in `commands.json`). Because3aa0828^ already contains the visits change, an additional `932563d^` export checks the true pre-visits state. CSVs and stdout are retained.

```json
{
  "seeds3": {
    "csvIdentical": true,
    "csvBytes": {
      "3aa0828-parent": 6550,
      "6bc2b4d": 6550,
      "932563d-parent": 6550
    },
    "sha256": {
      "3aa0828-parent": "4fa9c3e10ccb8dbce67bcaa31574a23bea5626a1f83cb4be119eaf11741c80db",
      "6bc2b4d": "4fa9c3e10ccb8dbce67bcaa31574a23bea5626a1f83cb4be119eaf11741c80db",
      "932563d-parent": "4fa9c3e10ccb8dbce67bcaa31574a23bea5626a1f83cb4be119eaf11741c80db"
    },
    "firstTryPercent": {
      "novice": [
        "100 %",
        "67 %",
        "0 %",
        "0 %",
        "0 %"
      ],
      "average": [
        "100 %",
        "100 %",
        "100 %",
        "100 %",
        "33 %"
      ],
      "expert": [
        "100 %",
        "100 %",
        "100 %",
        "100 %",
        "100 %"
      ]
    },
    "all15TableRowsEqual": true
  },
  "14827e0": {
    "seeds": 30,
    "changedRoundedRows": [
      {
        "profile": "average",
        "day": "Wednesday",
        "changes": {
          "eventsPerShift": {
            "before": "1.8",
            "after": "1.7"
          }
        }
      },
      {
        "profile": "average",
        "day": "Thursday",
        "changes": {
          "satisfaction": {
            "before": "65",
            "after": "64"
          },
          "serveSeconds": {
            "before": "68.7",
            "after": "68.4"
          }
        }
      },
      {
        "profile": "average",
        "day": "Friday",
        "changes": {
          "eventsPerShift": {
            "before": "1.9",
            "after": "1.8"
          }
        }
      },
      {
        "profile": "expert",
        "day": "Wednesday",
        "changes": {
          "eventsPerShift": {
            "before": "1.8",
            "after": "1.7"
          }
        }
      }
    ],
    "firstTryWalkoutsTriesIdentical": true
  },
  "7586668": {
    "seeds": 30,
    "changedRoundedRows": [
      {
        "profile": "novice",
        "day": "Wednesday",
        "changes": {
          "eventsPerShift": {
            "before": "1.5",
            "after": "1.7"
          }
        }
      },
      {
        "profile": "novice",
        "day": "Thursday",
        "changes": {
          "eventsPerShift": {
            "before": "1.3",
            "after": "1.5"
          }
        }
      },
      {
        "profile": "novice",
        "day": "Friday",
        "changes": {
          "tips": {
            "before": "$6.40",
            "after": "$6.41"
          },
          "eventsPerShift": {
            "before": "1.7",
            "after": "1.8"
          }
        }
      },
      {
        "profile": "average",
        "day": "Thursday",
        "changes": {
          "satisfaction": {
            "before": "64",
            "after": "65"
          },
          "eventsPerShift": {
            "before": "1.3",
            "after": "1.8"
          }
        }
      },
      {
        "profile": "average",
        "day": "Friday",
        "changes": {
          "eventsPerShift": {
            "before": "1.8",
            "after": "1.9"
          }
        }
      },
      {
        "profile": "expert",
        "day": "Thursday",
        "changes": {
          "eventsPerShift": {
            "before": "1.3",
            "after": "1.8"
          }
        }
      },
      {
        "profile": "expert",
        "day": "Friday",
        "changes": {
          "tips": {
            "before": "$12.33",
            "after": "$12.28"
          },
          "serveSeconds": {
            "before": "63.3",
            "after": "63.2"
          }
        }
      }
    ],
    "firstTryWalkoutsTriesIdentical": true
  }
}
```

The30-seed A4/A5 comparisons rerun14827e0^ ->14827e0 and7586668^ ->7586668, including every profile/day row rather than only first-try percentage. The recorded table diff checks the claimed -0.1 event changes,64/65 satisfaction change, THE_USUAL-driven event increases and unchanged first-try/walkout/tries values.

### E2E and device boundary

Ran exactly once, last among all test/build/balance jobs, with one worker: `E2E_PORT=5203 npx playwright test --config tests/review/playwright.ipv6.config.ts` (also `WEEK_UI_SHOTS=<E/week-ui>` solely to retain the requested images). **Exit1: 26 passed,9 failed,18 skipped,53 discovered,29.0minutes.** The process preflight found no competing test/build/balance process. No second full run or focused rerun was performed: week.spec passed all5 cases, including its formerly flaky case in3.4minutes; weekUi passed all3, including Monday/Scores in2.9minutes and the Day 2 bot in3.8minutes.

The historical nominal36-executed/17-opt-in-skipped result is **not reproduced**:35 executed here, with9 failures and one additional missing-segment skip. The17 opt-in skips comprise10 accessibility and7 polish cases; the18th skip is segments.spec because its audio-content-type check correctly rejects the missing clip. The9 failures are1 audio.spec,3 audioSmoke,4 audioState and1 sound-lab listening scenario. All have an absent real-clip fixture or an assumption that Gaz used a real clip; the exact assertions remain failures, not rewritten as skips or passes. F8 records this acceptance/evidence gap. In particular A2/A7's assertions are not proof of separate product regressions here: earlier Gaz TTS can satisfy their unfiltered history/spoken predicates when the expected Gaz clips are absent. Their behaviour with restored assets remains UNVERIFIED.

| Failed assertion | Observed result |
| --- | --- |
| audio.spec.ts:54 | No completed history item within20seconds |
| audioSmoke.spec.ts:114,164 | Expected clip, received tts |
| audioSmoke.spec.ts:256 | No Gaz clip in history |
| audioState.spec.ts:111 | No completed clip after restart |
| audioState.spec.ts:139 | An utterance matched the selected history text (expected no match); selector does not identify a new Dazza utterance |
| audioState.spec.ts:178 | No completed delayed clip within15seconds |
| audioState.spec.ts:207 | Selected utterance volume1, expected0.4; predicate does not identify a new Dazza utterance |
| listening.spec.ts:129 |0 real clips, expected at least2 |

`e2e-full.txt`, `e2e-exit.json`, `e2e-results-index.json`, copied error contexts, trace hashes and extracted MP3 responses preserve the results. The HTTP200 text/html MP3 responses explain why the line-audio probes falsely considered the assets available. No files were manufactured and no extra rerun was used to hide these failures.

Both perf specs passed with3 customers: desktop114 calls /50.0ms median, phone102 calls /33.3ms median; frame medians are software-rendering observations, not device performance guarantees. phoneHud6/6 passed its authored cases. The independent Small-text regression still fails outside that narrower matrix.

`week-ui/06-monday-report.png` and `week-ui/10-scores.png` were visually inspected: both display Excellent,6 served andAUD9.80; the report stamp is “Cracker of a shift”, the source's Excellent wording. The screenshot and the two grade assertions substantiate T4.7 for this first-Monday scenario. The **reviewer red count4 refers only to the new unit regressions**; these9 existing E2E failures are reported separately.

An initial desktop comparison produced a false4px delta because the temporary checkout could not serve symlinked dependency fonts. After adding the original dependency path to that fixture’s Vite fs.allow and asserting font readiness, both revisions measure exactly x662/y133.3046875/w346/h373.390625. The invalid measurement and first unit run are retained as unit-with-invalid-font-baseline.txt / desktop-fonts-blocked.txt; they are not product findings. The corrected full unit run above is authoritative.

Phone probes are Chromium CSS-viewports with touch flags and DPR1, not iPhone Safari or Android hardware. The independent probes cover both 390x844 and 375x667 at Small/Medium/Large, actual Day 1 `#subs`, Day 2 `#rsubs`, register versus `#rinstr`, and populated Scores. The original phoneHud only checks Day 2 `#rsubs` at390px and the register at default Medium; it does not cover the failing Small-text combination.

T4.7 was read, not inferred from its comment: `weekUi.spec.ts:182-186` asserts the report’s `.best` line from `s.grade`; `:226` asserts the Scores row using that same mapped grade. This does establish the displayed best-grade equality on a first play. The main `.stamp` is only checked to differ from “Total disaster”; it is not directly cross-compared to Scores. No stronger assertion is claimed.

## 4. Ranked findings

1. **P1 F1 — `src/core/save/storage.ts:36`:** A successful disk load is not cached, so a later `getItem` exception replaces week3/shift2/$125.00/owned-grinder progress with a fresh in-memory save and the next autosave advances that new save instead of the player’s saved week (**confirmed**, one red independentAcceptanceStorage test).
2. **P2 F2 — `src/core/save/telemetry.ts:33`:** After reading five existing records, a read exception followed by `put` retains only the new record, dropping the earlier session logs from the running session (**confirmed**, one red independentAcceptanceStorage test).
3. **P2 F3 — `src/ui/styles/rush.css:504`:** The register’s zoomed top offset intersects `#rinstr` by 4.78125 px at Small text on both 390x844 and 375x667 (**confirmed**, two red independentAcceptanceBrowser tests and saved PNGs).
4. **P2 F4 — `todo.md:130` / `src/app/boot.ts:29`:** T2.6’s verify stays green after boot switches to its own copied pause implementation, so it cannot protect the sharing requirement (**confirmed**, mutation exit 0, added import-contract guard exit 1).
5. **P2 F5 — `todo.md:181` / `scripts/build-clean.ts:80`:** T3.1’s normal-build/tiny-budget verify stays green after working-tree files contaminate the HEAD export (**confirmed**, smoke0/budget1 while dirty-sentinel guard fails).
6. **P2 F6 — `todo.md:203` / `scripts/deploy.ts:56`:** T3.4’s verifier uses prebuilt fixtures and remains green when the real build receives `/` instead of `/no-wukkas-cafe/` (**confirmed**, mutation exit 0, subprocess-environment guard exit 1).
7. **P2 F7 — `todo.md:265` / `src/app/rushView.ts:65`:** T4.3’s verifier stays green when the production summary-to-score call is removed entirely (**confirmed**, mutation exit 0, three real-dispatch guards fail).
8. **P2 F9 — `tests/e2e/phoneHud.spec.ts:128`:** T2.5 requires measuring literal `#subs`, but its test measures only `#rsubs`, leaving the required Day 1 subtitle case absent (**confirmed** by `phone-spec-contract.json`; new independent Day 1 probes pass today).
9. **P3 F8 — `todo.md:279`:** The T4.6 file-backed acceptance cannot be reproduced in this checkout because all 597 placeholder files, including the new Gaz clip, are absent and the one full E2E finishes 26 passed /9 audio failures /18 skipped (**confirmed environment/evidence gap**, voices:check exit 1; not proof that the author never rendered it; the final E2E audio results share this missing-assets limitation).

10. **P3 F10 — `src/ui/screens/shiftReport.ts:34`:** For a non-new-best Endless run, the report replaces T4.3’s required grade/served wording with served/tips (**confirmed**, exact input/output in the executed bestLine test; a literal-copy mismatch, not a scoring error).

The real application rereads the save in app/weekWiring.ts:21,50,53 and commits a summary through finishShift at:108, so the read-error sequence is reachable in the same running session. The regression starts with week3/shift2 and calls that actual finishShift function after the failure.

F10 is a literal-spec deviation, not a ranking defect: with mode=endless, grade=good, served=14 and tipsCents=2150, the executed UI test confirms “Best so far: 14 served, $21.50 in tips”; T4.3 prescribes “Best so far: Good, 14 served” without an Endless exception. The M4 goal defines Endless ranking by served/tips, but does not explicitly change this report-copy clause. Align the implementation or formally amend that clause.

F1/F2 are the explicitly requested replan flaws, not duplicates of the prior scores-store finding. Their disk backing data remains unchanged because the stores switch permanently to memory-only after the exception; **permanent disk deletion was not reproduced**. F1 is P1 for severe same-session progress loss, not an unsupported disk-wipe claim. Minimal repair: cache the last successfully migrated/parsed read in each store, as scores now does.

F3 combines `rush.css:504`’s measured absolute top with `base.css:166`’s0.9 zoom; instruction bottom119.078125, POS top114.296875. The red tests assert non-intersection rather than accepting the overlap. Medium/Large pass. Minimal repair: express the offset in consistent screen/layout units and retain both phone/text-size regressions.

The missing-asset preflight is also misleading: audio.spec.ts:44, audioSmoke.spec.ts:81-82 and audioState.spec.ts:65 test only response.ok(). Trace network records show absent MP3 URLs returning200 text/html (Vite SPA fallback), so the tests run instead of skipping and then observe TTS or no completed clip. See e2e-audio-responses.json and the final E2E failures; these are not audio acceptance passes.

F9 is a missing specified regression case, not a current Day 1 layout failure: the shared CSS explains why Day 2 is a useful proxy, but does not make the two DOM elements identical. The six new independent Day 1 tests supply the missing coverage; retain it in the named verification path.

Exploratory Node-loader commands in usual-exact*.txt failed before producing a rate measurement; the successful independentAcceptanceRates run supplies the reported rates. Reviewer-only formatting mistakes were corrected before the final typecheck/lint run. Their saved initial outputs are not product findings.

F4–F7 are verifier defects, not claims that the corresponding production features are currently broken. Add the failing-under-mutation guards to each task’s verification path. F8 requires restoring/providing the authorised development assets before claiming file-backed audio acceptance; do not regenerate manifests, purchase voices or change production code to hide it.

## 5. M5 and Edward-gate honesty

| Gate | Observation | Verdict |
| --- | --- | --- |
| T5.1 per-speaker release summary with HUMAN action | voices-check.ts:140 groups error codes and prints at most25 examples, not per-speaker paid-render/actor-import instructions; release exits1 before build | Not implemented |
| T5.2 version/changelog | package.json already0.1.0 in initial aed6129; no later version bump, CHANGELOG.md or tests/scripts/version.test.ts | Partly pre-existing; task not complete, no covert M5 bump |
| T5.3 What the bots got wrong | Heading absent in docs/DEVLOG.md | Not implemented |
| T5.4 release:tag | package script, release-tag implementation and releaseTag.test.ts absent | Not implemented |
| Analytics provider / online leaderboard | Production fetch sites are own audio assets; dev-only review IO is separate; no analytics SDK or online score transport in source/dependencies | No wiring found; local scores only |
| Paid TTS | Existing T5.0 Google adapter is an explicitly recorded older capability; no paid call made in this audit, manifests remain placeholder | Historical never-called claim UNVERIFIED without provider audit logs |
| Audio in git | Required git ls-files audio-extension scan is empty | PASS |
| Deployment | gh-pages db4c056 unchanged before/after; only dry run to project remote | No publication in this audit; a historical no-op --push cannot be disproved by an unchanged ref |
| DECISIONS.md | Answered AFFINITY_RULE, SEGMENT_GATE andQ1 unchanged; Q2-Q7 remain open; history inspected | No new answer authored; historical human authorship not independently authenticated |
| Determinism | requested grep exits1 with0 matches under src/sim and src/core | PASS (grep1 means no match) |
| Source size | Only the same six files previously listed exceed600 lines | PASS, no newly oversized module |

Existing over600-line files: trial.ts687; ownerLines.ts937; voice/manifest.json14933; dev.css839; world/owner.ts623; world/station.ts894. These match the previous M4 review and are not new findings. No source, save schema, economy tuning, audio generation, paid API call, analytics choice, online service, release tag or publication was added by this review.

## Edward에게 (한국어)

- Q2: 병합된 로컬 브랜치 정리 여부, Q3: 기존 작업 폴더의 오래된 음성 렌더 삭제 여부.
- Q4: extra-hot 게이지 목표를 68–74°C로 바꿀지, Q5: Day 1·연습 자막을 음성 시작에 맞출지.
- Q7: 오디오 중단 시 자막 대기·즉시 표시·게임 일시정지 중 어떤 동작을 선택할지.
- 공개 호스트·도메인, 분석 도구 사용, 유료 음성·배우 녹음 진행 여부.
- 온라인 순위표 여부와 Q6의 Steam 출시 시점·래퍼·기능 범위.
