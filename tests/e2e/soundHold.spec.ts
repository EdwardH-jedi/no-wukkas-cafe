// Q7 in a real browser: the browser suspends the AudioContext mid-shift (as iOS does for a call or
// another app's audio). The game holds under its "Sound stopped" card, with no clock running
// down, until a click brings the sound back.
import { expect, test } from '@playwright/test';
import type { createDebugHandle } from '../../src/app/debug';

type DebugWindow = Window & {
  __trial: ReturnType<typeof createDebugHandle>;
  __ctx?: AudioContext;
};

test('the browser stops sound mid-shift: the café waits under its card until a click', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Keep the game's own AudioContext where the test can suspend it, as the browser would.
  await page.addInitScript(() => {
    const C = window.AudioContext;
    window.AudioContext = class extends C {
      constructor(o?: AudioContextOptions) {
        super(o);
        (window as unknown as DebugWindow).__ctx = this;
      }
    };
  });
  await page.goto('/?seed=7&ibis=0');
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  const rush = () => page.evaluate(() => (window as unknown as DebugWindow).__trial.rush);
  for (let i = 0; i < 120 && (await rush())?.phase !== 'service'; i++) {
    await page.mouse.click(640, 300);
    await page.waitForTimeout(250);
  }
  expect((await rush())?.phase).toBe('service');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as DebugWindow).__ctx?.state))
    .toBe('running');
  const card = page.getByRole('alert').filter({ hasText: 'Sound stopped' });
  await expect(card).toBeHidden();

  await page.evaluate(() => (window as unknown as DebugWindow).__ctx!.suspend());
  await expect(card).toBeVisible();
  const held = (await rush())!.serviceTime;
  await page.waitForTimeout(1500);
  expect((await rush())!.serviceTime, 'no shift time passes while the sound is stopped').toBe(held);

  await card.click();
  await expect(card).toBeHidden();
  await expect.poll(async () => (await rush())!.serviceTime).toBeGreaterThan(held);
});
