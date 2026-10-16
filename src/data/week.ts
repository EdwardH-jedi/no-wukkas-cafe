// Week 1: the Day 1 trial, then five paid shifts that grow the menu and the queue. Hard mode plays
// the same table with less patience. Arrivals speed up through each shift (gap.first → gap.last);
// shift 0 matches today's Day 2 (six customers, roughly 15–26 s apart).

import type { DrinkId } from '../sim/contracts/ticket';
import type { Difficulty } from '../sim/listening';

export interface ShiftDef {
  index: number;
  day: string;
  customers: number;
  /** Drinks that join the menu at this shift. */
  unlocks: DrinkId[];
  /** Most shift events this shift (sim/events/scheduler.ts). */
  eventCap: number;
  /** Seconds between arrivals: the first gap and the last. */
  gap: { first: number; last: number };
}

export const WEEK: readonly ShiftDef[] = [
  {
    index: 0,
    day: 'Monday',
    customers: 6,
    unlocks: ['flatWhite', 'longBlack'],
    eventCap: 0,
    gap: { first: 26, last: 22 },
  },
  {
    index: 1,
    day: 'Tuesday',
    customers: 7,
    unlocks: ['cappuccino'],
    eventCap: 1,
    gap: { first: 24, last: 18 },
  },
  {
    index: 2,
    day: 'Wednesday',
    customers: 8,
    unlocks: ['latte'],
    eventCap: 2,
    gap: { first: 22, last: 16 },
  },
  {
    index: 3,
    day: 'Thursday',
    customers: 9,
    unlocks: ['piccolo'],
    eventCap: 2,
    gap: { first: 16, last: 10 },
  },
  {
    index: 4,
    day: 'Friday',
    customers: 10,
    unlocks: ['icedLongBlack'],
    eventCap: 2,
    gap: { first: 16, last: 10 },
  },
];

/** Patience multiplier by difficulty: the same week, less forgiving on Hard. */
export const PATIENCE_SCALE: Record<Difficulty, number> = { easy: 1.15, normal: 1, hard: 0.85 };

/** Seconds after the doors open that the first customer walks in (as on Day 2). */
export const FIRST_ARRIVAL = 1;

/** Endless Rush: no customer cap, arrivals keep speeding up, over at the third walk-out. */
export const ENDLESS = { maxWalkouts: 3, gap: { first: 22, min: 8, decay: 0.95 } } as const;
