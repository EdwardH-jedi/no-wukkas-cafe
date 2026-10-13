# Next-checkpoint report (2026-10-14)

- **Worktree:** `/Users/edwardhwang/Desktop/no-wukkas-cafe-next`.
- **Stacked branches**, each building on the one before:

  ```
  feat/audio-qa-hardening (4c809a6)          ← base, unchanged
  └ fix/audio-integration   9338436           Phase 1
    └ feat/voice-casting    14a7a5f, b962a04  Phase 2
      └ feat/cafe-bgm       a068305           Phase 3
        └ feat/bin-chicken  ce93cef, +report  Phase 4 + this report
  ```

- **Not done:** no merges, pushes or deploys. The main checkout (`feat/voice-listening`), the
  audio-qa worktree and Codex's review folders were not modified. E2E ran on its own ports
  (5191, 5192) so it never reused another checkout's dev server.

**At the tip (`feat/bin-chicken`), after the last code change:**

| Check | Result |
|---|---|
| typecheck | exit 0 |
| lint (eslint + prettier) | exit 0 |
| `npm test` | **23 files, 210 tests passed** |
| `npm run build` | ✓, `[audio-gate] ok: 0 licensed audio file(s) in the build` |
| `E2E_PORT=5191 npx playwright test` | **14 passed (10.2 min)** |
| `npm run voices:check` | 506 clips, 0 errors |
| `npm run release:check` | fails, by design: 506 placeholder voices |

---

## Phase 1: integration audit (`fix/audio-integration`, `9338436`)

### Claims re-verified at `4c809a6` before changing anything

| Claim | My result |
|---|---|
| 174 unit tests pass | **Reproduced:** 16 files, 174 passed. |
| 7 E2E tests pass | **Not reproduced: 6/7.** In `audio.spec`, the first owner clip was cut at 4.73 s of 5.0 s. Its clip started late on a cold dev server and the sim moved on to the next line, the same class of defect as Codex A3. Fixed below. |

### Codex findings A1–A10

All are rechecked against `4c809a6`. "Proven" means a new test fails on `4c809a6` and passes after
the fix. I ran each browser test against both trees.

| # | Finding | Status | Evidence |
|---|---|---|---|
| A1 | Pause → title → new game left audio suspended | **Fixed**: one `resumeAll()` for clock, menus and audio | e2e `audioState` A1, proven (base: `suspended`) |
| A2 | A clip that failed while paused started the browser voice | **Fixed**: the fallback is held, then spoken on resume if still current | e2e A2, proven (base: spoke while paused) |
| A3 | The order moved on before its clip was heard | **Fixed**: the manager reports `loading`; the sim holds the line's clock, and the speaking customer's patience, as a deterministic input (capped at 6 s) | unit `audioContract` ×3; e2e A3, proven (base: register opened while the late clip was still playing) |
| A4 | Placeholder audio could ship | **Fixed in the build; the rights are still unproven.** Builds remove placeholder voices and **fail** on any audio without verified provenance. `release:check` fails while placeholders exist. | unit `audioGate` ×5; manual build with stray files: exit 1 |
| A5 | Generator reported success on failures or an empty casting | **Fixed**: exits 1 before touching anything if a speaker has no voice; only a complete, valid run replaces the manifest (temp + rename); failed output goes to `voice-cache/manifest.rejected.json` | unit `tests/scripts/voices.test.ts` (fake `say`, manifest byte-identical) |
| A6 | Unit gate passes without MP3s | **By design, now documented accurately**: `npm test` checks the manifest; `voices:check` checks files; the build gate checks packaging. AGENTS.md wording corrected. | — |
| A7 | Browser voice ignored the Voices volume | **Fixed**: utterance volume = voice volume; muting stops it | e2e A7, proven (base: volume 1) |
| A8 | Wrong milk produced "wanted a flat white, not a flat white", with no clip | **Fixed**: new `rush.wrongMilk` lines (13 clips) | unit `audioContract` A8 |
| A9 | Repeated questions cost each time but were counted once | **Fixed**: questions counted per ask | unit A9 |
| A10 | Replays piled up; customers talked after leaving | **Fixed**: identical queued requests coalesce; a replay while their line is queued is ignored (no cost); leaving drops queued lines | unit A10 ×3 |

