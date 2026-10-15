// The eight shift events as ShiftEventDefs: when each can happen and which outcome a choice leads
// to. Numbers come from data/events.ts; the rules, including fairness, live here as code:
//  - a legitimate complaint (WRONG_MILK after the player's own mistake) is never `difficult`;
//  - difficult behaviour belongs to a personality (DIFFICULT_PERSONALITIES), never to anyone else;
//  - CALL_MANAGER always backs the staff member, and refusing an abusive customer ends their
//    service without touching the drink's grade or the player's reputation;
//  - RARE_BIRD is the bin chicken: sim/ibis.ts runs the visit (see rareBird.ts).
// Guesses use ctx.rng, the only randomness.

import {
  BUSY_QUEUE,
  DIFFICULT_PERSONALITIES,
  EVENT_DATA,
  GUESS_RIGHT,
  OUTCOMES,
  USUAL_AFFINITY,
} from '../../data/events';
import type { EventContext, EventOutcome, ShiftEventDef, ShiftEventId } from '../contracts/events';

const KEY: Record<ShiftEventId, string> = {
  JUST_COFFEE: 'justCoffee',
  THE_USUAL: 'theUsual',
  CHANGE_MIND: 'changeMind',
  QUEUE_JUMP: 'queueJump',
  WRONG_MILK: 'wrongMilk',
  CALL_MANAGER: 'callManager',
  THE_NAME: 'theName',
  RARE_BIRD: 'rareBird',
};

export const gazKey = (id: ShiftEventId, outcomeCase: string): string =>
  `event.${KEY[id]}.${outcomeCase}`;

function outcome(
  id: ShiftEventId,
  outcomeCase: string,
  difficult: boolean,
  extra: Partial<EventOutcome> = {},
): EventOutcome {
  const n = OUTCOMES[`${id}.${outcomeCase}`];
  if (!n) throw new Error(`no outcome numbers for ${id}.${outcomeCase}`);
  return { ...n, ...extra, difficult, gazLineKey: gazKey(id, outcomeCase) };
}

const hasCustomer = (ctx: EventContext): boolean => ctx.customer !== null;
const difficultSort = (ctx: EventContext): boolean =>
  ctx.customer !== null && DIFFICULT_PERSONALITIES.includes(ctx.customer);
const knowsUsual = (ctx: EventContext): boolean =>
  ctx.customer !== null && (ctx.affinity[ctx.customer] ?? 0) >= USUAL_AFFINITY;
const busy = (ctx: EventContext): boolean => ctx.queueLength >= BUSY_QUEUE;

interface Rules {
  canTrigger(ctx: EventContext): boolean;
  resolve(choice: string, ctx: EventContext): EventOutcome;
}

const RULES: Record<ShiftEventId, Rules> = {
  JUST_COFFEE: {
    canTrigger: hasCustomer,
    resolve: (c, ctx) =>
      c === 'ask'
        ? outcome('JUST_COFFEE', 'asked', false)
        : outcome('JUST_COFFEE', ctx.rng.next() < GUESS_RIGHT ? 'lucky' : 'wrong', false),
  },
  THE_USUAL: {
    canTrigger: knowsUsual,
    // Not known well enough after all: "the usual" falls back to a clarifying question.
    resolve: (c, ctx) =>
      c === 'ask'
        ? outcome('THE_USUAL', 'asked', false)
        : knowsUsual(ctx) && ctx.customer
          ? outcome('THE_USUAL', 'remembered', false, { affinityDelta: { [ctx.customer]: 1 } })
          : outcome('THE_USUAL', 'forgot', false),
  },
  CHANGE_MIND: {
    canTrigger: hasCustomer,
    resolve: (c, ctx) =>
      c === 'keep'
        ? outcome('CHANGE_MIND', 'kept', false)
        : outcome('CHANGE_MIND', busy(ctx) ? 'busy' : 'remade', false),
  },
  QUEUE_JUMP: {
    canTrigger: (ctx) => ctx.queueLength >= 2,
    resolve: (c, ctx) =>
      c === 'backOfLine'
        ? outcome('QUEUE_JUMP', 'sentBack', true)
        : outcome('QUEUE_JUMP', busy(ctx) ? 'queueGrumbles' : 'letThrough', true),
  },
  WRONG_MILK: {
    // Anyone may complain about a real mistake; only a difficult personality claims one.
    canTrigger: (ctx) => hasCustomer(ctx) && (ctx.playerMistake || difficultSort(ctx)),
    resolve: (c, ctx) =>
      ctx.playerMistake
        ? outcome('WRONG_MILK', c === 'remake' ? 'ourBad' : 'argued', false)
        : outcome('WRONG_MILK', c === 'remake' ? 'goodwill' : 'ticket', true),
  },
  CALL_MANAGER: {
    canTrigger: difficultSort,
    resolve: (c) =>
      c === 'gaz'
        ? outcome('CALL_MANAGER', 'backsYou', true)
        : c === 'apologise'
          ? outcome('CALL_MANAGER', 'smoothed', true)
          : outcome('CALL_MANAGER', 'showsOut', true, { endsService: true }),
  },
  THE_NAME: {
    canTrigger: hasCustomer,
    resolve: (c, ctx) =>
      c === 'spell'
        ? outcome('THE_NAME', 'asked', false)
        : outcome('THE_NAME', ctx.rng.next() < GUESS_RIGHT ? 'gotIt' : 'misspelt', false),
  },
  RARE_BIRD: {
    // The bird comes in through the door, so only while nobody is mid-order at the register.
    canTrigger: (ctx) => ctx.customer === null,
    resolve: (c, ctx) =>
      c === 'ignore'
        ? outcome('RARE_BIRD', 'ignored', false)
        : outcome('RARE_BIRD', busy(ctx) ? 'busy' : 'shooed', false),
  },
};

export const SHIFT_EVENTS: readonly ShiftEventDef[] = (
  Object.keys(EVENT_DATA) as ShiftEventId[]
).map((id) => {
  const d = EVENT_DATA[id];
  return {
    id,
    weight: d.weight,
    minShift: d.minShift,
    cooldownShifts: d.cooldownShifts,
    choices: d.choices.map((c) => ({ ...c })),
    canTrigger: RULES[id].canTrigger,
    resolve: (choice, ctx) => {
      if (!d.choices.some((c) => c.id === choice)) throw new Error(`${id} has no choice ${choice}`);
      return RULES[id].resolve(choice, ctx);
    },
  };
});

export function eventDef(id: ShiftEventId): ShiftEventDef {
  const d = SHIFT_EVENTS.find((e) => e.id === id);
  if (!d) throw new Error(`unknown shift event ${id}`);
  return d;
}
