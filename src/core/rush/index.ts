// Day 2, the morning rush: the public API, unchanged for main.ts, ui/ and world/.
//   state.ts      types and the helpers that only read or set state
//   machine.ts    create / restart / the fixed step and the shift's phases
//   customers.ts  arriving, queueing, patience, walking out
//   register.ts   taking the order, listening aids, ringing up the ticket
//   serve.ts      handing over drinks, hand-backs, misheard tickets
//   speech.ts     who says what through the one speech channel
// The bin chicken stays in core/rushIbis.ts.

export { createRush, restartRush, stepRush } from './machine';
export { atCounter } from './register';
export {
  atRegister,
  emptyRushInput,
  ENTER_TIME,
  LEAVE_TIME,
  STEP_UP_TIME,
  waitingCustomers,
  type CustomerState,
  type LineOverrides,
  type Rush,
  type RushAction,
  type RushCustomer,
  type RushEvent,
  type RushInput,
  type RushPhase,
} from './state';
