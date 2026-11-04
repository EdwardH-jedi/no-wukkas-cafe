// The serve result card (src/ui/serveResult.ts) on real headless shifts: every customer who is
// dealt with gets a card (served, handed back, walked out) saying how it went, with the tip, and
// what to do next, so the loop runs order → make → serve → result → next customer.

import { describe, expect, it } from 'vitest';
import type { Rush } from '../../src/core/rush';
import type { Complaint } from '../../src/sim/rush';
import {
  COMPLAINT_TEXT,
  createServeCard,
  RESULT_SECONDS,
  serveResultCard,
  type ResultCard,
} from '../../src/ui/serveResult';
import { BOT_IDEAL, playRush, type ListenBot } from '../helpers/rushBot';

/** Every card the HUD would show during a shift, built at the moment its event fired. */
function cardsOf(o: ListenBot): { cards: ResultCard[]; r: Rush } {
  const cards: ResultCard[] = [];
  const { r } = playRush({
    ...o,
    each: (rush) => {
      let fixed: string | null = null;
      for (const e of rush.events) {
        if (e.type === 'ticketFixed') fixed = e.customer;
        if (e.type === 'served' || e.type === 'walkout' || e.type === 'refused') {
          const c = serveResultCard(rush, e);
          if (c) cards.push(c);
        } else if (e.type === 'rejected') {
          const c = serveResultCard(rush, { ...e, fixed: fixed === e.customer });
          if (c) cards.push(c);
        }
      }
    },
  });
  return { cards, r };
}

describe('serve result card', () => {
  it('a clean Day 2: one card per customer, how happy, the tip, and what comes next', () => {
    const { cards, r } = cardsOf({ seed: 3, ...BOT_IDEAL });
    expect(r.phase).toBe('summary');
    expect(cards.map((c) => c.customer)).toEqual(
      r.customers.filter((c) => c.outcome === 'served').map((c) => c.key),
    );
    expect(cards).toHaveLength(r.customers.length);
    for (const [i, card] of cards.entries()) {
      const c = r.customers.find((x) => x.key === card.customer)!;
      expect(card.title.startsWith(c.def.name)).toBe(true);
      expect(card.tone).not.toBe('back');
      expect(card.detail).toContain(`${c.result!.satisfaction}% happy`);
      expect(card.detail).toMatch(c.result!.tipCents > 0 ? /\+\$\d+\.\d\d tip/ : /no tip/);
      // Every card but the last points at the next thing to do; the last says the shift is done.
      if (i < cards.length - 1) expect(card.next, card.title).toMatch(/^Next: /);
      else expect(card.next).toBe("That's everyone. Nice work.");
    }
    expect(cards.some((c) => c.tone === 'great')).toBe(true);
  });

  it('a misheard ticket: handed back, the card says it was a listening mistake and to remake it', () => {
    const { cards } = cardsOf({
      seed: 3,
      ...BOT_IDEAL,
      heard: (c) =>
        c.def.id !== 'priya'
          ? c.order
          : c.order.type === 'flatWhite'
            ? { ...c.order, milk: c.order.milk === 'oat' ? 'soy' : 'oat' }
            : { type: 'flatWhite', milk: 'full', extraHot: false, heart: false },
    });
    const back = cards.find((c) => c.tone === 'back');
    expect(back?.customer).toBe('priya');
    expect(back?.title).toBe('Priya handed it back');
    expect(back?.detail).toMatch(/^(Wrong milk: they wanted \w[\w ]*\.|They ordered a [\w ]+\.)/);
    expect(back?.detail).toContain('You heard it wrong; the ticket is fixed.');
    expect(back?.next).toMatch(/^Next: remake it, /);
    // Then she is served from the corrected ticket.
    const after = cards.slice(cards.indexOf(back!) + 1).find((c) => c.customer === 'priya');
    expect(after?.tone).toMatch(/great|ok|poor/);
  });

  it('walk-outs get a card too, and Endless never says "that\'s everyone"', () => {
    const { cards } = cardsOf({ seed: 5, idle: true });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.tone).toBe('gone');
      expect(c.title).toMatch(/ walked out$/);
    }
    const endless = cardsOf({
      seed: 5,
      idle: true,
      week: { shiftIndex: 4, unlockedDrinks: ['flatWhite', 'longBlack'], endless: true },
    });
    expect(endless.cards).toHaveLength(3);
    for (const c of endless.cards) expect(c.next).not.toBe("That's everyone. Nice work.");
  });

  it('names every complaint an accepted drink can have', () => {
    const accepted: Complaint[] = [
      'notHotEnough',
      'tooHot',
      'lukewarm',
      'noHeart',
      'messy',
      'weak',
      'strong',
      'badShot',
      'slow',
    ];
    for (const k of accepted) expect(COMPLAINT_TEXT[k], k).toBeTruthy();
  });

  it('the card view: escapes text, stays up RESULT_SECONDS of game time, then comes down', () => {
    const el = { className: '', innerHTML: '' } as unknown as HTMLElement;
    const view = createServeCard(el);
    const card: ResultCard = {
      customer: 'karen',
      tone: 'poor',
      title: 'Karen: served, not happy',
      detail: '30% happy · no tip · <b>a long wait</b>',
      next: null,
    };
    view.show(card, 10);
    expect(el.className).toBe('tone-poor');
    expect(el.innerHTML).toContain('&lt;b&gt;a long wait&lt;/b&gt;');
    expect(el.innerHTML).not.toContain('class="rn"');
    view.update(10 + RESULT_SECONDS - 0.01);
    expect(view.current).toBe(card);
    view.update(10 + RESULT_SECONDS);
    expect(view.current).toBeNull();
    expect(el.className).toBe('hide');
  });
});
