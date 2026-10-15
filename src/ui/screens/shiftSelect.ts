// Shift select: the week's shifts (locked / open / done, with the best grade), Endless Rush and
// the café upgrade shop (bought out of the save's till). Opened from the title screen ("The
// week"). Only the shift the week is on can be played. Built with textContent only.

import { endlessUnlocked, shiftRows } from '../../core/week/progress';
import { canPlay } from '../../core/week/session';
import { UPGRADES } from '../../data/upgrades';
import type { SaveV2 } from '../../sim/contracts/save';
import { DRINKS } from '../../sim/contracts/ticket';
import { formatCents } from '../../sim/rush';

export interface ShiftSelectActions {
  play(shift: number): void;
  endless(): void;
  back(): void;
  /** Buy a café upgrade (the screen only offers ones the till covers). */
  buy?(id: string): void;
}

function button(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

/** Shows the screen in `root`; returns a function that removes it. */
export function renderShiftSelect(
  root: HTMLElement,
  save: SaveV2,
  on: ShiftSelectActions,
  /** A line under the title, e.g. that progress won't be saved in this browser. */
  note = '',
): () => void {
  const el = document.createElement('section');
  el.className = 'shift-select';
  el.setAttribute('aria-label', 'Shifts');
  const title = document.createElement('h2');
  title.textContent = `Week ${save.week}`;
  const list = document.createElement('ol');
  for (const row of shiftRows(save)) {
    const parts = [`${row.day}`, `${row.customers} customers`];
    if (row.unlocks.length > 0)
      parts.push(`new: ${row.unlocks.map((d) => DRINKS[d].name).join(', ')}`);
    if (row.best) parts.push(`best: ${row.best}`);
    const b = button(parts.join(' · '), () => on.play(row.index), !canPlay(save, row.index));
    b.dataset.shift = String(row.index);
    b.dataset.status = row.status;
    const li = document.createElement('li');
    li.append(b);
    list.append(li);
  }
  const endless = button('Endless Rush', () => on.endless(), !endlessUnlocked(save));
  endless.className = 'shift-select-endless';
  const back = button('Back', () => on.back());
  back.className = 'shift-select-back';
  el.append(title);
  if (note) {
    const p = document.createElement('p');
    p.className = 'shift-select-note';
    p.textContent = note;
    el.append(p);
  }
  el.append(list, endless);
  if (on.buy) el.append(shop(save, on.buy));
  el.append(back);
  root.append(el);
  return () => el.remove();
}

/** The upgrade shop: every upgrade, its price, and whether it's owned or affordable. */
function shop(save: SaveV2, buy: (id: string) => void): HTMLElement {
  const box = document.createElement('section');
  box.className = 'shift-select-shop';
  box.setAttribute('aria-label', 'Café upgrades');
  const h = document.createElement('h3');
  h.textContent = `Café upgrades · in the till: ${formatCents(save.cents)}`;
  const list = document.createElement('ul');
  for (const u of UPGRADES) {
    const owned = save.upgrades.includes(u.id);
    const label = `${u.name} · ${owned ? 'owned' : formatCents(u.costCents)} · ${u.description}`;
    const b = button(label, () => buy(u.id), owned || save.cents < u.costCents);
    b.dataset.upgrade = u.id;
    b.dataset.status = owned ? 'owned' : 'open';
    const li = document.createElement('li');
    li.append(b);
    list.append(li);
  }
  box.append(h, list);
  return box;
}
