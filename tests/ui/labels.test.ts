import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../../src/data/upgrades';
import { migrate, type SaveV2 } from '../../src/sim/contracts/save';
import { formatCents, type ShiftSummary } from '../../src/sim/rush';
import { buyUpgrade } from '../../src/sim/shop';

const price = (id: string): number => UPGRADES.find((u) => u.id === id)?.costCents ?? NaN;
import {
  buyMessage,
  endlessReason,
  reportButton,
  reportStamp,
  shiftCells,
  shiftLabel,
  shopEntryLine,
  shopLines,
} from '../../src/ui/screens/labels';

const save = (over: Partial<SaveV2> = {}): SaveV2 => ({ ...migrate(null), ...over });

describe('title: Endless Rush', () => {
  it('is locked on a fresh save, with a one-line reason', () => {
    const why = endlessReason(save());
    expect(why).toBe('Pass Monday in the week to unlock it.');
  });

  it('opens once Monday is passed, and stays open in later weeks', () => {
    expect(endlessReason(save({ shift: 1 }))).toBeNull();
    expect(endlessReason(save({ week: 2, shift: 0 }))).toBeNull();
  });
});

const report = (shift: number, grade: ShiftSummary['grade']): SaveV2['reports'][number] => ({
  week: 1,
  shift,
  summary: {
    customers: 6,
    ordersCompleted: 6,
    correctOrders: 6,
    walkouts: 0,
    avgServeSeconds: 40,
    satisfaction: 80,
    tipsCents: 450,
    wasted: 0,
    grade,
  },
});

describe('shift select: the Monday–Friday grid', () => {
  it('a fresh save: Monday to play, the rest locked, no grades yet', () => {
    const cells = shiftCells(save());
    expect(cells.map((c) => c.day)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
    ]);
    expect(cells.map((c) => [c.status, c.playable, c.state])).toEqual([
      ['open', true, 'Play now'],
      ['locked', false, 'Locked'],
      ['locked', false, 'Locked'],
      ['locked', false, 'Locked'],
      ['locked', false, 'Locked'],
    ]);
    expect(cells[0]?.detail).toBe('6 customers · new: flat white, long black');
    expect(cells.every((c) => c.best === null)).toBe(true);
  });

  it('mid-week: passed shifts are done with their best grade; a disaster is played again', () => {
    const s = save({
      shift: 2,
      reports: [
        report(0, 'okay'),
        report(0, 'good'),
        report(1, 'excellent'),
        report(2, 'disaster'),
      ],
    });
    const [mon, tue, wed, thu] = shiftCells(s);
    expect([mon?.state, mon?.best, mon?.playable]).toEqual(['Done', 'Best: Good', false]);
    expect([tue?.state, tue?.best]).toEqual(['Done', 'Best: Excellent']);
    expect([wed?.state, wed?.best, wed?.playable]).toEqual(['Play again', 'Best: Disaster', true]);
    expect([thu?.state, thu?.status]).toEqual(['Locked', 'locked']);
  });

  it('reads each shift as one sentence per line for screen readers', () => {
    const [mon] = shiftCells(save({ shift: 1, reports: [report(0, 'good')] }));
    expect(mon && shiftLabel(mon)).toBe(
      'Monday: Done. 6 customers · new: flat white, long black. Best: Good.',
    );
  });

  it('the shop button shows the till and how many upgrades are owned', () => {
    expect(shopEntryLine(save({ cents: 52_000, upgrades: ['docketRail'] }))).toBe(
      `In the till: ${formatCents(52_000)} · 1 of ${UPGRADES.length} owned`,
    );
  });
});

describe('the shop', () => {
  it('lists every upgrade with its price in cents, one-line effect and state', () => {
    const lines = shopLines(save({ cents: price('grinder'), upgrades: ['docketRail'] }));
    expect(lines.map((l) => l.id)).toEqual(UPGRADES.map((u) => u.id));
    const by = Object.fromEntries(lines.map((l) => [l.id, l]));
    expect(by.docketRail?.state).toBe('owned');
    expect(by.grinder).toMatchObject({ state: 'buy', price: formatCents(price('grinder')) });
    expect(by.secondGroup?.state).toBe('short');
    for (const l of lines) expect(l.effect).toBe(UPGRADES.find((u) => u.id === l.id)?.description);
  });

  it('a buy the till covers says what is left', () => {
    const before = save({ cents: 50_000 });
    const r = buyUpgrade(before, 'grinder');
    expect(buyMessage(r, 'grinder', before)).toBe(
      `Better grinder bought. ${formatCents(50_000 - price('grinder'))} left in the till.`,
    );
  });

  it("a buy the till can't cover is refused with the price and the till, never silently", () => {
    const before = save({ cents: 900 });
    const r = buyUpgrade(before, 'secondGroup');
    expect(r.ok).toBe(false);
    expect(buyMessage(r, 'secondGroup', before)).toBe(
      `Not enough in the till: Second group head costs ${formatCents(price('secondGroup'))}, you have ${formatCents(900)}.`,
    );
  });

  it('an owned or unknown upgrade says so', () => {
    const before = save({ cents: 900_000, upgrades: ['grinder'] });
    expect(buyMessage(buyUpgrade(before, 'grinder'), 'grinder', before)).toBe(
      'Better grinder is already yours.',
    );
    expect(buyMessage(buyUpgrade(before, 'espressoCart'), 'espressoCart', before)).toBe(
      "That upgrade isn't for sale.",
    );
  });
});

describe('the shift report', () => {
  const summary = (grade: ShiftSummary['grade'], served = 6): ShiftSummary => ({
    ...report(0, grade).summary,
    ordersCompleted: served,
  });

  it('a passed week shift offers the next shift', () => {
    for (const g of ['excellent', 'good', 'okay', 'poor'] as const)
      expect(reportButton({ endless: false }, summary(g))).toEqual({
        act: 'next',
        label: 'Next shift',
      });
  });

  it('a failed week shift, Day 2 and Endless Rush offer another go', () => {
    expect(reportButton({}, summary('disaster'))).toEqual({ act: 'next', label: 'Try again' });
    expect(reportButton(null, summary('excellent'))).toEqual({ act: 'again', label: 'Try again' });
    expect(reportButton({ endless: true }, summary('good'))).toEqual({
      act: 'again',
      label: 'Try again',
    });
  });

  it('Endless Rush is stamped with how many were served; the rest with the grade', () => {
    expect(reportStamp({ endless: true }, summary('disaster', 23))).toEqual({
      text: 'Served 23',
      band: 'hired',
    });
    expect(reportStamp(null, summary('good'))).toEqual({
      text: 'Solid first shift',
      band: 'hired',
    });
    expect(reportStamp({}, summary('disaster'))).toEqual({
      text: 'Total disaster',
      band: 'disaster',
    });
  });
});
