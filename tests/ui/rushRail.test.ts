import { describe, expect, it } from 'vitest';
import { createRush, type Rush } from '../../src/core/rush';
import { weekFor } from '../../src/core/week/session';
import { newSave } from '../../src/sim/contracts/save';
import { wrongFields } from '../../src/sim/listening';
import { orderLabel, type Order } from '../../src/sim/rush';
import {
  fieldText,
  fillRail,
  isRegular,
  misheardHtml,
  railOrder,
  ticketOrderHtml,
  ticketsBehind,
  ticketWho,
} from '../../src/ui/rushRail';

const fw = (o: Partial<Order> = {}): Order => ({
  type: 'flatWhite',
  milk: 'full',
  extraHot: false,
  heart: false,
  ...o,
});
const lb: Order = { type: 'longBlack', milk: null, extraHot: false, heart: false };

/** Everyone waiting, tickets printed in the order given (customer indexes). */
function waiting(r: Rush, order: number[]): void {
  order.forEach((i, n) => {
    const c = r.customers[i];
    if (!c) return;
    c.state = 'waiting';
    c.ticket = n + 1;
  });
}

describe('the docket rail', () => {
  it('holds tickets oldest first, whatever order the customers are in', () => {
    const r = createRush(7);
    waiting(r, [2, 0, 1]);
    expect(railOrder(r).map((c) => c.ticket)).toEqual([1, 2, 3]);
    expect(railOrder(r).map((c) => c.key)).toEqual([
      r.customers[2]?.key,
      r.customers[0]?.key,
      r.customers[1]?.key,
    ]);
  });

  it('reuses the array it is given and counts the tickets behind a full rail', () => {
    const r = createRush(7, 'normal', {}, weekFor({ ...newSave({ seed: 7 }), shift: 4 }));
    waiting(
      r,
      r.customers.map((_, i) => i),
    );
    const out = [r.customers[0]!];
    expect(fillRail(r, out)).toBe(out);
    expect(out).toHaveLength(3);
    expect(ticketsBehind(r, out.length)).toBe(r.customers.length - 3);
    // Day 2 shows every ticket: nothing behind.
    const d2 = createRush(7);
    waiting(
      d2,
      d2.customers.map((_, i) => i),
    );
    expect(ticketsBehind(d2, railOrder(d2).length)).toBe(0);
  });
});

describe('regulars on the rail', () => {
  it('on Day 2 everyone is new: name and a few words about them', () => {
    const r = createRush(7);
    for (const c of r.customers) {
      expect(isRegular(r, c)).toBe(false);
      expect(ticketWho(r, c)).toEqual({ name: c.def.name, tag: c.def.tag });
    }
  });

  it('a regular the save remembers is shown by name only', () => {
    const save = { ...newSave({ seed: 7 }), shift: 1 };
    save.regulars = { dazza: { visits: 0, affinity: 2 } };
    const r = createRush(7, 'normal', {}, weekFor(save));
    const dazza = r.customers.find((c) => c.def.id === 'dazza');
    const other = r.customers.find((c) => c.def.id !== 'dazza' && c.key === c.def.id);
    expect(dazza && isRegular(r, dazza)).toBe(true);
    expect(dazza && ticketWho(r, dazza)).toEqual({ name: 'Dazza', tag: null });
    expect(other && isRegular(r, other)).toBe(false);
    expect(other && ticketWho(r, other).tag).toBe(other?.def.tag);
  });

  it('someone back for a second visit in the same shift is a regular by then', () => {
    const r = createRush(7, 'normal', {}, weekFor({ ...newSave({ seed: 7 }), shift: 4 }));
    const again = r.customers.find((c) => c.key.includes('#'));
    expect(again).toBeDefined();
    if (!again) return;
    expect(isRegular(r, again)).toBe(true);
    const first = r.customers.find((c) => c.key === again.def.id);
    expect(first && isRegular(r, first)).toBe(false);
  });
});

describe('misheard marks on a ticket', () => {
  it('without marks the ticket reads as orderLabel does', () => {
    const o = fw({ milk: 'oat', extraHot: true, heart: true });
    expect(ticketOrderHtml(o, [])).toBe(orderLabel(o));
    expect(ticketOrderHtml(lb, [])).toBe('long black');
  });

  it('marks the corrected milk, spelling out full cream when that was it', () => {
    expect(ticketOrderHtml(fw({ milk: 'oat' }), ['milk'])).toBe('<mark>oat</mark> flat white');
    expect(ticketOrderHtml(fw(), ['milk'])).toBe('<mark>full cream</mark> flat white');
  });

  it('marks a corrected temperature or heart, defaults included', () => {
    expect(ticketOrderHtml(fw({ extraHot: true }), ['temp'])).toBe(
      'flat white · <mark>extra hot (68–74 °C)</mark>',
    );
    expect(ticketOrderHtml(fw(), ['temp', 'heart'])).toBe(
      'flat white · <mark>not extra hot</mark> · <mark>no heart</mark>',
    );
    expect(ticketOrderHtml(fw({ heart: true }), ['heart'])).toBe(
      'flat white · <mark>heart on top</mark>',
    );
  });

  it('a misheard drink marks the whole drink', () => {
    expect(ticketOrderHtml(fw({ milk: 'soy' }), ['drink'])).toBe('<mark>soy flat white</mark>');
    expect(ticketOrderHtml(lb, ['drink'])).toBe('<mark>long black</mark>');
  });

  it('notes what was rung up, struck out, then what they said', () => {
    const printed = fw({ milk: 'soy', extraHot: true });
    const truth = fw({ milk: 'oat' });
    const marks = wrongFields(printed, truth);
    expect(marks).toEqual(['milk', 'temp']);
    expect(misheardHtml(printed, truth, marks)).toBe(
      '↩ Misheard: <s>soy</s> → oat; <s>extra hot</s> → normal',
    );
    expect(misheardHtml(lb, fw(), wrongFields(lb, fw()))).toBe(
      '↩ Misheard: <s>long black</s> → flat white',
    );
  });

  it('reads each field the way a ticket says it', () => {
    expect(fieldText(fw({ milk: 'almond' }), 'milk')).toBe('almond');
    expect(fieldText(fw({ milk: null }), 'milk')).toBe('full cream');
    expect(fieldText(fw({ heart: true }), 'heart')).toBe('heart');
    expect(fieldText(lb, 'drink')).toBe('long black');
    expect(fieldText(lb, 'milk')).toBe('none');
  });
});
