// The register: ring up what the customer said. Drink first (no default: you have to have heard
// it), then milk/temperature/heart, which default to what goes unsaid. Replay, "could you repeat
// that?" and clarifying questions go to the sim (they cost the customer patience and are counted).
// In learning mode, the transcript with the key words marked appears once the ticket prints.

import { atCounter, type Rush, type RushAction, type RushCustomer } from '../core/rush';
import { cueSpans, MAX_REPEATS, wrongFields, type OrderField } from '../sim/listening';
import { MILK_NAME, orderLabel, type DrinkType, type Milk, type Order } from '../sim/rush';
import { esc } from './screens';

export interface Pos {
  update(r: Rush): void;
  /** The player's question, shown under the buttons. */
  onAsk(text: string): void;
  /** A ticket printed: learning-mode feedback. */
  onTicket(c: RushCustomer, learning: boolean): void;
  /** Ring up the current selection if it's complete (Enter key). */
  ringUp(): boolean;
}

interface Sel {
  drink: DrinkType | null;
  milk: Milk;
  temp: 'normal' | 'extraHot';
  heart: 'no' | 'yes';
}

const FIELD_NAME: Record<OrderField, string> = {
  drink: 'drink',
  milk: 'milk',
  temp: 'temperature',
  heart: 'heart',
};

export function marked(
  text: string,
  spans: Array<{ field: OrderField; start: number; end: number }>,
  wrong: readonly OrderField[],
): string {
  let out = '';
  let at = 0;
  for (const s of spans) {
    if (s.start < at) continue;
    out += esc(text.slice(at, s.start));
    out += `<mark class="${wrong.includes(s.field) ? 'miss' : ''}">${esc(text.slice(s.start, s.end))}</mark>`;
    at = s.end;
  }
  return out + esc(text.slice(at));
}

/** Spell out what an unsaid default means, so a miss teaches something. */
function missNote(truth: Order, wrong: readonly OrderField[]): string {
  const notes: string[] = [];
  if (wrong.includes('milk'))
    notes.push(
      truth.milk && truth.milk !== 'full'
        ? `${MILK_NAME[truth.milk]} milk`
        : 'no milk named means full cream',
    );
  if (wrong.includes('temp') && !truth.extraHot) notes.push('nobody said extra hot');
  if (wrong.includes('heart') && !truth.heart) notes.push('nobody asked for a heart');
  return notes.length ? ` <small>(${esc(notes.join('; '))})</small>` : '';
}

