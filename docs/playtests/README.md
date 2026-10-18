# Playtests

How to run a 30-minute playtest of No Wukkas Café.

## The plan

- 3 to 5 testers. Working-holiday makers and international students are ideal.
- Each tester plays the Day 1 Trial, then the week: Monday to Wednesday.
- 30 minutes per tester.
- Notes for each session go in `docs/playtests/<date>.md`. Copy `TEMPLATE.md`.

## What we want to learn

These are the metrics to watch (from the ROADMAP "Success metrics" and `docs/TODO.md` Phase 5).

| Metric                              | Why                                                                  |
| ----------------------------------- | -------------------------------------------------------------------- |
| Median session length               | Is the loop sticky?                                                  |
| % of players reaching day 3 / day 7 | Early drop-off shows onboarding or difficulty problems               |
| Pardons per order by day            | Listening difficulty curve: should dip, then rise as accents thicken |
| Accuracy per field                  | Shows which parts of an order confuse people                         |
| Walk-outs per rush hour             | Pressure is working vs. just punishing                               |

## Before the session

- [ ] Pick how the tester will play.
  - Local: run `npm run dev -- --host`. The game serves on port 5183. A phone on the same Wi-Fi opens `http://<the Mac's LAN IP>:5183/`.
  - Deployed: `https://edwardh-jedi.github.io/no-wukkas-cafe/`. This is not live yet. It only works once Edward publishes it with `npm run deploy -- --push`.
- [ ] Know the voice difference. The voice clips are placeholders that only the dev server serves. A deployed build falls back to the browser voice and says so.
- [ ] Open Settings, then Playtest log. Press **Clear log** (it asks twice) so the log starts empty.
- [ ] Copy `docs/playtests/TEMPLATE.md` to `docs/playtests/<date>.md`. Fill in the device and browser.
- [ ] Ask the tester if they agree to notes. Audio or screen recordings need their clear yes.

## What to tell the tester

Say only this much.

- Mouse moves the jug and sets the steam depth.
- Hold click or Space to grind, steam and pour. On a trackpad, use Space.
- 1, 2, 3 set the jug high, lift or low.
- Enter confirms or moves on. Esc pauses.
- T takes the order at the register.

Do not coach them through the game. If they get stuck, write down what happened and the time. Step in only if they are fully blocked for a few minutes.

## During the session

- [ ] Sit beside them or watch the screen. Stay quiet.
- [ ] Note where they get stuck, with the time.
- [ ] Note quotes, word for word.
- [ ] Note walk-outs and how many times they replay an order.
- [ ] At the end, ask: "Would you play one more shift?" Write yes or no, and why.

## After the session

- [ ] Open Settings, then Playtest log. Check that the count is above zero.
- [ ] Press **Export log**. It downloads `no-wukkas-log-YYYY-MM-DD.json`. On iOS Safari the download may open the JSON in a tab instead (untested). If so, share or save it from there.
- [ ] Move the file to `docs/playtests/logs/` and rename it `<date>-<tester-initials-or-number>.json`. No real names in file names.
- [ ] Fill in the rest of your session notes.
- [ ] Press **Clear log** before the next tester.

## One log per browser

The log lives in the browser on that device. On a shared device, clear it between testers. Or give each tester their own device.

## What the log records

Per shift:

- served
- walk-outs, and where: queue, register, ordering or ticket
- accuracy per field: drink, milk, temp, heart
- pardons: replays, repeats and questions
- time to serve, and register wait
- events, grade and tips
- quit point

Per Day 1 Trial: attempts, verdict and quit point.

## After all the sessions

Run this to print a Markdown table:

```bash
npm run playtest:summary -- docs/playtests/logs/*.json
```

It covers sessions, shifts, served, walk-outs by stage, accuracy per field, pardons per order, register wait, quit points and trial verdicts. Paste the table into the session notes.

## Privacy

- The log is saved on the device only. Nothing is sent anywhere.
- No real names in notes or file names. Use initials or a number.
- No audio or screen recordings unless the tester agrees first.
