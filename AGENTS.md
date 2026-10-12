# AGENTS.md

Shared context for every AI coding agent on this repo (Codex reads this file; Claude Code imports it from `CLAUDE.md`).
Keep it true. If you change a command, folder or rule, update this file in the same PR.

---

## 1. Project snapshot

**No Wukkas Café** — a first-person 3D café sim set in Surry Hills, Sydney. The player stands behind the counter, decodes Australian-accented orders, makes the drinks, survives difficult customers, and turns the profit into cars, property and new branches.

- **Platform:** web first (desktop + mobile browsers, iOS Safari included). Static build, no backend.
- **Stack (target):** Vite · TypeScript (strict) · Three.js (npm, latest) · Vitest · Playwright.
- **Current state:** a working single-file prototype lives in `prototype/game.html` (Three.js r128 from a CDN, about 1,800 lines of plain JS). It is the **design reference**, not the codebase. Phase 0 in `docs/ROADMAP.md` ports it into `src/`.
- **Owner:** Edward. Solo project with AI pair-programming.

## 2. Roles and working agreement

| Agent | Role | Writes code? |
|---|---|---|
| Claude Code | **Implementer**: builds features, writes tests, runs checks | Yes |
| Codex | **Reviewer/verifier**: reviews diffs, reproduces bugs, runs the checks, flags risks | Only small, clearly-scoped fixes when asked |

- **Talk to Edward in Korean.** Code, identifiers, comments, commit messages, PR text and in-game copy are in **English** (in-game English uses Australian spelling: *colour, favourite, flavour*).
- Work in small vertical slices: one feature or fix per branch/PR. Branch names: `feat/…`, `fix/…`, `chore/…`, `balance/…`.
- Commits follow Conventional Commits (`feat(sim): add steam temperature scoring`).
- Never push to `main` directly. Never force-push shared branches.
- If a task is ambiguous and the wrong guess is expensive (save-format changes, economy retune, large refactors), stop and ask Edward before building.

## 3. Commands

> Set up in Phase 0. Until then only the prototype exists. If a script here doesn't exist yet, create it exactly as named.

```bash
npm install            # install deps (Node 24 LTS)
npm run dev            # Vite dev server → http://localhost:5173
npm run dev -- --host  # same, reachable from an iPhone on the same Wi-Fi
npm run build          # production build → dist/
npm run preview        # serve dist/ locally
npm run typecheck      # tsc --noEmit
npm run lint           # eslint + prettier --check
npm test               # vitest (sim + data unit tests)
npm run test:e2e       # playwright smoke test (boot → play day 1 → summary)
npm run balance        # headless 30-day economy sim → reports/balance.csv
```

Prototype only: `npx serve prototype` then open `/game.html` (needs internet for the Three.js CDN).

## 4. Architecture and hard boundaries

```
src/
  main.ts            boot, wires everything, owns the RAF loop
  core/              state machine (title → dayIntro → playing → summary → shop), game clock,
                     seeded RNG, event bus, versioned save/load
  sim/               PURE game logic: orders, recipe evaluation, pricing, customers, patience,
                     events, economy, stress, rating. No DOM. No three. No Date.now/Math.random.
  data/              content as data: drinks, milks, slang dictionary, cast, events, shop items, news
  world/             Three.js only: scene, café build, humans, cup visual, camera look, raycast picking
  audio/             WebAudio SFX, voice playback (TTS now, pre-rendered clips later)
  ui/                DOM HUD, docket, bar, modals, shop, cheat sheet
scripts/balance.ts   runs sim/ headless for N days with skill profiles (novice/average/expert)
tests/               vitest unit tests (mirror src/ paths) + e2e/ for playwright
public/assets/       audio clips, fonts, textures (bundled, never hot-linked)
```

**Rules that reviews enforce:**
1. `sim/` must never import from `world/`, `ui/`, `audio/`, `three`, or touch `window`/`document`. It takes a state and an input, and returns a new state and events. This is what makes it testable and lets `npm run balance` run in Node.
2. **All randomness goes through the seeded RNG** in `core/rng.ts`, passed in explicitly. No `Math.random()` outside `core/rng.ts`. The same seed and the same inputs must give the same day.
3. **All timing goes through the game clock.** No `setTimeout`/`setInterval` for gameplay flow (pausing must freeze everything). UI-only cosmetics such as toast fade-outs are the only exception.
4. Content lives in `data/`. Adding a drink, a slang word or a customer should not need a logic change. If it does, the data schema is missing a field.
5. `world/` reads state and renders it. It never mutates sim state directly; it emits intents (`{type:'action', id:'shot'}`) that `core/` feeds into `sim/`.
6. Save data is versioned (`save.version`). Any change to its shape ships a migration in `core/save.ts` plus a test that loads the previous version.

## 5. Conventions

