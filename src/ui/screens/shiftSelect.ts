// Shift select: the week's shifts (locked / open / done, with the best grade) and Endless Rush.
// A new screen only; adding its button to the title screen is the integrator's hook
// (docs/integration/T5-hook.md). Built with textContent only.

import { endlessUnlocked, shiftRows } from '../../core/week/progress';
import type { SaveV2 } from '../../sim/contracts/save';
import { DRINKS } from '../../sim/contracts/ticket';

export interface ShiftSelectActions {
  play(shift: number): void;
  endless(): void;
  back(): void;
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
): () => void {
  const el = document.createElement('section');
  el.className = 'shift-select';
  const title = document.createElement('h2');
  title.textContent = `Week ${save.week}`;
  const list = document.createElement('ol');
  for (const row of shiftRows(save)) {
    const parts = [`${row.day}`, `${row.customers} customers`];
    if (row.unlocks.length > 0)
      parts.push(`new: ${row.unlocks.map((d) => DRINKS[d].name).join(', ')}`);
    if (row.best) parts.push(`best: ${row.best}`);
    const b = button(parts.join(' · '), () => on.play(row.index), row.status === 'locked');
    b.dataset.shift = String(row.index);
    b.dataset.status = row.status;
    const li = document.createElement('li');
    li.append(b);
    list.append(li);
  }
  const endless = button('Endless Rush', () => on.endless(), !endlessUnlocked(save));
  endless.className = 'shift-select-endless';
  el.append(
    title,
    list,
    endless,
    button('Back', () => on.back()),
  );
  root.append(el);
  return () => el.remove();
}
