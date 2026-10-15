// Day 2, the morning rush: six scripted customers, one espresso station, Gaz watching.
// A DOM-free state machine like core/trial.ts: the view feeds RushInput every fixed step and
// drains `events` each frame. Movement is timed states (no navigation); the view interpolates.
// Listening: each customer says their order once; the player rings up what they heard (asking to
// replay, repeat or clarify if needed), and the ticket, right or wrong, is what gets made.
// This file is the shift itself (create, restart, phases, the fixed step); the parts it drives are
// in the sibling modules (see index.ts).

import { CUSTOMERS } from '../../data/customers';
import { RUSH_INTRO } from '../../data/ownerLines';
import { normaliseOrder, pickOrder, type Difficulty } from '../../sim/listening';
import { createOwner } from '../../sim/owner';
import { summariseShift } from '../../sim/rush';
import {
  binDrink,
  createBarista,
  startDrink,
  stepBarista,
  type BaristaEvent,
  type BaristaInput,
} from '../barista';
import { createRng } from '../rng';
import { channelBusy, createChannel, updateChannel } from '../speech';
import { stepCustomers } from './customers';
import { listenAction, ringUp, takeOrder } from './register';
import { serve } from './serve';
import { gaz, gazDef, startSay } from './speech';
import type { CustomerState, LineOverrides, Rush, RushInput, RushPhase } from './state';

export function createRush(
  seed: number,
  difficulty: Difficulty = 'normal',
  lines: LineOverrides = {},
): Rush {
  const rng = createRng(seed ^ 0x2d2);
  return {
    seed,
    difficulty,
    lines,
    rng,
    time: 0,
    phase: 'intro',
    phaseTime: 0,
    serviceTime: 0,
    owner: createOwner(),
    speech: createChannel(),
    barista: createBarista(),
    customers: CUSTOMERS.map((def) => {
      const picked = pickOrder(def.orders, difficulty, rng);
      const forced = lines[def.id];
      const line = forced ? def.orders.find((o) => o.id === forced) : picked;
      if (!line) throw new Error(`${def.id} has no order line ${forced}`);
      return {
        def,
        line,
        order: normaliseOrder(line.order),
        heard: null,
        listen: { replays: 0, repeats: 0, clarified: [], questions: 0 },
        lastListen: null,
        state: 'outside' as CustomerState,
        stateTime: 0,
        patience: def.patience,
        registerAt: null,
        orderedAt: null,
        ticket: null,
        rejected: 0,
        outcome: null,
        result: null,
        reaction: null,
        said: { impatient: false, angry: false },
        nags: { register: 0, slow: 0, pos: 0 },
        orderLine: null,
      };
    }),
    records: [],
    listening: [],
    summary: null,
    nextTicket: 1,
    streak: { good: 0, bad: 0 },
    praised: 0,
    flags: {},
    lastGazText: '',
    events: [],
  };
}

/** Start the shift over. Gaz keeps his memory of what he's said. */
export function restartRush(r: Rush): void {
  const owner = r.owner;
  const rng = r.rng;
  const time = r.time;
  Object.assign(r, createRush(r.seed, r.difficulty, r.lines));
  r.rng = rng;
  r.time = time;
  r.owner = { ...owner, frustration: 0, lastAt: {} };
  r.events.push({ type: 'phase', phase: 'intro' });
  r.flags.intro = true;
  beginIntro(r);
}

// ---------------------------------------------------------------- flow

function setPhase(r: Rush, phase: RushPhase): void {
  r.phase = phase;
  r.phaseTime = 0;
  r.events.push({ type: 'phase', phase });
}

function beginIntro(r: Rush): void {
  for (const [i, d] of RUSH_INTRO.entries()) gazDef(r, `rush.intro.${i}`, d);
}

function handleBarista(r: Rush, out: BaristaEvent[]): void {
  for (const e of out) {
    if (e.type === 'line') gaz(r, e.key, e.priority);
    else if (e.type === 'sfx') r.events.push({ type: 'sfx', id: e.id });
    else if (e.type === 'phase') r.events.push({ type: 'station', phase: e.phase });
  }
  out.length = 0;
}

const baristaOut: BaristaEvent[] = [];
const baristaIn: BaristaInput = {
  holding: false,
  pressed: false,
  cupX: 0,
  cupY: 0,
  hasCup: false,
  jugDepth: 1.5,
  heightDelta: 0,
  heightPreset: null,
  next: false,
};

export function stepRush(r: Rush, input: RushInput, dt: number): void {
  r.time += dt;
  r.phaseTime += dt;
  updateChannel(
    r.speech,
    r.time,
    input.skip || (r.phase === 'intro' && input.pressed),
    startSay(r),
    input.voiceHold ? dt : 0,
  );
  const a = input.action;
  if (a?.type === 'restart') {
    restartRush(r);
    return;
  }

  switch (r.phase) {
    case 'intro':
      if (r.phaseTime < 0.05 && !r.flags.intro) {
        r.flags.intro = true;
        beginIntro(r);
      }
      if (r.phaseTime > 0.3 && !channelBusy(r.speech)) setPhase(r, 'service');
      break;
    case 'service': {
      r.serviceTime += dt;
      // Player actions.
      if (a?.type === 'takeOrder') takeOrder(r);
      else if (a?.type === 'replay' || a?.type === 'repeat' || a?.type === 'clarify')
        listenAction(r, a);
      else if (a?.type === 'ringUp') ringUp(r, a.order);
      else if (a?.type === 'make') startDrink(r.barista, a.drink, baristaOut, a.milk);
      else if (a?.type === 'serve') serve(r, a.customer);
      else if (a?.type === 'bin') {
        if (binDrink(r.barista, baristaOut)) gaz(r, 'rush.binned', 'react');
      }
      // The station.
      Object.assign(baristaIn, input);
      baristaIn.next = a?.type === 'next';
      stepBarista(r.barista, baristaIn, dt, r.time, baristaOut);
      handleBarista(r, baristaOut);
      stepCustomers(r, dt, input.voiceHold === true);
      if (r.customers.every((c) => c.state === 'gone')) {
        setPhase(r, 'wrapup');
        const wasted = r.barista.binned + (r.barista.ready || r.barista.phase !== 'idle' ? 1 : 0);
        r.summary = summariseShift(r.records, r.customers.length, wasted);
        gaz(r, `rush.end.${r.summary.grade}`, 'react');
        if (r.barista.ready) gaz(r, 'rush.wasteLeft', 'react');
      }
      break;
    }
    case 'wrapup':
      if (r.phaseTime > 1 && !channelBusy(r.speech) && r.summary) {
        setPhase(r, 'summary');
        r.events.push({ type: 'summary', summary: r.summary });
      }
      break;
    case 'summary':
      break;
  }
}
