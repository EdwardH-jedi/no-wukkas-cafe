// The title screen: its markup and what each of its buttons does. The Day 1 HUD shows and hides
// it; the buttons' actions come from src/app/title.ts.

import { titleHtml } from '../screens';

export interface TitleCallbacks {
  /** Day 1: start the trial. */
  start(): void;
  /** Start Day 2. */
  day2(): void;
  /** Open shift select (the week's shifts and Endless Rush). */
  shifts(): void;
  /** Latte-art practice. */
  practice(): void;
  /** Open the sound settings. */
  sound(): void;
}

/** Draw the title screen into `el` and wire its buttons. */
export function renderTitle(el: HTMLElement, touch: boolean, cb: TitleCallbacks): void {
  el.innerHTML = titleHtml(touch);
  el.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.act === 'day2') cb.day2();
      else if (b.dataset.act === 'shifts') cb.shifts();
      else if (b.dataset.act === 'practice') cb.practice();
      else if (b.dataset.act === 'sound') cb.sound();
      else cb.start();
    };
  });
}
