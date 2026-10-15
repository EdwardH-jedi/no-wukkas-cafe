// The event card (week mode): what has come up, and the choices with what each costs the customer
// in patience (EventChoice.costSeconds, data/events.ts). While the card is up, number keys 1–3 pick
// its choices (rushKey in app/rushWiring.ts asks eventChoiceForKey). Touches the DOM only when the
// event (or where it must sit to keep clear of the cup) changes.

import type { Rush } from '../core/rush';
import { EVENT_PROMPTS } from '../data/events';
import type { EventChoice, ShiftEventDef } from '../sim/contracts/events';
import { costPill } from './pos';
import { esc } from './screens';

/** Number keys 1..EVENT_KEYS belong to the card while it's up (no event has more choices). */
export const EVENT_KEYS = 3;

/** The event whose card is on screen (waiting for the player's answer), if any. */
export const shownEvent = (r: Rush): ShiftEventDef | null =>
  r.phase === 'service' ? (r.shiftEvents.current?.def ?? null) : null;

/** Is `key` the card's? A digit 1–3 while it's up, even past its last choice (a stray 3 on a
 *  two-choice card mustn't serve a ticket or move the jug instead). Not during the pour: there
 *  1–3 are the jug heights (3 lays the white low), so a card that pops up mid-pour waits for a
 *  click or the end of the pour rather than taking an answer the player never meant. */
export function eventOwnsKey(r: Rush, key: string): boolean {
  const n = Number(key);
  return (
    shownEvent(r) !== null && r.barista.phase !== 'pour' && /^[1-9]$/.test(key) && n <= EVENT_KEYS
  );
}

/** The choice id a number key picks on the card, or null (no card, or no such choice). */
export function eventChoiceForKey(r: Rush, key: string): string | null {
  const def = shownEvent(r);
  if (!def || !eventOwnsKey(r, key)) return null;
  return def.choices[Number(key) - 1]?.id ?? null;
}

/** The card's prompt, with the customer's call name in it. */
export const eventPrompt = (def: ShiftEventDef, name: string): string =>
  EVENT_PROMPTS[def.id].replace('{name}', name);

/** One choice: its key (not on touch), its words, and its patience cost when it has one. */
export const choiceHtml = (c: EventChoice, i: number, touch: boolean): string =>
  `<button class="btn small" data-choice="${esc(c.id)}">${touch || i >= EVENT_KEYS ? '' : `<kbd>${i + 1}</kbd> `}${esc(c.label)}${costPill(c.costSeconds)}</button>`;

export interface EventCard {
  update(r: Rush): void;
}

export function createEventCard(
  el: HTMLElement,
  touch: boolean,
  choose: (choice: string) => void,
): EventCard {
  const head = el.querySelector('.h') as HTMLElement;
  const box = el.querySelector('.b') as HTMLElement;
  let key = '';
  let aside = false;
  let pouring = false;
  return {
    update(r) {
      // During the pour 1–3 are the jug heights, so the card's key hints step back.
      const p = r.barista.phase === 'pour';
      if (p !== pouring) {
        pouring = p;
        el.classList.toggle('pouring', p);
      }
      // Two hands swings the camera to the group head, and the cup with it: the card moves aside.
      const a = r.barista.phase === 'shotSteam';
      if (a !== aside) {
        aside = a;
        el.classList.toggle('aside', a);
      }
      const def = shownEvent(r);
      const cur = def ? r.shiftEvents.current : null;
      const k = cur ? `${cur.def.id}|${cur.customer ? r.customers.indexOf(cur.customer) : -1}` : '';
      if (k === key) return;
      key = k;
      el.classList.toggle('hide', !cur);
      if (!cur) return;
      head.textContent = eventPrompt(cur.def, cur.customer?.def.callName ?? 'Someone');
      box.innerHTML = cur.def.choices.map((c, i) => choiceHtml(c, i, touch)).join('');
      box.querySelectorAll<HTMLButtonElement>('button[data-choice]').forEach((b) => {
        b.onclick = () => choose(b.dataset.choice ?? '');
      });
    },
  };
}
