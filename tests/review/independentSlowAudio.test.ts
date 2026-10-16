// Deliberately red acceptance tests: do not update snapshots or invert the expectations.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from './harness';
import { orderWith } from './orderFlow';

afterEach(() => vi.unstubAllGlobals());

describe('independent audio clock and order guarantees', () => {
  it('Web Audio advances by wall time, including a long RAF gap, and freezes on pause', async () => {
    const h = createHarness();
    h.audio.unlock();
    h.app.timeScale = 3;
    const start = h.ctx().currentTime;
    await h.frame(0.5);
    expect(h.ctx().currentTime - start).toBeCloseTo(0.5);
    h.app.clock.paused = true;
    h.audio.setPaused(true);
    const paused = h.ctx().currentTime;
    await h.frame(1);
    expect(h.ctx().currentTime).toBe(paused);
  });

  for (const scale of [1, 2, 3]) {
    it(`25 s load at timeScale ${scale}: the order must be heard before ticketing`, async () => {
      const { h, o, asked, heard, c } = await orderWith({ status: 200, delay: 25 }, 7, scale);
      const starts = h.starts.filter((s) => s.speaker === o.id && s.at >= asked);
      console.log(JSON.stringify({ scale, heard, starts, ticket: c.ticket, outcome: c.outcome }));
      expect(heard, `scale ${scale}: ${o.id}'s order was skipped`).toBe(true);
      expect(c.ticket).not.toBeNull();
      expect(c.outcome).toBeNull();
    }, 15_000);

    it(`10 s load at timeScale ${scale}: subtitle dispatch must not lead audible speech`, async () => {
      const { h, o, asked } = await orderWith({ status: 200, delay: 10 }, 7, scale);
      const caption = h.said.find((s) => s.line.speaker === o.id && s.at >= asked);
      const sound = h.starts.find((s) => s.speaker === o.id && s.text === o.text && s.at >= asked);
      console.log(JSON.stringify({ scale, captionAt: caption?.at, soundAt: sound?.at }));
      expect(caption).toBeDefined();
      expect(sound).toBeDefined();
      // This observes the real rushView -> HUD boundary. The browser probe separately checks
      // visible text; Normal/auto hides order words, so a no-op HUD alone cannot prove that.
      expect(caption!.at).toBeGreaterThanOrEqual(sound!.at);
    }, 15_000);
  }

  it('legacy scaled audio clock masks the timeScale 3 timeout ordering defect', async () => {
    const { heard } = await orderWith({ status: 200, delay: 25 }, 7, 3, 'legacy-scaled');
    expect(heard).toBe(true);
  }, 15_000);
});
