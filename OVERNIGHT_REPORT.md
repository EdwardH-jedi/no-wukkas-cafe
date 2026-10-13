# Overnight report: voice, accents, listening, latte art, NPCs (2026-10-13)

Branch `feat/voice-listening` (from `6b8e0ae`). Nothing pushed, merged or deployed.

**In one paragraph:** pressing Start now plays a recorded line from Gaz through Web Audio. Chrome
decodes and plays it, with timings measured in the browser below. Day 2 orders are now a
listening task. Six customers in four accent groups speak 30 curated orders. You ring up what
you heard, and can replay, ask for a slower repeat, or ask one question. The ticket you print is
what gets made, so mishearing has consequences. **All voices are placeholders** made with macOS
system voices. The accents come from the voices themselves (Indian-English Tara, Korean Yuna,
Mandarin Tingting reading standard English), but nobody has judged by ear whether they sound
natural. The Australian set is one female voice (Karen) shifted in pitch for four characters,
including Gaz. Licensed or recorded voices are needed before anything ships (§4–5).

---

## 1. Initial state

- Day 1 (barista trial) and Day 2 (morning rush, 5 customers) were playable, at
  http://localhost:5183/.
- **Voice before this session:**
  - All dialogue went through `speechSynthesis` (`src/audio/voice.ts`). It called `cancel()` and
    then `speak()` in the same tick (Chrome is known to drop such utterances).
  - `pause()` could leave the engine stuck paused.
  - Gaz was voiced by the only en-AU system voice, the female Karen.
  - Nothing detected or reported a failure, so silence was invisible.
- **The silence was not reproduced.** In automation Chrome, a trusted click on Start did start
  speech: instrumented `speechSynthesis` showed Karen's `start` event and `speaking=true`.
  - The exact cause on Edward's machine is therefore unknown.
  - Plausible causes, all removed by the new design:
    - the dropped-after-`cancel()` Chrome bug;
    - an engine left paused;
    - voices not yet loaded when the first line fired;
    - the voice toggle, with no UI saying it was off.
  - The fix doesn't depend on `speechSynthesis` at all. Clips play through Web Audio, and the
    browser voice is only a reported fallback.
- No TTS provider credentials existed. The Higgsfield MCP connector is paid, so it was not used.

## 2. Work by phase

| Phase | Commit | What |
|---|---|---|
| 1 Audio (P0) | `19c3c46` | AudioManager; `npm run voices` pipeline; replay/volumes/status; clip-timed subtitles |
| 2+3 Accents + listening (P0/P1) | `566f3c6` | 30 curated orders and answer keys; register (POS); replay, repeat, clarify; difficulty; learning mode; Mei; 486 clips |
| 4 Latte art (P2) | `806492c` | Jug and arm go see-through over the cup (the one demonstrated weakness) |
| 5 NPCs (P2) | `010855b` | Customer head turns and eye contact, lip sync from audio, blinks, reactions; Gaz's eyes lead his head |
| 6 Report | this commit | This file, docs, roadmap |

**Phase 1: AudioManager (`src/audio/manager.ts`)**
- One `AudioContext`, created and resumed inside the Start click (also on any later click or key
  if the browser blocked it).
- Three buses with their own volume: voice, ambience, SFX. An analyser sits on the voice bus.
- Clips are fetched and decoded with `decodeAudioData`. The encoded bytes are cached; only the 16
  most recent clips are kept decoded, to limit memory.
- Only one line plays at a time; a new line fades out the old one.
- Replay (R, or the ↻ button).
- Pausing suspends the context, so the voice freezes mid-word and resumes from the same point.
- A status dot and a toast cover every state: blocked, missing clip, load failure, fallback.
- A hardened browser-speech fallback (`src/audio/voice.ts`):
  - calls `resume()` before speaking, and speaks on the next task after `cancel()`;
  - guards the utterance against garbage collection;
  - runs a watchdog that reports when speech never starts.
- SFX now share the same context.
- How long a line holds the screen (`core/`) now comes from the clip length plus 0.35 s, so the
  subtitle and the voice end together.
