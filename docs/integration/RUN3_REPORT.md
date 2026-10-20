# Overnight run #3 — report

Run of `OVERNIGHT_TODO_3.md`, 2026-10-17 23:18 → 2026-10-18 ~04:00 AEDT, unattended after the start. Base: `origin/main`
1a54a00 + the review branch `chore/review-main-1a54a00` (8333240, merged as a fast-forward first). End: `main` =
`origin/main` = ce38986 (code as of 89e4214; ce38986 only adds the TODO's not-done lists), every push a
fast-forward. Decisions used as given: AFFINITY_RULE = yes,
SEGMENT_GATE = yes.

## Read this first: one reviewer test was edited

`tests/review/independentFuzz.test.ts` → "THE_USUAL remains unreachable across 1000 seeds and five consecutive saved
shifts" asserted the defect itself (`regulars` stay `{}`, THE_USUAL fires 0 times). AFFINITY_RULE = yes makes that
false by construction, and A5 requires THE_USUAL in ≥ 1 of 1000 seeds, so "0 red" and the rule could not both hold
without touching it. At 23:40 I asked about exactly this conflict and Edward chose **"Invert that one test
(Recommended)"**. His later run message said "never edit the reviewer's tests (tests/review/independent*…)". I read
the earlier, specific answer as the exception to the later general rule and inverted that one test in place in
**7586668** (same seeds and saved five-shift loop; it now asserts THE_USUAL > 0 and that affinity is written in shifts
without it). No other reviewer file (`tests/review/independent*`, `*.browser.ts`, `tests/fuzz/*`,
`tests/review/playwright.*.config.ts`) was edited. The original test: `git show 7586668^:tests/review/independentFuzz.test.ts`.

`tests/review/harness.ts` (the review's helper, not one of its acceptance tests and not on the forbidden list) was
changed twice: in A3 its copied voice hold followed boot's new rule (`MAX_VOICE_HOLD` removed), and in B1 it was
switched to call the production frame driver, as B1 asked; A2 also gave its fake HUD an `onStop` no-op.
`tests/review/orderFlow.ts` was not touched.

## Summary

| Item | Commit(s) | Status |
| --- | --- | --- |
| merge review branch | 8333240 (fast-forward) | done |
| A1 prune never follows symlinks out of the cache | a3ff4e5 | done; independentPrune 2/2 |
| A2 captions start with the voice, stop with it | a16fde9, ef9071d (voices off keeps the words) | done; probes 3/3 |
| A3 one deadline, audio clock | 66283fe | done; independentSlowAudio 8/8 |
| A4 ibis honks wait; week bird at 0.30 | 14827e0 | done; independentFuzz ibis 3/3 |
| A5 +1 affinity per correct serve (THE_USUAL) | 7586668 | done; reviewer test inverted (above) |
| A6 placeholder segment fails the build | cd28b37 | done; independentGate 5/5 |
| A7 "telemetry has no transport" | 59b1c47 | done (docs, a comment) |
| A8 Phase 1.5 evidence, exact viewports + sidecars | 1e34e0c | done; 16 PNG + 18 JSON |
| A9 verification, TODO Phase 6 | 38b80e5 | done |
| A10 push main | 1a54a00..38b80e5 | done (fast-forward) |
| B1 `refactor/frame-driver` | 4c8467d, merge 9f05502 | done, pushed |
| B3 `feat/a11y` | dfc294c d, e94f7ff a, b09615f b, a163a66 c, f955e3d e (save v3); 102f0a1 chore; 5aa1d4a flake fix; merge c1b6f17 | done, pushed |
| B2 `refactor/audio-manager` | 1285f00; f6da39e, 89a8e98 (test race); merge 2dd94b1 | done, pushed |
| B4 `docs/steam-spike` | 79fc8cb, merge cbd465b | done (research only, no cargo) |
| B5 `docs/devlog` | b3fd5ee, merge e2c9c94 | done |
| B6 `chore/worktrees` | merge 89e4214 | **[!]** no branch deleted (rule conflict, below) |

Order: B1 → B3 → B2 → B4 → B5 → B6, the TODO's priority order (time didn't run short).

## Exact counts

- **Unit** (`npm run typecheck && npm run lint && npm test`, read by exit code, never piped through grep):
  baseline on 8333240: 95 files, **10 failed / 765 passed**. Part A end (ef9071d): 96 files, 787 passed, 0 failed.
  Final (89e4214): **97 files, 797 passed, 0 failed**.
- **Review acceptance tests**: independentPrune 2/2, independentSlowAudio 8/8, independentFuzz 5/5 (ibis 3/3, THE_USUAL
  inverted 1/1, PROPOSED RULE 1/1), independentGate 5/5, independentTelemetry 2/2; `tests/review` 61/61 on the shared
  frame driver.
- **E2E** (`E2E_PORT=5202 npx playwright test --config tests/review/playwright.ipv6.config.ts`):
  - Part A (the tree of ef9071d; 38b80e5 only adds the TODO): **28 passed, 7 skipped (30.5m), exit 0**.
  - feat/a11y before its merge: 27 passed, 17 skipped, 1 failed = a pre-existing flake in `tests/e2e/audio.spec.ts`
    (it fails 2 of 5 on 8333240, the code from before the run; fixed in 5aa1d4a, then its remaining race closed in
    f6da39e and 89a8e98: 15/15 with `--repeat-each 15`).
  - B1 smoke (trial, practice, audioState, audioSmoke, rush): 10 passed (11.1m). B2 audio subset (audio, audioSmoke,
    audioState, listening, music, segments, ibis): 15 passed (4.3m).
  - **Final (89e4214): 28 passed, 17 skipped, 0 failed (26.6m), exit 0.**
  - "Skipped" = the two opt-in evidence specs (`polishEvidence`, `a11yEvidence`), which run only with POLISH_SHOTS /
    A11Y_SHOTS.
- **Caption probes** (`tests/review/playwright.probes.config.ts`): 3/3 at 66283fe, at 38b80e5, on feat/a11y, on the B2
  branch, and 3/3 on final main (0.021–0.037 s); the caption follows the clip's start by 0.005–0.048 s (it was
  10.02 s ahead).
