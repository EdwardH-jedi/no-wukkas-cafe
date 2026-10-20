// Q5 caption probe for Day 1 (the implementer's copy of the review's slow-audio probe,
// tests/review/independentSlowAudio.browser.ts, which covers the rush): real boot, DOM and
// AudioContext, Gaz's clips held back 4 s. His subtitle must never show before his voice starts.
import { expect, test } from '@playwright/test';
import type { createDebugHandle } from '../../src/app/debug';

type DebugWindow = Window & { __trial: ReturnType<typeof createDebugHandle> };

for (const scale of [1, 3]) {
  test(`Day 1, 4 s clip load, timeScale ${scale}: Gaz's subtitle never precedes his voice`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.route('**/assets/voice/gaz/**', async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.fulfill({ response });
    });
    await page.goto('/?seed=7&ibis=0');
    await page.evaluate((value) => {
      (window as unknown as DebugWindow).__trial.timeScale = value;
    }, scale);
    await page.getByRole('button', { name: 'Start the trial' }).click();
    const observations = await page.evaluate(async () => {
      const out: Array<{
        audio: number;
        text: string;
        clipStart: number | null;
        via: string | null;
      }> = [];
      const start = performance.now();
      await new Promise<void>((done) => {
        const frame = () => {
          const d = (window as unknown as DebugWindow).__trial;
          const clip = d.audio.history.find((h) => h.speaker === 'gaz');
          out.push({
            audio: d.audio.currentTime,
            text: d.audioTick.subs,
            clipStart: clip?.startedAt ?? null,
            via: clip?.via ?? null,
          });
          if (performance.now() - start < 8_000) requestAnimationFrame(frame);
          else done();
        };
        frame();
      });
      return out;
    });
    const caption = observations.find((o) => o.text.length > 0);
    const clip = observations.find((o) => o.via === 'clip');
    console.log(
      JSON.stringify({
        scale,
        firstCaption: caption,
        firstClip: clip,
        leadSeconds: caption && clip ? clip.clipStart! - caption.audio : null,
      }),
    );
    expect.soft(caption, 'a subtitle showed').toBeDefined();
    expect.soft(clip, "Gaz's clip played").toBeDefined();
    if (caption && clip) expect(caption.audio).toBeGreaterThanOrEqual(clip.clipStart!);
  });
}
