// Shift select: the week's Monday–Friday grid (locked / open / done, with the best grade), Endless
// Rush (or why it's locked), the way into the café upgrade shop, and back. Opened from the title
// screen ("The week"). Only the shift the week is on can be played. Built with textContent only.

import type { SaveV2 } from '../../sim/contracts/save';
import { focusQuietly, menuKeys } from './keys';
import { endlessReason, shiftCells, shiftLabel, shopEntryLine } from './labels';

export interface ShiftSelectActions {
  play(shift: number): void;
  endless(): void;
  /** Open the café upgrade shop. */
  shop(): void;
  back(): void;
}

function span(className: string, text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = className;
  s.textContent = text;
  return s;
}

/** A wide button with a name and a line under it (the line is its description, not its name). */
function wide(
  className: string,
  name: string,
  sub: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.disabled = disabled;
  b.setAttribute('aria-label', name);
  const subEl = span('sub', sub);
  subEl.id = `${className}-sub`;
  b.setAttribute('aria-describedby', subEl.id);
  b.append(span('name', name), subEl);
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
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Shifts');
  const card = document.createElement('div');
  card.className = 'ss-card';
  const head = document.createElement('header');
  const title = document.createElement('h2');
  title.textContent = `Week ${save.week}`;
  const intro = document.createElement('p');
  intro.textContent =
    'One shift at a time: pass it and the next one opens. A disaster means another go.';
  head.append(title, intro);
  card.append(head);
  if (note) {
    const p = document.createElement('p');
    p.className = 'shift-select-note';
    p.textContent = note;
    card.append(p);
  }

  const list = document.createElement('ol');
  list.className = 'ss-grid';
  let next: HTMLButtonElement | null = null;
  for (const cell of shiftCells(save)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = !cell.playable;
    b.dataset.shift = String(cell.index);
    b.dataset.status = cell.status;
    b.setAttribute('aria-label', shiftLabel(cell));
    b.append(span('day', cell.day), span('state', cell.state), span('detail', cell.detail));
    if (cell.best) b.append(span('best', cell.best));
    b.addEventListener('click', () => on.play(cell.index));
    if (cell.playable) next = b;
    const li = document.createElement('li');
    li.append(b);
    list.append(li);
  }

  const lock = endlessReason(save);
  const endless = wide(
    'shift-select-endless',
    'Endless Rush',
    lock ?? 'Everything on the menu so far, until the third walk-out.',
    () => on.endless(),
    lock !== null,
  );
  const shop = wide('shift-select-shop', 'Café upgrades', shopEntryLine(save), () => on.shop());
  const more = document.createElement('div');
  more.className = 'ss-more';
  more.append(shop, endless);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'shift-select-back';
  back.textContent = 'Back';
  back.addEventListener('click', () => on.back());

  card.append(list, more, back);
  el.append(card);
  menuKeys(el, { modal: true, escape: () => on.back() });
  root.append(el);
  focusQuietly(next ?? el.querySelector('button:not(:disabled)'));
  return () => el.remove();
}