- TypeScript `strict: true`, no `any` without a comment explaining why. Prefer discriminated unions for states and events.
- Money is stored in **integer cents**, never floats. Display with `Intl.NumberFormat('en-AU', {style:'currency', currency:'AUD'})`.
- Units: AUD, °C, metres (three.js world units = metres; the counter top sits at y = 1.04).
- Game time: 1 in-game day runs 06:00–14:00 (Sydney café hours) and takes about 300 real seconds at 1× speed.
- File size guideline: split files over about 400 lines by responsibility.
- Every new `sim/` function gets a unit test. Every bug fix gets a regression test first.
- Dispose three.js resources (`geometry.dispose()`, `material.dispose()`, `texture.dispose()`) when removing meshes. Customers are spawned and removed all day.

## 6. Game-design guardrails

**Content and representation (non-negotiable):**
- The cast is multicultural on purpose. The **accent and slang are the puzzle, never the joke.** Difficult behaviour (Karen, the influencer, the entitled agent) belongs to a personality, never to an ethnicity, accent or language.
- Non-English lines (e.g. Jiwoo's Korean, 아아 = iced americano) must be natural and correct. Flag anything that reads as mockery.
- No real people. Real brands and places may appear as setting (Harbour Bridge, Woolies, a Porsche), never as logos or impersonation.

**Design pillars (use these to judge features):**
1. **Listen:** decoding Aussie English is the core skill. Features that let players skip listening need a cost.
2. **Hands:** making the drink should need timing and multitasking (shot extraction, steam temperature, two group heads), not just menu clicking.
3. **Pressure → relief:** rush-hour chaos, then a satisfying end-of-day receipt and shopping.
4. **Consequences stick:** regulars remember, reviews accumulate, and choices in events matter the next day.

**Economy:** balance changes must come with a before/after `npm run balance` diff in the PR description. Target: first car around day 2, first branch around day 7, Mosman win around days 25–35 for an average player.

## 7. Performance budget

- 60 fps on an M-series MacBook Air and ≥ 30 fps on a mid-range Android phone.
- Fewer than 150 draw calls in the café view. Merge static café geometry. Instance repeated props (cups, stools).
- No allocations in per-frame hot paths (reuse `Vector3`s, no `.map()`/spread inside `tick`).
- Shadow map ≤ 1024². Pixel ratio capped at 1.75.
- Initial load under 3 MB before audio. Audio clips are lazy-loaded per day.

## 8. Known prototype issues (fix while porting)

These exist in `prototype/game.html`. Don't copy them into `src/`.
- `removeHuman()` removes meshes but never disposes geometry, materials or face canvas textures, so it **leaks memory** over a long session.
- Gameplay flow uses `setTimeout` (customer leaving, the Hamish event delay, end-of-day). These keep running while paused, which breaks rule 3.
- `Math.random()` is used everywhere, so days are not reproducible. Weather, specials and orders all need to come from the seeded RNG.
- Canvas textures with text (neon, chalkboard, window decal) are drawn before web fonts load and fall back to Impact. Redraw them after `document.fonts.ready`.
- Three.js r128 → latest migration: `outputEncoding`/`sRGBEncoding` became `outputColorSpace`/`SRGBColorSpace`. Lights are physically based by default since r155, so point-light intensities need rescaling (roughly ×π and adjusted for decay). `CapsuleGeometry` is now available for bodies.
- Voices come from `speechSynthesis`. An `en-AU` voice is often missing (fallback en-GB/en-US), and iOS needs a user gesture before the first utterance. The plan is to move to pre-rendered clips (Roadmap Phase 2).
- Economy: branch income grows faster than counter income, so player skill stops mattering after about day 15. This is a known design debt (Roadmap Phase 4).

## 9. Review protocol (Codex)

When asked to review a diff or PR:
1. Run `npm run typecheck && npm run lint && npm test`. If sim or economy code changed, also run `npm run balance` and compare against `main`.
2. Check the hard boundaries in §4 (imports in `sim/`, RNG, timers, save migrations).
3. Look for: wrong recipe/evaluation logic, float money, missing dispose, per-frame allocations, pause-unsafe timers, mobile input gaps (touch, iOS audio unlock), text overflow at 400 px width, and anything that breaks §6.
4. Report findings **ranked by severity**. For each one give `file:line`, a one-line summary, and a concrete failure scenario (input → wrong output). Mark anything you couldn't reproduce as *plausible* rather than *confirmed*.
5. Don't rewrite working code for style. Suggest the minimal fix. Only implement fixes when Edward asks.

## 10. Definition of done

- [ ] `typecheck`, `lint`, `test` pass; `test:e2e` passes if boot, UI or input changed
- [ ] New or changed `sim/` logic has unit tests; bugs have a regression test
- [ ] Balance diff attached if the economy, patience, spawn rates or prices changed
- [ ] Tried on iPhone Safari (`npm run dev -- --host`) if input, audio or layout changed
- [ ] `docs/ROADMAP.md` checkbox ticked; this file updated if a command or rule changed
