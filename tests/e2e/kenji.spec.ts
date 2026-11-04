// Kenji (Japanese-accented English) in a real browser: Endless Rush (a save with Monday passed),
// the six before him rung up at the register so he reaches it, then he says his order in his own
// recorded voice (placeholder clip from voice-cache/, the audio specs' requirement), is rung up
// exactly as he said it, and his ticket (the seventh) prints. Screenshots land in test-results/evidence-kenji/.

import { expect, test, type Page } from '@playwright/test';

interface Order {
  type: 'flatWhite' | 'longBlack';
  milk: 'full' | 'oat' | 'soy' | 'almond' | null;
  extraHot: boolean;
  heart: boolean;
}
interface Dbg {
  rush: {
    phase: string;
    week: { endless?: boolean } | null;
    customers: Array<{
      id: string;
      key: string;
      state: string;
      order: Order;
      heard: Order | null;
      segments: number;
      ticket: number | null;
    }>;
  } | null;
  audio: { history: Array<{ speaker: string; via: string; file: string; text: string }> };
  timeScale: number;
}
const dbg = (page: Page): Promise<Dbg> =>
  page.evaluate(() => {
    const t = (window as unknown as { __trial: Dbg }).__trial;
    return { rush: t.rush, audio: t.audio, timeScale: t.timeScale };
  });
const timeScale = (page: Page, k: number): Promise<number> =>
  page.evaluate((x) => ((window as unknown as { __trial: Dbg }).__trial.timeScale = x), k);

const summary = {
  customers: 6,
  ordersCompleted: 6,
  correctOrders: 6,
  walkouts: 0,
  avgServeSeconds: 40,
  satisfaction: 80,
  tipsCents: 450,
  wasted: 0,
  grade: 'good',
};
/** Monday passed: Endless Rush is open. */
const tuesday = {
  version: 2,
  createdAt: '2026-11-04T00:00:00.000Z',
  seed: 5,
  difficulty: 'normal',
  week: 1,
  shift: 1,
  unlockedDrinks: ['flatWhite', 'longBlack', 'cappuccino'],
  upgrades: [],
  regulars: {},
  reports: [{ week: 1, shift: 0, summary }],
  cents: 450,
};

async function ringUp(page: Page, o: Order): Promise<void> {
  const pos = page.locator('#pos');
  const click = (name: string) => pos.getByRole('button', { name, exact: true }).click();
  await click(o.type === 'flatWhite' ? 'Flat white' : 'Long black');
  if (o.type === 'flatWhite') {
    await click({ full: 'Full cream', oat: 'Oat', soy: 'Soy', almond: 'Almond' }[o.milk ?? 'full']);
    await click(o.extraHot ? 'Extra hot' : 'Normal');
    await click(o.heart ? 'Heart' : 'No heart');
  }
  await page.keyboard.press('Enter');
}

test('Kenji orders in Endless Rush in his own voice and is rung up as he said it', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((s) => localStorage.setItem('nwc.save.v2', s), JSON.stringify(tuesday));
  await page.goto('/?seed=5&ibis=0');
  await page.getByRole('button', { name: /Endless Rush/ }).click();
  await expect.poll(async () => (await dbg(page)).rush?.week?.endless).toBe(true);

  // Everyone before him: take the order and ring up a long black as soon as they've said it.
  await timeScale(page, 4);
  const end = Date.now() + 200_000;
  for (;;) {
    const r = (await dbg(page)).rush!;
    if (r.phase === 'intro') await page.mouse.click(512, 300);
    const kenji = r.customers.find((c) => c.id === 'kenji')!;
    if (kenji.state === 'register') break;
    const reg = r.customers.find((c) => c.state === 'register');
    const deciding = r.customers.find((c) => c.state === 'deciding');
    if (deciding)
      await ringUp(page, { type: 'longBlack', milk: null, extraHot: false, heart: false });
    else if (reg) await page.keyboard.press('t');
    if (Date.now() > end)
      throw new Error(
        `Kenji never reached the register: ${JSON.stringify(r.customers.map((c) => `${c.id}:${c.state}`))}`,
      );
    await page.waitForTimeout(100);
  }
  await timeScale(page, 1);
  await expect(page.getByRole('button', { name: /Take Kenji's order/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/evidence-kenji/01-kenji-at-register.png' });

  await page.keyboard.press('t');
  await expect
    .poll(async () => (await dbg(page)).rush!.customers.find((c) => c.id === 'kenji')!.state)
    .toMatch(/ordering|deciding/);
  await expect(page.locator('#rsubs .who')).toContainText('KENJI');
  await page.screenshot({ path: 'test-results/evidence-kenji/02-kenji-ordering.png' });

  // His order is his own recording (ja-JP placeholder): a curated line is one clip, a generated
  // one his segment clips back to back. Without segment clips rendered (npm run voices --
  // --segments), a generated line falls back to the browser voice, whole: that's the fallback.
  await expect
    .poll(async () => (await dbg(page)).audio.history.filter((h) => h.speaker === 'kenji').length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  const said = (await dbg(page)).audio.history.find((h) => h.speaker === 'kenji')!;
  const generated = (await dbg(page)).rush!.customers.find((c) => c.id === 'kenji')!.segments > 0;
  const res = await page.request.get('/assets/voice/segments/kenji/kenji.greet.1.mp3');
  const segmentsHere = res.ok() && (res.headers()['content-type'] ?? '').startsWith('audio/');
  test.info().annotations.push({
    type: 'Kenji audio',
    description: JSON.stringify({ generated, segmentsHere, said }),
  });
  if (!generated || segmentsHere) {
    expect(said.via).toBe('clip');
    expect(said.file).toMatch(generated ? /segments\/kenji\// : /kenji\//);
  } else expect(said.via).toBe('tts');

  // Ring up exactly what he said: the ticket matches and prints.
  await expect
    .poll(async () => (await dbg(page)).rush!.customers.find((c) => c.id === 'kenji')!.state, {
      timeout: 60_000,
    })
    .toBe('deciding');
  const order = (await dbg(page)).rush!.customers.find((c) => c.id === 'kenji')!.order;
  await ringUp(page, order);
  await expect
    .poll(async () => (await dbg(page)).rush!.customers.find((c) => c.id === 'kenji')!.heard)
    .toEqual(order);
  // His ticket prints (it may wait behind a full rail: the six before him are still waiting).
  const k = (await dbg(page)).rush!.customers.find((c) => c.id === 'kenji')!;
  expect(k.state).toBe('waiting');
  expect(k.ticket).toBe(7);
  await page.screenshot({ path: 'test-results/evidence-kenji/03-kenji-ticket.png' });
  expect(errors).toEqual([]);
});
