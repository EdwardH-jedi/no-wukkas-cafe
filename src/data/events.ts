// Shift events (difficult and memorable customers): the tunable numbers. When each event can
// happen and which outcome applies (fairness included) is in sim/events/defs.ts; Gaz's lines are
// in data/dialogue/gazEvents.ts. A choice's costSeconds is what its button shows; the outcome's
// patienceDelta already includes it (costs follow the listening aids: clarify 3 s, repeat 6 s).
// Money is integer cents.

import type { EventChoice, EventOutcome, ShiftEventId } from '../sim/contracts/events';
import type { CustomerId } from './customers';

export interface EventData {
  weight: number;
  minShift: number;
  cooldownShifts: number;
  choices: EventChoice[];
}

export const EVENT_DATA: Record<ShiftEventId, EventData> = {
  JUST_COFFEE: {
    weight: 3,
    minShift: 1,
    cooldownShifts: 0,
    choices: [
      { id: 'ask', label: 'What sort of coffee?', costSeconds: 3 },
      { id: 'guess', label: 'Make them a flat white', costSeconds: 0 },
    ],
  },
  THE_USUAL: {
    weight: 2,
    minShift: 1,
    cooldownShifts: 1,
    choices: [
      { id: 'make', label: 'Coming right up', costSeconds: 0 },
      { id: 'ask', label: 'Remind me what that is?', costSeconds: 3 },
    ],
  },
  CHANGE_MIND: {
    weight: 2,
    minShift: 1,
    cooldownShifts: 1,
    choices: [
      { id: 'remake', label: "No worries, I'll remake it", costSeconds: 0 },
      { id: 'keep', label: "Sorry, it's already made", costSeconds: 0 },
    ],
  },
  QUEUE_JUMP: {
    weight: 2,
    minShift: 2,
    cooldownShifts: 1,
    choices: [
      { id: 'backOfLine', label: 'The line starts back there', costSeconds: 2 },
      { id: 'serve', label: 'Serve them anyway', costSeconds: 0 },
    ],
  },
  WRONG_MILK: {
    weight: 2,
    minShift: 2,
    cooldownShifts: 1,
    choices: [
      { id: 'remake', label: 'Remake it', costSeconds: 0 },
      { id: 'standBy', label: 'Stand by the drink', costSeconds: 3 },
    ],
  },
  CALL_MANAGER: {
    weight: 1,
    minShift: 3,
    cooldownShifts: 2,
    choices: [
      { id: 'gaz', label: 'Get Gaz', costSeconds: 0 },
      { id: 'apologise', label: 'Apologise and fix it', costSeconds: 3 },
      { id: 'refuse', label: "That's enough. We're done here", costSeconds: 0 },
    ],
  },
  THE_NAME: {
    weight: 2,
    minShift: 1,
    cooldownShifts: 1,
    choices: [
      { id: 'spell', label: 'Could you spell that for me?', costSeconds: 2 },
      { id: 'write', label: 'Write what you heard', costSeconds: 0 },
    ],
  },
  RARE_BIRD: {
    weight: 1,
    minShift: 1,
    cooldownShifts: 2,
    choices: [
      { id: 'shoo', label: 'Shoo it out', costSeconds: 0 },
      { id: 'ignore', label: 'Leave it', costSeconds: 0 },
    ],
  },
};

/** Difficult behaviour belongs to a personality, never to a background (AGENTS.md §6): only these
 *  customers can call for the manager or claim a wrong milk that was right. */
export const DIFFICULT_PERSONALITIES: readonly CustomerId[] = ['karen'];
/** Affinity a regular needs before "the usual" means anything to the player. */
export const USUAL_AFFINITY = 2;
/** How often a guess comes off ("a coffee" made as a flat white, a name written as heard). */
export const GUESS_RIGHT = 0.5;
/** A queue this long makes slow fixes cost the people waiting. */
export const BUSY_QUEUE = 3;

export type OutcomeNumbers = Omit<
  EventOutcome,
  'gazLineKey' | 'difficult' | 'endsService' | 'affinityDelta'
>;

/** Outcome numbers by `${event}.${case}`; sim/events/defs.ts decides which case applies. */
export const OUTCOMES: Record<string, OutcomeNumbers> = {
  'JUST_COFFEE.asked': { patienceDelta: -3, satisfactionDelta: 0 },
  'JUST_COFFEE.lucky': { patienceDelta: 0, satisfactionDelta: 4 },
  'JUST_COFFEE.wrong': { patienceDelta: -8, satisfactionDelta: -10, wasteCents: 180 },
  'THE_USUAL.remembered': { patienceDelta: 0, satisfactionDelta: 10 },
  'THE_USUAL.asked': { patienceDelta: -3, satisfactionDelta: -2 },
  'THE_USUAL.forgot': { patienceDelta: -3, satisfactionDelta: -4 },
  'CHANGE_MIND.remade': { patienceDelta: 0, satisfactionDelta: 5, wasteCents: 150 },
  'CHANGE_MIND.busy': {
    patienceDelta: 0,
    queuePatienceDelta: -3,
    satisfactionDelta: 5,
    wasteCents: 150,
  },
  'CHANGE_MIND.kept': { patienceDelta: 0, satisfactionDelta: -8 },
  'QUEUE_JUMP.sentBack': { patienceDelta: -2, queuePatienceDelta: 3, satisfactionDelta: -3 },
  'QUEUE_JUMP.letThrough': { patienceDelta: 5, queuePatienceDelta: -4, satisfactionDelta: 2 },
  'QUEUE_JUMP.queueGrumbles': {
    patienceDelta: 5,
    queuePatienceDelta: -6,
    satisfactionDelta: 2,
    reputationDelta: -1,
  },
  'WRONG_MILK.ourBad': { patienceDelta: -5, satisfactionDelta: -5, wasteCents: 150 },
  'WRONG_MILK.argued': { patienceDelta: -10, satisfactionDelta: -30, reputationDelta: -1 },
  'WRONG_MILK.goodwill': {
    patienceDelta: -5,
    satisfactionDelta: 8,
    wasteCents: 150,
    reputationDelta: 1,
  },
  'WRONG_MILK.ticket': { patienceDelta: -3, satisfactionDelta: -2 },
  'CALL_MANAGER.backsYou': { patienceDelta: 0, satisfactionDelta: 0 },
  'CALL_MANAGER.smoothed': { patienceDelta: -3, satisfactionDelta: 5 },
  'CALL_MANAGER.showsOut': { patienceDelta: 0, satisfactionDelta: 0 },
  'THE_NAME.asked': { patienceDelta: -2, satisfactionDelta: 2 },
  'THE_NAME.gotIt': { patienceDelta: 0, satisfactionDelta: 3 },
  'THE_NAME.misspelt': { patienceDelta: 0, satisfactionDelta: -5 },
  'RARE_BIRD.shooed': { patienceDelta: 0, queuePatienceDelta: -2, satisfactionDelta: 0 },
  'RARE_BIRD.busy': { patienceDelta: 0, queuePatienceDelta: -4, satisfactionDelta: 0 },
  'RARE_BIRD.ignored': { patienceDelta: 0, satisfactionDelta: 0, reputationDelta: -1 },
};
