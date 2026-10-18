// The title screen: every way into the game on one menu (the trial, Day 2, the week, Endless Rush,
// latte-art practice, scores, settings), and what each button does. The Day 1 HUD shows and hides it; the
// buttons' actions come from src/app/title.ts, which also redraws it on the way back from a shift
// (Endless Rush unlocks after one).

import { esc } from '../screens';
import { menuKeys } from './keys';

export interface TitleCallbacks {
  /** Day 1: start the trial. */
  start(): void;
  /** Start Day 2. */
  day2(): void;
  /** Open shift select (the week's shifts, the shop and Endless Rush). */
  shifts(): void;
  /** Endless Rush (only offered once it's unlocked). */
  endless(): void;
  /** Why Endless Rush is still locked (one line), or null once it's open. Read on every draw. */
  endlessLock(): string | null;
  /** Latte-art practice. */
  practice(): void;
  /** The local leaderboard. */
  scores(): void;
  /** Open the settings panel (sound, listening, pour). */
  settings(): void;
}

type TitleAct = 'start' | 'day2' | 'shifts' | 'endless' | 'practice' | 'scores' | 'settings';

interface Mode {
  act: TitleAct;
  name: string;
  /** One line under the name (also the button's description for screen readers). */
  sub: string;
  primary?: boolean;
  disabled?: boolean;
}

function modes(endlessLock: string | null): Mode[] {
  return [
    {
      act: 'start',
      name: 'Day 1: Start the trial',
      sub: 'One flat white with a heart for Gaz. Three goes.',
      primary: true,
    },
    {
      act: 'day2',
      name: 'Day 2: The morning rush',
      sub: 'Six customers. Take every order by ear.',
    },
    { act: 'shifts', name: 'The week: shifts', sub: 'Monday to Friday, tips and café upgrades.' },
    {
      act: 'endless',
      name: 'Endless Rush',
      sub: endlessLock ?? 'Keep serving until the third walk-out.',
      disabled: endlessLock !== null,
    },
    { act: 'practice', name: 'Latte art practice', sub: 'No customers, no clock. Just pour.' },
    { act: 'scores', name: 'Scores', sub: 'Your best shifts and Endless runs on this device.' },
    { act: 'settings', name: 'Settings', sub: 'Sound, subtitles, learning mode and pour feel.' },
  ];
}

const modeButton = (m: Mode): string =>
  `<button type="button" class="mode${m.primary ? ' primary' : ''}" data-act="${m.act}" aria-label="${esc(m.name)}" aria-describedby="title-sub-${m.act}"${m.disabled ? ' disabled' : ''}><b>${esc(m.name)}</b><small id="title-sub-${m.act}">${esc(m.sub)}</small></button>`;

export function titleHtml(touch: boolean, endlessLock: string | null): string {
  const controls = touch
    ? `<b>Drag</b><span>move the jug / wand depth</span>
       <b>Press &amp; hold</b><span>grind, steam, pour</span>
       <b>▲ ▼</b><span>jug height while pouring</span>`
    : `<b>Mouse</b><span>move the jug · set steam depth</span>
       <b>Hold click / Space</b><span>grind · steam · pour (trackpad: use Space)</span>
       <b>1 · 2 · 3</b><span>jug high · lift · low (trackpad-friendly)</span>
       <b>Scroll · W / S</b><span>fine jug height while pouring</span>
       <b>Enter</b><span>confirm · next</span>
       <b>Esc</b><span>pause</span>`;
  return `<div class="titleCard">
    <header class="titleHead">
      <div class="kicker">Crown St, Surry Hills · 6:40 am</div>
      <h1>No Wukkas Café</h1>
      <p>You want the barista job. Gaz, the owner, wants a flat white with a heart on top, and he's watching every move. Three goes. Don't stuff it up.</p>
    </header>
    <nav class="modes" aria-label="Play">${modes(endlessLock).map(modeButton).join('')}</nav>
    <div class="controls" role="group" aria-label="Controls">${controls}</div>
  </div>`;
}

/** Draw the title screen into `el` and wire its buttons. Safe to call again to redraw it. */
export function renderTitle(el: HTMLElement, touch: boolean, cb: TitleCallbacks): void {
  el.innerHTML = titleHtml(touch, cb.endlessLock());
  const act: Record<TitleAct, () => void> = {
    start: () => cb.start(),
    day2: () => cb.day2(),
    shifts: () => cb.shifts(),
    endless: () => {
      if (cb.endlessLock() === null) cb.endless();
    },
    practice: () => cb.practice(),
    scores: () => cb.scores(),
    settings: () => cb.settings(),
  };
  el.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => {
    const a = b.dataset.act as TitleAct;
    b.onclick = () => act[a]();
  });
  menuKeys(el);
}
