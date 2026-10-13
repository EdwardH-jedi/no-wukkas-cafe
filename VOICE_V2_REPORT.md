# Voice v2 report: casting page, café sound lab, audio QA (2026-10-14)

- **Worktree:** `~/Desktop/no-wukkas-cafe-voice-v2`, branch `feat/voice-audition-v2`, base
  `7663b80`.
- **Local commits only.** Nothing pushed, merged or deployed.
- **Other worktrees not modified.** `no-wukkas-cafe-next` was only read: its `voice-cache/` was
  copied in, so no clip had to be regenerated.
- **Protected paths untouched:** `src/sim/latte/`, `src/world/coffeeSurface.ts`,
  `src/core/rush.ts`, the character models (`git diff 7663b80..HEAD` lists none of them).
- **No candidate audio was generated, downloaded or bought; no paid API was called; no voice was
  cloned.** The only audio rendered was the existing workflow's 9 macOS pipeline-test takes
  (`voices:audition -- --pipeline-test`, local `say`, personal-use placeholders, never
  candidates).

## Bottom line

- **The seven authentic voices are not done, and can't be without Edward's decisions.** No
  character has real audition audio today. What's done is everything around the auditions:
  - a casting page that's ready for takes;
  - an import path for delivered recordings;
  - the casting rules as tested code;
  - a sourced provider and actor shortlist with prices and licence terms.
- **The music had one objective defect, a DC offset from the FM keys. It's fixed, with a
  regression test.** Nothing clips, even with every volume at 100%. Whether the music *sounds*
  good still needs people listening.

## 1. Implemented features

### Voice casting (Phase A, `6ae0baf`)

**`npm run voices:audition`, extended rather than replaced:**
- writes `voice-auditions/index.json`: every candidate configured in `CASTING`, with its takes
  (line, duration) or, when there are none, what it needs (`src/data/voice/auditionIndex.ts`,
  pure and unit-tested);
- `--import <dir>` now reads an optional `source.json` (`licence`, `source`, `performer`) beside
  delivered takes. Files are matched to lines by name (`1.wav`, `2b.wav`). Verified end to end
  with synthetic test tones, which were then deleted;
- `--provider google` refuses: there's no renderer and no account. `--provider azure` still
  refuses without `--allow-paid` and credentials. Both verified.

**`/dev/casting.html`** (dev server only; `vite build` doesn't include it, checked in `dist/`):
- **Identity cards** for all seven, with portraits drawn from the same look data as the 3D
  customers, the brief, the line count, and the placeholder voice the game uses today. For
  example, Gaz's card says "macos-say Karen, pitch ×0.88 · shares this voice with beryl, dazza,
  karen · pitch-shifted".
- **Lines × candidates grid:**
  - play and replay any take;
  - **Compare across candidates** plays one line from every candidate back to back;
  - a waveform with playhead, duration, integrated loudness (LUFS) and true peak per take,
    measured in the browser.
- **One take at a time:** a single shared player, so starting a take cuts the previous one
  (proven in e2e: `maxAudible` = 1).
- **Missing-asset indicators:**
  - a dashed "No take" cell for each missing line;
  - a "No audio yet" chip with what the candidate needs (Azure approval, actor delivery, no
    renderer);
  - a red banner when a character has no real audio at all;
  - a link to the provider's *own* preview page, marked "no login" or "may need a login". Never
    embedded or stored;
  - a page summary: "0 of 7 characters have real audition audio".
- **Ratings, 1–5:** naturalness, accent authenticity, acting and emotion, intelligibility, fit to
  the brief. Plus caricature risk, licence cleared and notes.
- **A decision per character:** undecided, shortlisted, cast, needs more auditions, needs a human
  actor. Plus "I'm a native or heritage speaker of …" for Priya, Jiwoo and Mei.
- **Live checks** (`src/data/voice/decision.ts`, unit-tested), mirroring the release validator:
  - placeholders can't be cast (they aren't even offered);
  - no two characters share a base voice;
  - the licence must be cleared;
  - no caricature risk;
  - every line heard;
  - a warning when an L2 accent wasn't confirmed by a speaker of it.
- **Export JSON** (download), **Save to disk** (`voice-auditions/decisions.json`, through a
  fixed-path dev endpoint), **Import JSON** (validated). Decisions also persist in the browser.

**Research:** `docs/VOICE_PROVIDERS.md` (section 4 below).

