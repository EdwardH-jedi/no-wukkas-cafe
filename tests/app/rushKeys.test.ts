// Register vs production keys (playtest 2026-11-02): one key press never reaches both the register
// and the station. The real rushKey and rushReplay (src/app/rushWiring.ts) on a real Rush, with a
// stand-in App that records what each key asked for. Remapped keys go through aliasKey first, as
// the window's key handler does (src/app/input.ts).

import { describe, expect, it } from 'vitest';
import type { App } from '../../src/app/context';
import { rushKey, rushReplay } from '../../src/app/rushWiring';
import { STEP } from '../../src/core/clock';
import {
  atCounter,
  atRegister,
  createRush,
  emptyRushInput,
  rushContext,
  stepRush,
  type Rush,
  type RushAction,
  type RushCustomer,
} from '../../src/core/rush';
import { emptyInput } from '../../src/core/trial';
import { DEFAULT_KEYS } from '../../src/sim/contracts/save';
import { aliasKey } from '../../src/ui/screens/keys';

interface Calls {
  ringUps: number;
  replays: number;
}

function fakeApp(calls: Calls): App {
  return {
    input: emptyInput(),
    rushAction: null,
    sfx: { unlock: () => undefined },
    rushHud: {
      ringUp: () => {
        calls.ringUps++;
        return true;
      },
    },
    replay: () => {
      calls.replays++;
    },
  } as unknown as App;
}

/** A keydown aimed at the canvas, or at a register button (`#pos`). */
function keyEvent(on: 'canvas' | 'pos' = 'canvas'): KeyboardEvent {
  const target = {
    tagName: on === 'pos' ? 'BUTTON' : 'CANVAS',
    closest: (sel: string) => (on === 'pos' && sel === '#pos' ? {} : null),
  };
  return { target, preventDefault: () => undefined } as unknown as KeyboardEvent;
}

function step(r: Rush, action: RushAction | null = null): void {
  const i = emptyRushInput();
  i.action = action;
  i.skip = r.phase === 'intro';
  stepRush(r, i, STEP);
}

function until(r: Rush, pred: () => boolean, maxSeconds = 180): void {
  for (let n = 0; n < maxSeconds / STEP && !pred(); n++) step(r);
  expect(pred(), 'reached in time').toBe(true);
}

/** Hold the grinder for two seconds, then lock in. */
function grindAndLock(r: Rush): void {
  for (let n = 0; n < 2 / STEP; n++) {
    const i = emptyRushInput();
    i.holding = true;
    stepRush(r, i, STEP);
  }
  step(r, { type: 'next' });
}

/** A rung up, B deciding at the register, and the station in `phase` making A's drink. */
function makingWithBDeciding(phase: 'grind' | 'lock' | 'shot'): { r: Rush; b: RushCustomer } {
  const r = createRush(7);
  until(r, () => atRegister(r) !== null);
  const a = atRegister(r) as RushCustomer;
  step(r, { type: 'takeOrder' });
  until(r, () => a.state === 'deciding');
  step(r, { type: 'ringUp', order: a.order });
  until(r, () => atRegister(r) !== null);
  const b = atRegister(r) as RushCustomer;
  step(r, { type: 'takeOrder' });
  until(r, () => b.state === 'deciding');
  step(r, { type: 'make', drink: 'flatWhite' });
  if (phase !== 'grind') {
    grindAndLock(r);
    if (phase === 'shot') until(r, () => r.barista.phase === 'shot', 5);
  }
  expect(r.barista.phase).toBe(phase);
  expect(rushContext(r)).toBe('production');
  expect(atCounter(r)).toBe(b);
  return { r, b };
}

describe('Day 2 keys while a drink is being made', () => {
  it.each(['grind', 'lock', 'shot'] as const)(
    'Enter in %s never rings up the customer at the register',
    (phase) => {
      const { r } = makingWithBDeciding(phase);
      for (const on of ['canvas', 'pos'] as const) {
        const calls = { ringUps: 0, replays: 0 };
        const app = fakeApp(calls);
        rushKey(app, r, 'enter', keyEvent(on));
        expect(calls.ringUps, `Enter on ${on}`).toBe(0);
        // Grind: Enter is the station's "tamp & lock in". Elsewhere it only skips a subtitle.
        if (phase === 'grind') expect(app.rushAction).toEqual({ type: 'next' });
        else {
          expect(app.rushAction).toBeNull();
          expect(app.input.skip).toBe(true);
        }
      }
    },
  );

  it('R (and a remapped replay key) leaves the register alone mid-drink', () => {
    const { r, b } = makingWithBDeciding('shot');
    const calls = { ringUps: 0, replays: 0 };
    const app = fakeApp(calls);
    rushKey(app, r, 'r', keyEvent());
    expect(app.rushAction).toBeNull(); // no counted replay for B
    expect(calls.replays).toBe(0); // and no free one of their order either
    const keys = { ...DEFAULT_KEYS, replay: 'q' };
    rushKey(app, r, aliasKey(keys, 'q'), keyEvent());
    expect(app.rushAction).toBeNull();
    expect(calls.replays).toBe(0);
    rushReplay(app, r); // the top bar's ↻ follows the same rule
    expect(app.rushAction).toBeNull();
    expect(calls.replays).toBe(0);
    expect(b.listen.replays).toBe(0);
  });

  it('T still takes the next order mid-drink, but Enter (the station key) does not', () => {
    const r = createRush(7);
    until(r, () => atRegister(r) !== null);
    step(r, { type: 'make', drink: 'longBlack' });
    expect(rushContext(r)).toBe('production');
    const app = fakeApp({ ringUps: 0, replays: 0 });
    rushKey(app, r, 't', keyEvent());
    expect(app.rushAction).toEqual({ type: 'takeOrder' });
    grindAndLock(r);
    expect(r.barista.phase).toBe('lock');
    const app2 = fakeApp({ ringUps: 0, replays: 0 });
    rushKey(app2, r, 'enter', keyEvent());
    expect(app2.rushAction).toBeNull();
  });
});

describe('Day 2 keys back at the register (unchanged)', () => {
  it('Enter rings up and R is the counted replay once the drink is binned', () => {
    const { r } = makingWithBDeciding('grind');
    step(r, { type: 'bin' });
    expect(rushContext(r)).toBe('register');
    const calls = { ringUps: 0, replays: 0 };
    const app = fakeApp(calls);
    rushKey(app, r, 'enter', keyEvent('pos'));
    expect(calls.ringUps).toBe(1);
    rushKey(app, r, aliasKey({ ...DEFAULT_KEYS, replay: 'q' }, 'q'), keyEvent());
    expect(app.rushAction).toEqual({ type: 'replay' });
    expect(calls.replays).toBe(0);
  });
});
