// Day 2 HUD: ticket rail, register prompt, station actions, the pass, subtitles with speaker names,
// gauges, instructions, pause and the end-of-shift receipt. Touches the DOM only on change.

import type { StationPhase } from '../core/barista';
import {
  atRegister,
  type Rush,
  type RushAction,
  type RushCustomer,
  type RushPhase,
} from '../core/rush';
import type { Utterance } from '../core/speech';
import { customerDef, type CustomerId } from '../data/customers';
import { DRINK_NAME, formatCents, LUKEWARM, orderLabel, type ShiftSummary } from '../sim/rush';
import { createGauges, type GaugeMode } from './gauges';
import { instruction } from './instructions';
import { esc } from './screens';

export interface RushHudCallbacks {
  action(a: RushAction): void;
  pause(p: boolean): void;
  restart(): void;
  title(): void;
  height(dir: -1 | 0 | 1): void;
  skip(): void;
  audioButtonsHtml: string;
  bindAudio(el: HTMLElement): void;
}

export interface RushHud {
  show(on: boolean): void;
  onSay(line: Utterance): void;
  /** Show a replayed line for `seconds`. */
  onReplay(speaker: string, text: string, seconds: number): void;
  onPhase(phase: RushPhase, r: Rush): void;
  setPaused(p: boolean): void;
  update(r: Rush, dt: number): void;
}

const GRADE_TEXT: Record<ShiftSummary['grade'], string> = {
  excellent: 'Cracker of a shift',
  good: 'Solid first shift',
  okay: 'Survived it',
  poor: 'Rough morning',
  disaster: 'Total disaster',
};

/** Customers whose tickets are on the rail, oldest ticket first. */
export function railOrder(r: Rush): RushCustomer[] {
  return r.customers
    .filter((c) => c.state === 'waiting')
    .sort((a, b) => (a.ticket ?? 0) - (b.ticket ?? 0));
}

