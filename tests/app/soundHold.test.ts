// Q7: when the browser stops sound mid-shift (autoplay policy, an iOS interruption) the game holds
// until sound is back: patience never drains in silence, and it isn't the player's pause. Driven
// through boot's own frame (the review harness) on its fake AudioContext.

import { describe, expect, it } from 'vitest';
import { soundHeld } from '../../src/app/pause';
import { clickThroughIntro, createHarness, FAST, type Harness } from '../review/harness';

/** Day 2 under way: service has begun and someone is waiting with patience to lose. */
async function midShift(h: Harness): Promise<void> {
  await h.run(0.5); // the title screen
  h.app.nav.startDay2();
  const step = { n: 0 };
  h.beforeStep = (app) => clickThroughIntro(app, step);
  const ok = await h.until(
    () =>
      h.app.rush?.phase === 'service' &&
      h.app.rush.customers.some((c) => c.state === 'register' || c.state === 'queue'),
    120,
  );
  expect(ok, 'a customer is waiting').toBe(true);
  h.beforeStep = null;
  expect(h.ctx().state).toBe('running');
}

const clocks = (h: Harness) => {
  const r = h.app.rush!;
  return {
    time: r.time,
    patience: r.customers.filter((c) => c.state !== 'gone').map((c) => c.patience),
  };
};

describe('the game holds while the browser has sound stopped (Q7)', () => {
  it('nothing runs down until sound is back, and then it runs again', async () => {
    const h = createHarness({ plan: () => FAST });
    await midShift(h);
    await h.ctx().suspend(); // the browser, not the player
    await h.frame();
    expect(soundHeld(h.app)).toBe(true);
    expect(h.app.clock.paused, 'not the player pause').toBe(false);
    const before = clocks(h);
    await h.run(5);
    expect(clocks(h)).toEqual(before);

    h.audio.unlock(); // any click or key (boot.ts)
    await h.frame();
    expect(soundHeld(h.app)).toBe(false);
    await h.run(1);
    expect(h.app.rush!.time).toBeGreaterThan(before.time);
  });

  it('input given while it holds is dropped', async () => {
    const h = createHarness({ plan: () => FAST });
    await midShift(h);
    await h.ctx().suspend();
    h.app.rushAction = { type: 'bin' };
    h.app.input.pressed = true;
    await h.frame();
    expect(h.app.rushAction).toBeNull();
    expect(h.app.input.pressed).toBe(false);
  });

  it("the player's own pause is theirs: sound coming back doesn't end it", async () => {
    const h = createHarness({ plan: () => FAST });
    await midShift(h);
    await h.ctx().suspend();
    await h.frame();
    h.app.setPaused(true);
    expect(soundHeld(h.app)).toBe(false); // paused, not held
    await h.ctx().resume();
    await h.run(1);
    expect(h.app.clock.paused).toBe(true);
    const t = h.app.rush!.time;
    await h.run(1);
    expect(h.app.rush!.time).toBe(t);
  });

  it('voices off: nothing waits on the sound, so the game runs on', async () => {
    const h = createHarness({ plan: () => FAST });
    await midShift(h);
    h.audio.voiceEnabled = false;
    await h.ctx().suspend();
    const t = h.app.rush!.time;
    await h.run(1);
    expect(soundHeld(h.app)).toBe(false);
    expect(h.app.rush!.time).toBeGreaterThan(t);
  });

  it('never on the title screen', async () => {
    const h = createHarness({ plan: () => FAST });
    await h.run(0.5);
    h.audio.unlock();
    await h.run(0.1);
    await h.ctx().suspend();
    await h.frame();
    expect(h.app.trial.phase).toBe('title');
    expect(soundHeld(h.app)).toBe(false);
  });
});
