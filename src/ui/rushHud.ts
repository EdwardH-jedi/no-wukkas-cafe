// Day 2 HUD: ticket rail, register prompt, station actions, the pass, subtitles with speaker names,
// gauges, instructions, pause and the end-of-shift receipt. Touches the DOM only on change.

import type { StationPhase } from '../core/barista';
import {
  atCounter,
  atRegister,
  type Rush,
  type RushAction,
  type RushCustomer,
  type RushPhase,
} from '../core/rush';
import type { Utterance } from '../core/speech';
import { customerDef, type CustomerId } from '../data/customers';
import {
  answerAsText,
  cueSpans,
  isAnswerKey,
  summariseListening,
  transcriptVisible,
  wrongFields,
  type ListenStage,
} from '../sim/listening';
import {
  DRINK_NAME,
  formatCents,
  LUKEWARM,
  MILK_NAME,
  orderLabel,
  type ShiftSummary,
} from '../sim/rush';
import { createGauges, type GaugeMode } from './gauges';
import { instruction } from './instructions';
import { createPos, marked } from './pos';
import { esc } from './screens';
import { subtitleMode, type ListenSettings } from './settings';

export interface RushHudCallbacks {
  action(a: RushAction): void;
  pause(p: boolean): void;
  restart(): void;
  title(): void;
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
  /** Enter at the register: ring up the selection. */
  ringUp(): boolean;
  setPaused(p: boolean): void;
  update(r: Rush, dt: number): void;
}

/** The ticket being made next for a drink type (oldest first), or the oldest of any. */
export function nextTicket(r: Rush, type?: string): RushCustomer | null {
  return railOrder(r).find((c) => c.heard && (!type || c.heard.type === type)) ?? null;
}

const DIFF_NAME = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const;

/** Receipt rows for the listening side of the shift. */
function listenRows(r: Rush): string {
  const l = summariseListening(r.listening);
  return `<div class="kv"><span>Orders heard right (${DIFF_NAME[r.difficulty]})</span><b>${l.heardRight}/${l.orders}</b></div>
    <div class="kv"><span>Replays · repeats · questions</span><b>${l.replays} · ${l.repeats} · ${l.questions}</b></div>`;
}

/** What was actually said, for every ticket rung up wrong, with the missed words marked. */
function misheardList(r: Rush): string {
  const items = r.listening
    .filter((x) => x.wrong.length > 0)
    .map((x) => {
      const c = r.customers.find((k) => k.def.id === x.customer);
      if (!c || !x.heard) return '';
      const wrong = wrongFields(x.heard, x.truth);
      return `<li><b>${esc(c.def.callName)}</b> said “${marked(c.line.text, cueSpans(c.line), wrong)}”<br><small>You rang up ${esc(orderLabel(x.heard))} · they wanted ${esc(orderLabel(x.truth))}</small></li>`;
    })
    .join('');
  return items
    ? `<div class="misheard"><div class="mh">Listen again</div><ul>${items}</ul></div>`
    : '';
}

const stageOf = (c: RushCustomer): ListenStage =>
  c.state === 'ordering' ? 'speaking' : c.state === 'deciding' ? 'deciding' : 'rungUp';

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
  const pos = createPos(root, touch, cb.action);

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

  const renderRail = (r: Rush): void => {
    const list = railOrder(r);
    const ready = r.barista.ready !== null;
    const canMake = r.barista.phase === 'idle' && !ready;
    const key = `${list.map((c) => `${c.def.id}:${c.heard ? orderLabel(c.heard) : ''}`).join(',')}|${ready}|${canMake}`;
    if (key !== railKey) {
      railKey = key;
      rail.innerHTML = '';
      ticketEls.clear();
      list.forEach((c, i) => {
        const el = document.createElement('div');
        el.className = 'ticket';
        // The ticket shows what was rung up, right or wrong: that's what gets made.
        el.innerHTML = `<div class="tn">#${c.ticket} · ${esc(c.def.name)}</div>
          <div class="tt">${esc(c.def.tag)}</div>
          <div class="to">${esc(c.heard ? orderLabel(c.heard) : '')}</div>
          <div class="tp"><i></i></div>
          <div class="tb"><button class="btn small ghost make" ${canMake ? '' : 'disabled'}>Make</button>
          <button class="btn small serve" data-c="${c.def.id}" ${ready ? '' : 'disabled'}>Serve${touch || !ready ? '' : ` <kbd>${i + 1}</kbd>`}</button></div>`;
        (el.querySelector('.serve') as HTMLButtonElement).onclick = () =>
          cb.action({ type: 'serve', customer: c.def.id as CustomerId });
        (el.querySelector('.make') as HTMLButtonElement).onclick = () => makeFor(c);
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

  const stationPhaseMode = (p: StationPhase): GaugeMode =>
    p === 'grind' || p === 'shot' || p === 'steam' || p === 'pour' || p === 'water' ? p : '';

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
      pos.onTicket(c, cb.settings().learning);
    },
    ringUp() {
      return pos.ringUp();
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
            ${listenRows(r)}
          </div>
          ${misheardList(r)}
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
      // Subtitles. Orders and answers only show when the rules allow: listening is the game.
      if (listenLine && r.speech.current === listenLine) {
        const c = r.customers.find((x) => x.def.id === listenLine?.speaker);
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

      lastRush = r;
      renderRail(r);
      pos.update(r);
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
      let key = `${r.phase}|${b.phase}|${reg?.def.id ?? ''}|${b.ready ? 1 : 0}|${b.espresso.dose >= 8 && !b.espresso.grinding}|${b.pour.poured > 0}|${next?.def.id ?? ''}`;
      if (r.phase === 'service') {
        if (reg) parts.push(btn('takeOrder', `Take ${reg.def.name.split(' ')[0]}'s order`, 'T'));
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
      actions.classList.toggle('side', r.phase === 'service' && b.phase === 'pour');

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
      gauges.update(r.phase === 'service' ? stationPhaseMode(b.phase) : '', b);
      touchPad.classList.toggle('hide', !(touch && b.phase === 'pour'));
    },
  };
}
