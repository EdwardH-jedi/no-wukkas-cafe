# Roadmap

Guiding bet: **most of the fun gain comes from Phase 1** (making drinks with your hands under rush-hour pressure). Content added before that only makes a longer quiz. Don't start Phase 2+ until Phase 1 playtests are clearly more fun than the prototype.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (only when checks actually ran)

---

## Day 1: Barista trial shift (new first playable day)

Day 1 is now a job trial: the player applies at No Wukkas and makes one flat white while Gaz, the owner, watches. No customers, no economy yet. Built directly in `src/` on the Phase 0 scaffold.

- [x] **D1.1 Trial flow:** greeting → grind → tamp/lock → shot → steam → owner demo → up to 3 attempts (pour → inspect → feedback) → verdict → restart (`src/core/trial.ts`)
- [x] **D1.2 Latte-art sim:** 128² foam field on the cup surface driven by pitcher position, height and flow (source push, wake drag, forward jet, MacCormack advection); same physics for the owner's demo and the player (`src/sim/latte/`)
- [x] **D1.3 Deterministic judging:** heart-template IoU (±20°), cleft + tip, mirror symmetry, centring, crispness, spill/fill; validity rules; bands 0–24 / 25–59 / 60–84 / 85–100; best valid attempt wins
- [x] **D1.4 Gaz:** event-keyed dialogue with frustration tiers, cooldowns and no-repeat pools; canvas-face expressions, gestures, head tracking
- [x] **D1.5 View:** café scene, machine/grinder/jug/cup, coffee-surface shader, camera shots, synthesised SFX, TTS behind `voice.ts`, HUD + result card + verdict
- [x] **D1.6 Checks:** sim/core unit tests, Playwright e2e playing the whole trial with real mouse input
- [ ] **D1.7 Playtest** on a MacBook trackpad and iPhone Safari; tune pour feel and steam timing from what people actually do

## Phase 0: Port and measure

Goal: the prototype running from a clean, tested TypeScript codebase, with telemetry to tell what's fun.

- [x] **0.1 Scaffold:** Vite + TS strict, ESLint/Prettier, Vitest, Playwright, all scripts from AGENTS.md §3 (stubs are fine for `balance`/`test:e2e`), `.gitignore`, CI-free for now
- [ ] **0.2 Core:** seeded RNG (`core/rng.ts`), game clock with pause, state machine, event bus, versioned save (`version: 1`)
- [ ] **0.3 Data:** move `DRINKS, MILKS, TEX, SLANG, CAST, STYLE, CHAT, ACCENT, NEWS, UPGRADES, CARS, HOMES, TREATS` into `src/data/` with types
- [ ] **0.4 Sim:** port `recipe`, `describe`, `phraseDrink`, `accentify`, `randomRecipe`, `evaluate`, `priceOf`, customer patience, specials schedule and `endDay` economy into `src/sim/`. Money in cents. Unit tests for each
- [ ] **0.5 World:** café scene, humans (with `dispose()`), cup visual, head-look camera, raycast picking, traffic/pedestrians/ibis on latest three.js
- [ ] **0.6 UI + audio:** HUD, docket, station bar, bubbles, choice cards, summary receipt, shop, cheat sheet, SFX, TTS behind `voice.ts`
- [ ] **0.7 Parity check:** side-by-side with `prototype/game.html`; e2e test plays day 1 (boot → serve → summary)
- [ ] **0.8 Telemetry (local only):** log per day: served, accuracy per field, pardons used, walk-outs, time-to-serve, quit point. "Export log" button in the cheat sheet
- [ ] **0.9 Balance script:** `npm run balance` simulates 30 days × {novice, average, expert} and writes `reports/balance.csv` (cash, rating, stress, day of first car/branch/home)
- [ ] **0.10 Playtest #1:** 3–5 people (working-holiday makers and international students are ideal). Write findings in `docs/playtests/2026-xx-xx.md`

**Exit criteria:** parity with the prototype, sim test coverage on orders/evaluation/economy, a first telemetry baseline.

## Phase 1: Hands (core-loop depth)

Goal: making a drink takes skill and timing, and rush hour becomes juggling.

