# Voice assets: sources, licence status, workflow

**Status (2026-10-17): every voice clip is still a PLACEHOLDER**; the licensed pass below is built
and waits for Edward's paid render, the listen-through and the actors' recordings. The manifest says so
(`status: "placeholder"`, `source.placeholder: true` on every clip), and the segment manifest
(`src/data/voice/segments.manifest.json`) lists **0 segment clips**. Nothing here is cleared
for distribution.

## Placeholder vs release audio

| | Placeholder (now) | Release (later) |
|---|---|---|
| Made by | `npm run voices`: macOS `say` + ffmpeg, offline | licensed voice actors, or a TTS service whose terms allow commercial redistribution |
| Licence | Apple system voices: personal, non-commercial use (my reading of the macOS licence; Edward to verify). **Not redistributable.** | stated per clip in `source.licence` (rights holder and terms), required |
| Lives in | `voice-cache/` (gitignored) | `public/assets/voice/` (bundled; remove its `.gitignore` line first) |
| Served by | the Vite dev server only (`scripts/vite-voice.ts`) | dev server and production builds |
| In a production build | **never**: the build strips any placeholder clip that reached `dist/`, and the game doesn't request placeholders in production (it uses the browser voice and says so) | yes |
| Manifest | `source.placeholder: true`, `engine: "macos-say"`, no `provenance` | `source.placeholder: false`, `source.licence: "…"`, `source.provenance: "licensed_tts"` or `"recorded"` |

The validator enforces the rules:
- a `macos-say` (or test `fake-tts`) clip can never be marked release;
- a release clip needs a licence statement and a provenance of `licensed_tts` or `recorded`;
- a placeholder clip never claims a release provenance;
- `npm run voices:check -- --release` fails while any placeholder remains.

## Sources in use

All are macOS system voices: no cloning, no paid API, no network.

| Character | Accent group | Voice | Reproducible? |
|---|---|---|---|
| Gaz, Dazza, Beryl, Karen | Australian | Karen (pitched per character) | yes, bit-identical across renders |
| Priya | Indian English | Tara | **no** (see below) |
| Jiwoo | Korean-accented | Yuna | yes |
| Mei | Mandarin-accented | Tingting | yes |

**Tara is not deterministic.**
- Two forced renders changed 8 to 12 of Priya's 36 clips, by up to 3.8 s.
- Parallel renders produced empty, garbled or hung files.
- So Priya's clips are now rendered one at a time, three takes each, keeping the median-length
  take that passes the sanity checks.
- With that, two forced renders differed in 1 of 36 clips, by 0.002 s.
- The manifest records `source.deterministic: false` for these clips.

## Workflow (development)

```bash
npm run voices                 # render missing/changed lines into voice-cache/, re-measure the rest
npm run voices -- --only priya --force    # re-render one speaker
npm run voices -- --prune      # delete cached clips no longer in the manifest
npm run voices:check           # manifest + files: missing audio, duration drift, orphans, metadata
npm run voices:check -- --release         # what a release build would need (fails today)
```

**What `npm run voices` does**
- Probes each voice for determinism.
- Renders each line; every take must pass:
  - duration 0.3–30 s;
  - pace 1.2–6 words/s;
  - peak above −30 dB;
  - mean above −35 dB.
- Retries a failed take up to 3 times. If it still fails, the clip is left out (so the coverage
  test fails loudly) rather than shipping a broken file.
- Writes `src/data/voice/manifest.json` from what is actually on disk.
- Never touches release clips.

**Checks**

| Check | Covers |
|---|---|
| `npm run voices:check` | the manifest checks below, plus every file exists where it should, its measured duration is within 30 ms of the manifest, and no cached file is orphaned; then the segment manifest (below), in both modes |
| Manifest checks (`src/data/voice/validate.ts`) | schema, duplicate ids and files, id/path consistency with speaker + transcript + delivery, voice profile, accent and locale, duration, pace, loudness, placeholder and licence flags, coverage of every line the game can say |
| Unit tests (`tests/data/voiceValidate.test.ts`, `tests/data/voice.test.ts`) | the manifest checks, run on every `npm test` |

- **After editing any spoken line** (owner lines, orders, answers, customer lines): run
  `npm run voices`, then `npm test`. The coverage tests fail until every line has a clip.
  Re-rendering needs macOS.
