// The docket rail: one paper ticket per order rung up, oldest first (the order they were taken in),
// each with its customer's patience, what the ticket says (and, after a misheard hand-back, which
// fields were wrong), and Make / Serve. Touches the DOM only when something on it changed.

import type { Rush, RushCustomer } from '../core/rush';
import { wrongFields, type OrderField } from '../sim/listening';
import { DRINK_NAME, EXTRA_HOT, MILK_NAME, orderLabel, type Order } from '../sim/rush';
import { MILK_ICON } from './gauges';
import { esc } from './screens';

const byTicket = (a: RushCustomer, b: RushCustomer): number => (a.ticket ?? 0) - (b.ticket ?? 0);

/** Fill `out` with the customers whose tickets are on the rail, oldest ticket first. In week mode
 *  the rail holds as many as the café's docket rail does (an upgrade); the rest wait their turn
 *  behind it. Reuses `out` (the HUD calls it every frame). */
export function fillRail(r: Rush, out: RushCustomer[]): RushCustomer[] {
  out.length = 0;
  for (const c of r.customers) if (c.state === 'waiting') out.push(c);
  out.sort(byTicket);
  if (r.week && out.length > r.barista.station.ticketsShown)
    out.length = r.barista.station.ticketsShown;
  return out;
}

/** Customers whose tickets are on the rail, oldest ticket first. */
export const railOrder = (r: Rush): RushCustomer[] => fillRail(r, []);

/** The ticket being made next for a drink type (oldest first), or the oldest of any. */
export function nextTicket(r: Rush, type?: string): RushCustomer | null {
  return railOrder(r).find((c) => c.heard && (!type || c.heard.type === type)) ?? null;
}

/** Tickets waiting behind a full rail (week mode, before the docket-rail upgrade). */
export function ticketsBehind(r: Rush, shown: number): number {
  let n = 0;
  for (const c of r.customers) if (c.state === 'waiting') n++;
  return n - shown;
}

/** The café has history with them: they're back for another visit this shift (`dazza#2`), or the
 *  save remembers them (SaveV2.regulars, which the week passes in as affinity). On Day 2 everyone
 *  is new to the player. */
export function isRegular(r: Rush, c: RushCustomer): boolean {
  return c.key !== c.def.id || r.week?.affinity?.[c.def.id] !== undefined;
}

/** Who the ticket is for: a regular by name only, anyone else by name and a few words about them. */
export function ticketWho(r: Rush, c: RushCustomer): { name: string; tag: string | null } {
  return { name: c.def.name, tag: isRegular(r, c) ? null : c.def.tag };
}

/** How one field of an order reads on a ticket, defaults included ("full cream", "no heart"). */
export function fieldText(o: Order, f: OrderField): string {
  if (f === 'drink') return DRINK_NAME[o.type];
  if (o.type !== 'flatWhite') return 'none';
  if (f === 'milk') return MILK_NAME[o.milk ?? 'full'];
  if (f === 'temp') return o.extraHot ? 'extra hot' : 'normal';
  return o.heart ? 'heart' : 'no heart';
}

/** The ticket's order as HTML: orderLabel's words, with the `marked` fields wrapped in <mark>. A
 *  marked default that orderLabel leaves unsaid (full cream, not extra hot, no heart) is spelled
 *  out, so the correction shows. */
export function ticketOrderHtml(o: Order, marked: readonly OrderField[]): string {
  if (marked.length === 0) return esc(orderLabel(o));
  const m = (f: OrderField, text: string): string =>
    marked.includes(f) ? `<mark>${esc(text)}</mark>` : esc(text);
  const fw = o.type === 'flatWhite';
  const drink = DRINK_NAME[o.type];
  const milk = MILK_NAME[o.milk ?? 'full'];
  const showMilk = fw && ((o.milk !== null && o.milk !== 'full') || marked.includes('milk'));
  // A misheard drink marks the whole drink; a misheard milk, just the milk.
  const parts = [
    marked.includes('drink')
      ? m('drink', showMilk ? `${milk} ${drink}` : drink)
      : showMilk
        ? `${m('milk', milk)} ${esc(drink)}`
        : esc(drink),
  ];
  if (fw && o.extraHot) parts.push(m('temp', `extra hot (${EXTRA_HOT[0]}–${EXTRA_HOT[1]} °C)`));
  else if (fw && marked.includes('temp')) parts.push(m('temp', 'not extra hot'));
  if (fw && o.heart) parts.push(m('heart', 'heart on top'));
  else if (fw && marked.includes('heart')) parts.push(m('heart', 'no heart'));
  return parts.join(' · ');
}

/** A flat white's carton on its ticket: the carton's shape and its name, full cream included, so
 *  the milk never rests on colour or on a word left unsaid (Phase 7). '' for a long black. */
export function milkLine(o: Order): string {
  if (o.type !== 'flatWhite') return '';
  const m = o.milk ?? 'full';
  const name = MILK_NAME[m];
  return `<div class="tk"><i aria-hidden="true">${MILK_ICON[m]}</i> ${esc(name.charAt(0).toUpperCase() + name.slice(1))}</div>`;
}

/** "↩ Misheard: soy → oat" for a ticket set straight at the pass: what was rung up, struck out,
 *  then what they actually said (text and strike-through, not colour alone). */