- [ ] **1.1 Shot extraction:** hold to extract; target 25–30 s real-world time compressed to about 2 s; under/over-extraction lowers the taste score
- [ ] **1.2 Steam wand:** hold to heat with a live thermometer. Aeration time sets the foam (replaces the texture buttons). 55–65 °C is the sweet spot; "extra hot" means 70 °C. Karen's complaint becomes a real, winnable order
- [ ] **1.3 Two group heads + docket rail:** take several orders at the register first, then build in parallel. Drinks left sitting go cold
- [ ] **1.4 Scoring split:** accuracy / taste / speed, a combo streak for consecutive perfects, tip multiplier
- [ ] **1.5 Juice:** machine sounds tied to actions, cup slide-to-customer animation, subtle camera kick, perfect-drink sting
- [ ] **1.6 Playtest #2:** compare against the Phase 0 baseline (session length, return rate for day 3+, self-reported fun)

**Exit criteria:** playtesters want to "just do one more day" more than in Phase 0.

## Phase 2: Listen (real comprehension)

- [ ] **2.1 Progressive text removal:** full subtitles on days 1–3, then fragments ("…lahj… flah… sugs"), then audio only on Hard. Café noise rises with the queue
- [ ] **2.2 Clarifying questions:** instead of a full repeat, ask one targeted question ("Oat or almond?", "How many sugars?"). Cheaper than "Sorry?"
- [ ] **2.3 Pre-rendered voice clips:** real Australian-accent voices, assembled from segments (greeting / size / strength / milk / drink / sugar / closer); roughly 300 clips, lazy-loaded; TTS as fallback
- [ ] **2.4 Slang expansion:** about 60 → 200 entries; regional voices (Western Sydney, Kiwi, Scottish backpacker); mishearing pairs (soy / sorry, flat / black)
- [ ] **2.5 Difficulty modes:** Tourist / Local / True Blue

## Phase 3: People and consequences

- [ ] **3.1 Regular affinity:** each regular remembers service quality; affinity unlocks their small story arc (e.g. Jiwoo's last day before flying home, Nan Beryl's 1987 story)
- [ ] **3.2 Review feed:** Google reviews as readable text, pinned by date; they affect the next day's foot traffic
- [ ] **3.3 Karen as a recurring boss:** escalates across the week and remembers how you handled her last time
- [ ] **3.4 Rival café:** "Third Wave Collective" opens across Crown St; weekly rating battle
- [ ] **3.5 Staff:** hire and train juniors who make visible mistakes you can catch before serving

## Phase 4: Economy and meta

- [ ] **4.1 Branches as levels:** each branch has its own customer mix and accent profile (Bondi surfers and tourists, Parramatta, Gangnam in Korean). Branch income decays unless you work a shift there. Fixes the late game where skill stops mattering
- [ ] **4.2 Weekly goals and awards:** e.g. "20 perfect flat whites in a day → Surry Hills Best Coffee"
- [ ] **4.3 Seasonal events:** Christmas in a heatwave, Vivid Sydney night trade, State of Origin day, Australia Day
- [ ] **4.4 Rebalance** with `npm run balance`. Targets: first car ≈ day 2, first branch ≈ day 7, Mosman ≈ days 25–35 (average player)
- [ ] **4.5 More endings** than Mosman (e.g. franchise empire, sell up and move to Byron)

## Phase 5: Ship

- [ ] **5.1 Performance pass** against the AGENTS.md §7 budget on a real mid-range Android and iPhone
- [ ] **5.2 Accessibility:** subtitle toggles, text size, colour-blind-safe milk labels, reduced motion, remappable keys
- [ ] **5.3 Deploy:** static host with a custom domain, OG image, analytics (privacy-friendly)
- [ ] **5.4 Write-up:** a devlog/README section covering the architecture (pure sim + seeded RNG + headless balance testing) and playtest learnings
- [ ] **5.5 Stretch:** evaluate Steam via a desktop wrapper (Tauri/Electron). This needs Windows build testing

---

## Success metrics (tracked from Phase 0 telemetry)

| Metric | Why |
|---|---|
| Median session length | Is the loop sticky? |
| % of players reaching day 3 / day 7 | Early drop-off shows onboarding or difficulty problems |
| Pardons per order by day | Listening difficulty curve: should dip, then rise as accents thicken |
| Accuracy per field (size, shots, milk…) | Shows which parts of an order confuse people |
| Walk-outs per rush hour | Pressure is working vs. just punishing |
