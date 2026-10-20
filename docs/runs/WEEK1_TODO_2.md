# Unattended run #2 — ordered TODO (base: origin/main 70ca3fd)

Run in `~/Desktop/no-wukkas-cafe` on branch `main`, ONE session, top to bottom. Update the
checkboxes and Evidence lines here as you go. This file stays UNTRACKED (never `git add` it).

Global rules (same as run #1):
- Read AGENTS.md first. Code, commits, game text in English.
- Before every commit: `npm run typecheck && npm run lint && npm test` exit 0; paste the tail
  into Evidence. Run e2e once at the end (R6) on a free port, not after every task.
- Conventional Commits, small commits. Never force/reset/clean/stash/delete. Never push
  anything except `main` as a plain fast-forward at the very end (R7). Never touch gh-pages.
- Never stage .env*, voice-cache/, voice-auditions/, public/assets/voice/, node_modules/,
  dist/, screenshots, logs, any audio. Never run a paid API.
- No Math.random / Date.now / setTimeout in src/sim or src/core. Money in integer cents.
- A task that can't be done safely → mark `[!]` with one line, continue with the next
  independent task. Do not widen scope.

---

## R0 — Inventory  `[x]`
- `git status --short`, `git branch --show-current` (must be `main`), `git log -3 --oneline`,
  `git fetch origin`, confirm `origin/main` == HEAD.
- Baseline `npm run typecheck && npm run lint && npm test`; record counts.
- Evidence: start state was branch `feat/voice-listening` @ 70ca3fd; `main` was checked out in
  worktree `../no-wukkas-cafe-day2` at 1b9c74b (behind origin/main, ancestor of it). Freed it
  non-destructively: `git -C ../no-wukkas-cafe-day2 switch --detach` (day2 keeps its files,
  HEAD detached at 1b9c74b, only untracked dirs there), `git fetch . origin/main:main`
  (plain ff 1b9c74b..70ca3fd), `git switch main`. `git rev-parse main origin/main HEAD` →
  all 70ca3fd4d9e6. `git status --short` → `?? WEEK1_TODO_2.md` only. Log:
  70ca3fd Merge …integrate/week1 into feat/voice-listening / bb8ccb1 / 23e9a0a.
  Baseline: typecheck 0 errors, lint clean ("All matched files use Prettier code style!"),
  vitest `Test Files 44 passed (44) / Tests 404 passed (404)`, 22.8 s.

## R1 — Test timeouts  `[x]`
- Headless-shift unit tests time out at vitest's 5 s default on slower machines (rush.test,
  rushWeek.test, audioContract.test, rushListening.test). Set `testTimeout: 20000` in the
  vitest config (not per-test) and remove any now-redundant per-test timeouts.
- Commit: `test: 20 s unit timeout for headless shift tests`
- Evidence: commit 5804387. `vite.config.ts` test block gets `testTimeout: 20_000`; removed the
  8 per-test `20000` overrides (rushEvents ×4, rushWeek ×3, rushTrace ×1 + its stale comment).
  Kept the longer ones (rushEvents 30000, rush 60_000, rushPace 120_000); voices.test's
  `timeout: 60_000` is a spawnSync option, not a test timeout. Checks before commit:
  typecheck/lint exit 0, `Test Files 44 passed (44) / Tests 404 passed (404)`, 22.6 s.

## R2 — Merge fix/day1-pull-through  `[!]`
- `git merge --no-ff origin/fix/day1-pull-through`. Expected: no conflicts (latte/camera/
  coach only). If conflicts appear outside src/world, src/sim/latte, src/ui/lesson*,
  src/core/barista.ts, AGENTS.md — stop, mark `[!]`, `git merge --abort`.
- Then run `/code-review` on the merged diff; fix only correctness findings; commit fixes
  as `fix(latte): address review of pull-through merge`.
- Evidence: `[!]` conflict outside the allowed paths → aborted. `git merge --no-ff --no-commit
  origin/fix/day1-pull-through` (8 commits, 4718592…b234a14) reported
  `CONFLICT (modify/delete): src/core/rush.ts deleted in HEAD and modified in
  origin/fix/day1-pull-through` (main split it in 32bec7b into src/core/rush/{machine,register,
  serve,speech,…}.ts) plus a one-line AGENTS.md conflict (`__trial` handle list: main adds
  `save`, branch adds `projectAnchor(…)`). Ran `git merge --abort`; `git status --short` →
  only `?? WEEK1_TODO_2.md`, HEAD still 5804387. The branch's rush.ts hunk is small (247f5dd,
  `serve()`: reject penalty no longer floored at 1 patience: `c.patience -= c.def.patience *
  REJECT_PENALTY`) and would port to src/core/rush/serve.ts, but that is outside this task's
  allowed conflict set, so left for Edward. `/code-review` not run (nothing merged).