export function createPos(root: HTMLElement, touch: boolean, act: (a: RushAction) => void): Pos {
  const el = document.createElement('div');
  el.id = 'pos';
  el.className = 'hide';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Register');
  const opt = (f: string, v: string, label: string): string =>
    `<button class="opt" data-f="${f}" data-v="${v}" aria-pressed="false">${label}</button>`;
  el.innerHTML = `
    <div class="ph"><b>Register</b><span class="who"></span><span class="st"></span></div>
    <div class="row"><span class="k">Drink</span>${opt('drink', 'flatWhite', 'Flat white')}${opt('drink', 'longBlack', 'Long black')}</div>
    <div class="row" data-row="milk"><span class="k">Milk</span>${opt('milk', 'full', 'Full cream')}${opt('milk', 'oat', 'Oat')}${opt('milk', 'soy', 'Soy')}${opt('milk', 'almond', 'Almond')}</div>
    <div class="row" data-row="temp"><span class="k">Temp</span>${opt('temp', 'normal', 'Normal')}${opt('temp', 'extraHot', 'Extra hot')}</div>
    <div class="row" data-row="heart"><span class="k">Art</span>${opt('heart', 'no', 'No heart')}${opt('heart', 'yes', 'Heart')}</div>
    <div class="row ask"><button class="opt" data-a="replay" title="Hear it again (R)">↻ Replay</button><button class="opt" data-a="repeat">“Sorry, could you repeat that?”</button></div>
    <div class="row ask"><span class="k">Ask</span><button class="opt" data-q="drink">Drink?</button><button class="opt" data-q="milk">Milk?</button><button class="opt" data-q="temp">Hot?</button><button class="opt" data-q="heart">Heart?</button></div>
    <div class="asked" aria-live="polite"></div>
    <button class="btn small ring" data-a="ring" disabled>Ring it up${touch ? '' : ' <kbd>Enter</kbd>'}</button>`;
  const fb = document.createElement('div');
  fb.id = 'posFeedback';
  fb.className = 'hide';
  fb.setAttribute('role', 'status');
  root.append(el, fb);

  const who = el.querySelector('.who') as HTMLElement;
  const st = el.querySelector('.st') as HTMLElement;
  const asked = el.querySelector('.asked') as HTMLElement;
  const ring = el.querySelector('[data-a="ring"]') as HTMLButtonElement;
  const repeatBtn = el.querySelector('[data-a="repeat"]') as HTMLButtonElement;
  const rows = {
    milk: el.querySelector('[data-row="milk"]') as HTMLElement,
    temp: el.querySelector('[data-row="temp"]') as HTMLElement,
    heart: el.querySelector('[data-row="heart"]') as HTMLElement,
  };

  let sel: Sel = { drink: null, milk: 'full', temp: 'normal', heart: 'no' };
  let forCustomer = '';
  let deciding = false;
  let fbUntil = 0;
  let now = 0;
  let stateKey = '';

  const order = (): Order | null =>
    sel.drink
      ? {
          type: sel.drink,
          milk: sel.drink === 'flatWhite' ? sel.milk : null,
          extraHot: sel.drink === 'flatWhite' && sel.temp === 'extraHot',
          heart: sel.drink === 'flatWhite' && sel.heart === 'yes',
        }
      : null;

  const paint = (): void => {
    el.querySelectorAll<HTMLButtonElement>('button[data-f]').forEach((b) => {
      const f = b.dataset.f as keyof Sel;
      const on = sel[f] === b.dataset.v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const lb = sel.drink === 'longBlack';
    for (const r of Object.values(rows)) r.classList.toggle('off', lb);
    ring.disabled = !deciding || sel.drink === null;
  };

  el.querySelectorAll<HTMLButtonElement>('button[data-f]').forEach((b) => {
    b.onclick = () => {
      const f = b.dataset.f as keyof Sel;
      (sel as unknown as Record<string, string>)[f] = b.dataset.v as string;
      paint();
    };
  });
  el.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach((b) => {
    b.onclick = () => act({ type: 'clarify', field: b.dataset.q as OrderField });
  });
  (el.querySelector('[data-a="replay"]') as HTMLButtonElement).onclick = () =>
    act({ type: 'replay' });
  repeatBtn.onclick = () => act({ type: 'repeat' });
  const doRing = (): boolean => {
    const o = order();
    if (!deciding || !o) return false;
    act({ type: 'ringUp', order: o });
    return true;
  };
  ring.onclick = () => void doRing();

  return {
    update(r) {
      const c = r.phase === 'service' ? atCounter(r) : null;
      if (!c) {
        el.classList.add('hide');
        forCustomer = '';
      } else {
        if (c.def.id !== forCustomer) {
          forCustomer = c.def.id;
          sel = { drink: null, milk: 'full', temp: 'normal', heart: 'no' };
          asked.textContent = '';
          who.textContent = c.def.name;
          stateKey = ''; // repaint: the last customer's choices must not stay lit
          fb.classList.add('hide');
        }
        deciding = c.state === 'deciding';
        const k = `${c.state}|${c.listen.repeats}`;
        if (k !== stateKey) {
          stateKey = k;
          st.textContent = deciding ? 'what did they order?' : 'listening…';
          repeatBtn.disabled = c.listen.repeats >= MAX_REPEATS;
          paint();
        }
        el.classList.remove('hide');
      }
      now = r.time;
      if (fbUntil > 0 && now > fbUntil) {
        fb.classList.add('hide');
        fbUntil = 0;
      }
    },
    onAsk(text) {
      asked.textContent = `You: ${text}`;
    },
    onTicket(c, learning) {
      if (!learning || !c.heard) return;
      const wrong = wrongFields(c.heard, c.order);
      const spans = cueSpans(c.line);
      fb.innerHTML = `<div class="fh">${wrong.length ? 'Not quite' : 'Spot on'} <small>${esc(c.def.name)}</small></div>
        <p class="said">“${marked(c.line.text, spans, wrong)}”</p>
        <p class="rung">You rang up: <b>${esc(orderLabel(c.heard))}</b></p>
        ${wrong.length ? `<p class="miss">Missed: ${wrong.map((f) => FIELD_NAME[f]).join(', ')}. They wanted <b>${esc(orderLabel(c.order))}</b>.${missNote(c.order, wrong)}</p>` : ''}`;
      fb.classList.remove('hide');
      fbUntil = now + 7;
    },
    ringUp: doRing,
  };
}
