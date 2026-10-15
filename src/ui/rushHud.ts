// Day 2 HUD: ticket rail, register prompt, station actions, the pass, subtitles with speaker names,
// gauges, instructions, pause and the end-of-shift receipt (screens/shiftReport.ts). Touches the DOM
// only on change.

import type { Barista } from '../core/barista';
import {
  atCounter,
  atRegister,
  presentSpeaker,
  type Rush,
  type RushAction,
  type RushCustomer,
  type RushPhase,
} from '../core/rush';
import type { Utterance } from '../core/speech';
import { customerDef, type CustomerId } from '../data/customers';
import { shiftDef } from '../core/week/progress';
import { answerAsText, isAnswerKey, transcriptVisible, type ListenStage } from '../sim/listening';
import { DRINK_NAME, formatCents, LUKEWARM, MILK_NAME, orderLabel } from '../sim/rush';
import { createEventCard, EVENT_KEYS } from './eventCard';
import { createGauges, type GaugeMode } from './gauges';
import { instruction } from './instructions';
import { createPos } from './pos';
import { createRail, nextTicket, railOrder } from './rushRail';
import { esc } from './screens';
import { renderShiftReport, type ShiftReportCallbacks } from './screens/shiftReport';
import { subtitleMode, type ListenSettings } from './settings';

export { nextTicket, railOrder } from './rushRail';

export interface RushHudCallbacks {
  action(a: RushAction): void;
  pause(p: boolean): void;
  restart(): void;
  title(): void;
  /** The end-of-shift report's buttons. */
  report: ShiftReportCallbacks;
  height(dir: -1 | 0 | 1): void;
  skip(): void;
  audioButtonsHtml: string;
  bindAudio(el: HTMLElement): void;
  settings(): ListenSettings;
  /** Can the player hear this line at all (voices on, and a recording or a browser voice)? */
  audible(line: Utterance): boolean;
}

export interface RushHud {
  show(on: boolean): void;
  onSay(line: Utterance): void;
  /** Show a replayed line for `seconds`. */
  onReplay(speaker: string, text: string, seconds: number): void;
  onPhase(phase: RushPhase, r: Rush): void;
  /** The player asked the customer something. */
  onAsk(text: string): void;
  onTicket(c: RushCustomer): void;
  /** A hand-back set a misheard ticket straight: mark what was misheard on it. */
  onTicketFixed(c: RushCustomer): void;
  /** Enter at the register: ring up the selection. */
  ringUp(): boolean;
  setPaused(p: boolean): void;
  update(r: Rush, dt: number): void;
}

const stageOf = (c: RushCustomer): ListenStage =>
  c.state === 'ordering' ? 'speaking' : c.state === 'deciding' ? 'deciding' : 'rungUp';

