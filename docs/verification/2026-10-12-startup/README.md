# Startup fix: verification, 2026-10-12

## Symptom

`http://localhost:5173` showed a dark page with an orange "No Wukkas Café" heading and nothing else.

## Root cause

That page is not this game. It is the Phase 0.1 placeholder of a separate, older repository,
`~/Desktop/Developer/cafe` (branch `feat/sim-orders`), whose `src/main.ts` only renders
`<h1>No Wukkas Café</h1>` (dark `#1b1410` background, orange `#e8a44a` heading). Its Vite config —
and its siblings `cafe-ui-audio-shell` and `cafe-world-shell` — claims port 5173 with
`strictPort: true`. This game also defaulted to 5173 but without `strictPort`, so when one of those
was running (or was the one started), `localhost:5173` served the placeholder and this game's dev
server, if started, moved silently to another port.

The game's own entry point was never broken: `index.html` → `src/main.ts` boots the café, the title
menu, the Day 1 trial and Day 2.

## Fix (this repository only; the sibling repositories were not touched)

- `vite.config.ts`: dev server on its own port **5183** with `strictPort: true`; preview on 4183.
- `package.json`: `npm run dev` opens the browser at the right URL (`vite --open`).
- `AGENTS.md`, `README.md`: documented URL updated, with a note about the placeholder page.

## Verified in a real browser (Chrome, http://localhost:5183/)

| Check | Result |
|---|---|
| Page loads with the 3D café and the main menu | yes (`01-main-menu.jpg`) |
| Console errors | none (only Vite's connect messages) |
| Failed network requests | none (55 requests, all 200) |
| "Day 1: Start the trial" | Gaz's greeting, then the grinder step (`02-day1-started.jpg`) |
| "Day 2: The morning rush" | Gaz's intro, then Dazza at the register (`03-day2-started.jpg`) |
| Second dev server on the same port | fails with "Port 5183 is already in use" instead of drifting |

Also run: `npm run typecheck`, `npm run lint`, `npm test` (102 passed), `npm run build`,
`npm run test:e2e` (Day 2 shift and Day 1 trial, both passed).
