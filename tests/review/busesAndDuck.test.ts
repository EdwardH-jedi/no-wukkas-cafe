// Scenario 5: the music ducks under dialogue (deeper under an order) and comes back; the four
// volume buses (voice, music, ambience, sfx: audio/manager.ts, the four sliders in
// ui/audioPanel.ts) are independent: moving one never changes another's gain, and the duck never
// moves the player's music volume. Real manager on the review harness's fake AudioContext.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioManager, DEFAULT_VOLUMES, type Bus } from '../../src/audio/manager';
import { duckLevel } from '../../src/audio/musicPatterns';
import { VOICE_MANIFEST } from '../../src/data/voice';
import { createHarness, FakeCtx, type FakeNode, type Harness } from './harness';

afterEach(() => vi.unstubAllGlobals());

type GainLike = FakeNode & { gain: { value: number } };
const BUSES: readonly Bus[] = ['voice', 'music', 'ambience', 'sfx'];

/** The four bus gain nodes and the duck, found by how the manager wires them. */
function graph(h: Harness) {
  const ctx = h.ctx();
  const gains = ctx.nodes.filter((n) => n.kind === 'gain') as GainLike[];
  const master = gains.find((g) => g.outs.includes(ctx.destination))!;
  const duck = h.audio.output('music') as unknown as GainLike;
  const voiceTap = ctx.nodes.find(
    (n) => n.kind === 'analyser' && n.outs.some((o) => gains.includes(o as GainLike)),
  )!;
  const bus: Record<Bus, GainLike> = {
    voice: voiceTap.outs[0] as GainLike,
    music: duck.outs[0] as GainLike,
    ambience: h.audio.output('ambience') as unknown as GainLike,
    sfx: h.audio.output('sfx') as unknown as GainLike,
  };
  for (const b of BUSES) expect(bus[b].outs, `${b} feeds the master`).toContain(master);
  expect(new Set(BUSES.map((b) => bus[b])).size).toBe(4);
  return { bus, duck };
}

const levels = (g: ReturnType<typeof graph>) =>
  Object.fromEntries(BUSES.map((b) => [b, g.bus[b].gain.value])) as Record<Bus, number>;

const clipOf = (speaker: string) =>
  VOICE_MANIFEST.clips.find((c) => c.characterId === speaker && c.delivery === 'normal')!;

async function unlocked(): Promise<Harness> {
  const h = createHarness();
  h.audio.unlock();
  await h.frame();
  expect(h.ctx().state).toBe('running');
  return h;
}

