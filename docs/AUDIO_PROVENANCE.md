# Audio provenance and the release gate

Nothing with an unknown or unverified licence may ship. This is enforced by the production build
itself, not by people remembering.

## What can be in a build

| Audio | Where it comes from | Allowed in a build? |
|---|---|---|
| Procedural SFX and music (`src/audio/sfx.ts`, `src/audio/music.ts`) | generated in code at runtime: original to this repo, no files | yes (no files to check) |
| Placeholder voice clips (`voice-cache/`, `source.placeholder: true`) | macOS `say`, development only (docs/VOICE_ASSETS.md) | **no**: removed from `dist/` by the build |
| Release voice clips (`public/assets/voice/`, `source.placeholder: false` + `source.licence`) | licensed recordings/TTS | yes |
| Release segment clips (`public/assets/voice/segments/`, listed in `src/data/voice/segments.manifest.json`) | licensed recordings/TTS of generated-order segments (none yet) | yes, only when listed |
| Any other audio file (music, ambience, SFX recordings…) | must be listed in `src/data/audio/provenance.json` with a verified licence | only when listed and verified |
| Anything else | unknown | **no**: the build fails |

## The gate

`scripts/vite-voice.ts` runs after every `vite build`, using `scripts/audio-gate.ts`. It scans
every audio file in `dist/`:
- **placeholder voice clip:** deleted, with a warning;
- **licensed release voice clip (`placeholder: false`, a licence, and provenance `licensed_tts` or
  `recorded`) in the line manifest or the segment manifest, or a provenance entry with all of
  `source`, `licence`, `verifiedBy` and `verifiedOn`:** kept;
- **anything else:** **the build fails** and lists the files. For example, renders left in the
  old `public/assets/voice/` location that aren't in the manifest fail it, and so does a segment
  clip the segment manifest doesn't list.

`npm run release:check` adds the release-only rule: every voice clip must be release audio
(`voices:check --release`). It fails today, because all 499 clips are placeholders.

## Adding a licensed audio file

1. Put it under `public/assets/…`.
2. Add an entry to `src/data/audio/provenance.json`:
   ```json
   {
     "file": "assets/music/morning-tram.ogg",
     "title": "Morning Tram",
     "author": "Name of the composer",
     "source": "https://where.it.came.from/",
     "licence": "CC0 1.0 (or the contract reference)",
     "verifiedBy": "Edward",
     "verifiedOn": "2026-10-20"
   }
   ```
3. Keep a copy of the licence text or contract with the project records. `verifiedBy` means a
   person read the licence and confirmed it allows use in this game, including commercial use if
   the game will be sold.
4. Run `npm run build`. The gate must report it as kept.

## History

On `feat/voice-listening` (`1e659f9`), a build with local renders present copied all 490 MP3s
into `dist/` (Codex audit A4).
- **`feat/audio-qa-hardening` (`4c809a6`):** removed the 486 manifest placeholders, but still
  shipped 4 orphan renders that weren't in the manifest.
- **`fix/audio-integration`:** fails the build on those 4 instead. Verified on 2026-10-13 with a
  copy of the main checkout's `public/assets/voice/`.

Genuinely clean checkouts (`git archive`) of every branch contain no audio files at all.

## Music (2026-10-14)

Three moods are generated in code, so no recordings, samples or third-party tracks are involved:

| Mood | Style | Tempo | When |
|---|---|---|---|
| `opening` | indie acoustic / light jazz: fingerpicked pluck, soft keys, brushes | 92 bpm | title, Day 1, Day 2 intro |
| `rush` | upbeat indie / surf / funk: kit, syncopated bass, tremolo surf lead | 118 bpm | Day 2 service |
| `afternoon` | neo-soul / relaxed jazz: Rhodes-style keys, swung kit, walking bass | 78 bpm | Day 1 verdict, Day 2 wrap-up and report |

