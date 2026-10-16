# Balance hook: what Phase 2 could not do with numbers alone

Phase 2 (docs/TODO.md) owns the numbers in `src/data/{week,upgrades,events}.ts`. These targets need
code outside that, so they are written up here and left for a session that owns the code.

## 1. No event twice in a row, even after a quiet shift

**Target:** "no event twice in a row across 1,000 seeds".

**Done with numbers:** JUST_COFFEE's `cooldownShifts` 0 → 1 (ef903a5). Every event's cooldown is now
at least one shift, so an event never repeats in the same shift or the next one.
`tests/sim/events/scheduler.test.ts` checks that over 1,000 seeds. In the 30-seed balance runs
(3 profiles, every attempt in play order) there are now no back-to-back repeats at all; before the
fix there were 20, all JUST_COFFEE in adjacent shifts.

**Not covered:** a shift with no events at all between two of the same, for example QUEUE_JUMP on
Wednesday, nothing on Thursday, QUEUE_JUMP on Friday. Cooldowns count shifts, not events, so no
number rules this out. The scheduler test's synthetic week (random queue and register states, checks
every 10 s) produces it once in 1,000 weeks (seed 275). The real rush hasn't produced it in any
balance run, because a shift after Monday almost always fires at least one event.

**Proposed change (about 10 lines plus a test):**

- `src/sim/events/scheduler.ts`: give `EventLog` a `lastId?: ShiftEventId`. `startShiftLog`
  copies it from `prev`, `pickEvents` leaves `log.lastId` out of the pool, and a pick sets it.
- `src/core/rush/events.ts` `createShiftEvents`: seed the log's `lastId` from the week context.
- `src/core/rush/state.ts` `RushWeek` / `src/core/week/session.ts` `Cooldowns`: carry the last event
  id beside `eventCooldowns`. Like the cooldowns, it lives only as long as the page (decision 2-A).
- `src/app/weekWiring.ts`: keep `r.shiftEvents.log.lastId` with `app.cooldowns` after a shift.
- Test: make the scheduler test's no-repeat check strict (no `b.shift - a.shift > 1` escape).

**Determinism and e2e:** filtering the pool only changes a pick when the last event is eligible
again. A fresh page has no last event, so the e2e Tuesday save (seed 1, THE_NAME at Dazza) doesn't
move.

## 2. QUEUE_JUMP never fires in the real rush (finding, not a Phase 2 target)

In `docs/balance/2026-10-16.csv` (90 weeks, 509 events) QUEUE_JUMP fired 0 times: JUST_COFFEE 159,
THE_NAME 155, CHANGE_MIND 148, RARE_BIRD 96, CALL_MANAGER 39, WRONG_MILK 2, THE_USUAL 0. THE_USUAL
is expected (week 1 never reaches affinity 2). QUEUE_JUMP isn't.

Why: someone pushing in is only asked for at the 20-second poll (`EVENT_POLL` in
`src/core/rush/events.ts`), with QUEUE_JUMP as its only candidate. Tallied over 277 polls (average
bot, Wednesday–Friday, 8 seeds): 166 came after the shift's cap (2) was already used by events at
the register, 111 had fewer than two people queueing, and none were left open. Changing the weight
can't help, because QUEUE_JUMP is alone in that pool. Raising `eventCap` would also add register
events and move the Thursday/Friday curve this phase just set.

Options for whoever owns `src/core/rush/events.ts`: count the poll against its own cap, or offer
QUEUE_JUMP at the register too when the queue is 2 or more. Then re-run `npm run balance` and
compare it with the committed CSV.