### Café sound (Phase B, `5de108e`)

**`/dev/listening.html`, the café sound lab**, runs the game's own engine (manager, music synth,
SFX):
- switch Opening / Rush / Afternoon / off;
- **separate Voices / Music / Café ambience / Machine & effects volumes**. They don't overwrite
  the player's saved game settings: a new `persist: false` manager option, checked in e2e;
- crowd level (empty / normal / packed) and the espresso machine;
- **ducking under real dialogue:** three orders and one chat line from the game, "3 lines, fast",
  stop voice, pause and resume;
- live output peak (held), RMS, music duck, clip events, voices at once, and a 12-second scope;
- **Measure:** each mood rendered offline through the same synth.
  - Music alone at 100%: integrated loudness (BS.1770), true peak, crest, DC, clipped samples.
  - A worst case: every bus at 100%, a packed café, every machine sound at once, and the loudest
    order over the ducked music.
  - Findings from `src/audio/mixCheck.ts` (unit-tested).
- per-mood ratings (fits the café, sits under the voices, easy to hear all shift, doesn't feel
  repetitive), notes and a "listening on" device field. Saved to `reports/listening-notes.json`
  or exported.

**Engine seams, no rewrite:**
- `createMusic()` takes a narrow host and gains `renderAhead()` for offline rendering;
- the manager gains a read-only `masterPeak()` probe, `DEFAULT_VOLUMES` and `persist: false`.

**`src/audio/meter.ts`:**
- BS.1770-4 integrated loudness. It matches the reference K-weighting coefficients at 48 kHz to
  8 decimal places and passes EBU Tech 3341 case 1 (−23 LUFS).
- 4× true peak, clipping, DC and waveform peaks.
- Cross-checked against ffmpeg: the macOS takes encoded with `loudnorm I=-17:TP=-2` measure
  −17.0 to −17.7 LUFS and −2.3 to −2.6 dBTP.

## 2. Real audition clips available

**None.** No real candidate for any character has audio.

| Character | Candidates configured (no audio yet) | Placeholder pipeline takes (not candidates) |
|---|---|---|
| Gaz | Azure Duncan, Azure William, Google Chirp3-HD-Algenib, human actor | macOS Karen ×3 |
| Dazza | Azure Neil, Azure Ken, Google Chirp3-HD-Fenrir | — |
| Beryl | Azure Elsie, Google Chirp3-HD-Gacrux, human actor | — |
| Karen | Azure Natasha, Azure Joanne, Google Chirp3-HD-Kore | — |
| Priya | Azure Neerja, Azure Ananya, Google en-IN-Chirp3-HD-Leda | macOS Tara ×2 |
| Jiwoo | human actor (Korean L2 speaker) | macOS Yuna ×2 |
| Mei | human actor (Mandarin L2 speaker) | macOS Tingting ×2 |

- The 9 macOS takes are Apple system voices: personal use only, never castable, and the page
  shows them striped as "Pipeline test: not a candidate".
- In the game itself all 506 clips are still placeholders. Gaz, Dazza, Beryl and Karen share one
  Australian female voice, three of them pitch-shifted (`release:check`: 365 pitch-shift errors,
  1 shared-voice error).

## 3. Missing accent assets

- **Australian (Gaz, Dazza, Beryl, Karen):**
  - no real takes;
  - the only installed en-AU voice is macOS Karen (female), so all four share it today;
  - Azure has **no male HD** Australian voice, so Gaz and Dazza would use the older standard tier;
  - **no provider has an elderly voice** for Beryl.
- **Indian English (Priya):** no real takes. Azure en-IN and Google en-IN voices are listed to
  audition.
- **Korean-accented English (Jiwoo):** **no source at all.** No provider documents Korean-accented
  English. Azure's ko-KR multilingual voices reading English are undocumented for accent, and
  prompted accents are a caricature risk. Needs a native Korean speaker (or native review of any
  AI take).
- **Mandarin-accented English (Mei):** **no source at all.** As for Jiwoo, with a native Mandarin
  speaker.
- **Not claimed:** no accent here is "complete" or "authentic". Nobody has heard a real candidate
  yet.

## 4. Provider candidates and licensing

Full detail, with every fact labelled verified or unverified (checked 2026-10-14):
`docs/VOICE_PROVIDERS.md`.