- A Sound panel holds the three volumes, a voice on/off switch, a Test voice button, Replay, and
  the listening settings.

**Phase 2: voice pipeline**
- Every line the game can say is enumerated, with templates expanded (`src/data/voice/script.ts`).
- `npm run voices` (`scripts/voices.ts`) does the rest:
  - renders each line with `say`;
  - processes it with ffmpeg: optional pitch shift that keeps the speed, silence trim, loudness
    normalisation to −17 LUFS, mono 24 kHz 48 kbps MP3;
  - measures duration and loudness from the encoded file;
  - writes `src/data/voice/manifest.json`.
- Each manifest entry has:
  - `dialogueId` (speaker plus a hash of the exact words and delivery);
  - `characterId`, `voiceId`, `accent`, `locale`, `transcript`, `file`, `duration`, `meanDb`;
  - `playback` settings and `source` metadata;
  - `placeholder: true` on every clip made with `say`.
- Rendering is incremental: an edited line gets a new id and is re-rendered.

**Phase 3: listening (Day 2)**
- **Order bank** (`src/data/orders.ts`): 30 orders, each with its exact text and an answer key.
  - Each order is scored on pace, connected speech, slang, chatter and number of modifiers, which
    gives a tier from 1 to 3.
  - Every accent group has orders in every tier, so accent alone never sets difficulty (tested).
  - Every part of an order that isn't the default is actually said (`cues`, tested).
- **Register** (`src/ui/pos.ts`):
  - **Selection:** drink (no default), milk, temperature, heart.
  - **Listening aids:**
    - Replay;
    - "Sorry, could you repeat that?" (a slower recording, at most two per customer);
    - questions: Drink? Milk? Hot? Heart? Answers come from the answer key, in the customer's own
      words.
    - Each aid costs the customer patience and is counted.
- **The ticket is what gets made.**
  - A wrong ticket produces the wrong drink, which the customer hands back. Wrong milk is now
    rejected too.
  - Gaz says "That's what the ticket says, mate, but it's not what Priya said" (or similar). The
    customer states the right milk, and the ticket is corrected.
- **Difficulty** Easy / Normal / Hard sets:
  - which order tiers customers pick from;
  - café crowd noise (×0.6 / ×1 / ×1.7);
  - the default subtitle rule.
- **Order subtitles:** Always, only after a repeat, or Off. **Learning mode** shows the transcript
  once you ring up, with the key words marked: green for heard, red for missed.
- **Shift report:** "Orders heard right", replays · repeats · questions, and a "Listen again" list.
- **Mei** (Mandarin-accented English, product manager) joins. Day 2 now has 6 customers; arrivals
  were re-spaced to 1/16/42/66/90/114 s. Milk type flows from ticket to station to drink.

**Phase 4: latte art.** I only fixed what the evidence showed. In the 2026-10-12 e2e screenshot,
the jug and arm hide the right ~40% of the cup while pouring, so you pour blind on that side.
They now fade to 30% opacity over the cup, for your pour and for Gaz's demo. The pour sim and
scoring are unchanged. Evidence: `docs/verification/2026-10-13-latte/`.

**Phase 5: NPCs. Customers** (all six share the factory in `src/world/humans.ts`):
- The head is now a separate mesh, so it can turn: 5 draw calls per person instead of 4.
- **Eye contact:**
  - at the register, and whenever they're talking, they look at you;
  - while waiting, they watch the pass;
  - walking or leaving, they look ahead.
- The mouth follows the loudness of their own recorded line (from the voice bus analyser).
- Blinking, with each person on their own rhythm.
- Idle breathing and a slow weight shift.
- Reactions:
  - happy serve: cheer (a hop, chin up); acceptable serve: nod;
  - poor serve or walk-out: huff (lean back, chin up);
  - drink handed back: head shake.
- Face redraws compare fields rather than building strings, so there are no per-frame
  allocations.

**Phase 5: Gaz.**
- His mouth follows the loudness of his clip (added in Phase 1).
- His pupils now lead his head toward whatever he's looking at, and cover what his neck can't
  turn to. Small, timed eye movements keep him from staring like a statue.
