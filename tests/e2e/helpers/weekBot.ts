// A browser bot for a whole rush shift (Day 2 or a week shift), for the week UI e2e. It READS the
// dev debug handle (window.__trial) to decide what to do, as tests/helpers/rushBot.ts does
// headless, but every action is real input: keys (T take order, F make, 1–6 serve, B bin, 1 for
// an event card) and clicks (the register's options, Enter to ring up, Tamp & lock in, Hand it
// over), and the mouse held on the canvas to grind, run the hot water, steam and pour. It rings up
// what the handle says was ordered (the listening puzzle isn't under test here), makes the oldest
// ticket one step at a time (no two hands), pours without art, and serves straight away.

import type { Page } from '@playwright/test';

export type DrinkType = 'flatWhite' | 'longBlack';
export interface Order {
  type: DrinkType;
  milk: 'full' | 'oat' | 'soy' | 'almond' | null;
  extraHot: boolean;
  heart: boolean;
}
export interface Cust {
  id: string;
  key: string;
  state: string;
  order: Order;
  heard: Order | null;
  ticket: number | null;
  outcome: string | null;
  rejected: number;
}
export interface Summary {
  customers: number;
  ordersCompleted: number;
  correctOrders: number;
  walkouts: number;
  satisfaction: number;
  tipsCents: number;
  grade: string;
}
export interface RushState {
  phase: string;
  serviceTime: number;
  station: string;
  stationTime: number;
  dose: number;
  shotTime: number;
  extracting: boolean;
  shotDone: boolean;
  temp: number;
  aeration: number;
  steamDone: boolean;
  water: number;
  ready: { type: DrinkType; temp: number; milkType: string | null } | null;
  fill: number;
  customers: Cust[];
  week: { week: number; shiftIndex: number; endless: boolean } | null;
  event: { id: string; customer: string | null; choices: string[] } | null;
  eventsFired: string[];
  records: Array<{ customer: string; accepted: boolean; satisfaction: number }>;
  summary: Summary | null;
  line: { speaker: string; key: string; text: string } | null;
  paused: boolean;
}
export interface SaveView {
  seed: number;
  week: number;
  shift: number;
  cents: number;
  upgrades: string[];
  reports: Array<{ week: number; shift: number; summary: Summary }>;
  memoryOnly: boolean;
}
interface Debug {
  rush: RushState | null;
  save: SaveView;
  timeScale: number;
  project(x: number, y: number): { x: number; y: number };
}

export const readRush = (page: Page): Promise<RushState | null> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.rush);
export const readSave = (page: Page): Promise<SaveView> =>
  page.evaluate(() => (window as unknown as { __trial: Debug }).__trial.save);
export const setTimeScale = (page: Page, k: number): Promise<number> =>
  page.evaluate((x) => ((window as unknown as { __trial: Debug }).__trial.timeScale = x), k);

/** Poll the rush until `pred` holds; `tick` runs on every poll (e.g. take an order by key). */
export async function until(
  page: Page,
  pred: (s: RushState) => boolean,
  timeout = 60_000,
  tick?: (s: RushState) => Promise<void>,
): Promise<RushState> {
  const end = Date.now() + timeout;
  for (;;) {
    const s = await readRush(page);
    if (s && pred(s)) return s;
    if (Date.now() > end) {
      const brief = s && {
        ...s,
        customers: s.customers.map((c) => `${c.key}:${c.state}`),
        records: s.records.length,
      };
      throw new Error(`timed out waiting on the rush; last ${JSON.stringify(brief)}`);
    }
    if (s && tick) await tick(s);
    await page.waitForTimeout(30);
  }
}

// ---------------------------------------------------------------- where the hands go

/** The canvas spot the station's button is held on (clear of the HUD: checked, not assumed). */
const HOLD = [
  { x: 640, y: 400 },
  { x: 600, y: 380 },
  { x: 560, y: 360 },
];
/** Mouse height for a steam depth (mouse up = jug up = tip deeper), as in the Day 2 spec. */
const steamY = (depth: number, h: number): number => (0.2 + ((3 - depth) / 3.8) * 0.6) * h;

/** The first of `spots` where a press lands on the 3D canvas, not on a HUD panel. */
async function onCanvas(page: Page, spots: Array<{ x: number; y: number }>) {
  const free = await page.evaluate(
    (pts) => pts.map((p) => document.elementFromPoint(p.x, p.y)?.id === 'gl'),
    spots,
  );
  const i = free.indexOf(true);
  if (i < 0) throw new Error(`no free canvas spot among ${JSON.stringify(spots)}`);
  return spots[i] as { x: number; y: number };
}

// ---------------------------------------------------------------- the bot

const counterOf = (s: RushState): Cust | undefined =>
  s.customers.find((c) => c.state === 'ordering' || c.state === 'deciding');
const atRegister = (s: RushState): Cust | undefined =>
  s.customers.find((c) => c.state === 'register');