- **Build**: clean `git archive` export of 89e4214 (node_modules linked): `npm run build` exit 0, `[audio-gate] ok: 0
  licensed audio file(s) in the build`. The in-checkout build still stops on nine old untracked placeholder renders in
  the gitignored `public/assets/voice/` (no provenance): the gate doing its job on local files; left for you.
- **Balance** (`npm run balance`, 30 seeds): A4 −0.1 events/shift in three rows, average Thursday satisfaction 65 → 64;
  A5 raised Wed–Fri events/shift (average Thursday 1.3 → 1.8: THE_USUAL now fires). First-try pass, walk-outs and
  tries to pass unchanged in every row. Full rows in the 14827e0 and 7586668 commit bodies.
- **Ibis fuzz** (500 seeds each): Day 2 26.8 %, week shift 3 and index 3 both 31.8 %, 0 overlaps (was 189 / 541 / 716).
- **THE_USUAL**: 888 times in 1,000 seeds × 5 saved shifts; 4,112 shifts wrote affinity without it.

## rushTrace hashes (seven profiles, `node --import ./tests/review/nodeReviewLoader.mjs tests/review/recomputeRushTrace.ts`)

Identical at every point measured: the review's 1a54a00 values, Part A end (ef9071d), before and after B1, before and
after B2, and on final main (ce38986, re-measured at the end):

| profile | SHA-1 (1a54a00 = ef9071d = after B1 = after B2 = ce38986) |
| --- | --- |
| normal | c565b78d766c5ba56ecd8392abd023854b279cd1 |
| hard | 884d6e217f4bd585a5f9b6978bc98a006cf38905 |
| easy | f4065c58885c4122e4c40ca5652e86af91f89348 |
| aids | dbbb564067f0e0c74eb796726e3686f27618ada8 |
| misheard | 9cb0c12941833c576d9f797b618c271d93ddf528 |
| hurry | d975462d381d8b61e57311db657d280d7a302bff |
| idle | 90a50992c8d385091bb9c22a3e4455d5d9b93c2f |

## What is NOT done

