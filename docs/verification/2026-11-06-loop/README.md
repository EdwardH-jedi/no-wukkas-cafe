# Order loop, Kenji and the bin chicken: Playwright evidence (2026-11-06)

Branch `feat/playable-loop-kenji-ibis`. Full suite under `caffeinate -i -m`:
`E2E_PORT=5202 npm run test:e2e -- --config tests/review/playwright.ipv6.config.ts` on 6460d76:
59 passed, 1 failed (casting: seven identity cards expected, eight now with Kenji; fixed in the
next commit, `casting.spec` 1/1 after it), 17 opt-in skipped; Chromium (SwiftShader), 1024×640.
Screenshots copied from `test-results/evidence-{rush,kenji,ibis}/` and converted to JPEG.

Result card (`tests/e2e/rush.spec.ts`, `?seed` default, voices off):

- `01-result-card-served.jpg`: Dazza served, "✓ Dazza: spot on · 100% happy · +$3.00 tip",
  "Next: the next customer is on their way."; the top chips read Served 1/6, Tips $3.00.
- `02-result-card-handed-back.jpg`: Priya rung up wrong on purpose (a long black for her almond
  flat white, extra hot): "↩ Priya handed it back · They ordered a flat white. You heard it wrong;
  the ticket is fixed. · Next: remake it, almond flat white · extra hot (68–74 °C)." The long black
  is still on the pass, so the card sits above it; the ticket shows the misheard drink struck out.
- `03-result-card-walkout.jpg`: "✗ Nan Beryl walked out · They waited too long. No sale. · Next:
  Mei is at the register.", with "Take Mei's order T" below.

Kenji (`tests/e2e/kenji.spec.ts`, a save with Monday passed, Endless Rush, `?seed=5&ibis=0`):

- `04-kenji-at-register.jpg`: the six before him rung up (three tickets on the rail, "+3 more
  behind the rail"); Kenji at the register, "Take Kenji's order".
- `05-kenji-ordering.jpg`: the register reads "Register Kenji 健二 · listening…", the subtitle
  "KENJI 健二 · EXCHANGE STUDENT · 🔊 Listen…" (Normal: the words show after a repeat). The spec
  checks his order was played from his own recording (clip or his segment clips), not the browser
  voice.
- `06-kenji-ticket.jpg`: rung up exactly as he said it; ticket 7 printed.

Bin chicken (`tests/e2e/ibis.spec.ts`, `?seed=7&ibis=1&voice=0`):

- `07-bin-chicken-foraging.jpg`: the bird at the bin, the hint showing.
- `08-bin-chicken-shooed-out.jpg`: three clicks on it and it has walked out.
- `09-next-order-after-bird.jpg`: after it has gone, T takes the next customer's order as usual
  (Dazza at the register, "listening…").
