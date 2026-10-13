# Audio QA hardening report (2026-10-13)

- **Branch:** `feat/audio-qa-hardening`.
- **Worktree:** `/Users/edwardhwang/Desktop/no-wukkas-cafe-audio-qa`, separate from the main
  checkout and from Codex's review snapshot (`/private/tmp/no-wukkas-audit-20261013/snapshot`).
- **Not done:** no pushes, merges or deploys. The main worktree and Codex's snapshot were not
  modified. Codex was running its e2e on port 5179, so this branch ran e2e on port 5189
  (`E2E_PORT`).

## 1. Base commit

`1e659f9` (head of `feat/voice-listening`, "fix(pos): repaint the register for each new
customer…"). This is the commit in Codex's snapshot: file hashes of `OVERNIGHT_REPORT.md`,
`src/ui/pos.ts` and `src/core/rush.ts` match.

## 2. Implemented changes

### Task C: listening gameplay tests (`3c0d7eb`)

`tests/core/rushListening.test.ts` has 23 tests. Its headless bot (`tests/helpers/rushBot.ts`)
keeps steaming and pouring while it works the register, like a player's two hands.

| Scenario | What is checked |
|---|---|
| **All 30 curated orders**, end to end (7 shifts with forced lines) | rung up from the answer key, made from the ticket, accepted and correct |
| Answer keys | every single-field mishearing of every order is caught as exactly that field. Modifiers on a long black don't count against it, because they can't be made. |
| Corrections: wrong milk / wrong drink | handed back; the customer names the milk; the ticket is fixed; remade; served right |
| Corrections: missed "extra hot" | accepted but marked wrong (`notHotEnough`) |
| Corrections: extra hot rung up for a normal order | scores lower quality |
| Penalties | replay, repeat and clarify cost exactly 1, 6 and 3 s of patience on top of the clock; a third repeat is refused and free; clarified fields are recorded once |
| Concurrent dialogue | with every aid used on every customer, no customer is cut off by another; a question cuts off Gaz or the same customer only, and queues behind anyone else |
| Rapid switching | ring up, then take the next order on the very next steps: tickets stay with their customers; aids go to the new customer; with nobody at the register, aids do nothing; ringing up mid-sentence is ignored |
| Shift completion | every order misheard (drinks and milks): all corrected, the shift still reaches the report, fixed tickets = rejections |
| Restart | a restart keeps forced order lines and difficulty |

**Defect found and fixed (demonstrated by a test):** Gaz's "asked twice" remark was offered as a
`live` line while the customer's slow repeat was still playing, so it could never be said. It is
now queued after the repeat (`react`).

**Small API addition:** `createRush(seed, difficulty, lines?)` can force a customer's order line,
for tests and debugging. It still draws from the RNG, so the rest of the seeded shift is
unchanged.

### Task D: refactor (`0e5e166`)

I judged extraction safe and did it:
- `core/rushSpeech.ts`: `gaz`, `gazDef`, `customerSay`, `customerListen` (with its interrupt
  rule), `varsFor`, `startSay`.
- `core/rushListening.ts`: `atCounter`, `listenAction`, `ringUp`, and the new
  `fixMisheardTicket`, split out of `serve()`.
- `core/rush.ts` re-exports `atCounter`, so UI imports are unchanged. It went from 718 to 543
  lines. Both new modules import only types from `rush.ts`, so there is no runtime import cycle.

**Proof of no behaviour change:** the event logs of six headless shifts (normal, hard, easy, all
aids, every order misheard, hurried) are byte-identical before and after. They were hashed with
SHA-1 in a temporary worktree at `3c0d7eb` and in the refactored tree.

**Plan for the rest (not done):** `rush.ts` is still above the ~400-line guideline. The next safe
cuts, each with the same event-hash check:
1. `stepCustomers` and `walkout` into `core/rushCustomers.ts`;
2. `serve()` and its reactions into `core/rushServe.ts`;
3. leave `createRush`, `stepRush` and the types in `rush.ts`.

### Task A: voice asset pipeline (`707ae84`)

- **Development-only placeholder workflow:**
  - `npm run voices` now writes clips to `voice-cache/` (gitignored), not `public/`.
  - A Vite dev plugin (`scripts/vite-voice.ts`) serves them at `/assets/voice/…`.
  - A build plugin strips any placeholder clip that still reaches `dist/`, for example old renders
    left in `public/`.
  - In a production build, the game doesn't request placeholder clips. It uses the browser voice
    and says "Recorded voices are development-only placeholders and are not in this build."
    Checked in Chrome on `vite preview`: 0 requests to `/assets/voice/`, and the status and toast
    say so.
- **Reproducibility:**
  - A full re-render reproduced every Karen, Yuna and Tingting clip exactly: the committed
    manifest was unchanged for all 450 of them.
  - Tara is **not deterministic**:
    - two forced renders changed 8 to 12 of Priya's 36 clips, by up to 3.8 s;
    - a 16-way parallel stress test produced empty, garbled and hung `say` processes;
    - one committed-era render was 0.27 s for a 4-word line.
  - The pipeline now:
    - probes each voice and treats Tara as unstable;
    - renders unstable voices one clip at a time, with **3 takes, keeping the median-length**
      good take;
    - sanity-checks every take (0.3–30 s, 1.2–6 words/s, peak > −30 dB, mean > −35 dB);
    - retries up to 3 times, with a 30 s timeout per `say`.
  - Result: two forced Priya renders now differ in **1 of 36 clips, by 0.002 s**.
  - Kept clips are re-measured and re-checked, so the manifest always matches the files on disk.
    That is how 7 broken Priya renders left in the cache were caught and re-rendered.
- **Manifest v2:**
  - `status` (`placeholder` | `release`);
  - a licence note;
  - per-clip `source.deterministic`;
  - per-clip `source.licence`, required for release clips.
- **Validation:** `src/data/voice/validate.ts` is shared by the scripts and the tests. It checks:
  - schema;
  - duplicate dialogue ids and files;
  - that the id and path match speaker + transcript + delivery;
  - voice profile, accent and locale;
  - duration, pace and loudness;
  - placeholder and licence rules: a macOS voice can never be release audio, and a release clip
    needs a licence;
  - coverage of every line the game can say, and stale clips.
- **`npm run voices:check`** adds file checks:
  - **missing audio**;
  - **duration drift** (more than 30 ms between file and manifest);
  - orphan files;
  - clips still in the old `public/` location.

  `--release` fails on any placeholder. I verified that it catches a deliberately deleted clip, a
  deliberately wrong duration and a deliberately orphaned file.
- **Documentation:** `docs/VOICE_ASSETS.md` covers:
  - sources and licence status;
  - the placeholder vs release table;
  - the workflow;
  - Tara's nondeterminism;
  - step by step, how to move to licensed audio.

  `AGENTS.md` and `README.md` commands are updated.

### Task B: audio smoke tests, voices on (`e788346`)

**`tests/e2e/audioSmoke.spec.ts` (3 tests, Chromium):**

1. **Owner after Start:**
   - the clip decodes to its manifest length (5.002 s) and plays to its end (not interrupted);
   - voice-bus RMS 0.239–0.247, and RMS after the master gain 0.239–0.245. That gain is the last
     node before `ctx.destination`.
   - the context is `running`; the output reports 48 kHz, 2 channels, `sinkId` "" (default
     device);
   - while the clip plays, the sim's current line and the subtitle (typing) are that line;
   - the audio clock advances;
   - the sim never moves on before the clip ends; it moves on within the 0.35 s tail plus the
     measured game-time lag;
   - never more than one audible line.
2. **Customer order (Dazza):**
   - the order is voiced from a clip;
   - the register stays in `ordering` while it plays and opens (`deciding`) only after it ends;
   - Replay plays the same clip again and the sim counts it;
   - asking "Milk?" mid-replay cuts the replay: it's marked `interrupted` and ends early, with at
     most one audible line;
   - pause freezes `AudioContext.currentTime`, and resume finishes the same clip uncut (end −
     start = buffer length ± 0.15 s).
3. **Missing customer clip (404):**
   - browser-voice fallback with a toast;
   - Gaz's clips are unaffected;
   - the register still opens on the line's own timing.

**Instrumentation**, test and debug only, via `window.__trial`:
- per-clip `interrupted` and master peak RMS;
- live and fading voice counts with their maxima;
- AudioContext output info;
- a per-frame `audioTick`.

**Also:** `E2E_PORT` in `playwright.config.ts`, so two checkouts can run e2e at the same time.

## 3. Exact test results (after the last code change)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` (eslint + prettier) | clean ("All matched files use Prettier code style!") |
| `npm test` | **Test Files 16 passed (16); Tests 174 passed (174)**, base was 138; new: 23 listening + 13 voice validation |
| `npm run build` | `✓ built`; with a placeholder clip planted in `public/`: "[voice] stripped 1 placeholder clip(s) …" and no `dist/assets/voice` |
| `E2E_PORT=5189 npx playwright test` | **7 passed (7.6 min)**: `audio.spec` ×2, `audioSmoke.spec` ×3, `rush.spec`, `trial.spec` |
| `npm run voices` (forced Priya, twice) | 36/36 rendered, 0 render failures, manifest check 0 errors |
| `npm run voices:check` | development: 486 clips, 0 errors, 0 warnings |
| `npm run voices:check -- --release` | 486 errors (`placeholder-in-release`): **expected**, nothing is release audio |

Measured in the e2e run:
- the owner's line ended, and the sim moved on 0.603 s later; game time was 0.251 s behind the
  audio over that line;
- Dazza's order ended, and the register opened 0.667 s later; game time was 0.352 s behind.

## 4. Asset licensing risks

- **Every clip is Apple macOS system-voice output, a placeholder.** My reading of the macOS
  licence is personal, non-commercial use only, with no redistribution. Edward should verify
  that.
- **Mitigations on this branch:**
  - clips are gitignored in `voice-cache/`;
  - they are served by the dev server only;
  - builds strip them;
  - production never requests them;
  - the validator forbids marking `macos-say` clips as release;
  - `voices:check --release` fails until every clip is licensed.
- **Checked:** no audio file has ever been committed (`git log --all -- '*.mp3' '*.wav' '*.aiff'`
  is empty).
- **Risk on the reviewed branch, fixed here:** on `feat/voice-listening` (`1e659f9`), clips render
  into the gitignored `public/assets/voice/`. `npm run build` copies them into `dist/` (5.6 MB in
  the overnight build). So a build from that branch would redistribute placeholder audio if it
  were deployed.
- No paid synthesis API was called, no network synthesis was used, no voice was cloned, and no
  credentials exist in the repo.

## 5. Remaining limitations

- **No automated check here proves speech is audible or natural to a person.** Playwright's
  headless shell runs with `--mute-audio`, so the device output is muted. The tests prove that
  data loads, decodes, the clock advances, and signal reaches the master gain. Accent quality and
  naturalness are still unjudged by a human ear.
- **Tara is mitigated, not fixed.** A re-render on another machine can still shift a Priya clip
  slightly. The manifest follows the local files, so the game stays in sync. For truly
  reproducible audio, use a deterministic or recorded voice for Priya.
- **Game time lags the audio clock when frames are slow.** Each frame is capped at 0.1 s of game
  time; in headless software GL the lag was 0.25–0.6 s per line. The effect is a later subtitle
  and next line, never a cut-off clip; the tests assert the "never before the audio ends" part.
  Not measured on phones.
- **Not tested on iOS or Safari.**
- The audio e2e tests skip on machines without rendered clips (non-macOS, CI).
- **Design observations, left unchanged** (balance is out of scope):
  - a missed "extra hot" on a normal order only lowers quality, and a forgiving regular can still
    rate it 100%;
  - correcting a wrong milk often costs a less patient customer (bots see walk-outs).
- `core/rush.ts` is still 543 lines (plan in §2).

## 6. Commits (on `feat/audio-qa-hardening`, base `1e659f9`)

```
(this)  docs: audio QA report
e788346 test(audio): voice-on browser smoke tests with playback, sync and interruption evidence
707ae84 feat(voice): reproducible, validated, development-only placeholder voice pipeline
0e5e166 refactor(rush): move speech and listening helpers out of core/rush.ts (no behaviour change)
3c0d7eb test(listening): every curated order end to end, corrections, aid costs, dialogue and switching
```

## 7. Safe integration instructions

1. Let Codex finish reviewing `feat/voice-listening` (`1e659f9`) and fix anything it finds there
   first.
2. Review this branch: `git log 1e659f9..feat/audio-qa-hardening`.
3. Integrate:
   - If `feat/voice-listening` hasn't moved:
     `git checkout feat/voice-listening && git merge --ff-only feat/audio-qa-hardening`.
   - If it has moved: `git rebase feat/voice-listening feat/audio-qa-hardening`, then
     fast-forward.
   - Conflicts are most likely in `src/core/rush.ts` (extracted functions),
     `src/audio/manager.ts` and `src/main.ts` (debug handle).
4. In the main checkout, retire the old clip location:
   ```bash
   mkdir -p voice-cache && mv public/assets/voice/* voice-cache/ && rmdir public/assets/voice
   npm run voices          # re-measures, re-renders bad or unstable takes
   npm run voices:check    # expect 0 errors
   ```
   This step matters: until `public/assets/voice/` is gone, builds strip it (with a warning), but
   don't keep it around.
5. No new dependencies; `npm install` is enough. Then run:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run build
   ```
   and `npm run test:e2e`, using `E2E_PORT=…` if another checkout is running e2e.
6. The manifest is now v2. If Edward's re-render changes Priya durations (Tara), the manifest
   diff is expected. Commit it only together with line changes, or restore it with
   `git checkout src/data/voice/manifest.json` and re-run `npm run voices`.
7. Afterwards, remove this worktree: `git worktree remove ../no-wukkas-cafe-audio-qa`. Its
   `voice-cache/` is untracked and is deleted with it.