### Findings beyond Codex's list

1. **Orphan renders still shipped on `4c809a6`.** Its build removed the 486 manifest placeholders
   but copied 4 renders that weren't in the manifest. The new gate fails the build on them
   (verified: exit 1, listing the 4 files).
2. **Title screen at 1024×640:** the "Sound settings" button was below the fold and unreachable.
   The title now scrolls.
3. **Day 1 e2e brushed its 180 s timeout late in a full run.** The timeout is now 300 s.

### The `dist/` contradiction, resolved

Both claims were true for the state each author tested.

| Build | MP3s in `dist/` |
|---|---|
| Clean `git archive` of `1e659f9` | 0 |
| Clean `git archive` of `4c809a6` | 0 |
| `1e659f9` with local renders in `public/` (Codex A4) | **490** |
| `4c809a6` with local renders in `public/` | **4** (orphans) |
| `fix/audio-integration` with local renders in `public/` | **build fails** (4 unlicensed files listed); placeholders removed |

No audio file has ever been committed.

## Phase 2: voice casting plan (`feat/voice-casting`, `14a7a5f` + `b962a04`)

**Implemented:**
- **`docs/VOICE_CASTING.md`:**
  - per-character briefs (personality independent of accent);
  - candidate sources per accent group:
    - human actors recommended for Gaz, Jiwoo and Mei;
    - licensed neural TTS as a first pass for Dazza, Beryl, Karen and Priya;
  - scoring sheet and licence checklist;
  - a size estimate (~30,000 characters per full pass) to price later.
- **`src/data/voice/auditions.ts`:** 2–3 real lines per character, pulled from game data.
- **`src/data/voice/casting.ts`:** candidate data. macOS placeholders sit in a separate
  pipeline-test list and are never candidates.
- **`npm run voices:audition`:**
  - dry run by default;
  - `--pipeline-test` renders macOS takes, run once here: 9 takes plus a review sheet;
  - `--import` brings in delivered takes;
  - `--provider azure` refuses without `--allow-paid` plus credentials (verified refusal);
  - output goes to `voice-auditions/` (gitignored) with a review sheet and JSON score export.
- **Release validation** now also rejects pitch-shifted clips and any voice shared between
  characters. On today's manifest it flags Karen voicing Gaz, Dazza, Beryl and Karen.

**Planned, not done (needs approval):** real auditions, the provider account, budget,
native-speaker review, licence clearance, and the batch render. **No replacement clips were
generated and no paid service was used.**

**Tests:** casting data ×3, Azure SSML ×1, new release rules.

**Manual:** choose and approve providers or actors; listen to auditions with Korean, Mandarin and
Indian-English speakers; clear licences.

## Phase 3: café sound design (`feat/cafe-bgm`, `a068305`)

**Implemented:**
- **Three original moods generated in code**, so nothing is licensed or copied:
  - `opening`: indie acoustic / light jazz, 92 bpm;
  - `rush`: indie / surf / funk, 118 bpm;
  - `afternoon`: neo-soul / relaxed jazz, 78 bpm, swung.
- **Mood selection:** title, Day 1 and the Day 2 intro play `opening`; service plays `rush`; the
  verdict and report play `afternoon`.
- **New music bus** with its own slider (default 45%), separate from voices, ambience and effects.
- **Automatic ducking:**
  - 0.28 under orders and answers;
  - 0.55 under other speech, clip or browser voice;
  - back to full in about 1 s.
- **Pause:** the synth is scheduled on the audio clock, so pausing freezes it.

**Licences and provenance:**
- `docs/AUDIO_PROVENANCE.md` documents the music as original to this repo.
- No Spotify, commercial or library music, and no samples.
- Future licensed tracks must pass the provenance file and the build gate.

**Tests:**
- unit ×6;
- e2e `music.spec`:
  - notes are scheduled;
  - master RMS 0.114 with only music audible;
  - the mood switches to `rush` in service;
  - the music ducks to 0.28 under Dazza's order, then recovers above 0.9.