export function misheardHtml(printed: Order, now: Order, fields: readonly OrderField[]): string {
  const notes = fields.map(
    (f) => `<s>${esc(fieldText(printed, f))}</s> → ${esc(fieldText(now, f))}`,
  );
  return `↩ Misheard: ${notes.join('; ')}`;
}

export interface RailCallbacks {
  make(c: RushCustomer): void;
  serve(key: string): void;
}

export interface Rail {
  /** A ticket printed: remember what it said, for the marks after a misheard hand-back. */
  onTicket(c: RushCustomer): void;
  /** A hand-back set a misheard ticket straight (c.heard is already the corrected order). */
  onTicketFixed(c: RushCustomer): void;
  /** A new shift (or a restart): forget the last one's tickets. */
  reset(): void;
  update(r: Rush): void;
  clear(): void;
}

interface TicketView {
  bar: HTMLElement;
  meter: HTMLElement;
  pct: number;
  cls: string;
}

export function createRail(el: HTMLElement, touch: boolean, cb: RailCallbacks): Rail {
  const printed = new Map<string, Order>();
  const fixed = new Map<string, OrderField[]>();
  const views = new Map<string, TicketView>();
  const list: RushCustomer[] = [];
  let key = '';

  const ticketHtml = (
    r: Rush,
    c: RushCustomer,
    i: number,
    ready: boolean,
    canMake: boolean,
  ): string => {
    const who = ticketWho(r, c);
    const marks = fixed.get(c.key) ?? [];
    const was = printed.get(c.key);
    const note =
      marks.length > 0 && was && c.heard
        ? `<div class="tm">${misheardHtml(was, c.heard, marks)}</div>`
        : c.rejected > 0
          ? `<div class="tm">↩ Handed back${c.rejected > 1 ? ` ×${c.rejected}` : ''}</div>`
          : '';
    // The ticket shows what was rung up, right or wrong: that's what gets made.
    return `<div class="tn">#${c.ticket} · ${esc(who.name)}</div>
      ${who.tag ? `<div class="tt">${esc(who.tag)}</div>` : ''}
      <div class="to">${c.heard ? ticketOrderHtml(c.heard, marks) : ''}</div>${c.heard ? milkLine(c.heard) : ''}${note}
      <div class="tp" role="meter" aria-label="Patience" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      <div class="tb"><button class="btn small ghost make" ${canMake ? '' : 'disabled'}>Make</button>
      <button class="btn small serve" ${ready ? '' : 'disabled'}>Serve${touch || !ready ? '' : ` <kbd>${i + 1}</kbd>`}</button></div>`;
  };

  const build = (r: Rush, behind: number, ready: boolean, canMake: boolean): void => {
    el.innerHTML = '';
    views.clear();
    list.forEach((c, i) => {
      const t = document.createElement('div');
      t.className = `ticket${isRegular(r, c) ? ' regular' : ''}${fixed.has(c.key) ? ' fixed' : ''}`;
      t.innerHTML = ticketHtml(r, c, i, ready, canMake);
      (t.querySelector('.serve') as HTMLButtonElement).onclick = () => cb.serve(c.key);
      (t.querySelector('.make') as HTMLButtonElement).onclick = () => cb.make(c);
      el.appendChild(t);
      const meter = t.querySelector('.tp') as HTMLElement;
      views.set(c.key, { bar: meter.firstElementChild as HTMLElement, meter, pct: -1, cls: '' });
    });
    if (behind > 0) {
      const more = document.createElement('div');
      more.className = 'ticket more';
      more.textContent = `+${behind} more behind the rail`;
      el.appendChild(more);
    }
  };

  return {
    onTicket(c) {
      if (c.heard) printed.set(c.key, { ...c.heard });
    },
    onTicketFixed(c) {
      const was = printed.get(c.key);
      if (was && c.heard) fixed.set(c.key, wrongFields(was, c.heard));
    },
    reset() {
      printed.clear();
      fixed.clear();
    },
    update(r) {
      fillRail(r, list);
      const ready = r.barista.ready !== null;
      const canMake = r.barista.phase === 'idle' && !ready;
      const behind = ticketsBehind(r, list.length);
      let k = `${ready}|${canMake}|${behind}`;
      for (const c of list)
        k += `,${c.key}:${c.heard ? orderLabel(c.heard) : ''}:${c.rejected}:${fixed.get(c.key)?.length ?? 0}`;
      if (k !== key) {
        key = k;
        build(r, behind, ready, canMake);
      }
      for (const c of list) {
        const v = views.get(c.key);
        if (!v) continue;
        const f = Math.max(0, c.patience / c.maxPatience);
        const pct = Math.round(f * 100);
        if (pct === v.pct) continue;
        v.pct = pct;
        v.bar.style.width = `${pct}%`;
        v.meter.setAttribute('aria-valuenow', String(pct));
        const cls = f > 0.5 ? 'ok' : f > 0.22 ? 'warn' : 'bad';
        if (cls !== v.cls) v.bar.className = v.cls = cls;
      }
    },
    clear() {
      el.innerHTML = '';
      views.clear();
      key = '';
    },
  };
}
