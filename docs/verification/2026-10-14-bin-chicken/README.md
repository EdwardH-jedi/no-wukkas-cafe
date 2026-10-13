# Bin chicken: Playwright evidence (2026-10-14)

`E2E_PORT=5191 npx playwright test tests/e2e/ibis.spec.ts`: 2 passed, Chromium (SwiftShader),
`?seed=7&ibis=1&voice=0`.

- `01-foraging.jpg`:
  - the ibis at the bin: white body, bare black head and neck, down-curved bill, black plumes;
  - the bin lid is nudged open;
  - the hint is showing;
  - Gaz: "It's in the bin. Of course it's in the bin."
- `02-shooed-out.jpg`: after three clicks on the bird it has walked out; the hint is gone.

All geometry is procedural (`src/world/ibis.ts`) and the honk is synthesised (`src/audio/sfx.ts`):
no external assets.
