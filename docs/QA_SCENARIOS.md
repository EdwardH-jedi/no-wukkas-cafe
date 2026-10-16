# Mandatory regression scenarios

Canonical source: `docs/TODO.md`, Phase 4, at `1a54a00`. There is no checked-in
"bible §20" to consult. These eight scenarios are the available specification.
The four-row evidence table below makes the source's testing distinctions explicit;
Phase 4 does not contain a literal four-row "what each test kind proves" table.

| ID | Scenario | Required observation |
| --- | --- | --- |
| S1 | Pause → title → new game audio | Audio resumes with the new game; no old replay, doubled voice/music, or inherited rush noise. |
| S2 | Audio 404 / 10 s / 25 s | Every order is heard as a clip or fallback, without premature progression or subtitle timing that outruns audible speech. Test independent wall/audio and simulation clocks, pause, and timeScale 1, 2, 3. |
| S3 | Silence after a customer leaves | No late clip, fallback, queued line, or pending replay starts once that customer is gone. Include leaving during loading as well as playback. |
| S4 | Wrong milk hand-back and remake | Exercise listening mistakes and making mistakes separately; corrected ticket, retry, acceptance and accounting agree. |
| S5 | BGM ducking and four sliders | Speech ducks music; voices, music, ambience and SFX controls affect only their intended paths. Check stop/resume and replay. |
| S6 | Deterministic ibis/events without interrupted orders | Same seed and inputs give the same events. Check entry, repeated honks and their audible tails against orders and answers. Measure natural appearance frequency without forcing the bird. |
| S7 | Latte scoring from the foam field | Practice, Day 1 and Day 2 judge deposited foam, not merely cursor or pitcher paths. Include a misleading gesture with a different field. |
| S8 | Build rejects unlicensed audio | Build scratch projects with public audio, code imports, missing licences and invalid segment provenance. Distinguish rejection from stripping; inspect output and preserve the actual process exit code. |

## What each test kind proves

| Test kind | Can establish | Cannot establish by itself |
| --- | --- | --- |
| Pure unit tests and seeded fuzz | State transitions, invariants, reproducible scheduling, scoring, accounting and generated content for the exercised inputs. | App wiring, actual media loading, DOM visibility, browser policies or audible output. |
| Wiring integration with fake audio/network/HUD | Calls across real core/app/audio modules, controlled loading and cancellation, bus targets. | Boot-loop equivalence unless checked; real clocks, subtitle pixels, browser speech timing, hardware sound or natural voice quality. |
| Browser E2E and real build probes | DOM/input behaviour, decoded clips, browser audio graph and build-gate behaviour in the stated browser/configuration. | Human audibility with muted headless output, iPhone Safari behaviour, legal permission to distribute or representative player experience. |
| Human/device playtests and evidence review | Audible quality, accent/slang fairness, feel, touch usability, real device/browser operation and observed layouts. | Exhaustive invariants, all seeds, untested devices, or results on later commits. |

Record the exact revision, command, exit status, counts, seed, viewport and clock model.
Missing screenshots, skipped tests, mocked providers and real device runs are separate
evidence states. A screenshot without viewport/DPR metadata does not prove its filename's
claimed CSS dimensions. Never pipe a test command into a filter without preserving its
exit code. Keep deliberately failing review regressions visible until a fix or explicit
design decision resolves their expectations.