**Not verified:** whether it sounds good. Nobody has listened: headless Chromium is muted, and I
can't hear. Loudness balance against voices and on phone speakers is untested.

**Manual:** listen to all three moods, judge style and balance, and adjust the mix in
`MOODS[*].mix`.

## Phase 4: bin chicken (`feat/bin-chicken`, `ce93cef`)

**Implemented:**
- **`src/sim/ibis.ts`:** a deterministic state machine, separate from `core/rush.ts`, with its own
  RNG.
  - **Frequency:** 30% of shifts, 40–150 s into service.
  - **Flow:** enters only through the open door → walks to the bin → forages, honks, looks up
    once when looked at.
  - **Gentle outcome:** three shoos (a wave or clap) and it walks out on its own feet; left alone
    it goes back to the bin; ignored for 30 s it raids the bin and leaves.
  - No mechanic can harm it.
- **`src/core/rushIbis.ts`:** door detection from customer movement, and Gaz lines (7 clips)
  queued as `react` or `ambient`, so they **never cut off** a customer's order or answer.
- **`src/world/ibis.ts`:** procedural low-poly white ibis (white body, bare black head and neck,
  curved bill, black plumes; walk, peck, flap), the café bin and the mess. No external models or
  textures; measured 122 draw calls.
- **Controls:** click the bird or press I. A hint shows while it's in, and Gaz looks at it when he
  talks about it.
- **Sounds:** honk, bin rattle and clap are synthesised.
- **Test switches:** `?ibis=0` / `?ibis=1`. Existing specs pin `ibis=0`, because seed 7 schedules
  the bird at 50 s and their scripted clicks could hit it.

**Tests:**
- unit sim ×8: rarity over 1000 seeds, door, behaviours, cooldown, timeout, raid, never stuck over
  40 seeds;
- unit core ×4: lines recorded, no customer cut off, inert outside service, separate RNG;
- e2e `ibis.spec` ×2: I key, clicking.
- Evidence: `docs/verification/2026-10-14-bin-chicken/`.

**Manual:**
- Is the bird readable at that distance? It's small and the counter hides its legs.
- Is the 30% frequency right?
- Is the tone of Gaz's lines right ("feathery menace" is affectionate, not cruel)?

## Phase 5: remaining bugs and risks

- **Release is blocked:** every voice is a placeholder macOS render with unproven distribution
  rights. The gate enforces this; it isn't a bug, but nothing can ship until Phase 2 approvals.
- **Tara (Priya) is nondeterministic.** It's mitigated (median of 3 takes), not eliminated.
- **The sim clock lags the audio clock on slow frames** (0.2–0.35 s per line in headless
  software GL). The result is a later subtitle or next line, never a cut-off. Not measured on
  phones.
- **The 6 s cap on the A3 hold:** if a download takes longer, the line proceeds unheard, as before,
  with a "fallback" status if the clip then fails.
- **Untested on iOS/Safari and Android.**
- `core/rush.ts` is 563 lines, still above the guideline. The extraction plan is in
  AUDIO_QA_REPORT.md.
- **Possible test fragility:** e2e totals ~10 min in software GL.

## Commits

```
ce93cef feat(event): the bin chicken - a rare, gentle white-ibis encounter on Day 2
a068305 feat(audio): café background music (three original moods), music bus and ducking under speech
b962a04 style: prettier on the voice validation tests
14a7a5f feat(voice): casting plan, audition pipeline and release rules against pitch-shift casting
9338436 fix(audio): resolve Codex audit A1-A10 and gate unlicensed audio out of builds
```

## Integration (when approved)

1. Review in order: `fix/audio-integration`, then `feat/voice-casting`, then `feat/cafe-bgm`, then
   `feat/bin-chicken`. Each fast-forwards onto the one before.
2. Before building in the main checkout, move old renders out of `public/assets/voice/` (see
   docs/AUDIO_PROVENANCE.md). Otherwise the build gate fails, by design.
3. Run `npm run voices` on macOS (manifest v2, plus 20 new Gaz lines), then
   `npm run voices:check`.
4. Run `npm test`, `npm run build`, and `E2E_PORT=… npm run test:e2e`.
5. Run `npm run release:check` only after licensed voices replace the placeholders.