| Option | Fit | Price | Licence / risk |
|---|---|---|---|
| **Google Cloud TTS** (Chirp 3 HD) | widest en-AU range (30 personas), en-IN; **public previews, no login** | ~$0.90 per full pass; free tier covers it | output is customer data; no disclosure rule found (disclose anyway); accent steering only in preview |
| **Azure AI Speech** | en-AU standard voices (7 male), en-IN incl. HD | ~$0.45 neural / $0.66 HD per pass; F0 free tier | game use allowed; **must disclose synthetic voices**; no male HD en-AU |
| Amazon Polly | weak en-AU (Russell is standard engine only) | ~$0.48–0.90 | can't cast two modern Australian men |
| ElevenLabs | accent categories; Voice Design | paid plan needed to ship ($6–22/mo) | free tier non-commercial; library voices can be withdrawn; default voices expire 2026-12-31 |
| OpenAI TTS | prompted accent only, 13 generic voices | ~$0.45–0.90 | **must disclose AI voices**; accents without distinct people |
| Open models (Kokoro, Piper, XTTS, F5…) | no en-AU voice | free | XTTS-v2 and F5-TTS are non-commercial; others need a voice donor |
| **Human actors** | best for Gaz's timing, Beryl's age, Jiwoo and Mei | ~**AU$6k–15k** for seven (MEAA-aligned agency rates: AU$485/hr + AU$220 character loading + super) | buyout covering game, trailers and stores; no-AI-training clause |

**Recommendation (unchanged from `VOICE_CASTING.md`, now sourced):**
- human actors for **Gaz, Jiwoo and Mei**, and probably Beryl;
- an audition round on **Google Chirp 3 HD** (listen free on Google's page first) and **Azure**
  for Dazza, Karen and Priya.

Disclosure is required if Azure or OpenAI voices ship. A lawyer should read the final terms.

## 5. BGM quality test tools

- **The lab:** `/dev/listening.html` (section 1).
- **Measured in Chrome 155, after the fix:**

| Mood | LUFS at 100% music | at the default 45% | True peak | Worst-case mix | Clipped | DC |
|---|---|---|---|---|---|---|
| Opening (92 bpm) | −20.1 | −27.1 | −4.1 dBTP | −0.5 dBTP | 0 | 0.00000 |
| Rush (118 bpm) | −20.5 | −27.4 | −2.5 dBTP | −0.6 dBTP | 0 | 0.00000 |
| Afternoon (78 bpm) | −20.3 | −27.2 | −1.4 dBTP | −0.8 dBTP | 0 | 0.00001 |

- The moods are within 0.4 LU of each other, so a mood change isn't a volume jump.
- Orders sit **about 24 LU above the ducked music** at default volumes (23.6 / 24.0 / 23.8 LU).
  - The placeholder clips measure −14.5 LUFS as heard in the game: a mono clip up-mixed to both
    output channels.
  - The files themselves read −17.5 LUFS.
  - A first pass measured the clips as mono and under-stated the gap by 3 LU. That was corrected
    in the lab before this report.
- The duck measures **0.28 under orders and 0.55 under chat**, as designed, and recovers above
  0.9.
- **Fixed defect: DC offset.**
  - Before: 0.0013, 0.0032 and 0.0035 per mood.
  - Cause: soloing each instrument offline traced it to the **FM keys**. They modulate at the
    carrier's own frequency, which puts a 0 Hz sideband into every chord (afternoon keys alone:
    −0.0047).
  - Fix: a 20 Hz high-pass at the synth's output. DC is now ≤ 0.00001; loudness moved ≤ 0.2 LU.
    The compositions (notes, instruments, mix) are unchanged.
  - **The output is not bit-identical.** The filter's phase shift at low frequencies realigns
    partials, so music-alone true peaks moved:
    - opening −4.8 → −4.1 dBTP;
    - rush −3.4 → −2.5 dBTP;
    - afternoon −1.1 → −1.4 dBTP.

    The worst case is unchanged within 0.3 dB (−0.5 / −0.6 / −0.8 dBTP), and nothing clips. Worth
    a listen on Rush: the kick's low end goes through the filter.
  - Regression test: `tests/e2e/listening.spec.ts` fails on the old synth (opening DC 0.00127)
    and passes now.
- **Smallest margin:** the worst case keeps 0.5 dB of headroom. If louder release voices arrive,
  re-measure before adding a limiter. No limiter was added on a guess.
- **Not changed:** the tracks themselves. Nothing was replaced on taste.

