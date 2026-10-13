# Audio provenance and the release gate

Nothing with an unknown or unverified licence may ship. This is enforced by the production build
itself, not by people remembering.

## What can be in a build

| Audio | Where it comes from | Allowed in a build? |
|---|---|---|
| Procedural SFX and music (`src/audio/sfx.ts`, `src/audio/music.ts`) | generated in code at runtime: original to this repo, no files | yes (no files to check) |
| Placeholder voice clips (`voice-cache/`, `source.placeholder: true`) | macOS `say`, development only (docs/VOICE_ASSETS.md) | **no**: removed from `dist/` by the build |
| Release voice clips (`public/assets/voice/`, `source.placeholder: false` + `source.licence`) | licensed recordings/TTS | yes |
| Any other audio file (music, ambience, SFX recordings…) | must be listed in `src/data/audio/provenance.json` with a verified licence | only when listed and verified |
| Anything else | unknown | **no**: the build fails |

## The gate

`scripts/vite-voice.ts` runs after every `vite build`, using `scripts/audio-gate.ts`. It scans
every audio file in `dist/`:
- **placeholder voice clip:** deleted, with a warning;
- **licensed release voice clip, or a provenance entry with all of `source`, `licence`,
  `verifiedBy` and `verifiedOn`:** kept;
- **anything else:** **the build fails** and lists the files. For example, renders left in the
  old `public/assets/voice/` location that aren't in the manifest fail it.

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
