# Voice assets: sources, licence status, workflow

**Status (2026-10-13): every voice clip is a PLACEHOLDER.** The manifest says so
(`status: "placeholder"`, `source.placeholder: true` on every clip). Nothing here is cleared
for distribution.

## Placeholder vs release audio

| | Placeholder (now) | Release (later) |
|---|---|---|
| Made by | `npm run voices`: macOS `say` + ffmpeg, offline | licensed voice actors, or a TTS service whose terms allow commercial redistribution |
| Licence | Apple system voices: personal, non-commercial use (my reading of the macOS licence; Edward to verify). **Not redistributable.** | stated per clip in `source.licence` (rights holder and terms), required |
| Lives in | `voice-cache/` (gitignored) | `public/assets/voice/` (bundled; remove its `.gitignore` line first) |
| Served by | the Vite dev server only (`scripts/vite-voice.ts`) | dev server and production builds |
| In a production build | **never**: the build strips any placeholder clip that reached `dist/`, and the game doesn't request placeholders in production (it uses the browser voice and says so) | yes |
| Manifest | `source.placeholder: true`, `engine: "macos-say"` | `source.placeholder: false`, `source.licence: "…"` |

The validator enforces the rules:
- a `macos-say` clip can never be marked release;
- a release clip needs a licence statement;
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
| `npm run voices:check` | the manifest checks below, plus every file exists where it should, its measured duration is within 30 ms of the manifest, and no cached file is orphaned |
| Manifest checks (`src/data/voice/validate.ts`) | schema, duplicate ids and files, id/path consistency with speaker + transcript + delivery, voice profile, accent and locale, duration, pace, loudness, placeholder and licence flags, coverage of every line the game can say |
| Unit tests (`tests/data/voiceValidate.test.ts`, `tests/data/voice.test.ts`) | the manifest checks, run on every `npm test` |

- **After editing any spoken line** (owner lines, orders, answers, customer lines): run
  `npm run voices`, then `npm test`. The coverage tests fail until every line has a clip.
  Re-rendering needs macOS.
- **Clips from before 2026-10-13** were written to `public/assets/voice/`. Delete that folder
  (it is gitignored, and builds strip it anyway) and run `npm run voices` to fill `voice-cache/`.

## Moving to release audio

1. Record or license the lines listed in the manifest. Each `transcript` is the exact wording,
   and `delivery: "slow"` is the "could you repeat that?" take.
2. Put the files at the manifest's `file` paths under `public/assets/voice/`, and remove
   `public/assets/voice/` from `.gitignore`.
3. Update each clip:
   - `source.placeholder: false`;
   - `source.engine`;
   - `source.licence` (rights holder and terms);
   - `voiceId`;
   - the measured `duration` and `meanDb`.
4. When no placeholder is left, set `status: "release"`.
5. Run `npm run voices:check -- --release` until it passes, then `npm test` and `npm run test:e2e`.