- He wasn't remodelled: no asset packs, no character creator. Proportions and silhouettes are
  unchanged.

## 3. Accent audio files that exist now

486 MP3 clips, about 9.7 MB, under `public/assets/voice/<speaker>/` (**gitignored**, see §4).
The manifest (committed) lists every one.

| Character | Accent group | Voice (macOS) | Clips | Of which | Personality (independent of accent) |
|---|---|---|---|---|---|
| Gaz (owner) | Australian | Karen, pitch ×0.88 | 283 | all Day 1 and Day 2 owner lines, templates expanded | sarcastic, grumpy, fair |
| Dazza | Australian | Karen, pitch ×0.90, fast | 32 | 4 orders + 4 slow repeats + 13 answers + reactions | tradie, fast, slangy |
| Nan Beryl | Australian | Karen, slow | 31 | 4 + 4 + 13 + reactions | chatty, warm, slow |
| Karen | Australian | Karen, pitch ×1.03 | 30 | 3 + 3 + 13 + reactions | curt, demanding |
| Priya | Indian English | Tara (en-IN) | 36 | 6 + 6 + 13 + reactions | tired nurse, polite, changes her mind |
| Jiwoo | Korean-accented | Yuna (ko-KR) | 35 | 6 + 6 + 13 + reactions | cheerful, a few Korean words (아아, 감사합니다) |
| Mei | Mandarin-accented | Tingting (zh-CN) | 39 | 7 + 7 + 13 + reactions | brisk, on a call, confident |

- **Order recordings per accent group:**
  - Australian: 11 (+11 slow);
  - Indian: 6 (+6);
  - Korean: 6 (+6);
  - Mandarin: 7 (+7).
- **Owner recordings:** 283.
- The brief asked for at least 6 per group and 8 for the owner: met.
- Example: `assets/voice/dazza/8c37a1c3.mp3`, 3.07 s, "Oi mate! Flattie, ta. Gotta be on site in
  ten."

## 4. Provider and licence

- **Engine:** macOS `say` (Apple system voices), driven offline by `npm run voices`. No paid API,
  no network calls, no credentials, and no voice cloning.
- **Licence (my understanding; please verify).** Apple's macOS licence covers system voices for
  personal, non-commercial use and does not allow redistributing their output. So:
  - the MP3s are **not committed** (`.gitignore: public/assets/voice/`);
  - the Sound panel says the voices are placeholders.
- **Before any public build:** replace them with licensed voice actors, a licensed TTS service
  with commercial rights, or original recordings. The manifest format and the game don't change;
  swap `renderOne()` in `scripts/voices.ts`, or drop in files with the same ids.
- **Consequence:** a fresh clone or a non-Mac machine has no clips. The game then falls back to
  browser speech and shows a "fallback" status; the audio e2e test skips. Only macOS can repair
  the voice coverage tests after a line is edited.

## 5. Placeholders and what is NOT verified

- **Gaz is not a male Australian voice.** No male en-AU voice is installed, so he is the female
  Karen pitched down. First manual step: install "Lee" or "Gordon" (System Settings →
  Accessibility → Spoken Content → System Voice → Manage Voices), then run `npm run voices`. The
  profiles already prefer them.
- **The four Australian characters share one voice.** On Day 2, voices are clearly different
  only *between* accent groups, not within the Australian group.
- **Tingting and Yuna read English through Mandarin and Korean engines.** The accent is present
  (they are native-language voices), and duration checks show they speak at about 2.5 words/s
  rather than spelling words out. Whether the English sounds natural or caricatured has not been
  judged by a human ear. I can't listen to audio; Edward should listen to a few of each.
- No automated test proves accent authenticity, intelligibility or fun. The tests only prove that
  clips exist, decode, aren't silent or truncated, and match the transcript the game shows.
- Not tried on iPhone Safari (`npm run dev -- --host`). The code follows the iOS unlock rules
  (create and resume inside the gesture, play a 1-sample buffer), but it is untested there.
