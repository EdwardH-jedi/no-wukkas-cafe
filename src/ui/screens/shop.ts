// The café upgrade shop, opened from shift select: every upgrade with its price and what it does,
// owned or not, and the till. A buy the till can't cover is refused with the reason in a status
// line; a buy that goes through updates the till and the row in place (focus stays put). Built
// with textContent only.

import type { SaveV2 } from '../../sim/contracts/save';
import { focusQuietly, menuKeys } from './keys';
import { shopLines, tillLine, type ShopLine } from './labels';

export interface ShopActions {
  /** Try to buy upgrade `id`: the save afterwards (unchanged when refused) and one line on what
   *  happened. */
  buy(id: string): { save: SaveV2; message: string };
  /** Back to shift select. */
  back(): void;
}

const BUY_TEXT: Record<ShopLine['state'], string> = { owned: 'Owned', buy: 'Buy', short: 'Buy' };

function paintRow(b: HTMLButtonElement, line: ShopLine): void {
  b.textContent = BUY_TEXT[line.state];
  b.dataset.status = line.state;
  // An owned upgrade's button stays focusable (focus doesn't jump after a buy); pressing it just
  // says it's already yours.
  b.setAttribute('aria-disabled', String(line.state === 'owned'));
  b.setAttribute(
    'aria-label',
    line.state === 'owned' ? `${line.name}: owned` : `Buy ${line.name} for ${line.price}`,
  );
}

/** Shows the shop in `root`; returns a function that removes it. */
export function renderShop(
  root: HTMLElement,
  save: SaveV2,
  on: ShopActions,
  /** A line under the title, e.g. that progress won't be saved in this browser. */
  note = '',
): () => void {
  const el = document.createElement('section');
  el.className = 'shop';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'shop-title');
  const card = document.createElement('div');
  card.className = 'shop-card';
  const h = document.createElement('h2');
  h.id = 'shop-title';
  h.textContent = 'Café upgrades';
  const till = document.createElement('p');
  till.className = 'shop-till';
  till.textContent = tillLine(save);
  card.append(h, till);
  if (note) {
    const p = document.createElement('p');
    p.className = 'shift-select-note';
    p.textContent = note;
    card.append(p);
  }
  const list = document.createElement('ul');
  const buttons = new Map<string, HTMLButtonElement>();
  const msg = document.createElement('p');
  msg.className = 'shop-msg';
  msg.setAttribute('role', 'status');
  const repaint = (s: SaveV2): void => {
    till.textContent = tillLine(s);
    for (const line of shopLines(s)) {
      const b = buttons.get(line.id);
      if (b) paintRow(b, line);
    }
  };
  for (const line of shopLines(save)) {
    const li = document.createElement('li');
    li.dataset.upgrade = line.id;
    const name = document.createElement('b');
    name.textContent = line.name;
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = line.price;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = line.effect;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.upgrade = line.id;
    b.addEventListener('click', () => {
      const r = on.buy(line.id);
      msg.textContent = r.message;
      repaint(r.save);
    });
    buttons.set(line.id, b);
    paintRow(b, line);
    li.append(name, price, effect, b);
    list.append(li);
  }
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'shop-back';
  back.textContent = 'Back to shifts';
  back.addEventListener('click', () => on.back());
  card.append(list, msg, back);
  el.append(card);
  menuKeys(el, { modal: true, escape: () => on.back() });
  root.append(el);
  focusQuietly(
    [...buttons.values()].find((b) => b.dataset.status === 'buy') ??
      [...buttons.values()].find((b) => b.dataset.status === 'short') ??
      back,
  );
  return () => el.remove();
}