- **Clips from before 2026-10-13** were written to `public/assets/voice/`. Delete that folder
  (it is gitignored, and builds strip it anyway) and run `npm run voices` to fill `voice-cache/`.

## The licensed pass (Phase 3, 2026-10-16)

Edward's decisions: **Google Cloud TTS** (Chirp 3 HD) for Dazza, Beryl, Karen and Priya; **actors**
for Gaz, Jiwoo and Mei; a **AU$20** cap. The cast is `CAST` in `src/data/voice/casting.ts`.

```bash
npm run voices:estimate -- --segments  # characters and AU$ per TTS speaker; refuses over the cap
npm run voices:render                  # dry run: what would render
npm run voices:render -- --allow-paid  # paid (Edward): → voice-cache/licensed/ + index.json
npm run voices:sheet                   # voice-auditions/review-sheet.{json,md}: listen-through + recording script
npm run voices:render -- --promote     # offline: approved staging → public/assets/voice/ + manifest (segments → segment manifest)
npm run voices:render -- --import <dir> # actors' takes (<hash>.wav, segments/<id>.wav, source.json {licence, performer})
npm run release:check                  # passes only with 0 placeholders
```

- The paid render needs `--allow-paid` and `GOOGLE_TTS_ACCESS_TOKEN` (`gcloud auth print-access-token`)
  plus `GOOGLE_CLOUD_PROJECT`. Nothing calls Google without both.
- Today the full TTS pass is 5,536 characters (AU$0.27), or 7,599 (AU$0.36) with segments.
- Staging is resumable: `index.json` is written after every clip, and a re-run only renders what
  is missing or changed.
- `--promote` and `--import` write the manifest only when it still validates.
- Release clips carry `source.provenance` (`licensed_tts` or `recorded`). The validator and the
  build gate refuse anything else.
- **Never commit audio.** Release clips live in `public/assets/voice/` (gitignored); commit the
  manifest only. Each machine that builds a release needs the clips there (render or copy them).
- Generated-order segments ship through their own committed manifest (next section).

## Segment clips (generated orders)

Generated orders are said as segment clips joined back to back (`src/data/voice/segments.ts`), one
file per segment id at `assets/voice/segments/<speaker>/<id>.mp3`.

- **Development:** `npm run voices -- --segments` renders placeholder segment clips into
  `voice-cache/segments/`. The dev server serves them, and the game tries every segment.
- **Release:** `src/data/voice/segments.manifest.json` (`{ "version": 1, "clips": [] }`, committed)
  lists each segment clip that ships, with the line clips' `source` fields (`placeholder: false`,
  `licence`, `provenance` `licensed_tts` or `recorded`). It is a separate file, so the line
  manifest's shape and version don't change.
  - `voices:render -- --promote` writes the staged licensed segments into it, and
    `-- --import <dir>` writes the actors' segment takes (`<speaker>/segments/<segment id>.wav`).
    The files go to `public/assets/voice/segments/`.
  - The build gate keeps a segment clip only when this manifest lists it as release audio, and
    rejects any other segment clip in the build. A placeholder entry here (`placeholder: true` or
    provenance `placeholder`) fails the build; it is never quietly stripped.
  - A production build asks for a segment clip only when it is listed here. A generated line with
    any unlisted segment uses the browser voice, whole.
  - `voices:check` validates it in both modes: the segment exists with the same words, the file
    path, a licence and provenance, and no placeholders. With file checks, each listed file must be
    in `public/assets/voice/segments/` at its duration, and no unlisted segment file may be there.
- **0 segment clips ship today:** in builds, generated orders use the browser voice until the paid
  render or the actors' segment takes are promoted or imported.
- A slow repeat ("could you repeat that?") of a generated line is always the browser voice: segments
  are rendered at normal pace only.

## Moving to release audio

1. Record or license the lines listed in the manifest. Each `transcript` is the exact wording,
   and `delivery: "slow"` is the "could you repeat that?" take.
2. Put the files at the manifest's `file` paths under `public/assets/voice/`, and remove
   `public/assets/voice/` from `.gitignore`.
3. Update each clip:
   - `source.placeholder: false`;
   - `source.engine`;
   - `source.licence` (rights holder and terms);
   - `source.provenance` (`licensed_tts` or `recorded`);
   - `voiceId`;
   - the measured `duration` and `meanDb`.
4. When no placeholder is left, set `status: "release"`.
5. Run `npm run voices:check -- --release` until it passes, then `npm test` and `npm run test:e2e`.