## 6. Test results

All runs are on this branch, on macOS. E2E uses `E2E_PORT=5196`, my own dev server.

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` (eslint + prettier) | exit 0 |
| `npm test` | **28 files, 244 tests passed** (was 210; +34: meter, mix checks, audition index, casting decisions, save endpoint) |
| `npm run build` | ✓; `[audio-gate] ok: 0 licensed audio file(s)`. `dist/` has 0 audio files and only `index.html` (no dev pages, no audition code) |
| `npm run voices:check` | 506 clips, 0 errors, 0 warnings |
| Every manifest clip fetched from the dev server | 506 / 506 served (HTTP 200, `audio/mpeg`): **no missing voice assets** |
| `npm run release:check` | **fails, by design**: 872 errors (506 placeholder-in-release, 365 pitch-shift, 1 shared-voice). Placeholder voices can't ship |
| E2E, Playwright Chromium, full suite (on `7a6b1ba`) | **17 / 17 passed** (11.0 min), no edits in flight. After the speech-loudness fix, `casting` + `listening` re-ran: 3 / 3 |
| E2E in the **installed Google Chrome 155** (macOS), audio and dev-page specs | **13 / 13 passed** (3.2 min) |

**What the Google Chrome run proves (Phase C):**
- **Playback works:**
  - Gaz's first line decodes to 5.002 s (manifest 5.002) and plays for 5.003 s;
  - voice RMS 0.24 and master RMS 0.25 at the node feeding the output device;
  - output path: 48 kHz, stereo, running.
- **No overlapping dialogue:** `maxAudible` ≤ 1 in the game (audioSmoke). In the lab, three fast
  lines cut each other, and the casting page's player never plays two takes.
- **No missing voice asset errors:** all 506 clips are served, and a clip that does fail is
  reported and falls back to the browser voice (audio, audioSmoke).
- **Pause / resume:**
  - A1: pause → title → new game keeps audio running;
  - A2: a fallback due while paused waits for resume;
  - in the lab, pause suspends the audio clock and the music stops scheduling, then carries on
    after resume.
- **Music ducking:**
  - 0.28 under orders and 0.55 under chat;
  - recovers above 0.9 (lab and in-game `music.spec`);
  - in-game, master RMS 0.105 with only music audible.
- **No unlicensed placeholder files in release builds:** the build gate removed or failed
  everything; `dist/` holds no audio. `release:check` blocks shipping while placeholders remain.

**Notes, honestly:**
- **Two mid-run failures, not game bugs.** The first full Chromium run had 2 failures (rush,
  trial): `page.evaluate: Execution context was destroyed`. I'd edited `src/dev/*` during the run,
  and the Vite log shows it reloading every open page at those moments. Both passed on a clean
  re-run (rush 5.8 min, trial 3.2 min). The final run above was made with no edits in flight.
- **A second server on port 5196.** Another project's `vite preview` (PID 68703, running 9 days)
  listens on 127.0.0.1:5196; mine is on `::1`. Every run reached my server (the dev pages and the
  game's debug handle only exist there). Use another `E2E_PORT` if that process is still around.
- **Proven: signal reaches the output. Not proven: anything sounds right.** Headless Chrome is
  muted at the device. Nobody has listened yet (section 8).

## 7. Local commit hashes

| Commit | What |
|---|---|
| `6ae0baf` | feat(voice): casting page for auditions, audition index, decisions JSON, provider research |
| `5de108e` | feat(audio): café sound lab, offline mix measurement, and a DC blocker for the music |
| `7a6b1ba` | refactor(dev): split the casting page and sound lab under 400 lines |
| (next) | this report, the roadmap notes and the speech-loudness correction: the commit after `7a6b1ba` (`git log --oneline -5`) |

On `feat/voice-audition-v2`, on top of `7663b80`. Not pushed.

## 8. Instructions for human listening review

### Setup (once)

```bash
cd ~/Desktop/no-wukkas-cafe-voice-v2
npm install
npm run voices:check          # 506 clips here already; on a fresh clone run `npm run voices` (macOS)
npm run voices:audition       # writes voice-auditions/index.json (add -- --pipeline-test for the 9 macOS takes)
npm run dev                   # http://localhost:5183
```

For a phone: `npm run dev -- --host`, then open `http://<your Mac's Wi-Fi IP>:5183/…` on the
iPhone.

### A. Voice casting: `http://localhost:5183/dev/casting.html`

1. Put your name in **Reviewer**.
2. Go through the seven characters on the left. Each card shows the brief and the voice the game
   uses today.
3. **Before any audition audio exists**, open "Hear it on the provider's page" on Google
   candidates (no login).
   - Google's voice list plays a sample per voice: listen for the named one (for example
     `en-AU-Chirp3-HD-Algenib` for Gaz).
   - Write impressions in the decision notes. Rating stays off until there are takes, so a rating
     always refers to our own lines.
4. **Decide what to fund:**
   - Google / Azure free-tier auditions: needs an account with billing enabled; expected cost $0.
     Azure also needs `--allow-paid`;
   - and/or human actors, at roughly AU$6k–15k for seven.

   I didn't sign up for anything or spend anything.
5. **When takes arrive:**
   - lay them out as `<dir>/<character>/<voice>/1.wav, 2.wav…` with a `source.json` (licence,
     source, performer);
   - run `npm run voices:audition -- --import <dir>` and reload the page;
   - play each line, then **Compare across candidates** for each line;
   - rate naturalness, accent authenticity, acting, intelligibility and fit;
   - tick caricature risk if there's any doubt.
6. **Accents:** have a native or heritage speaker rate Priya (Indian English), Jiwoo (Korean) and
   Mei (Mandarin), and tick the box on the card. Check that 아아 and 감사합니다 sound natural.
7. Choose a decision per character. **The Checks panel must show 0 errors before anything is
   cast.** Then **Save to disk** (`voice-auditions/decisions.json`) and **Export JSON** for the
   records.

### B. Café sound: `http://localhost:5183/dev/listening.html`

1. Listen on **real speakers and on headphones**, and if you can on a phone. Write what you used in
   "Listening on". Headless tests can't hear anything.
2. Press **▶ Start sound**, then **Reset to game defaults**. Give each mood at least 2–3 minutes:
   loops that sound fine for 20 seconds can grate after five minutes.
3. **Under pressure:** set Crowd to *Packed*, tick the espresso machine, then press **Dazza's
   order**, **Karen's order** and **Priya's order**. Is every order clear over the music? Then
   **Gaz chatting**: does the music feel right at the lighter duck?
4. Try **3 lines, fast**: only one voice should ever be heard. Try **Pause** / **Resume**.
5. Rate each mood (fits the café, sits under the voices, easy to hear all shift, doesn't feel
   repetitive) and write notes. Then **Save to disk** (`reports/listening-notes.json`).
6. Press **Measure** again after any change to the music. It must keep showing 0 clipped samples
   and no defects.
7. Finally, play the game (`/`): Day 1, and Day 2 through service and the report, to hear the moods
   change in context.

**Send back:** `voice-auditions/decisions.json`, `reports/listening-notes.json`, and the
budget/provider decision. Neither file is committed: both folders are gitignored. Attach them or
copy them into the PR if you want them kept.

## For review (Codex): look closely at

- **`src/audio/music.ts`, the DC blocker.**
  - A 20 Hz high-pass at the synth's output.
  - It changes the music-alone true peaks by up to 0.9 dB (section 5).
  - Check that nothing else connects around it: the reverb's wet path goes through it too.
- **`src/audio/manager.ts`:**
  - `persist: false` (start from `DEFAULT_VOLUMES`, never save);
  - `masterPeak()`, a separate 2048-sample analyser so `masterRms()` keeps its window;
  - the game itself still calls `createAudioManager` without options.
- **`scripts/vite-dev-tools.ts`:** dev-server-only (`apply: 'serve'`) GET and POST endpoints.
  - Saves go to two fixed paths, chosen by name, never by a request path.
  - Bodies are capped at 2 MB, and casting decisions are validated by `parseDecisions`.
  - Audition files are served only from inside `voice-auditions/` (normalised path check).
- **`src/dev/offlineMix.ts`:**
  - `createSfx` receives a cast host (`context`, `output`, `unlock` only);
  - the duck automation copies the manager's time constants (0.05 down / 0.4 up). If those change
    in `manager.ts`, this copy must follow.
- **`tests/e2e/casting.spec.ts`** asserts "shares this voice with" from the committed placeholder
  manifest. It will need updating when release voices land, and that update is the point.
- **The worst-case headroom is 0.5 dB.** Re-measure when real voices arrive: louder release clips
  could clip without a limiter.
