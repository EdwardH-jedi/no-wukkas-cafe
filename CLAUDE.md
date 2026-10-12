# CLAUDE.md

@AGENTS.md

Everything in AGENTS.md applies. This file adds what Claude Code needs as the **implementer**.

## How to work on a task

1. **Read before writing.** Open the relevant part of `docs/ROADMAP.md`, the files you'll touch, and, when porting, the matching section of `prototype/game.html` (search by function name: `evaluate`, `phraseDrink`, `makeHuman`, `endDay` …).
2. **Plan in a few lines** (in Korean, to Edward) for anything touching more than about 3 files, the save format or the economy. For small, clear tasks, just start.
3. **Sim first, then view.** Write or extend the pure logic in `src/sim/` with Vitest tests, get them green, then wire `world/` and `ui/`.
4. **Run the checks yourself** before saying you're done: `npm run typecheck && npm run lint && npm test` (plus `npm run balance` and `npm run test:e2e` when relevant, per the Definition of done).
5. **Hand off for review.** End with a short Korean summary for Edward covering what changed, how it was verified, and anything Codex should look at closely. Write the PR description in English.

## Porting from the prototype

- Port **behaviour**, not code style. The prototype is dense one-liners with globals (`S`, `D`, `B`, `Game`, `W`). In `src/` these become typed state objects passed explicitly.
- Keep the data verbatim where possible (`DRINKS`, `MILKS`, `SLANG`, `CAST`, `STYLE`, `CHAT`, `ACCENT`, `UPGRADES`, `CARS`, `HOMES`, `TREATS`, `NEWS`). Move it into `src/data/*.ts` with proper types.
- After a port step, compare side by side with `prototype/game.html` in the browser. Visual and gameplay parity comes before improvements, unless the roadmap item says otherwise.
- Fix the "Known prototype issues" (AGENTS.md §8) as you go and mention each fix in the PR.

## Three.js notes

- Import from `three` and `three/addons/...`. No CDN script tags.
- Build static café geometry once, then merge it (`BufferGeometryUtils.mergeGeometries`) per material to stay under the draw-call budget.
- Customers come from a factory in `world/humans.ts` that returns a handle with `dispose()`. The spawner must call it.
- Face expressions are canvas textures today. Keep one small canvas per human, redraw only when the mood or mouth state changes, and never every frame.
- Camera "head look" follows the pointer with dead-zones (see `look` in the prototype). Keep it configurable. Touch uses drag.

## Audio and voice

- Unlock the `AudioContext` and speech on the first user gesture (the Start button). iOS Safari needs this.
- Keep TTS behind an interface (`audio/voice.ts: speak(line, speaker)`) so it can swap to pre-rendered clips in Phase 2 without touching sim or UI.

## Don'ts

- Don't add dependencies without saying why in the PR. Prefer small or zero-dependency solutions (it's a static web game).
- Don't reformat untouched files or rename things outside the task.
- Don't mark a roadmap item done if its tests or checks weren't actually run.
- Don't invent Australian slang meanings. If unsure, leave a `// TODO(slang-check)` and list it for Edward.