- There is no music, so the "music" volume is the café ambience slider.
- **Day 2 balance (6 customers, listening-aid costs) has only been tested by bots.** A competent
  bot serves all six on Normal and Hard, and the rush e2e passes. Human playtesting (D2.7) is
  still open.

## 6. Tests, typecheck and build

- `npm run typecheck`: clean.
- `npm run lint` (eslint + prettier): clean.
- `npm test`: **138 passed** (16 files), up from 102 at the start. New tests cover:
  - voice ids and manifest fields;
  - every scripted line has a clip, and every line the bots hear on Day 1 or Day 2 has a clip
    and holds the screen longer than the clip;
  - listening rules: answer key, tiers, picks, clarifying answers, transcript visibility;
  - order-bank fairness;
  - Day 2 scenarios:
    - misheard → handed back → corrected → served;
    - aids are counted and cost patience;
    - the repeat cap;
    - difficulty picks the right tiers;
    - a hard shift.
- `npm run test:e2e`: **4 passed (6.8 min)** after Phase 5: the audio playback spec, the audio 404 spec, the Day 2 rush (listening) spec and the Day 1 trial spec. After the final one-line register fix, the Day 2 spec was re-run and passed (3.9 min).
- `npm run build`: OK after the last code change. JS 918 KB, 223.5 KB gzipped. After Phase 1 it
  was 821 KB; the pre-session size wasn't measured. The growth is mostly the voice manifest;
  trimming it is listed in §11.
- `npm run balance` is still a stub. No economy exists yet, so there's no balance diff.

## 7. Browser playback verification (real Chrome, not "play() didn't throw")

**Chrome via DevTools MCP, http://localhost:5183/?seed=7, trusted click on "Day 1: Start the
trial":**
- Context `running`, status `ok`, latency from request to first sample 39 ms.
- First clip "Oi. You the trial? You're late…":
  - decoded buffer 5.0023 s against 5.002 s in the manifest;
  - started at context time 0.027 s, `onended` at 5.029 s (played its full length);
  - voice-bus peak RMS 0.248.
- The next line started at 5.344 s (the 0.35 s gap is the subtitle tail).
- Pause (Esc): context `suspended`, `currentTime` frozen at 14.7627 s for 1.5 s.
- Resume: the paused clip ended at 15.541 s, exactly its start (10.437 s) plus its length
  (5.104 s), so no audio was lost.
- Replay (R): the same line played again from the start, and its subtitle came back.
- **Failure path:** I made every clip return 404. Status changed to `fallback`, an amber toast
  said "Couldn't load a voice clip (HTTP 404 …). Using the browser voice for now.", and browser
  speech started (Karen, `start` fired).
- **Day 2:**
  - Dazza's order clip played (peak RMS 0.26–0.28).
  - "Milk?" played "Just normal milk." as a clip.
  - "Repeat" played the `-slow` clip (3.44 s against 3.07 s for the normal one), and the
    transcript appeared, as Normal difficulty requires.

**Playwright (`tests/e2e/audio.spec.ts`), Chromium, real click:**
- Decoded 5.002 s (manifest 5.002 s), played 5.003 s, peak RMS 0.243.
- Pause freezes `currentTime`.
- Replay adds a second play of the same line.
- The voice volume slider works.
- The 404 test shows the toast and falls back to browser speech.

## 8. Gameplay verification

- **Day 1:**
  - Gaz speaks on Start (above).
  - Every line he can say in four bot play styles (good, messy, lazy, blob) has a clip (unit
    test).
  - The full trial e2e (mouse and trackpad hearts, verdict, restarts) passes with clip-timed
    lines.
- **Day 2 e2e** (`tests/e2e/rush.spec.ts`, evidence in `docs/verification/2026-10-13-listening/`):
  1. No transcript while Dazza orders.
  2. Replay, then "Milk?" (answer heard, still no transcript), then "repeat": slow take, and the
     transcript appears.
  3. Rung up correctly ("Spot on"), made with real input, served.
  4. Priya rung up wrong on purpose: "Not quite", with the missed words in red.
  5. Her wrong drink is made, handed back, Gaz says it was misheard, and the ticket is corrected.
  6. Walk-outs, then a shift report with "Orders heard right 1/2" and "Listen again".
  7. Restart, back to the title.