**Sources:**
- `src/audio/musicPatterns.ts` holds the notes: generic chord progressions, with melodies picked
  from scales by a seeded RNG per bar.
- `src/audio/music.ts` is the synth: FM keys, filtered pluck, sine/triangle bass, saw lead with
  tremolo, and noise drums.

**Provenance:** original to this repository. Chord progressions such as ii–V–I or Em7–A7–G–D7
are common musical vocabulary, not copied works. No Spotify, commercial or library music is used.

**Mixing:**
- The music has its own bus and volume slider ("Music", default 45%).
- It ducks under speech: to 0.28 under orders and answers, 0.55 under other talk, and back to
  full about 1 s after the speech ends.

**Replacing it later:** licensed tracks must go through `src/data/audio/provenance.json` and the
build gate above.

## Listening lab and measurements (2026-10-14)

`npm run dev`, then `/dev/listening.html` (dev server only, never built). It runs the game's own
audio engine (manager, music synth, SFX):
- switch between the three moods, or turn the music off;
- separate voice / music / ambience / effects volumes (they don't touch the player's saved game
  settings), crowd level and the espresso machine;
- real dialogue to test the duck (orders vs chat), three lines fired quickly to test that only one
  plays at a time, pause and resume;
- live output peak (held), RMS, music duck, clip events and a 12-second level scope;
- **Measure**: each mood rendered offline through the same synth: 28 s alone at 100% music, and a
  16 s worst case (every bus at 100%, a packed café, every machine sound at once, an order over
  the ducked music). Integrated loudness (BS.1770, `src/audio/meter.ts`), true peak (4×
  oversampled), crest, DC and clipped samples, with findings from `src/audio/mixCheck.ts`;
- ratings (fits the café, sits under the voices, easy to hear all shift, variety) and notes per
  mood, saved to `reports/listening-notes.json` or exported.

**Measured in Chrome 155 (headless, macOS), after the fix below:**

| Mood | LUFS at 100% music | at the default 45% | True peak | Worst case | Clipped |
|---|---|---|---|---|---|
| opening | −20.1 | −27.1 | −4.1 dBTP | −0.5 dBTP | 0 |
| rush | −20.5 | −27.4 | −2.5 dBTP | −0.6 dBTP | 0 |
| afternoon | −20.3 | −27.2 | −1.4 dBTP | −0.8 dBTP | 0 |

- The moods are within 0.4 LU of each other: a mood change isn't a volume jump.
- The placeholder order clips average −14.5 LUFS as heard in the game (mono, up-mixed to both
  channels; the files themselves read −17.5), about **24 LU above the ducked music** at default
  volumes.
- Measured duck: 0.28 under an order and 0.55 under chat, as designed.
- Nothing clips, even in the worst case. Its 0.5 dB of headroom is the smallest margin; if
  louder release voices arrive, re-measure before adding a limiter.

**Fixed: DC offset in the music (objective defect).** The FM electric-piano keys modulate at the
carrier's own frequency, which puts a 0 Hz sideband into every chord. Soloing each instrument
offline traced it to the keys (afternoon keys alone: DC −0.0047, every other instrument below
−62 dBFS). Mixes measured 0.0013 (opening), 0.0032 (rush) and 0.0035 (afternoon). A 20 Hz
high-pass at the synth's output (`src/audio/music.ts`) removes it: DC is now ≤ 0.00001, and
loudness moved by ≤ 0.2 LU. The notes, instruments and mix are unchanged.

The output isn't bit-identical: the filter's low-frequency phase shift moved the music-alone true
peaks (opening −4.8 → −4.1, rush −3.4 → −2.5, afternoon −1.1 → −1.4 dBTP). The worst case moved by
less than 0.3 dB. Regression:
`tests/e2e/listening.spec.ts` (DC < 0.0005 per mood) fails on the old synth and passes now.

**Not judged by measurement:** whether the moods sound good, fit the café, or tire the ear over a
shift. That needs people listening on real speakers, and phones: see the lab's notes.