- **B6 branch deletion**: not done. B6 says delete fully merged local branches; `docs/TODO.md`'s global rules say
  "never delete branches", so I deleted none. Merged into main (21; 8 are also on origin: feat/cafe-bgm,
  feat/day1-barista-trial, feat/day2-morning-rush, feat/voice-casting, feat/voice-listening, fix/audio-integration,
  fix/day1-pull-through, fix/day2-first-shift; the other 13 exist only here, and main has their content): balance/week1, chore/review-main-1a54a00,
  chore/worktrees, claude/recursing-perlman-d9d838, docs/devlog, docs/queue-jump-decision, docs/steam-spike,
  docs/todo-phase4-5-evidence, feat/a11y, feat/cafe-bgm, feat/day1-barista-trial, feat/day2-morning-rush,
  feat/voice-casting, feat/voice-listening, fix/audio-integration, fix/day1-pull-through, fix/day2-first-shift,
  fix/phase1-5-polish, refactor/audio-manager, refactor/frame-driver, voice/phase3. Merged but checked out in a
  worktree (18, left alone): chore/merge-day1-pull-through, chore/p1-ownership, chore/split-main, chore/split-styles,
  feat/audio-qa-hardening, feat/bin-chicken, feat/latte-art-polish, feat/service-hud, feat/shell-screens,
  feat/ship-segments, feat/telemetry, feat/voice-audition-v2, fix/event-hooks, fix/p4-audio, fix/p4-gate,
  integrate/week1, test/phase4-review, test/week-ui-e2e. `git worktree prune` had nothing to prune; only the run's own
  scratch worktree was removed.
- **Day 1 trial and practice subtitles** still start when a line is asked for, not when its voice starts
  (`trialWiring.ts` hud.onSay, `practiceWiring.ts` practiceHud.onSay). A2 was scoped to the rush (and the shared Replay).
- **The review harness still copies** boot's setPaused / resumeAll / replay (B1 shared the frame only, as asked).
- **No device testing**: nothing ran on an iPhone, Android or Steam Deck. The accessibility evidence is Chromium only.
- **Steam**: research only (no `cargo` on this machine; no toolchain installed); no scaffold, no decision.
- **Devlog**: architecture only; playtest learnings wait for Phase 5 (HUMAN).
- **Seen, not fixed** (outside tonight's list):
  - the milk gauge's target card reads 55–65 °C even on an extra-hot order (68–74 °C; `ui/gauges.ts` uses
    `TARGET_TEMP` for every flat white);
  - on a 390 px phone the register panel covers the instruction line behind it (it shows faintly through);
  - at Medium text on a 390 px phone the subtitle box is 392 px wide, 1 px over each side (as before tonight);
  - `RegularMemory.visits` is still never written.
- **Process notes**: 102f0a1 (a one-line `.prettierignore` change) was committed after `prettier --check .` only, not
  the full typecheck + lint + test trio; the next commit's full run covered it. The A6 clean build used
  `git stash create` (no stash entry, working tree untouched), which `docs/TODO.md`'s "never stash" rule arguably
  covers. The messages of two unpushed commits were amended to correct counts (A8, B3a).

## Questions for Edward

1. **The inverted reviewer test** (7586668): keep it inverted, or have the reviewer re-issue it?
2. **Branches**: may I delete the 21 merged branches listed above (not the 18 checked out in worktrees)? Keep
   `chore/review-main-1a54a00` until the reviewer confirms they don't need it pushed (only main carries 8333240).
3. **Steam** (`docs/STEAM.md`): first release or later port; Tauri or Electron; which Steam features (none,
   achievements, Steam Cloud)?
4. **Milk gauge on extra-hot orders**: should its target zone follow the ticket (68–74 °C)? A small UI fix if yes.
5. **Day 1 and practice captions**: give them the rush's "start with the voice" rule?
6. **The nine old renders in `public/assets/voice/`** (untracked, gitignored) stop the in-checkout build: delete them,
   or keep building from a clean export?
7. Still open from before: 1.5.6 pull-through thinning at 2.99 cm (pour physics, your feel-test); the Phase 3 and
   Phase 5 HUMAN items (paid TTS render, actors' takes, the playtest).