- **Manual (Chrome MCP):**
  - The register layout, and that a ticket's Make button is readable (fixed during the session).
  - Enter rings up even with a register option focused (fixed during the session).
  - The ghosted jug during Gaz's demo.
  - Customers making eye contact (Priya ordering) and a waiting customer watching the pass
    (`docs/verification/2026-10-13-npc/`).

## 9. Performance

- **Draw calls:** 104 with 2 customers (Chrome MCP). The Day 2 e2e asserts fewer than 150 at the
  busiest moment it sees. In a quick Chrome check with up to 4 customers on screen, the maximum
  was 121. Each customer now costs 5 calls instead of 4.
- **Audio memory:**
  - at most 16 decoded buffers at once; the rest are kept as compressed bytes;
  - prefetch per day: Day 1 Gaz clips about 2.9 MB; Day 2 the remaining customer and rush clips.
  - Initial JS stays well under the 3 MB budget.
- **Per-frame:**
  - the voice-level read uses a preallocated `Float32Array`;
  - face canvases redraw only when the mood, mouth, a blink or Gaz's gaze changes.
- Not profiled on a phone.

## 10. Commits

```
(this)  docs: overnight report, roadmap, AGENTS/README updates
010855b feat(npc): customers make eye contact, lip-sync to their clips, blink and react; Gaz's eyes lead
806492c feat(latte): ghost the jug and arm over the cup so the pattern stays visible while pouring
566f3c6 feat(listening): Day 2 orders are heard, not read: register, replay/repeat/clarify, six voices
19c3c46 feat(audio): recorded voice lines through Web Audio, with replay, volumes and failure feedback
```

## 11. Remaining bugs and risks

- **Placeholder voices** (§4–5) are the main open item.
- `core/rush.ts` is now 718 lines, over the ~400-line guideline. Split the listening
  orchestration out of it before it grows more.
- The JS bundle carries the full manifest (~200 KB raw). The runtime only needs id → file,
  duration and playback settings. Generating a slim runtime map would save about 150 KB.
- When the register is open, it covers the waiting customers standing on the right.
- Clips for edited or removed lines stay on disk as orphans (harmless, but untidy).
- Patience costs of the listening aids (1 / 6 / 3 s) and the 6-customer timing are guesses that
  need a playtest.
- Browser speech fallback on Safari and iOS is untested.
- **Fixed in this session:**
  - `?voice=0` used to save "voices off" for later visits;
  - Enter didn't ring up with a register button focused;
  - a ticket's Make button was unreadable;
  - macOS's new voice-list format hid Tara;
  - the register kept the previous customer's buttons highlighted when the next customer arrived
    in the same state.

## 12. How to run and play

```bash
npm install
npm run voices          # macOS only: renders the placeholder voice clips (≈1 min first time)
npm run dev             # http://localhost:5183/
npm test && npm run test:e2e
```

- **Day 1:** click "Day 1: Start the trial". Gaz speaks.
- **Sound:** the "Sound" button in the top bar, or "Sound settings" on the title. It holds the
  volumes, voice on/off, Test voice, and the Listening options (difficulty, order subtitles,
  learning mode).
- **Day 2 controls:**

  | Key | Action |
  |---|---|
  | T | take the order |
  | R | replay what the customer said last |
  | Enter | ring up (also lock in or hand over at the station) |
  | F | make the next ticket |
  | L | make the next long black |
  | 1–6 | serve that ticket (jug height while pouring) |
  | B | bin |
  | Esc | pause |

  The register's buttons cover milk, temperature, heart, "could you repeat that?" and the four
  questions.
- If you hear nothing, check the dot on the Sound button:
  - **green:** clips are playing;
  - **amber:** the browser voice is standing in (clips missing: run `npm run voices`);
  - **red:** the browser blocked sound (click anywhere);
  - **grey:** voices are off.
