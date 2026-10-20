# Unattended run #2 — report

Run: 2026-10-15, one Claude Code session in `~/Desktop/no-wukkas-cafe`, branch `main`, following
`WEEK1_TODO_2.md` top to bottom. Base: origin/main 70ca3fd. This file is untracked (as is the TODO).

## Summary

| Task | Status | Commit(s) |
|---|---|---|
| R0 Inventory | done | (none) |
| R1 20 s unit timeout | done | 5804387 `test: 20 s unit timeout for headless shift tests` |
| R2 Merge fix/day1-pull-through | **[!] aborted** | none (conflict outside the allowed paths) |
| R3 Merge feat/voice-audition-v2 | done | 8f2211d merge (AGENTS.md conflict, both sides kept) |
| R4 Segment playback | done | dc36c50 `feat(audio): play generated orders as segment clips with whole-line fallback` |
| R5 Upgrade shop | done (one parameter inert, see below) | a47f701 `feat(shop): upgrades bought from the save and applied to the station` |
| R6 Full verification | done: unit 455/455, e2e 22/22; build clean for the tracked tree (local-only failure noted) | (none) |
| R7 Push | done: fast-forward `70ca3fd..a47f701 main -> main` | (none) |

## R0 — Inventory

- The session started on `feat/voice-listening` @ 70ca3fd, and `main` was checked out in another
  worktree (`../no-wukkas-cafe-day2`, at 1b9c74b, behind origin/main). To work here on `main`
  without force/reset, I detached that worktree's HEAD (`git -C ../no-wukkas-cafe-day2 switch
  --detach`). Its files are unchanged and it only has untracked dirs. Then I moved local `main`
  forward with a plain fast-forward (`git fetch . origin/main:main`, 1b9c74b..70ca3fd) and ran
  `git switch main`.
- Baseline: typecheck and lint clean, `Test Files 44 passed (44) / Tests 404 passed (404)`.

## R1 — Test timeouts

- `vite.config.ts` test block: `testTimeout: 20_000`. Removed the 8 per-test `20000` overrides
  (rushEvents ×4, rushWeek ×3, rushTrace ×1). Longer overrides stay (30 s, 60 s, 120 s).

## R2 — Merge fix/day1-pull-through: [!] not merged

- `git merge --no-ff --no-commit origin/fix/day1-pull-through` →
  `CONFLICT (modify/delete): src/core/rush.ts deleted in HEAD and modified in
  origin/fix/day1-pull-through`. main split `rush.ts` into `src/core/rush/*` in 32bec7b. There
  was also a one-line AGENTS.md conflict. `src/core/rush.ts` is outside the allowed conflict set,
  so I ran `git merge --abort` and the tree came back clean. `/code-review` was not run because
  nothing was merged.
- The branch's change to rush.ts is small. In 247f5dd, `serve()` stops flooring the reject
  penalty at 1 patience (`c.patience -= c.def.patience * REJECT_PENALTY`), so a hand-back can
  empty patience. It would port to `src/core/rush/serve.ts`, and its tests are in
  `tests/core/rush.test.ts` on the branch.

## R3 — Merge feat/voice-audition-v2

- Merge commit 8f2211d, with 4 branch commits and 34 files: casting page, sound lab, audition
  index and decisions, provider research.
- The only conflict was the AGENTS.md `test:e2e` line. I kept both sides ("the week" + "dev
  review pages"). `vite.config.ts` auto-merged and keeps the R1 timeout beside the new `devTools`
  plugin.
- `npm run release:check` exits 1 by design: `509 clips, status "placeholder", 906 error(s)`,
  including `placeholder-in-release: 509`.
- Build: see R6. In short, it fails in this checkout because of untracked local files, and the
  tracked tree builds clean with `[audio-gate] ok: 0 licensed audio file(s) in the build`.

## R4 — Segment playback

- What is wired:
  - The register passes a generated order's `VoiceRef{kind:'segments'}` to the utterance and to
    Replay (`lastListen.voice`).
  - main.ts passes `segments` to `audio.say`.
  - A slow repeat carries no segments, because segments are rendered at normal pace only. It
    stays browser speech for the whole line.
- How the manager plays a segmented line:
  - It fetches and decodes every part first. `loading` stays true until then, so the A3 hold
    covers the whole list.
  - It then starts each part on the previous part's `onended`, on the AudioContext clock. Pausing
    (which suspends the context) freezes the list.
  - It keeps one PlayRecord (`segments` = parts started) and one fade. A newer line or
    `stopVoice` drops the parts not yet played (the A10 path).
  - If any part is missing, the **whole** line goes to browser speech. The missing file is
    remembered, so later lines don't wait on it.
  - Production builds never request segment clips (`import.meta.env.DEV`).
- `npm run voices -- --segments` renders the 181 segments of `data/voice/segments.ts` into
  `voice-cache/segments/<speaker>/<id>.mp3` plus `index.json` (provenance `placeholder`). The
  committed manifest is untouched. The run here gave `rendered 181, 181/181 on disk`.
- Tests: 5 manager unit tests with a fake AudioContext (in order, missing → whole TTS, pause
  freezes, stop drops the rest, slow → TTS) and 3 core tests. New e2e `tests/e2e/segments.spec.ts`
  passed in 14.9 s with the clips, and gave `1 skipped` with `voice-cache/segments` moved aside.
- Environment note: this checkout had **no `voice-cache/`**, so the audio e2e specs could not
  have played clips. I copied the gitignored placeholder cache from `../no-wukkas-cafe-integrate`.
  `voices:check` on it gave 509 clips and 0 errors. Nothing from it is staged.

## R5 — Upgrade shop

- `src/sim/shop.ts` (pure):
  - `BASE_STATION`: each upgrade's `from`.
  - `stationParams(owned)`.
  - `buyUpgrade(save, id)`: returns a new SaveV2, or refuses with `short`, `owned` or `unknown`.
    Integer cents; SaveV2 shape unchanged.
- How the parameters reach the station:
  - `weekFor`/`endlessFor` add `station`, and `createRush` passes it to the barista.
  - Grinder and wand scale the grind and steam steps. They are ×1 by default, so Day 2 is
    byte-identical and the rushTrace hashes are unchanged.
  - In week mode the docket rail shows `ticketsShown` tickets (3, or 6 with the rail). Day 2
    still shows all of them.
- UI: a shop section on shift select lists the upgrades with prices, disables any that are owned
  or unaffordable, and on Buy saves and redraws the screen.

## R6 — Full verification

All at HEAD a47f701 with a clean tree.

```
> tsc --noEmit                          exit 0
> eslint . && prettier --check .        All matched files use Prettier code style!
> vitest run                            Test Files 53 passed (53) / Tests 455 passed (455), 22.6 s
```

- **Build in this checkout: exit 1.** The audio gate finds 7 stale Oct-13 mp3s in the gitignored
  `public/assets/voice/`: `7 audio file(s) in the build have no verified licence … no
  provenance: not in the voice manifest`. These are untracked local files, not in git, and I did
  not delete them.
- **Build of exactly the tracked tree** (`git checkout-index -a` into a scratch dir): exit 0,
  `✓ built in 112ms` / `[audio-gate] ok: 0 licensed audio file(s) in the build`.
- **E2E** `E2E_PORT=5194 npx playwright test` ran to completion: `22 passed (16.3m)`. That covers
  audio ×2, audioSmoke ×3, audioState A1/A2/A3/A7, casting, ibis ×2, listening ×2, music,
  practice, rush, the new segments spec, trial, and week ×3. Placeholder voice-cache and segment
  clips were present.
- Judgement: green for the code on main. The only failure is the local untracked-files build
  (open question 2).

## R7 — Push

- Ran `git fetch origin`; `git merge-base --is-ancestor origin/main main` was true; then
  `git push origin main` → `70ca3fd..a47f701  main -> main` (a plain fast-forward, no force).
  Afterwards origin/main = main = a47f701.
- Not pushed: no other branch, and gh-pages was not touched. `WEEK1_TODO_2.md` and this report
  stay untracked.

## What is NOT done

- **R2 merge**: needs the rush.ts hunk ported to `src/core/rush/serve.ts` (see R2).
- **Second group head**: `groupHeads: 2` reaches `barista.station` but does nothing. The station
  has one group head, and dual extraction is a feature of its own.
- **Segment timing**: generated orders still last for their reading time. Nothing commits segment
  durations, and sim timing must not depend on local files. So the register can open before a
  long segment list finishes playing.
- **Upgrade prices** are still TODO(balance). No balance diff, because `npm run balance` is a stub
  until the economy is ported.
- iPhone Safari was not tried (shop layout, segment audio).

## Open questions for Edward

1. R2: should I port the `serve()` patience change into `src/core/rush/serve.ts` and redo the
   merge (resolving the modify/delete by porting), or should the branch be rebased onto the
   rush split first?
2. The in-checkout `npm run build` fails on 7 stale Oct-13 mp3s in the gitignored
   `public/assets/voice/` (the old placeholder location). Can I delete that folder, or does
   anything there need to be kept?
3. The week-mode rail now holds 3 tickets without the docket rail upgrade (the data's
   `from: 3`). Before this, the rail showed every ticket. Is 3 the intended starting rail?
4. `../no-wukkas-cafe-day2` was left with a detached HEAD at 1b9c74b so that `main` could be
   checked out here. Should it go back to `main` (`git -C ../no-wukkas-cafe-day2 switch main`,
   which would move its files to the new main)?
5. Segment durations: should the voice pipeline commit a segment manifest (durations) so
   generated lines hold the floor for their real length, the way curated lines do?
