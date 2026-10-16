// Real boot/DOM/AudioContext corroboration of the fake-HUD subtitle finding.
import { expect, test } from '@playwright/test';
import type { createDebugHandle } from '../../src/app/debug';

type DebugWindow = Window & { __trial: ReturnType<typeof createDebugHandle> };

for (const scale of [1, 2, 3]) {
  test(`10 s load, timeScale ${scale}: visible subtitle never precedes the clip`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'nwc.listen.v1',
        JSON.stringify({
          version: 2,
          difficulty: 'normal',
          subtitles: 'always',
          learning: false,
          pourSensitivity: 1,
        }),
      ),
    );
    let armed = false;
    await page.route('**/assets/voice/dazza/**', async (route) => {
      if (!armed) return route.fulfill({ status: 503, body: 'prefetch deliberately unavailable' });
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      await route.fulfill({ response });
    });
    await page.goto('/?seed=7&ibis=0');
    await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
    for (let i = 0; i < 80; i++) {
      const state = await page.evaluate(() => (window as unknown as DebugWindow).__trial.rush);
      if (state?.customers.some((c) => c.id === 'dazza' && c.state === 'register')) break;
      if (state?.phase === 'intro') await page.mouse.click(640, 300);
      await page.waitForTimeout(250);
    }
    await expect(page.getByRole('button', { name: /Take Dazza's order/ })).toBeVisible();
    armed = true;
    await page.evaluate((value) => {
      (window as unknown as DebugWindow).__trial.timeScale = value;
    }, scale);
    await page.getByRole('button', { name: /Take Dazza's order/ }).click();
    const observations = await page.evaluate(async () => {
      const out: Array<{
        audio: number;
        sim: number;
        text: string;
        speaker: string | null;
        clipStart: number | null;
        via: string | null;
      }> = [];
      const start = performance.now();
      await new Promise<void>((done) => {
        const frame = () => {
          const d = (window as unknown as DebugWindow).__trial;
          const clip = d.audio.history.find((h) => h.speaker === 'dazza');
          out.push({
            audio: d.audio.currentTime,
            sim: d.audioTick.sim,
            text: d.audioTick.subs,
            speaker: d.rush?.line?.speaker ?? null,
            clipStart: clip?.startedAt ?? null,
            via: clip?.via ?? null,
          });
          if (performance.now() - start < 14_000) requestAnimationFrame(frame);
          else done();
        };
        frame();
      });
      return out;
    });
    const caption = observations.find(
      (o) => o.speaker === 'dazza' && o.text.length > 0 && !o.text.includes('Listen…'),
    );
    const clip = observations.find((o) => o.via === 'clip');
    console.log(
      JSON.stringify({
        scale,
        firstCaption: caption,
        firstClip: clip,
        leadSeconds: caption && clip ? clip.clipStart! - caption.audio : null,
      }),
    );
    expect.soft(caption).toBeDefined();
    expect.soft(clip).toBeDefined();
    if (caption && clip) expect(caption.audio).toBeGreaterThanOrEqual(clip.clipStart!);
  });
}
