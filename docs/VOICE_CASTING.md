# Voice casting plan

**Status (2026-10-14): plan and pipeline only.**
- No replacement voices have been generated.
- No paid service has been used.
- No credits have been bought.

Today's voices are macOS placeholders, with four Australian characters sharing one female voice
through pitch shifts (docs/VOICE_ASSETS.md).

## Goals

- **One distinct voice identity per character.** No two characters share a base voice, and no
  identity is made by pitch-shifting another. `voices:check --release` enforces this.
- **Natural, intelligible English:** a listener should understand every order on first hearing at
  Easy difficulty.
- **Authentic accents, played straight:**
  - the accent is the puzzle, never the joke (AGENTS.md §6);
  - Korean- and Mandarin-accented English should come from people who actually speak that way, or
    from voices reviewed by such speakers;
  - no exaggeration.
- **Licence first:**
  - every candidate's terms are reviewed before any batch generation;
  - nothing is generated at scale until Edward approves a cast and a budget.

## Character briefs

| Character | Role / personality | Accent | Age | Voice notes | Lines today |
|---|---|---|---|---|---|
| **Gaz** | café owner; sarcastic, gruff, secretly fair | general/broad Australian (Sydney) | 50s | low, dry, unhurried; deadpan comic timing; warmth under the sarcasm | 296 |
| **Dazza** | tradie regular; always late for site | broad Australian | 30s | fast, clipped, slangy, friendly; slight rasp | 32 |
| **Beryl** | regular since 1987; chatty nan | older Australian | 70s+ | slow, warm, a bit wavery; "love", "darl" | 31 |
| **Karen** | demanding, curt, precise | general Australian | 40s | crisp, clipped consonants, controlled irritation; never shouting | 30 |
| **Priya** | nurse after a night shift; polite, tired | Indian English | late 20s | soft, slightly slow, tired but clear | 36 |
| **Jiwoo** | working-holiday maker; cheerful | Korean-accented English (L2, fluent) | early 20s | bright, quick, a few Korean words said naturally (아아, 감사합니다) | 35 |
| **Mei** | product manager on a call; brisk, confident | Mandarin-accented English (L2, fluent, professional) | 30s | quick, efficient, assured; not "cute", not halting | 39 |

The personalities are independent of accent. Jiwoo's cheerfulness and Mei's brusqueness belong to
them as people.

## Candidate sources (to audition, not chosen)

Voice catalogues change: check every name below against the provider's current list before
auditioning. "Natural" and "authentic" are judgements for Edward and native-speaker reviewers,
not for automated checks.

| Source | Australians | Indian English | Korean- / Mandarin-accented English | Notes |
|---|---|---|---|---|
| **Human voice actors** (Australian agencies, Voices.com, Backstage, Fiverr Pro) | best for Gaz's comic timing and Beryl's age | actor of Indian background | **recommended**: L2 speakers with the real accent | buyout licence covering games and trailers; usually the most natural |
| Microsoft Azure Neural TTS | en-AU: e.g. William, Duncan, Darren, Neil, Ken (m); Natasha, Annette, Elsie, Joanne, Carly (f) | en-IN: Prabhat, Kunal (m); Neerja, Ananya (f) | no dedicated accented-English voices; multilingual voices are a gamble, so review them | commercial use under Azure terms; SSML for pace and pauses |
| Google Cloud TTS | en-AU Neural2 / WaveNet / Chirp HD (A–D) | en-IN Neural2 (A–D) | as Azure | commercial use under Google Cloud terms |
| Amazon Polly | en-AU: Olivia (neural), Nicole, Russell | en-IN: Kajal (neural), Aditi, Raveena | none | limited en-AU neural range |
| ElevenLabs | voice-library Australian voices (per-voice terms) | yes | some accented voices; quality varies | commercial rights depend on plan and voice; check voice-library terms per voice and confirm actor consent |
| Open models (e.g. Piper voices) | no en-AU voice known | some | no | free, but each voice has its own dataset licence |

**Recommendation for the audition round:**
- **Human actors** for Gaz, Jiwoo and Mei: the hardest to get right, and the most at risk of
  caricature with TTS.
- **Licensed neural TTS** for Dazza, Beryl, Karen and Priya as a cheaper first pass, with a human
  fallback for any that sound flat.

## Audition set (2–3 short lines per character)

These are taken from the game's real lines and defined in `src/data/voice/auditions.ts`.
`npm run voices:audition` renders them for the configured candidates.

| Character | Audition lines |
|---|---|
| Gaz | the greeting opener · "Bloody hell. That's a proper heart." · a pour instruction |
| Dazza | "Oi mate! Flattie, ta. Gotta be on site in ten." · "Oat, mate." · "Legend. Cheers, mate." |
| Beryl | the heart order · "Soy, darl. Doctor's orders." · "Oh, look at that! A proper heart. You're a treasure." |
| Karen | "Almond flat white, extra hot. Not warm. Extra hot. …" · "That is the wrong milk. Do you people listen?" |
| Priya | "Just a long black. Actually, no, sorry, make that a flat white. Full cream's fine." · "Oat milk, please." |
| Jiwoo | the 아아 order · "Wah, perfect! 감사합니다! Thank you!" |
| Mei | "Oat flat white, extra hot. Sorry, I'm on a call." · "Sorry, this is the wrong milk." |

Score every candidate on the review sheet (`voice-auditions/index.html`):
- naturalness 1–5;
- intelligibility 1–5 (could a learner catch the order?);
- accent authenticity 1–5, from a native or heritage speaker for the Indian, Korean and Mandarin
  English voices;
- fit to the brief 1–5;
- caricature risk (yes/no);
- licence cleared (yes/no).

## Licence review checklist (per candidate, before any batch)

- [ ] Commercial use in a game distributed publicly (web build, desktop, mobile stores).
- [ ] Redistribution of the audio files inside game builds.
- [ ] Editing allowed: trimming, loudness normalisation, format conversion.
- [ ] Use in trailers, store pages and social media.
- [ ] Perpetual, worldwide, no per-download royalties (or the limits are written down).
- [ ] For TTS or cloned voices: the provider's terms allow commercial game use on our plan, and
      the voice's owner consented to synthetic use.
- [ ] Attribution or credit requirements are recorded.
- [ ] The contract or terms are saved with the project records, and `source.licence` names them.
- [ ] For actors: a buyout covering every manifest line, including slow repeats, plus a plan for
      pick-ups.

## Pipeline

- `src/data/voice/casting.ts`: the audition candidates per character (provider, voice, settings).
  Data only.
- `npm run voices:audition`:
  - renders the audition lines for every candidate into `voice-auditions/` (gitignored), and
    writes a review sheet;
  - **providers:**
    - `macos`: pipeline test only, and the sheet marks it "not a candidate";
    - `files`: import recordings an actor or provider delivered;
    - `azure`: prepared but untested (no credentials); it refuses to run without `--allow-paid`
      and `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`, and prints the character count first.
- **Release rules in the validator (`voices:check --release`):**
  - no placeholder;
  - a licence on every clip;
  - **one base voice per character** (no sharing);
  - **no pitch shift**.

## Cost and size (estimate to verify)

- About 500 lines, averaging ~60 characters, is roughly **30,000 characters per full voice pass**,
  plus about 10% for retakes.
- Neural TTS is priced per million characters, so one pass is small next to actor fees. **Check
  current pricing before approving.**
- Actors: Gaz has 296 lines. Expect a session-based quote.
