# Changelog

What changed for players, release by release. `package.json` holds the version.

## 0.1.0 (unreleased)

The first public web build: the Day 1 trial, the Day 2 rush, a playable week and the practice bench.

### Play

- Day 1 barista trial: grind, pull a shot, steam the milk and pour a heart for Gaz, three goes.
- Day 2 morning rush: six customers order out loud; ring each order up by ear, make it, serve it, read the shift report.
- The week: Monday to Friday shifts with generated orders, shift events, tips and an autosaved save.
- Café upgrades shop between shifts: the price, a one-line effect, Owned once bought, and a refused buy says why.
- Endless Rush, unlocked once Monday is passed.
- Latte art practice: no customers and no clock; pour, review with reasons, reset, or watch Gaz's demo.
- Easy, Normal and Hard difficulty.
- Week 1 difficulty tuned from headless bot runs: Thursday and Friday arrive faster, and upgrades cost $15 to $100.
- Regulars come back: a correct serve to a regular builds affinity, and "the usual" can come up.
- Week shifts after the first skip Gaz's first-shift intro.

### Listening and service

- Replay, repeat (slow) and clarify at the register, with each one's patience cost shown on the button.
- Docket rail in arrival order with a patience bar per ticket; a misheard field is marked after a hand-back.
- Returning regulars show by name on their ticket.
- Event cards: choices with their cost, keys 1–3, placed clear of the cup.
- Gauges for the shot timer, steam temperature and both hands; the milk shows as text and an icon.
- Top chips for the shift, drinks served and walk-outs.
- Shift report: one screen for Day 2, the week and Endless, with listening and event rows.
- Spoken dialogue from pre-rendered clips with subtitles; without clips the game uses the browser's voice and says so.
- Subtitles start when the voice does, not before.

### Screens, settings and accessibility

- Title screen with Day 1, Day 2, The week, Endless, Practice, Scores and Settings; works by keyboard and trackpad.
- Shift select: Monday to Friday with locked, open and done states and the best grade.
- Settings: four volume sliders, voices on or off, subtitles, text size (Small, Medium, Large), learning mode.
- Colour-blind-safe milk labels (a shape and the name), reduced motion, and remappable keys with "Usual keys" to reset.
- Phone layout (390 px wide): the register sits under the tickets, and the subtitle box stays on screen at Medium and Large text.
- "Bin it" never sits under the register's "Ring it up".

### Scores

- Local Scores screen: the best Monday to Friday shift per difficulty and the Endless top 10.
- The shift report says "New best!" or shows the best so far.
- Gaz says so when a week shift beats your best.

### Sharing and playtests

- The page is titled "No Wukkas Café" and has a share description and preview image.
- Playtest log in Settings: Export log downloads this browser's shift records as JSON; Clear log empties it.

### Fixed

- An order line that loads slowly is still spoken instead of skipped.
- A reaction or walk-out line no longer plays after the customer has left.
- After pausing to the title, "Replay last line" no longer replays the old customer's order.
- The café murmur goes back to its normal level after a Hard shift.
- The bin chicken waits until nobody is mid-order before it walks in or honks.
- Space no longer gets swallowed when a button has focus.
- Gaz's end-of-shift praise no longer says "Five for five" after six drinks.
- A line cut off while the browser has suspended audio stays cut off when sound comes back.
- Closing Settings while it waits for a new key stops waiting.
- Week 2 and later show the current shift's state correctly on the shift select.
- Saves, scores and the playtest log keep the last good copy when browser storage starts failing.
