// The trial's pause menu → Title screen → a new trial, without a reload (playtest 2026-11-02).
// The real wiring (act, toTitle, setPaused, boot's frame driver) on the real audio stack over a
// fake AudioContext (tests/review/harness.ts). Quitting mid-grind or mid-steam leaves nothing
// behind: no held button or jug nudge, no line of the old trial still to come, a clock that runs,
// and the next trial starts from its greeting with a clean slate, one voice at a time.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../../src/app/context';
import { act } from '../../src/app/trialWiring';
import { createHarness, type Harness } from '../review/harness';

afterEach(() => vi.unstubAllGlobals());

/** boot's input sampling (held mouse or Space → holding) plus a player who clicks through Gaz's
 *  talk and works the station: grind to 19 g, a shot stopped at 27 s, then the steam held. */
function player(app: App): void {
  const t = app.trial;
  const i = app.input;
  i.holding = app.held || app.spaceHeld;
  if (t.phase === 'intro' || t.phase === 'lock' || t.phase === 'shot') i.skip = true;
  if (t.phase === 'grind' && t.espresso.dose >= 19 && !app.held) i.action = 'next';
  if (t.phase === 'shot') {
    const e = t.espresso;
    if (!e.extracting && !e.done && t.phaseTime > 0.5) i.pressed = true;
    if (e.extracting && e.shotTime >= 27) i.pressed = true;
  }
}

async function startTrial(h: Harness): Promise<void> {
  act(h.app, 'start');
  expect(await h.until(() => h.app.trial.phase === 'grind', 90)).toBe(true);
}

/** Pause, then the pause menu's "Title screen" (the HUD calls app.nav.toTitle). */
async function quitToTitle(h: Harness): Promise<void> {
  h.app.setPaused(true);
  await h.run(0.3);
  expect(h.app.clock.paused).toBe(true);
  h.app.nav.toTitle();
  await h.run(0.5);
}

function expectCleanTitle(h: Harness): void {
  const { app } = h;
  expect(app.mode).toBe('trial');
  expect(app.trial.phase).toBe('title');
  expect(app.clock.paused).toBe(false);
  expect(app.held).toBe(false);
  expect(app.spaceHeld).toBe(false);
  expect(app.keyHeight).toBe(0);
  expect(app.touchHeight).toBe(0);
  expect(app.input.holding).toBe(false);
  expect(app.input.action).toBeNull();
  expect(app.trial.results).toHaveLength(0);
  expect(app.trial.attempt).toBe(0);
  expect(app.trial.speech.current).toBeNull();
  expect(app.trial.speech.queue).toHaveLength(0);
  expect(app.audio.lastLine).toBeNull(); // Replay on the title has nothing of the old trial
}

describe('trial pause → Title screen → new trial', () => {
  it('quits mid-grind with the button held and a jug nudge on, then starts afresh', async () => {
    const h = createHarness({ seed: 7 });
    h.beforeStep = player;
    await startTrial(h);
    h.app.held = true; // the grinder button down…
    h.app.keyHeight = 1; // …and W held
    await h.run(0.6);
    expect(h.app.trial.espresso.grinding).toBe(true);
    expect(h.app.trial.espresso.dose).toBeGreaterThan(1);

    await quitToTitle(h);
    expectCleanTitle(h);
    expect(h.app.trial.espresso.dose).toBe(0);

    // The title stays quiet: nothing of the quit trial is still to be said.
    const heard = h.audio.history.length;
    await h.run(3);
    expect(h.app.trial.phase).toBe('title');
    expect(h.audio.history.length).toBe(heard);
    expect(h.audio.speaking).toBe(false);

    // A new trial: the greeting again, then a fresh grinder; one voice at a time throughout.
    const greetingsBefore = h.audio.history.length;
    await startTrial(h);
    expect(h.audio.history.length).toBeGreaterThan(greetingsBefore);
    expect(h.app.trial.attempt).toBe(0);
    expect(h.app.trial.results).toHaveLength(0);
    expect(h.app.trial.espresso.dose).toBe(0);
    expect(h.app.held).toBe(false);
    await h.run(1);
    expect(h.app.trial.espresso.dose).toBe(0); // no stuck hold grinding by itself
    expect(h.maxAudible).toBeLessThanOrEqual(1);
  });

  it('quits mid-steam with the valve open, then starts afresh', async () => {
    const h = createHarness({ seed: 3 });
    h.beforeStep = player;
    await startTrial(h);
    h.app.held = true;
    expect(await h.until(() => h.app.trial.espresso.dose >= 19, 10)).toBe(true);
    h.app.held = false;
    expect(await h.until(() => h.app.trial.phase === 'steam', 60)).toBe(true);
    expect(await h.until(() => !h.app.trial.speech.current, 30)).toBe(true);
    h.app.held = true;
    h.app.input.jugDepth = 0.3;
    expect(await h.until(() => h.app.trial.steam.temp > 30, 20)).toBe(true);
    expect(h.app.trial.steam.valveOpen).toBe(true);

    await quitToTitle(h);
    expectCleanTitle(h);
    expect(h.app.trial.steam.valveOpen).toBe(false);
    expect(h.app.trial.steam.temp).toBeLessThan(10); // a cold jug again

    await startTrial(h);
    expect(h.app.trial.attempt).toBe(0);
    expect(h.app.trial.espressoScore).toBeNull();
    expect(h.app.trial.milkScore).toBeNull();
    expect(h.maxAudible).toBeLessThanOrEqual(1);
  });

  it("restarting the clock once: game time runs at the frame driver's pace, not twice it", async () => {
    const h = createHarness({ seed: 7 });
    h.beforeStep = player;
    await startTrial(h);
    await quitToTitle(h);
    await startTrial(h);
    const t0 = h.app.trial.time;
    await h.run(2);
    expect(h.app.trial.time - t0).toBeCloseTo(2, 1);
  });
});