/** Tickets on the rail, oldest first (what F makes next and what 1–6 serve). */
const rail = (s: RushState): Cust[] =>
  s.customers
    .filter((c) => c.state === 'waiting' && c.heard)
    .sort((a, b) => (a.ticket ?? 0) - (b.ticket ?? 0));

/** Hands free: nothing held, and no shot about to need stopping. Clicks on the register only then. */
const handsFree = (s: RushState): boolean =>
  s.station === 'idle' ||
  s.station === 'ready' ||
  s.station === 'lock' ||
  (s.station === 'shot' && s.extracting && s.shotTime < 12);

export type Moment = 'ringUp' | 'shot' | 'shotRunning' | 'steam' | 'pour' | 'serve';

export interface BotOptions {
  /** Called at each kind of moment (screenshots); `s` is the state just before acting. */
  at?: (m: Moment, s: RushState) => Promise<void>;
  /** Real-time budget for the shift (ms). */
  timeout?: number;
}

export interface Played {
  end: RushState;
  log: string[];
}

/** Play the rush on screen from its intro to the report. */
export async function playShift(page: Page, o: BotOptions = {}): Promise<Played> {
  const log: string[] = [];
  const say = (s: RushState, m: string): void => {
    log.push(`${s.serviceTime.toFixed(1)} ${m}`);
  };
  const end = Date.now() + (o.timeout ?? 540_000);
  let lastT = 0;
  let target: string | null = null;
  let scale = 1;
  const pace = async (k: number): Promise<void> => {
    if (k !== scale) scale = await setTimeScale(page, k);
  };

  /** Hands busy: take an order by key (T works with the mouse held). Answers a card first. */
  const keys = async (s: RushState): Promise<void> => {
    if (s.event && s.station !== 'pour') {
      await page.keyboard.press('1');
      return;
    }
    if (atRegister(s) && !counterOf(s) && !s.event && Date.now() - lastT > 600) {
      lastT = Date.now();
      await page.keyboard.press('t');
    }
  };

  /** Hold the mouse on the canvas until `pred`, taking orders by key meanwhile. */
  const hold = async (
    at: { x: number; y: number },
    pred: (s: RushState) => boolean,
    timeout = 30_000,
  ): Promise<RushState> => {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    try {
      return await until(page, pred, timeout, keys);
    } finally {
      await page.mouse.up();
    }
  };

  const ringUp = async (c: Cust): Promise<void> => {
    const pos = page.locator('#pos');
    const click = (name: string) => pos.getByRole('button', { name, exact: true }).click();
    const od = c.order;
    await click(od.type === 'flatWhite' ? 'Flat white' : 'Long black');
    if (od.type === 'flatWhite') {
      const milk = { full: 'Full cream', oat: 'Oat', soy: 'Soy', almond: 'Almond' };
      await click(milk[od.milk ?? 'full']);
      await click(od.extraHot ? 'Extra hot' : 'Normal');
      await click(od.heart ? 'Heart' : 'No heart');
    }
    await page.keyboard.press('Enter');
    await until(page, (x) => x.customers.find((k) => k.key === c.key)?.state !== 'deciding', 8000);
  };

  const grind = async (): Promise<void> => {
    await hold(await onCanvas(page, HOLD), (s) => s.dose >= 18.4 || s.station !== 'grind');
    await page.getByRole('button', { name: /Tamp & lock in/ }).click();
    await until(page, (s) => s.station !== 'grind', 10_000);
  };

  const water = async (): Promise<void> => {
    await hold(await onCanvas(page, HOLD), (s) => s.water >= 0.6 || s.station !== 'water');
    await until(page, (s) => s.station !== 'water', 10_000);
  };

  const steam = async (s0: RushState): Promise<void> => {
    const h = page.viewportSize()?.height ?? 640;
    const made = s0.customers.find((c) => c.key === target);
    const hot = made?.heard?.extraHot ? 72 : 62;
    const xs = [640, 600, 560, 680];
    const top = await onCanvas(
      page,
      xs.map((x) => ({ x, y: steamY(0.25, h) })),
    );
    const deep = await onCanvas(
      page,
      xs.map((x) => ({ x, y: steamY(2.2, h) })),
    );
    await page.mouse.move(top.x, top.y);
    await page.mouse.down();
    try {
      await until(page, (s) => s.aeration >= 0.4 || s.station !== 'steam', 30_000, keys);
      await page.mouse.move(deep.x, deep.y, { steps: 4 });
      await until(page, (s) => s.temp >= hot || s.steamDone || s.station !== 'steam', 30_000, keys);
    } finally {
      await page.mouse.up();
    }
    await until(page, (s) => s.station !== 'steam', 10_000, keys);
  };

  const pour = async (): Promise<void> => {
    await until(page, (s) => s.station !== 'pour' || s.stationTime > 1.1, 10_000);
    const cup = await page.evaluate(() =>
      (window as unknown as { __trial: Debug }).__trial.project(0, -0.3),
    );
    const at = await onCanvas(page, [cup]);
    const s = await hold(at, (x) => x.fill >= 0.86 || x.station !== 'pour', 30_000);
    if (s.station === 'pour') {
      // Let go, then hand it over (the pour buttons sit to the side, clear of the cup).
      await page.waitForTimeout(250);
      const hand = page.getByRole('button', { name: /Hand it over/ });
      await hand.click({ timeout: 5000 }).catch(async (e: unknown) => {
        if ((await readRush(page))?.station === 'pour') throw e; // else it finished on its own
      });
    }
    await until(page, (x) => x.station !== 'pour', 10_000);
  };

  for (;;) {
    if (Date.now() > end) throw new Error(`the shift ran out of time:\n${log.join('\n')}`);
    const s = await readRush(page);
    if (!s) throw new Error('no rush running');
    if (s.phase === 'summary') {
      await pace(1);
      return { end: s, log };
    }
    if (s.phase === 'intro') {
      await page.mouse.click(640, 300); // a click skips Gaz's intro
      await page.waitForTimeout(200);
      continue;
    }
    if (s.phase !== 'service') {
      await page.waitForTimeout(100);
      continue;
    }

    // The register: an event card first, then whoever is waiting to order, then ring up.
    if (s.event && s.station !== 'pour') {
      say(s, `event ${s.event.id}: key 1`);
      await page.keyboard.press('1');
      await until(page, (x) => x.event?.id !== s.event?.id, 5000);
      continue;
    }
    const counter = counterOf(s);
    const reg = atRegister(s);
    if (reg && !counter && handsFree(s) && Date.now() - lastT > 600) {
      lastT = Date.now();
      say(s, `take ${reg.key}'s order`);
      await page
        .locator('#ractions button[data-a="takeOrder"]')
        .click({ timeout: 3000 })
        .catch(() => page.keyboard.press('t')); // the button was redrawn under the click: T
      continue;
    }
    if (counter?.state === 'deciding' && handsFree(s)) {
      await pace(1);
      await o.at?.('ringUp', s);
      say(s, `ring up ${counter.key}: ${JSON.stringify(counter.order)}`);
      await ringUp(counter);
      continue;
    }
    if (reg && !counter) await keys(s);

    // The station.
    const busy = s.station !== 'idle' || s.ready !== null || counter || reg || rail(s).length > 0;
    await pace(busy ? 1 : 2); // waiting for the next customer: hurry the clock
    switch (s.station) {
      case 'idle': {
        const next = rail(s)[0];
        if (!s.ready && next) {
          target = next.key;
          say(s, `make #${next.ticket} for ${next.key} (F)`);
          await page.keyboard.press('f');
          await until(page, (x) => x.station !== 'idle', 5000);
        }
        break;
      }
      case 'grind':
        await grind();
        break;
      case 'water':
        await water();
        break;
      case 'shot':
        if (!s.extracting && !s.shotDone) {
          await o.at?.('shot', s);
          const at = await onCanvas(page, HOLD);
          await page.mouse.click(at.x, at.y); // pump on
          await until(page, (x) => x.extracting || x.shotDone || x.station !== 'shot', 5000);
        } else if (s.extracting && s.shotTime >= 25.8) {
          const at = await onCanvas(page, HOLD);
          await page.mouse.click(at.x, at.y); // and off, in the window
          await until(page, (x) => x.shotDone || x.station !== 'shot', 5000);
          say(s, `shot stopped near ${s.shotTime.toFixed(1)} s`);
        } else if (s.extracting && s.shotTime >= 14 && s.shotTime < 22) {
          await o.at?.('shotRunning', s);
        }
        break;
      case 'steam':
        await o.at?.('steam', s);
        await steam(s);
        break;
      case 'pour':
        await o.at?.('pour', s);
        await pour();
        break;
      case 'ready': {
        if (!s.ready) break;
        const d = s.ready;
        const fits = (c: Cust): boolean =>
          c.heard !== null &&
          c.heard.type === d.type &&
          (d.type !== 'flatWhite' || (c.heard.milk ?? 'full') === d.milkType);
        const tickets = rail(s);
        const mine = tickets.find((c) => c.key === target);
        const who = mine && fits(mine) ? mine : tickets.find(fits);
        // The rail shows what 1–6 serve: find the ticket's place on it.
        const idx = who
          ? await page
              .locator('#rail .ticket .tn')
              .evaluateAll(
                (els, n) => els.findIndex((e) => e.textContent?.startsWith(`#${n} `)),
                who.ticket,
              )
          : -1;
        if (who && idx >= 0 && idx < 6) {
          await o.at?.('serve', s);
          say(s, `serve ${who.key} (key ${idx + 1})`);
          await page.keyboard.press(String(idx + 1));
          await until(page, (x) => x.ready === null || x.station !== 'ready', 5000);
        } else {
          say(s, 'nobody on the rail wants it: bin (B)');
          await page.keyboard.press('b');
          await until(page, (x) => x.ready === null, 5000);
        }
        break;
      }
      default:
        break;
    }
    await page.waitForTimeout(30);
  }
}
