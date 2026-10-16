// Scenario 2: a customer's order clip that 404s, or takes 10 s to arrive, never makes the game skip
// that order: it is still heard (the clip when it comes, or the browser voice) and the register
// still takes it. Real wiring and audio stack (harness.ts); Day 2 on Normal, where the order's
// words are not on screen, so the voice is the only way to get it. (25 s: the .failing file.)

import { afterEach, describe, expect, it, vi } from 'vitest';
import { orderWith } from './orderFlow';

afterEach(() => vi.unstubAllGlobals());

describe('S2: a slow or missing order clip never skips the order', () => {
  it('404: the browser voice says the order at once, and the register takes it', async () => {
    const { h, o, c, asked, heard } = await orderWith({ status: 404, delay: 0 });
    expect(heard).toBe(true);
    const said = h.starts.find((s) => s.speaker === o.id && s.at >= asked)!;
    expect(said.via).toBe('tts');
    expect(said.text).toBe(o.text);
    expect(said.at - asked).toBeLessThan(0.2);
    expect(c.outcome).toBeNull();
    expect(c.ticket).not.toBeNull();
    expect(h.app.rush!.listening.map((l) => l.customer)).toContain(o.id);
  }, 15_000);

  it('10 s: the clip plays when it arrives, whole, and the register takes it', async () => {
    const { h, o, c, asked, heard } = await orderWith({ status: 200, delay: 10 });
    expect(heard).toBe(true);
    const said = h.starts.find((s) => s.speaker === o.id && s.at >= asked)!;
    expect(said.via).toBe('clip');
    expect(said.at - asked).toBeCloseTo(10, 1);
    const rec = h.audio.history.find((r) => r.speaker === o.id)!;
    expect(rec.interrupted).toBe(false);
    expect(rec.endedAt).not.toBeNull();
    expect(c.outcome).toBeNull();
    expect(c.ticket).not.toBeNull();
  }, 15_000);

  it('404 after 10 s: the browser voice says it once the clip has failed', async () => {
    const { o, c, heard } = await orderWith({ status: 404, delay: 10 });
    expect(heard, `${o.id}'s order was never heard`).toBe(true);
    expect(c.outcome).toBeNull();
    expect(c.ticket).not.toBeNull();
  }, 15_000);
});