describe('S5: four independent volume buses', () => {
  it('moving any one slider changes only that bus, never another or the duck', async () => {
    const h = await unlocked();
    const g = graph(h);
    expect(levels(g)).toEqual(DEFAULT_VOLUMES);
    const set: Record<Bus, number> = { voice: 0.9, music: 0.2, ambience: 0.35, sfx: 0.6 };
    for (const b of BUSES) {
      const before = levels(g);
      const vols = Object.fromEntries(BUSES.map((x) => [x, h.audio.volume(x)]));
      const duck = g.duck.gain.value;
      h.audio.setVolume(b, set[b]);
      const after = levels(g);
      expect(after[b]).toBeCloseTo(set[b], 9);
      expect(h.audio.volume(b)).toBeCloseTo(set[b], 9);
      for (const o of BUSES.filter((x) => x !== b)) {
        expect(after[o], `${b} slider moved the ${o} bus`).toBe(before[o]);
        expect(h.audio.volume(o)).toBe(vols[o]);
      }
      expect(g.duck.gain.value).toBe(duck);
    }
    // Out of range is clamped, still only on its own bus.
    h.audio.setVolume('sfx', 7);
    expect(levels(g)).toEqual({ voice: 0.9, music: 0.2, ambience: 0.35, sfx: 1 });
  });

  it('voices off mutes only the voice bus; its slider still remembers, and comes back', async () => {
    const h = await unlocked();
    const g = graph(h);
    h.audio.voiceEnabled = false;
    expect(levels(g)).toEqual({ ...DEFAULT_VOLUMES, voice: 0 });
    h.audio.setVolume('voice', 0.3);
    h.audio.setVolume('music', 0.1);
    expect(levels(g)).toEqual({ ...DEFAULT_VOLUMES, voice: 0, music: 0.1 });
    expect(h.audio.volume('voice')).toBeCloseTo(0.3, 9);
    h.audio.voiceEnabled = true;
    expect(levels(g)).toEqual({ ...DEFAULT_VOLUMES, voice: 0.3, music: 0.1 });
  });

  it('saved volumes load bus by bus (one saved value never moves another)', () => {
    const store = new Map<string, string>([['nwc.audio.v1', JSON.stringify({ music: 0.2 })]]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const m = createAudioManager('/');
    expect(BUSES.map((b) => m.volume(b))).toEqual([
      DEFAULT_VOLUMES.voice,
      0.2,
      DEFAULT_VOLUMES.ambience,
      DEFAULT_VOLUMES.sfx,
    ]);
    m.setVolume('sfx', 0.5);
    expect(JSON.parse(store.get('nwc.audio.v1')!)).toMatchObject({
      voice: DEFAULT_VOLUMES.voice,
      music: 0.2,
      ambience: DEFAULT_VOLUMES.ambience,
      sfx: 0.5,
    });
  });
});

describe('S5: the music ducks under dialogue and recovers', () => {
  it('deep under an order, lighter under Gaz, back to full after; only the music moves', async () => {
    const h = await unlocked();
    const g = graph(h);
    const vols = levels(g);
    expect(h.audio.musicDuck).toBe(1);

    const order = clipOf('dazza');
    h.audio.say({ speaker: 'dazza', text: order.transcript, listen: true });
    await h.frame();
    await h.frame();
    expect(h.audio.clipPlaying).toBe(true);
    expect(h.audio.musicDuck).toBeCloseTo(duckLevel(true, true), 9);
    expect(h.audio.musicDuck).toBeLessThan(0.35);
    expect(levels(g)).toEqual(vols); // the player's volumes are untouched by the duck
    // The music slider moved mid-order: the duck holds, the volume follows the slider.
    h.audio.setVolume('music', 0.8);
    await h.frame();
    expect(h.audio.musicDuck).toBeCloseTo(duckLevel(true, true), 9);
    expect(g.bus.music.gain.value).toBeCloseTo(0.8, 9);

    expect(await h.until(() => !h.audio.speaking, order.duration + 2)).toBe(true);
    await h.frame();
    expect(h.audio.musicDuck).toBe(1);

    const gaz = clipOf('gaz');
    h.audio.say({ speaker: 'gaz', text: gaz.transcript });
    await h.frame();
    await h.frame();
    expect(h.audio.musicDuck).toBeCloseTo(duckLevel(true, false), 9);
    h.audio.stopVoice(); // cut off (a new game, the title): the duck lets go too
    await h.frame();
    expect(h.audio.musicDuck).toBe(1);
    expect(levels(g)).toEqual({ ...vols, music: 0.8 });
  });

  it('the browser-voice fallback ducks the music too, and lets it back up when it ends', async () => {
    const h = await unlocked();
    h.audio.say({ speaker: 'dazza', text: 'Not a recorded line, mate.', listen: true });
    await h.frame();
    await h.frame();
    expect(h.audio.history.at(-1)?.via).toBe('tts');
    expect(h.spoken.map((s) => s.text)).toEqual(['Not a recorded line, mate.']);
    expect(h.audio.musicDuck).toBeCloseTo(duckLevel(true, true), 9);
    expect(await h.until(() => !h.audio.speaking, 5)).toBe(true);
    await h.frame();
    expect(h.audio.musicDuck).toBe(1);
    expect(FakeCtx.last).toBe(h.ctx());
  });
});