export function createRushHud(root: HTMLElement, cb: RushHudCallbacks): RushHud {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  root.innerHTML = `
    <div id="rtopbar" class="hide">
      <div class="chip" id="rday"><span class="k">Day 2</span><b>Morning rush</b></div>
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
    <div id="revent" class="hide" role="group" aria-label="Something's come up"><div class="ek">Something's come up</div><div class="h"></div><div class="b"></div></div>
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
  // The shot card's Stop button: the same as Enter while steaming during the shot.
  const gauges = createGauges($('#rgauges'), touch, () => cb.action({ type: 'next' }));
  const pos = createPos(root, touch, cb.action);
  // The shift event waiting for an answer (week mode): what happened and the choices.
  const eventCard = createEventCard($('#revent'), touch, (choice) =>
    cb.action({ type: 'eventChoice', choice }),
  );

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

  const setActions = (key: string, html: string): void => {
    if (key === actionKey) return;
    actionKey = key;
    actions.innerHTML = html;
    actions.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a as string;
        if (a === 'makeNext') {
          if (lastRush) makeFor(nextTicket(lastRush));
        } else cb.action({ type: a } as RushAction);
      };
    });
  };
  const btn = (a: string, label: string, key: string, primary = true): string =>
    `<button class="btn small${primary ? '' : ' ghost'}" data-a="${a}">${esc(label)}${touch ? '' : ` <kbd>${key}</kbd>`}</button>`;

  let lastRush: Rush | null = null;
  const makeFor = (c: RushCustomer | null): void => {
    if (c?.heard) cb.action({ type: 'make', drink: c.heard.type, milk: c.heard.milk ?? 'full' });
  };

  const railView = createRail(rail, touch, {
    make: (c) => makeFor(c),
    serve: (key) => cb.action({ type: 'serve', customer: key }),
  });

  let replayHold = 0;
  /** The order/answer being said, whose transcript follows the subtitle rules. */
  let listenLine: Utterance | null = null;
  let listenShown: boolean | null = null;
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

  /** A flat white's shot shows the milk gauge under the timer: the milk can go on now. */
  const stationMode = (b: Barista): GaugeMode => {
    const p = b.phase;
    if (p === 'shotSteam' || (p === 'shot' && b.drink === 'flatWhite')) return 'shotSteam';
    return p === 'grind' || p === 'shot' || p === 'steam' || p === 'pour' || p === 'water' ? p : '';
  };

  return {
    show(on) {
      root.classList.toggle('hide', !on);
    },
    onSay(line) {
      if (line.key.startsWith('rush.end.')) endQuote = line.text;
      listenLine = line.listen ? line : null;
      listenShown = null;
      showLine(line.speaker, line.listen ? '' : line.text);
    },
    onAsk(text) {
      pos.onAsk(text);
    },
    onTicket(c) {
      railView.onTicket(c);
      pos.onTicket(c, cb.settings().learning);
    },
    onTicketFixed(c) {
      railView.onTicketFixed(c);
    },
    ringUp() {
      return pos.ringUp();
    },
    onReplay(speaker, text, seconds) {
      showLine(speaker, text);
      replayHold = seconds;
    },
    onPhase(phase, r) {
      if (phase === 'intro') {
        endQuote = '';
        railView.reset();
        const [k, v] = !r.week
          ? ['Day 2', 'Morning rush']
          : r.week.endless
            ? ['Endless', 'Rush']
            : [`Week ${r.week.week ?? 1}`, shiftDef(r.week.shiftIndex).day];
        $('#rday').innerHTML = `<span class="k">${esc(k)}</span><b>${esc(v)}</b>`;
      }
      topbar.classList.toggle('hide', phase === 'summary');
      summary.classList.toggle('hide', phase !== 'summary');
      if (phase === 'summary' && r.summary)
        renderShiftReport(summary, r, r.summary, endQuote, cb.report);
    },
    setPaused(p) {
      pauseEl.classList.toggle('hide', !p);
    },
    update(r, dt) {
      // Subtitles. Orders and answers only show when the rules allow: listening is the game.
      if (listenLine && r.speech.current === listenLine) {
        const c = listenLine ? presentSpeaker(r, listenLine.speaker) : null;
        const s = cb.settings();
        const vis = c
          ? transcriptVisible(subtitleMode(s), s.learning, stageOf(c), c.listen.repeats) ||
            answerAsText(isAnswerKey(listenLine.key), cb.audible(listenLine))
          : true;
        if (vis !== listenShown) {
          listenShown = vis;
          subFull = vis ? listenLine.text : '';
          subShown = 0;
          subsText.innerHTML = vis ? '' : '<i class="listen">🔊 Listen…</i>';
        }
      }
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
        railView.clear();
        actions.innerHTML = '';
        actionKey = '';
        instr.classList.add('hide');
        pass.classList.add('hide');
        eventCard.update(r);
        gauges.update('', r.barista);
        return;
      }

      // Top bar: 7:00 am plus six game-minutes per real minute... rushed.
      const mins = Math.floor(r.serviceTime / 10);
      (root.querySelector('#rclock') as HTMLElement).textContent =
        `7:${String(mins).padStart(2, '0')}`;
      const served = r.records.length;
      (root.querySelector('#rserved') as HTMLElement).textContent = r.week?.endless
        ? String(served)
        : `${served}/${r.customers.length}`;
      (root.querySelector('#rtips') as HTMLElement).textContent = formatCents(
        r.records.reduce((s, x) => s + x.tipCents, 0),
      );

      lastRush = r;
      railView.update(r);
      pos.update(r);
      eventCard.update(r);
      const b = r.barista;
      const reg = r.phase === 'service' ? atRegister(r) : null;
      const counter = r.phase === 'service' ? atCounter(r) : null;
      const next = nextTicket(r);

      // The pass.
      if (b.ready) {
        const cold = b.ready.temp < LUKEWARM + 4;
        pass.classList.remove('hide');
        pass.classList.toggle('cold', cold);
        const milk =
          b.ready.milkType && b.ready.milkType !== 'full' ? `${MILK_NAME[b.ready.milkType]} ` : '';
        pass.innerHTML = `<span class="k">On the pass</span> <b>${milk}${DRINK_NAME[b.ready.type]}</b> · ${b.ready.temp.toFixed(0)} °C${cold ? ' · going cold!' : ''}`;
      } else pass.classList.add('hide');

      // Actions.
      const parts: string[] = [];
      // Their own shift event comes first: the order waits for the answer.
      const held = reg !== null && r.shiftEvents.current?.customer === reg;
      let key = `${r.phase}|${b.phase}|${reg?.def.id ?? ''}|${held ? 1 : 0}|${b.ready ? 1 : 0}|${b.espresso.dose >= 8 && !b.espresso.grinding}|${b.pour.poured > 0}|${next?.def.id ?? ''}`;
      if (r.phase === 'service') {
        if (reg && !held)
          parts.push(btn('takeOrder', `Take ${reg.def.name.split(' ')[0]}'s order`, 'T'));
        if (b.phase === 'idle' && !b.ready) {
          if (next?.heard)
            parts.push(
              btn(
                'makeNext',
                `Make #${next.ticket}: ${orderLabel(next.heard).split(' · ')[0]}`,
                'F',
              ),
            );
        } else if (b.phase === 'grind' && b.espresso.dose >= 8 && !b.espresso.grinding) {
          parts.push(btn('next', 'Tamp & lock in', 'Enter'));
        } else if (b.phase === 'pour' && b.pour.poured > 0)
          parts.push(btn('next', 'Hand it over', 'Enter'));
        if (b.phase !== 'idle')
          parts.push(btn('bin', b.ready ? 'Bin it' : 'Bin it, start again', 'B', false));
      } else key = r.phase;
      setActions(key, parts.join(''));
      // While pouring, the buttons sit off to the side, clear of the cup the pointer steers over
      // (as on Day 1): a button under the pointer swallows its moves, and a stray click ends it.
      // Same with a drink on the pass: "Bin it" would sit right over the cup.
      actions.classList.toggle(
        'side',
        r.phase === 'service' && (b.phase === 'pour' || b.ready !== null),
      );

      // Instruction.
      let ins: { title: string; html: string } | null = null;
      if (r.phase === 'service') {
        if (counter) {
          ins = {
            title: 'Take the order',
            html:
              counter.state === 'ordering'
                ? `Listen to ${esc(counter.def.callName)}…`
                : `Ring up what ${esc(counter.def.callName)} said. Didn't catch it? Replay${touch ? '' : ' (<kbd>R</kbd>)'}, ask them to repeat, or ask about one thing.`,
          };
        } else if (held && reg && b.phase === 'idle') {
          // Their order waits for the event card's answer: T would do nothing yet.
          const n = r.shiftEvents.current?.def.choices.length ?? 0;
          ins = {
            title: 'Answer first',
            html: `${esc(reg.def.callName)}'s order waits for your answer on the card${touch || n === 0 ? '' : ` (<kbd>1</kbd>–<kbd>${Math.min(n, EVENT_KEYS)}</kbd>)`}.`,
          };
        } else if (b.phase === 'idle') {
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
                    html: `Make the next ticket${touch ? '' : ' (<kbd>F</kbd>)'}, or click <b>Make</b> on any ticket. The ticket says what you rang up.`,
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
      gauges.update(r.phase === 'service' ? stationMode(b) : '', b, b.phase === 'shotSteam');
      touchPad.classList.toggle('hide', !(touch && b.phase === 'pour'));
    },
  };
}
