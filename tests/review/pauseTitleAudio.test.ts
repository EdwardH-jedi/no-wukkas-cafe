// Scenario 1: pause mid-shift → title → new game. The real wiring (startRush, toTitle, act, the
// rush loop and views) on the real audio stack, over a fake AudioContext. The customer's order clip
// is still downloading when the player pauses and quits; it must never play in the new game, and
// the new game's audio must run normally (context running, one voice at a time, one music mood,
// the SFX loops built once). And nothing from the quit game carries over: Replay on the title has
// nothing of it to say, and the café murmur is back to a fresh page's.

import { afterEach, describe, expect, it } from 'vitest';
import { act } from '../../src/app/trialWiring';
import { createRush } from '../../src/core/rush';
import { clipFor } from '../../src/data/voice';
import {
  clickThroughIntro,
  createHarness,
  FakeCtx,
  FAST,
  type FakeNode,
  type Harness,
} from './harness';
import { vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

/** Day 2's first customer to reach the register for this seed, and their order clip. */
function firstOrder(seed: number) {
  const r = createRush(seed);
  const c = [...r.customers].sort((a, b) => a.arriveAt - b.arriveAt)[0]!;
  const clip = clipFor(c.def.id, c.line.text)!;
  return { id: c.def.id, text: c.line.text, file: clip.file };
}

/** Loops the SFX build once (room tone, murmur, grinder, pump, steam, pour). */
const loopSources = (h: Harness): number => h.ctx().sources.filter((s) => s.loop).length;

/** Music moods playing (their gain heading to full) into the synth's output. */
function activeMoods(h: Harness): number {
  const ctx = h.ctx();
  const duck = h.audio.output('music');
  const dcBlock = ctx.nodes.find((n) => n.kind === 'biquad' && n.outs.includes(duck));
  return ctx.nodes.filter(
    (n) =>
      n.kind === 'gain' &&
      n.outs.includes(dcBlock) &&
      (n as FakeNode & { gain: { value: number } }).gain.value === 1,
  ).length;
}

async function toRegister(h: Harness, id: string): Promise<void> {
  const step = { n: 0 };
  h.beforeStep = (app) => clickThroughIntro(app, step);
  const ok = await h.until(
    () => h.app.rush?.customers.find((c) => c.def.id === id)?.state === 'register',
    120,
  );
  expect(ok, `${id} reached the register`).toBe(true);
}

async function quitMidOrder(h: Harness): Promise<{ id: string; text: string }> {
  const first = [...createRush(h.app.seed).customers].sort((a, b) => a.arriveAt - b.arriveAt)[0]!;
  await h.run(0.5);
  h.app.nav.startDay2();
  const step = { n: 0 };
  h.beforeStep = (app) => clickThroughIntro(app, step);
  expect(await h.until(() => reg(h), 120)).toBe(true);
  h.app.rushAction = { type: 'takeOrder' };
  await h.run(4); // they say their order
  h.app.setPaused(true);
  await h.run(0.5);
  h.app.nav.toTitle();
  await h.run(1);
  return { id: first.def.id, text: first.line.text };
}
const reg = (h: Harness): boolean =>
  h.app.rush?.customers.some((c) => c.state === 'register') ?? false;

/** The café murmur's gain (the SFX's crowd loop: speech-band noise into the ambience bus). */
function murmur(h: Harness): number {
  const ctx = h.ctx();
  const band = ctx.nodes.find(
    (n) =>
      n.kind === 'biquad' &&
      (n as FakeNode & { frequency: { value: number } }).frequency.value === 520,
  );
  const g = band?.outs[0] as (FakeNode & { gain: { value: number } }) | undefined;
  return g?.gain.value ?? NaN;
}

describe('S1: pause mid-shift, quit to the title, start a new game', () => {
  it('the quit game never speaks again; the new one has running audio, one voice, one mood, no doubled loops', async () => {
    const seed = 7;
    const o = firstOrder(seed);
    let armed = false;
    const h = createHarness({
      seed,
      // Day 2 prefetches every clip: make that miss for the order, then make its real request slow.
      plan: (file) =>
        file === o.file ? (armed ? { status: 200, delay: 5 } : { status: 503, delay: 0 }) : FAST,
    });
    await h.run(0.5); // the title screen
    h.app.nav.startDay2();
    const loops = loopSources(h);
    expect(loops).toBe(6);
    await toRegister(h, o.id);

    armed = true;
    h.app.rushAction = { type: 'takeOrder' };
    await h.run(0.5);
    expect(h.audio.loading).toBe(true); // the order clip is in flight

    h.app.setPaused(true);
    await h.run(1);
    expect(h.ctx().state).toBe('suspended');
    h.app.nav.toTitle();
    const atTitle = h.now;
    await h.run(1);
    expect(h.app.mode).toBe('trial');
    expect(h.app.trial.phase).toBe('title');
    expect(h.music.mood).toBe('opening');

    act(h.app, 'start'); // Day 1: Start the trial
    const started = h.now;
    await h.run(8); // the old order's reply lands ~5 s after it was asked for

    // The quit game is silent: its order clip arrived but never played, and no browser voice
    // stood in for it.
    expect(h.starts.filter((s) => s.at >= atTitle && s.speaker === o.id)).toEqual([]);
    expect(h.audio.history.some((r) => r.speaker === o.id)).toBe(false);
    expect(h.spoken.some((s) => s.text === o.text)).toBe(false);

    // The new game's audio works.
    expect(h.ctx().state).toBe('running');
    expect(h.audio.paused).toBe(false);
    expect(h.app.clock.paused).toBe(false);
    expect(h.audio.status).toBe('ok');
    const gaz = h.starts.filter((s) => s.speaker === 'gaz' && s.at >= started);
    expect(gaz.length, 'Gaz speaks in the new game').toBeGreaterThan(0);
    expect(gaz[0]!.via).toBe('clip');
    expect(h.maxAudible).toBeLessThanOrEqual(1);

    // One music mood, the SFX loops built once, the duck released between lines.
    expect(h.music.mood).toBe('opening');
    expect(activeMoods(h)).toBe(1);
    expect(loopSources(h)).toBe(loops);
    expect(FakeCtx.last).toBe(h.ctx()); // still the one AudioContext
    const quiet = await h.until(() => !h.audio.speaking, 20);
    expect(quiet).toBe(true);
    await h.frame();
    expect(h.audio.musicDuck).toBe(1);
  }, 20_000);
});

describe('S1: nothing from the quit game carries into the next one', () => {
  it('Replay (R / "Replay last line") on the title does not say the quit customer\'s order', async () => {
    const h = createHarness({ plan: () => FAST });
    const quit = await quitMidOrder(h);
    expect(h.app.trial.phase).toBe('title');
    const before = h.starts.length;
    h.replay(); // boot.ts replay(): what R and the settings' "Replay last line" call on the title
    await h.run(2);
    const after = h.starts.slice(before);
    expect(
      after.filter((s) => s.speaker === quit.id),
      `on the title screen, Replay says "${quit.text}"`,
    ).toEqual([]);
  });

  it("the café ambience on the title (and the Day 1 trial after it) is back to a fresh page's", async () => {
    const fresh = createHarness({ plan: () => FAST });
    await fresh.run(0.5);
    act(fresh.app, 'start'); // a fresh page: Day 1 straight from the title
    await fresh.run(1);
    const day1Murmur = murmur(fresh);
    vi.unstubAllGlobals();

    const h = createHarness({ plan: () => FAST, listen: { difficulty: 'hard' } });
    await quitMidOrder(h);
    act(h.app, 'start');
    await h.run(1);
    expect(murmur(h), 'Day 1 after a Hard shift keeps the packed-café murmur').toBeCloseTo(
      day1Murmur,
      6,
    );
  });
});
