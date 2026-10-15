import { describe, expect, it } from 'vitest';
import { wrongFields } from '../../../src/sim/listening';
import type { Order } from '../../../src/sim/rush';
import {
  DRINK_IDS,
  DRINKS,
  diffTickets,
  isDrinkId,
  isPlayable,
  ticketValue,
} from '../../../src/sim/contracts/ticket';
import { CUSTOMERS } from '../../../src/data/customers';

const fw = (o: Partial<Order> = {}): Order => ({
  type: 'flatWhite',
  milk: 'full',
  extraHot: false,
  heart: false,
  ...o,
});
const lb: Order = { type: 'longBlack', milk: null, extraHot: false, heart: false };

describe('diffTickets', () => {
  it('is empty when the ticket matches, including defaults (null milk = full cream)', () => {
    expect(diffTickets(fw(), fw())).toEqual([]);
    expect(diffTickets(fw(), fw({ milk: null }))).toEqual([]);
    expect(diffTickets(lb, { ...lb, extraHot: true, heart: true })).toEqual([]);
  });

  it('names each wrong field with what was said and what was rung up', () => {
    expect(diffTickets(fw({ milk: 'oat', heart: true }), fw({ milk: 'soy' }))).toEqual([
      { field: 'milk', truth: 'oat', heard: 'soy' },
      { field: 'heart', truth: true, heard: false },
    ]);
    expect(diffTickets(fw({ extraHot: true }), fw())).toEqual([
      { field: 'temp', truth: 'extraHot', heard: 'normal' },
    ]);
  });

  it('a wrong drink trumps everything else', () => {
    expect(diffTickets(fw({ milk: 'oat' }), lb)).toEqual([
      { field: 'drink', truth: 'flatWhite', heard: 'longBlack' },
    ]);
  });

  it('agrees with wrongFields on every curated order against every other', () => {
    const orders = CUSTOMERS.flatMap((c) => c.orders.map((l) => l.order));
    for (const truth of orders)
      for (const heard of orders)
        expect(diffTickets(truth, heard).map((d) => d.field)).toEqual(wrongFields(heard, truth));
  });

  it('ticketValue reads normalised values', () => {
    expect(ticketValue(lb, 'milk')).toBeNull();
    expect(ticketValue(fw({ milk: null }), 'milk')).toBe('full');
  });
});

describe('drink ids', () => {
  it('only the drinks the station can make today are playable', () => {
    expect(DRINK_IDS.filter(isPlayable)).toEqual(['flatWhite', 'longBlack']);
    expect(DRINK_IDS).toHaveLength(6);
  });

  it('isDrinkId accepts catalogue ids only', () => {
    expect(isDrinkId('latte')).toBe(true);
    expect(isDrinkId('toString')).toBe(false);
    expect(isDrinkId('flat_white')).toBe(false);
    expect(isDrinkId(3)).toBe(false);
  });

  it('every drink has a name', () => {
    for (const id of DRINK_IDS) expect(DRINKS[id].name.length).toBeGreaterThan(0);
  });
});