## R3 — Merge feat/voice-audition-v2  `[x]`
- `git merge --no-ff origin/feat/voice-audition-v2`. Expected conflicts at most in
  docs/ROADMAP.md, docs/AUDIO_PROVENANCE.md, AGENTS.md (keep both sides) and
  src/dev/** (take theirs). Nothing in src/core or src/sim should conflict; if it does, stop.
- Verify the dev casting page and sound lab still build (`npm run build`) and that the
  audio gate still reports 0 licensed files and release:check still fails by design.
- Evidence: merge commit 8f2211d (parents 5804387 + b40dc2c; 4 branch commits, 34 files).
  Only conflict: AGENTS.md test:e2e line → kept both ("the week" + "dev review pages",
  ~15 min). ROADMAP.md and vite.config.ts auto-merged (R1 `testTimeout` kept beside the new
  `devTools` plugin). Nothing staged under src/core or src/sim; no audio/images/.env staged.
  Before commit: typecheck/lint exit 0, `Test Files 49 passed (49) / Tests 438 passed (438)`.
  `npm run build` in this checkout exits 1: the gate finds 7 stale gitignored mp3s in the
  local `public/assets/voice/` (Oct 13 renders, untracked, not in origin/main, not deleted)
  ("7 audio file(s) in the build have no verified licence"). A clean build of exactly the
  staged tree (`git checkout-index -a --prefix=<scratch>/`, node_modules symlinked) exits 0:
  `✓ built in 127ms` / `[audio-gate] ok: 0 licensed audio file(s) in the build`. The dev
  casting page and sound lab are dev-server only (not in the Vite build); their TS (src/dev,
  scripts/vite-dev-tools.ts) is covered by typecheck, and their e2e specs run in R6.
  `npm run release:check` exits 1 by design: `voices:check (release): 509 clips, status
  "placeholder", 906 error(s)` incl. `error placeholder-in-release: 509`.

## R4 — Segment playback (audio side of Lane A, no paid calls)  `[x]`
- Generated orders are VoiceRef{kind:'segments'} but fall back to browser speech because no
  segment clips exist. Make the audio manager play a segment list as back-to-back clips when
  the clips exist, with one subtitle for the joined transcript and the same A3 hold/A10
  coalescing semantics as a single clip. When any segment is missing, fall back to browser
  speech for the WHOLE line (never half clip, half TTS).
- Extend `npm run voices` so the macOS placeholder renderer can render
  src/data/voice/segments.ts into voice-cache/segments/ (dev only, gitignored, provenance
  'placeholder'), so the path can be tested locally. Do not commit audio.
- Tests: unit on the manager (segments play in order; missing segment → full fallback;
  pause mid-list freezes; leaving customer drops the rest). e2e: one generated order on a
  week shift plays ≥2 segment clips when placeholders exist (skip cleanly when absent).
- Commit: `feat(audio): play generated orders as segment clips with whole-line fallback`
- Evidence: commit dc36c50 (13 files). Register → `customerListen(…, c.line.voice)` →
  `Utterance.voice` → main.ts `audio.say({… segments})`; Replay keeps it (`lastListen.voice`);
  slow repeat carries none. Manager `saySegments`: fetch+decode all parts first (A3: `loading`
  true until then), play part i+1 on part i's `onended` (context clock → pause freezes), one
  PlayRecord with `segments` = parts started; `stopSource`/newer line → rest dropped; any part
  missing → `viaTts` whole line, missing file remembered (no refetch). Prod builds skip segments
  (`import.meta.env.DEV`). `npm run voices -- --segments` → `segments: rendered 181, 181/181 on
  disk in …/voice-cache/segments (placeholder)` + index.json; manifest.json untouched (not in
  `git status`). voice-cache/ was absent in this checkout: copied the gitignored placeholder
  cache from ../no-wukkas-cafe-integrate (`voices:check (development): 509 clips … 0 error(s)`).
  Tests: tests/audio/manager.test.ts (5: in order / missing → whole TTS / pause freezes / stop
  drops rest / slow → TTS) + tests/core/rushSegments.test.ts (3) → `Tests 8 passed (8)`;
  e2e tests/e2e/segments.spec.ts on :5195 → `✓ … plays two or more segment clips as one line
  (14.9s) / 1 passed`; with voice-cache/segments moved aside → `1 skipped`. Pre-commit checks:
  typecheck/lint exit 0, `Test Files 51 passed (51) / Tests 446 passed (446)`. No audio staged.
  Not done: line timing still uses reading time for generated orders (no committed segment
  durations), so the register can open before a long segment list finishes.

## R5 — Upgrade shop (T5-hook section 5)  `[x]`
- Minimal shop screen reachable from shift select: lists src/data/upgrades.ts, buys with
  SaveV2.cents, records ids in SaveV2.upgrades (shape unchanged). Wire the station
  parameter each upgrade names (grinder speed, second group head, steam rate, docket rail
  capacity) into createRush via the week context. Prices stay TODO(balance).
- Tests: buy/refuse on cents, parameters reach the machine, save round-trip.
- Commit: `feat(shop): upgrades bought from the save and applied to the station`
- Evidence: commit a47f701 (12 files). Pure src/sim/shop.ts: `BASE_STATION` (= every upgrade's
  `from`), `stationParams(owned)`, `buyUpgrade(save,id)` → new SaveV2 or `short|owned|unknown`
  (integer cents, shape unchanged). `weekFor`/`endlessFor` add `station`; `createRush` →
  `createBarista(week?.station)`; grind/steam steps use `dt * grindSpeed|steamSpeed` (×1 by
  default → Day 2 byte-identical, rushTrace hashes unchanged); `railOrder` caps the rail at
  `ticketsShown` in week mode only (3, 6 with the docket rail; Day 2 shows all). Shop section on
  shift select (`.shift-select-shop`, textContent only, disabled when owned or short) → main.ts
  `buyUpgrade` → `store.save` → screen redrawn. Tests: tests/sim/shop.test.ts (4: base = from,
  params, buy in cents, refuse short/owned/unknown) + tests/core/shopStation.test.ts (5: Day 2
  base station, params reach week/Endless/restart barista, grinder ×1.4 dose and faster steam,
  rail 3/6/all, save round-trip) → `Tests 9 passed (9)`; session.test expectation updated for
  the new `station` field. Pre-commit: typecheck/lint exit 0, `Test Files 53 passed (53) /
  Tests 455 passed (455)`. NOT done: `groupHeads` reaches the machine (barista.station) but
  has no effect: the station has one group head, dual extraction is out of scope. Prices stay
  TODO(balance); no balance diff (economy not ported, `npm run balance` is a stub). The 3-ticket
  rail cap is new in week mode (the data's `from: 3`): flagged for Edward.

## R6 — Full verification  `[x]`
- `npm run typecheck && npm run lint && npm test && npm run build`, then
  `E2E_PORT=5194 npx playwright test` (expect ~15 min). Paste counts. Do not claim e2e
  passed if it did not run to completion.
- Evidence: at HEAD a47f701, clean tree (`?? WEEK1_TODO_2.md` only).
  ```
  > tsc --noEmit                                   (exit 0, no output)
  > eslint . && prettier --check .
  All matched files use Prettier code style!
  > vitest run
   Test Files  53 passed (53)
        Tests  455 passed (455)
     Duration  22.62s
  ```
  `npm run build` in this checkout → exit 1, from untracked local files only (7 stale Oct-13
  mp3s in the gitignored `public/assets/voice/`, not in git, not deleted):
  ```
  ✓ built in 266ms
  [audio-gate] removed 483 placeholder voice clip(s) from …/dist: placeholder audio never ships
  Error: [audio-gate] 7 audio file(s) in the build have no verified licence:
    assets/voice/beryl/5b4c26fd.mp3: no provenance: not in the voice manifest or provenance.json
    … (dazza ×2, gaz, jiwoo ×2, karen)
  ```
  `npm run build` of exactly the tracked tree at HEAD (`git checkout-index -a` into scratch,
  node_modules symlinked) → exit 0:
  ```
  ✓ built in 112ms
  [audio-gate] ok: 0 licensed audio file(s) in the build
  ```
  `E2E_PORT=5194 npx playwright test` ran to completion (with the placeholder voice-cache and
  segment clips present):
  ```
  ✓ 1–2 audio.spec  ✓ 3–5 audioSmoke  ✓ 6–9 audioState (A1 A2 A3 A7)  ✓ 10 casting
  ✓ 11–12 ibis  ✓ 13–14 listening (sound lab)  ✓ 15 music  ✓ 16 practice  ✓ 17 rush
  ✓ 18 segments (14.0s)  ✓ 19 trial  ✓ 20–22 week
    22 passed (16.3m)
  e2e exit=0
  ```
  Judgement: green for the code on main (the only failure is a local untracked-files build
  problem, listed as an open question for Edward).

## R7 — Push and report  `[x]`
- Only if R6 is green: `git push origin main` (must be a fast-forward; if rejected, stop
  and report — do not pull or force).
- Write docs/integration/RUN2_REPORT.md (untracked): per task — commits, what is NOT done,
  `[!]` items, open questions for Edward. Print it in the conversation.
- Evidence: `git fetch origin`; `git merge-base --is-ancestor origin/main main` → true;
  `git push origin main` → `To https://github.com/EdwardH-jedi/no-wukkas-cafe.git /
  70ca3fd..a47f701  main -> main` (plain fast-forward, no force). After fetch: origin/main =
  main = a47f701, `## main...origin/main`. docs/integration/RUN2_REPORT.md written, untracked
  (`?? docs/integration/`, `?? WEEK1_TODO_2.md`; neither staged), printed in the conversation.
