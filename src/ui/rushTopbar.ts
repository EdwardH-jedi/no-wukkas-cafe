// The rush's top chips: which shift this is (Day 2, a day of the week, or Endless), the clock,
// served and walk-outs, and tips. Pure labels, and an updater that writes the DOM only when a
// number on it changes (it runs every frame).

import type { Rush } from '../core/rush';
import { shiftDef } from '../core/week/progress';
import { ENDLESS } from '../data/week';
import { formatCents } from '../sim/rush';
import { esc } from './screens';

/** Which shift: "Day 2 · Morning rush", "Week 1 · Tuesday" or "Endless · Rush". */
export function dayChip(r: Rush): [string, string] {
  if (!r.week) return ['Day 2', 'Morning rush'];
  if (r.week.endless) return ['Endless', 'Rush'];
  return [`Week ${r.week.week ?? 1}`, shiftDef(r.week.shiftIndex).day];
}

/** 7:00 am plus six game-minutes per real minute... rushed. */
export function clockText(serviceTime: number): string {
  const mins = Math.max(0, Math.floor(serviceTime / 10));
  return `${7 + Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

/** Customers who gave up waiting this shift. */
export function walkoutCount(r: Rush): number {
  let n = 0;
  for (const c of r.customers) if (c.outcome === 'walkout') n++;
  return n;
}

/** Served so far: out of the shift's customers, or a plain count in Endless (no end to them). */
export const servedText = (r: Rush, served: number): string =>
  r.week?.endless ? String(served) : `${served}/${r.customers.length}`;

/** Walk-outs: Endless ends at its last one, so it shows how many it allows. */
export const walkoutText = (r: Rush, n: number): string =>
  r.week?.endless ? `${n}/${ENDLESS.maxWalkouts}` : String(n);

/** The chips' markup (the top bar adds its buttons after them). */
export const TOP_CHIPS_HTML = `
      <div class="chip" id="rday"><span class="k">Day 2</span><b>Morning rush</b></div>
      <div class="chip rwide"><span class="k">Time</span><b id="rclock">7:00</b></div>
      <div class="chip" id="rcount" title="Served · walk-outs"><span class="k">Served</span><b id="rserved">0/6</b><span class="k">Walk-outs</span><b id="rwalk">0</b></div>
      <div class="chip rwide"><span class="k">Tips</span><b id="rtips">$0.00</b></div>`;

export interface TopChips {
  /** A shift (re)starts: which one it is. */
  setDay(r: Rush): void;
  update(r: Rush): void;
}

export function createTopChips(root: HTMLElement): TopChips {
  const $ = (s: string): HTMLElement => root.querySelector(s) as HTMLElement;
  const day = $('#rday');
  const clock = $('#rclock');
  const served = $('#rserved');
  const walk = $('#rwalk');
  const tips = $('#rtips');
  const walkChip = walk.previousElementSibling as HTMLElement;
  // Last values written (-1: write on the first update).
  let mins = -1;
  let nServed = -1;
  let nTotal = -1;
  let nWalk = -1;
  let cents = -1;
  return {
    setDay(r) {
      const [k, v] = dayChip(r);
      day.innerHTML = `<span class="k">${esc(k)}</span><b>${esc(v)}</b>`;
      day.dataset.mode = !r.week ? 'day2' : r.week.endless ? 'endless' : 'week';
      mins = nServed = nTotal = nWalk = cents = -1;
    },
    update(r) {
      const m = Math.floor(r.serviceTime / 10);
      if (m !== mins) {
        mins = m;
        clock.textContent = clockText(r.serviceTime);
      }
      const s = r.records.length;
      if (s !== nServed || r.customers.length !== nTotal) {
        nServed = s;
        nTotal = r.customers.length;
        served.textContent = servedText(r, s);
      }
      const w = walkoutCount(r);
      if (w !== nWalk) {
        nWalk = w;
        walk.textContent = walkoutText(r, w);
        walkChip.classList.toggle('bad', w > 0);
      }
      let t = 0;
      for (const x of r.records) t += x.tipCents;
      if (t !== cents) {
        cents = t;
        tips.textContent = formatCents(t);
      }
    },
  };
}
