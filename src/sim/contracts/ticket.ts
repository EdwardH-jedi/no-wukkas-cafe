// Shared contract for the week-1 lanes: the ticket. A ticket IS the Day 2 `Order`
// (sim/rush.ts) and its fields are the listening fields (sim/listening.ts); this file names them
// for the lanes and adds the field-by-field diff that wrong-milk/wrong-drink consequences and shift
// stats build on. Pure: no DOM, no three, no browser globals (eslint enforces it for src/sim).

import { normaliseOrder, wrongFields, type OrderField } from '../listening';
import type { DrinkType, Milk, Order } from '../rush';

export type Ticket = Order;
export type TicketField = OrderField;
export type MilkId = Milk;

/** Week-1 unlocks that have no station recipe yet. A Ticket can only carry a playable drink. */
export type FutureDrinkId = 'cappuccino' | 'latte' | 'piccolo' | 'icedLongBlack';
export type DrinkId = DrinkType | FutureDrinkId;

export interface DrinkInfo {
  name: string;
  /** Made with steamed milk (so milk, temperature and a heart can be asked for). */
  milk: boolean;
  /** The station can make it today. */
  playable: boolean;
}

/** Every drink id the week can mention (the recipe table the unlock schedule is checked against). */
export const DRINKS: Record<DrinkId, DrinkInfo> = {
  flatWhite: { name: 'flat white', milk: true, playable: true },
  longBlack: { name: 'long black', milk: false, playable: true },
  cappuccino: { name: 'cappuccino', milk: true, playable: false },
  latte: { name: 'latte', milk: true, playable: false },
  piccolo: { name: 'piccolo', milk: true, playable: false },
  icedLongBlack: { name: 'iced long black', milk: false, playable: false },
};

export const DRINK_IDS = Object.keys(DRINKS) as DrinkId[];

export const isDrinkId = (x: unknown): x is DrinkId =>
  typeof x === 'string' && Object.hasOwn(DRINKS, x);

export const isPlayable = (d: DrinkId): d is DrinkType => DRINKS[d].playable;

/** One field the ticket got wrong: what was said versus what was rung up. */
export interface TicketDiff {
  field: TicketField;
  truth: unknown;
  heard: unknown;
}

/** The value a field compares on, after the usual defaults (full cream, no milk on a long black). */
export function ticketValue(t: Ticket, field: TicketField): unknown {
  const n = normaliseOrder(t);
  switch (field) {
    case 'drink':
      return n.type;
    case 'milk':
      return n.milk;
    case 'temp':
      return n.extraHot ? 'extraHot' : 'normal';
    case 'heart':
      return n.heart;
  }
}

/** Field-by-field diff. Same rules as wrongFields(): a wrong drink trumps everything. */
export function diffTickets(truth: Ticket, heard: Ticket): TicketDiff[] {
  return wrongFields(heard, truth).map((field) => ({
    field,
    truth: ticketValue(truth, field),
    heard: ticketValue(heard, field),
  }));
}
