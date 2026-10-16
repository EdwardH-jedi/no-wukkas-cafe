# Balance hook: what Phase 2 could not do with numbers alone

Phase 2 (docs/TODO.md) owns the numbers in `src/data/{week,upgrades,events}.ts`. These two needed
code outside that. They were written up here first; on Edward's go-ahead (2026-10-16, branch
`fix/event-hooks`) §1 was implemented, and §2 turned out to rest on a wrong diagnosis (see its end).

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

**Done:** as proposed. `EventLog.lastId` (scheduler), `RushWeek.lastEvent`, `weekFor(save, cooldowns,
lastEvent)`, `App.lastEvent` kept beside `App.cooldowns` (page only), and `playWeek` carries it the
same way. The scheduler test is strict now (no repeat at all over 1,000 seeds; seed 275 failed it
before), plus tests that the last event carries into the next shift and is never its first event.

## 2. QUEUE_JUMP never fires in the balance runs (finding, not a Phase 2 target)

In `docs/balance/2026-10-16.csv` (90 weeks, 509 events) QUEUE_JUMP fired 0 times: JUST_COFFEE 159,
THE_NAME 155, CHANGE_MIND 148, RARE_BIRD 96, CALL_MANAGER 39, WRONG_MILK 2, THE_USUAL 0. THE_USUAL
is expected (week 1 never reaches affinity 2). QUEUE_JUMP isn't.

**First diagnosis (wrong):** the 20-second poll (`EVENT_POLL` in `src/core/rush/events.ts`) found
the shift's cap used up (166 of 277 polls) or fewer than two queueing (111). The proposed fix was an
extra slot for the poll. That tally checked the cap first, so it hid the real cause.

**What it really is: no line ever forms at the register.** QUEUE_JUMP needs two or more customers
in the `queue` state (walked in, not yet at the register). The balance bots press "Take order" the
moment someone steps up, so the backlog builds up as tickets (`waiting`), never as a line. At the
polls (Wednesday–Friday, 10 seeds), `queue` ≥ 2 was 0 of 347 (average) and 0 of 391 (novice), while
four or more were often waiting for drinks. QUEUE_JUMP is already a candidate at the register too
(`AT_REGISTER` only leaves out RARE_BIRD and WRONG_MILK), so it isn't the pool either.

**Measured with a bot that doesn't take orders while it's making a drink** (an experiment, not
committed): the line forms (`queue` ≥ 2 at 298 of 796 polls, average) and QUEUE_JUMP is 10 of 112
events (average) and 17 of 113 (novice) under the game's rules as they are. With the extra poll
slot the numbers were identical, so it was **not shipped**: it changes nothing.

**Decision for Edward:**

- (a) Give the balance bots a register reaction time (how long a player leaves someone at the
  register while their hands are busy). That changes every profile and moves the whole curve, so it
  means re-tuning Thursday and Friday, not a tweak.
- (b) Leave it, and let the Phase 5 playtest show how long real players leave someone waiting at
  the register (ROADMAP 0.8 telemetry can log it). **Recommended:** today's profiles are guesses, and
  a second guess (the reaction time) would decide the curve.

Either way, remember when reading `npm run balance`: the bots' instant "Take order" means the
balance runs never see a line at the register, so no QUEUE_JUMP and no queue-patience effects
(CHANGE_MIND `busy`, RARE_BIRD `busy`).
