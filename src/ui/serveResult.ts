// The serve result card: after every hand-over the player sees what happened with that customer
// (served and how well, handed back and why, or walked out), the tip, and what to do next, so
// one order leads into the next. Before it the only feedback was the crowd's nod and a spoken
// line. Pure text from the rush state (serveResultCard, nextStep) plus a small DOM card that the
// rush clock takes down again: it counts down in update(), so a paused game keeps it up.

import { atRegister, type Rush, type RushCustomer } from '../core/rush';
import {
  DRINK_NAME,
  EXTRA_HOT,
  MILK_NAME,
  formatCents,
  orderLabel,
  type Complaint,
  type ServeResult,
} from '../sim/rush';
import { nextTicket } from './rushRail';
import { esc } from './screens';

export type ResultTone = 'great' | 'ok' | 'poor' | 'back' | 'gone';

export interface ResultCard {
  /** Which customer visit it's about. */
  customer: string;
  tone: ResultTone;
  title: string;
  detail: string;
  /** What the player can do next, or null when there's nothing to do but wait. */
  next: string | null;
}

/** The things a customer can notice about an accepted drink, in plain words. */
export const COMPLAINT_TEXT: Partial<Record<Complaint, string>> = {
  notHotEnough: `not extra hot (${EXTRA_HOT[0]}–${EXTRA_HOT[1]} °C)`,
  tooHot: 'too hot',
  lukewarm: 'went cold on the pass',
  noHeart: 'no heart on top',
  messy: 'spilt or short of the rim',
  weak: 'too much water',
  strong: 'not enough water',
  badShot: 'the shot ran off',
  slow: 'a long wait',
};

/** The last card of a shift (Day 2 and the week, never Endless), whoever that last one was: a
 *  walk-out or an unhappy serve gets no "nice work". */
export const LAST_CALL = "That's everyone for this shift.";

/** How long the card stays up, in game seconds. */
export const RESULT_SECONDS = 4.5;

export type ResultEvent =
  | { type: 'served'; customer: string; result: ServeResult }
  | { type: 'rejected'; customer: string; fixed?: boolean }
  | { type: 'walkout'; customer: string }
  | { type: 'refused'; customer: string };

const visit = (r: Rush, key: string): RushCustomer | null =>
  r.customers.find((c) => c.key === key) ?? null;

/** What to do now that this customer is dealt with: the register first (orders are the game),
 *  then the oldest ticket, then whoever is walking in or still to come. */
export function nextStep(r: Rush, done: string): string | null {
  const reg = atRegister(r);
  if (reg && reg.key !== done) return `Next: ${reg.def.callName} is at the register.`;
  const talking = r.customers.find(
    (c) => (c.state === 'ordering' || c.state === 'deciding') && c.key !== done,
  );
  if (talking) return `Next: ring up ${talking.def.callName}'s order.`;
  const t = nextTicket(r);
  if (t && t.key !== done && t.heard)
    return `Next: make ${t.def.callName}'s ${DRINK_NAME[t.heard.type]}.`;
  const coming = r.customers.find(
    (c) => (c.state === 'entering' || c.state === 'queue') && c.key !== done,
  );
  if (coming) return `Next: ${coming.def.callName} is coming in.`;
  if (r.customers.some((c) => c.state === 'outside' && c.key !== done))
    return 'Next: the next customer is on their way.';
  if (!r.week?.endless && r.customers.every((c) => c.key === done || c.outcome !== null))
    return LAST_CALL;
  return null;
}

/** The card for one event at the pass or the door. Null for a customer the rush doesn't know. */
export function serveResultCard(r: Rush, ev: ResultEvent): ResultCard | null {
  const c = visit(r, ev.customer);
  if (!c) return null;
  const name = c.def.name;
  if (ev.type === 'served') {
    const res = ev.result;
    const notes = res.complaints
      .map((k) => COMPLAINT_TEXT[k])
      .filter((t): t is string => t !== undefined)
      .slice(0, 2);
    const tone: ResultTone =
      res.correct && res.satisfaction >= 75 ? 'great' : res.satisfaction >= 45 ? 'ok' : 'poor';
    const title =
      tone === 'great'
        ? `${name}: spot on`
        : tone === 'ok'
          ? `${name}: served`
          : `${name}: served, not happy`;
    const tip = res.tipCents > 0 ? `+${formatCents(res.tipCents)} tip` : 'no tip';
    const said = notes.length ? ` · ${notes.join(', ')}` : '';
    return {
      customer: c.key,
      tone,
      title,
      detail: `${res.satisfaction}% happy · ${tip}${said}`,
      next: nextStep(r, c.key),
    };
  }
  if (ev.type === 'rejected') {
    const drink = r.barista.ready;
    const why =
      drink && drink.type !== c.order.type
        ? `They ordered a ${DRINK_NAME[c.order.type]}.`
        : `Wrong milk: they wanted ${MILK_NAME[c.order.milk ?? 'full']}.`;
    const fixed = ev.fixed ? ' You heard it wrong; the ticket is fixed.' : '';
    return {
      customer: c.key,
      tone: 'back',
      title: `${name} handed it back`,
      detail: `${why}${fixed}`,
      next: c.heard ? `Next: remake it, ${orderLabel(c.heard)}.` : null,
    };
  }
  return {
    customer: c.key,
    tone: 'gone',
    title: ev.type === 'walkout' ? `${name} walked out` : `${name} was shown the door`,
    detail: ev.type === 'walkout' ? 'They waited too long. No sale.' : 'No sale, no harm done.',
    next: nextStep(r, c.key),
  };
}

const ICON: Record<ResultTone, string> = {
  great: '✓',
  ok: '✓',
  poor: '✓',
  back: '↩',
  gone: '✗',
};

export interface ServeCardView {
  show(card: ResultCard, now: number): void;
  /** A hand-back turned out to be a listening mistake: say so on the card. */
  markFixed(r: Rush, customer: string, now: number): void;
  /** Every frame: takes the card down RESULT_SECONDS after it went up (game time). */
  update(now: number): void;
  hide(): void;
  readonly current: ResultCard | null;
}

export function createServeCard(el: HTMLElement): ServeCardView {
  let current: ResultCard | null = null;
  let until = 0;
  const render = (c: ResultCard): void => {
    el.className = `tone-${c.tone}`;
    el.innerHTML =
      `<div class="rh"><span class="ri" aria-hidden="true">${ICON[c.tone]}</span>${esc(c.title)}</div>` +
      `<div class="rd">${esc(c.detail)}</div>` +
      (c.next ? `<div class="rn">${esc(c.next)}</div>` : '');
  };
  const view: ServeCardView = {
    show(card, now) {
      current = card;
      until = now + RESULT_SECONDS;
      render(card);
    },
    markFixed(r, customer, now) {
      if (current?.customer !== customer || current.tone !== 'back') return;
      const card = serveResultCard(r, { type: 'rejected', customer, fixed: true });
      if (card) view.show(card, now);
    },
    update(now) {
      if (current && now >= until) view.hide();
    },
    hide() {
      current = null;
      el.className = 'hide';
      el.innerHTML = '';
    },
    get current() {
      return current;
    },
  };
  return view;
}