export function createRushHud(root: HTMLElement, cb: RushHudCallbacks): RushHud {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  root.innerHTML = `
    <div id="rtopbar" class="hide">
      <div class="chip"><span class="k">Day 2</span><b>Morning rush</b></div>
      <div class="chip"><span class="k">Time</span><b id="rclock">7:00</b></div>
      <div class="chip"><span class="k">Served</span><b id="rserved">0/5</b></div>
      <div class="chip"><span class="k">Tips</span><b id="rtips">$0.00</b></div>
      <div class="spacer"></div>
      ${cb.audioButtonsHtml}
      <button class="iconbtn" id="rpauseBtn" aria-label="Pause">❚❚</button>
    </div>
    <div id="rail" aria-label="Order tickets"></div>
    <div id="pass" class="hide"></div>
    <div id="rinstr" class="hide"><div class="h"></div><div class="b"></div></div>
    <div id="rgauges" class="hide"></div>
    <div id="ractions"></div>
    <div id="rtouchHeight" class="hide"><button data-h="1" aria-label="Raise jug">▲</button><button data-h="-1" aria-label="Lower jug">▼</button></div>
    <div id="rsubs" class="gone" role="status" aria-live="polite"><div class="who"></div><div class="text"></div></div>
    <div id="rsummary" class="hide"></div>
    <div id="rpause" class="hide"><div class="box"><h3>Paused</h3><div class="titleBtns">
      <button class="btn" data-p="resume">Back to it</button>
      <button class="btn ghost" data-p="restart">Restart shift</button>
      <button class="btn ghost" data-p="title">Title screen</button></div></div></div>`;
  const $ = <T extends HTMLElement>(s: string): T => root.querySelector(s) as T;
  const topbar = $('#rtopbar');
  const rail = $('#rail');
  const pass = $('#pass');
  const instr = $('#rinstr');
  const actions = $('#ractions');
  const touchPad = $('#rtouchHeight');
  const subs = $('#rsubs');
  const subsWho = subs.querySelector('.who') as HTMLElement;
  const subsText = subs.querySelector('.text') as HTMLElement;
  const summary = $('#rsummary');
  const pauseEl = $('#rpause');
  const gauges = createGauges($('#rgauges'), touch);

  $('#rpauseBtn').onclick = () => cb.pause(true);
  cb.bindAudio(topbar);
  pauseEl.querySelectorAll<HTMLButtonElement>('button[data-p]').forEach((b) => {
    b.onclick = () => {
      const p = b.dataset.p;
      if (p === 'resume') cb.pause(false);
      else if (p === 'restart') cb.restart();
      else cb.title();
    };
  });
  subs.onclick = () => cb.skip();
  touchPad.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    const dir = Number(b.dataset.h) as -1 | 1;
    b.onpointerdown = (e) => {
      e.preventDefault();
      cb.height(dir);
    };
    b.onpointerup = b.onpointerleave = b.onpointercancel = () => cb.height(0);
  });

  let endQuote = '';
  let subFull = '';
  let subShown = 0;
  let subHideIn = 0;
  let actionKey = '';
  let instrKey = '';
  let railKey = '';
  const ticketEls = new Map<string, HTMLElement>();

  const setActions = (key: string, html: string): void => {
    if (key === actionKey) return;
    actionKey = key;
    actions.innerHTML = html;
    actions.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a as string;
        if (a === 'flatWhite' || a === 'longBlack') cb.action({ type: 'make', drink: a });
        else cb.action({ type: a } as RushAction);
      };
    });
  };
  const btn = (a: string, label: string, key: string, primary = true): string =>
    `<button class="btn small${primary ? '' : ' ghost'}" data-a="${a}">${esc(label)}${touch ? '' : ` <kbd>${key}</kbd>`}</button>`;

  const renderRail = (r: Rush): void => {
    const list = railOrder(r);
    const ready = r.barista.ready !== null;
    const key = `${list.map((c) => c.def.id).join(',')}|${ready}`;
    if (key !== railKey) {
      railKey = key;
      rail.innerHTML = '';
      ticketEls.clear();
      list.forEach((c, i) => {
        const el = document.createElement('div');
        el.className = 'ticket';
        el.innerHTML = `<div class="tn">#${c.ticket} · ${esc(c.def.name)}</div>
          <div class="tt">${esc(c.def.tag)}</div>
          <div class="to">${esc(orderLabel(c.def.order))}</div>
          <div class="tp"><i></i></div>
          <button class="btn small serve" data-c="${c.def.id}" ${ready ? '' : 'disabled'}>Serve${touch || !ready ? '' : ` <kbd>${i + 1}</kbd>`}</button>`;
        (el.querySelector('button') as HTMLButtonElement).onclick = () =>
          cb.action({ type: 'serve', customer: c.def.id as CustomerId });
        rail.appendChild(el);
        ticketEls.set(c.def.id, el);
      });
    }
    for (const c of list) {
      const el = ticketEls.get(c.def.id);
      if (!el) continue;
      const f = Math.max(0, c.patience / c.def.patience);
      const bar = el.querySelector('.tp i') as HTMLElement;
      bar.style.width = `${(f * 100).toFixed(0)}%`;
      const cls = f > 0.5 ? 'ok' : f > 0.22 ? 'warn' : 'bad';
      if (bar.className !== cls) bar.className = cls;
    }
  };

  let replayHold = 0;
  const showLine = (speaker: string, text: string): void => {
    subFull = text;
    subShown = 0;
    subHideIn = 0;
    if (speaker === 'gaz') subsWho.innerHTML = 'GAZ<small>Owner</small>';
    else {
      const d = customerDef(speaker as CustomerId);
      subsWho.innerHTML = `${esc(d.name.toUpperCase())}<small>${esc(d.tag)}</small>`;
    }
    subs.classList.toggle('customer', speaker !== 'gaz');
    subs.classList.remove('gone');
  };

  const stationPhaseMode = (p: StationPhase): GaugeMode =>
    p === 'grind' || p === 'shot' || p === 'steam' || p === 'pour' || p === 'water' ? p : '';

  return {
    show(on) {
      root.classList.toggle('hide', !on);
    },
    onSay(line) {
      if (line.key.startsWith('rush.end.')) endQuote = line.text;
      showLine(line.speaker, line.text);
    },
    onReplay(speaker, text, seconds) {
      showLine(speaker, text);
      replayHold = seconds;
    },
    onPhase(phase, r) {
      if (phase === 'intro') endQuote = '';
      topbar.classList.toggle('hide', phase === 'summary');
      summary.classList.toggle('hide', phase !== 'summary');
      if (phase === 'summary' && r.summary) {
        const s = r.summary;
        const quote = endQuote;
        summary.innerHTML = `<div class="verdictCard"><div class="paper">
          <div class="hd"><b>NO WUKKAS</b><span>DAY 2 · MORNING RUSH · SHIFT REPORT</span></div>
          <div class="stamp ${s.grade === 'excellent' || s.grade === 'good' ? 'hired' : s.grade === 'okay' ? 'almost' : s.grade === 'poor' ? 'failed' : 'disaster'}">${esc(GRADE_TEXT[s.grade])}</div>
          <div class="rows">
            <div class="kv"><span>Orders completed</span><b>${s.ordersCompleted}/${s.customers}</b></div>
            <div class="kv"><span>Correct orders</span><b>${s.correctOrders}/${s.customers}</b></div>
            <div class="kv"><span>Walk-outs</span><b>${s.walkouts}</b></div>
            <div class="kv"><span>Average serve time</span><b>${s.ordersCompleted ? `${s.avgServeSeconds.toFixed(0)} s` : '–'}</b></div>
            <div class="kv"><span>Customer satisfaction</span><b>${s.satisfaction}%</b></div>
            <div class="kv"><span>Tips</span><b>${formatCents(s.tipsCents)}</b></div>
            <div class="kv"><span>Drinks wasted</span><b>${s.wasted}</b></div>
          </div>
          ${quote ? `<div class="quote">“${esc(quote)}”<br><small>— Gaz, owner</small></div>` : ''}
          <div class="cardBtns"><button class="btn" data-s="again">Run the rush again</button><button class="btn ghost" data-s="title">Title screen</button></div>
        </div></div>`;
        summary.querySelectorAll<HTMLButtonElement>('button[data-s]').forEach((b) => {
          b.onclick = () => (b.dataset.s === 'again' ? cb.restart() : cb.title());
        });
        (summary.querySelector('button') as HTMLButtonElement).focus({ preventScroll: true });
      }
    },
    setPaused(p) {
      pauseEl.classList.toggle('hide', !p);
    },
    update(r, dt) {
      // Subtitles.
      if (replayHold > 0) replayHold -= dt;
      if (r.speech.current || replayHold > 0) {
        subHideIn = 0.35;
        if (subShown < subFull.length) {
          subShown = Math.min(subFull.length, subShown + dt * 70);
          subsText.textContent = subFull.slice(0, Math.ceil(subShown));
        }
      } else if (subHideIn > 0) {
        subHideIn -= dt;
        if (subHideIn <= 0) subs.classList.add('gone');
      }
      if (r.phase === 'summary') {
        rail.innerHTML = '';
        railKey = '';
        actions.innerHTML = '';
        actionKey = '';
        instr.classList.add('hide');
        pass.classList.add('hide');
        gauges.update('', r.barista);
        return;
      }

      // Top bar: 7:00 am plus six game-minutes per real minute... rushed.
      const mins = Math.floor(r.serviceTime / 10);
      (root.querySelector('#rclock') as HTMLElement).textContent =
        `7:${String(mins).padStart(2, '0')}`;
      const served = r.records.length;
      (root.querySelector('#rserved') as HTMLElement).textContent =
        `${served}/${r.customers.length}`;
      (root.querySelector('#rtips') as HTMLElement).textContent = formatCents(
        r.records.reduce((s, x) => s + x.tipCents, 0),
      );

      renderRail(r);
      const b = r.barista;
      const reg = r.phase === 'service' ? atRegister(r) : null;

      // The pass.
      if (b.ready) {
        const cold = b.ready.temp < LUKEWARM + 4;
        pass.classList.remove('hide');
        pass.classList.toggle('cold', cold);
        pass.innerHTML = `<span class="k">On the pass</span> <b>${DRINK_NAME[b.ready.type]}</b> · ${b.ready.temp.toFixed(0)} °C${cold ? ' · going cold!' : ''}`;
      } else pass.classList.add('hide');

      // Actions.
      const parts: string[] = [];
      let key = `${r.phase}|${b.phase}|${reg?.def.id ?? ''}|${b.ready ? 1 : 0}|${b.espresso.dose >= 8 && !b.espresso.grinding}|${b.pour.poured > 0}`;
      if (r.phase === 'service') {
        if (reg) parts.push(btn('takeOrder', `Take ${reg.def.name.split(' ')[0]}'s order`, 'T'));
        if (b.phase === 'idle' && !b.ready) {
          parts.push(
            btn('flatWhite', 'Make a flat white', 'F'),
            btn('longBlack', 'Make a long black', 'L'),
          );
        } else if (b.phase === 'grind' && b.espresso.dose >= 8 && !b.espresso.grinding) {
          parts.push(btn('next', 'Tamp & lock in', 'Enter'));
        } else if (b.phase === 'pour' && b.pour.poured > 0)
          parts.push(btn('next', 'Hand it over', 'Enter'));
        if (b.phase !== 'idle')
          parts.push(btn('bin', b.ready ? 'Bin it' : 'Bin it, start again', 'B', false));
      } else key = r.phase;
      setActions(key, parts.join(''));

      // Instruction.
      let ins: { title: string; html: string } | null = null;
      if (r.phase === 'service') {
        if (b.phase === 'idle') {
          const waiting = railOrder(r).length;
          ins =
            reg && waiting === 0
              ? {
                  title: 'Register',
                  html: `${esc(reg.def.name)} is at the register. Take the order${touch ? '' : ' (<kbd>T</kbd>)'}.`,
                }
              : waiting > 0
                ? {
                    title: 'Make a drink',
                    html: `Check the tickets, then make a <b>flat white</b> or a <b>long black</b>${touch ? '' : ' (<kbd>F</kbd> / <kbd>L</kbd>)'}.`,
                  }
                : { title: 'Ready', html: 'Waiting for the next customer…' };
        } else if (b.phase === 'ready') {
          ins = {
            title: 'Serve it',
            html: `Hand it to the right customer: click their ticket's <b>Serve</b>${touch ? '' : ' (or press its number)'}.`,
          };
        } else if (b.phase === 'lock') ins = { title: 'Tamp', html: 'Tamping and locking in…' };
        else ins = instruction(b, touch);
      }
      const ik = ins ? ins.title + ins.html : '';
      if (ik !== instrKey) {
        instrKey = ik;
        instr.classList.toggle('hide', !ins);
        if (ins) {
          (instr.querySelector('.h') as HTMLElement).textContent = ins.title;
          (instr.querySelector('.b') as HTMLElement).innerHTML = ins.html;
        }
      }
      gauges.update(r.phase === 'service' ? stationPhaseMode(b.phase) : '', b);
      touchPad.classList.toggle('hide', !(touch && b.phase === 'pour'));
    },
  };
}
