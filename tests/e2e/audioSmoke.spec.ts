// Audio smoke tests with voices ON, in Chromium (headless shell, SwiftShader). What these prove:
// clips are fetched and decoded to their manifest length, the AudioContext clock advances while
// they play, signal reaches the voice bus and the master gain (the node feeding the output
// device), one line plays at a time, subtitles and the sim follow the audio, and orders move on
// when the audio ends. What they can't prove: that anything is audible or sounds natural to a
// person. Playwright's headless shell runs with --mute-audio, so the device output is muted
// even though the whole Web Audio graph runs.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { clipServed } from './helpers/voiceProbe';

interface PlayRecord {
  id: string;
  speaker: string;
  text: string;
  via: 'clip' | 'tts';
  manifestDuration: number;
  bufferDuration: number;
  startedAt: number;
  endedAt: number | null;
  maxRms: number;
  maxMasterRms: number;
  interrupted: boolean;
  error: string | null;
}
interface AudioDebug {
  status: string;
  contextState: string;
  currentTime: number;
  history: PlayRecord[];
  voices: { live: number; fading: number; maxLive: number; maxAudible: number };
  output: { state: string; sampleRate: number; destinationChannels: number; sinkId: string } | null;
}
interface Tick {
  t: number;
  /** Game time. Lags the audio clock whenever a frame takes longer than the 0.1 s step cap. */
  sim: number;
  now: number;
  clip: { text: string; endedAt: number | null; via: string } | null;
  playing: boolean;
  line: string | null;
  subs: string;
  counter: { id: string; state: string } | null;
  live: number;
}
interface RushLite {
  phase: string;
  customers: Array<{ id: string; state: string; listen: { replays: number } }>;
}

type W = { __trial: { audio: AudioDebug; audioTick: Tick; rush: RushLite | null } };

const manifest = JSON.parse(
  readFileSync(new URL('../../src/data/voice/manifest.json', import.meta.url), 'utf8'),
) as { clips: Array<{ file: string; characterId: string }> };

const audio = (page: Page): Promise<AudioDebug> =>
  page.evaluate(() => (window as unknown as W).__trial.audio);
const rush = (page: Page): Promise<RushLite | null> =>
  page.evaluate(() => (window as unknown as W).__trial.rush);

/** Snapshot the audio/sim/subtitle state every animation frame for `ms`. */
const sample = (page: Page, ms: number): Promise<Tick[]> =>
  page.evaluate(async (dur) => {
    const out: Tick[] = [];
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const f = (): void => {
        out.push({ ...(window as unknown as W).__trial.audioTick, now: performance.now() });
        if (performance.now() - t0 < dur) requestAnimationFrame(f);
        else done();
      };
      requestAnimationFrame(f);
    });
    return out;
  }, ms);

async function needClips(page: Page): Promise<void> {
  for (const who of ['gaz', 'dazza']) {
    const c = manifest.clips.find((x) => x.characterId === who);
    const ok = c ? await clipServed(page.request, c.file) : false;
    test.skip(!ok, 'voice clips not rendered on this machine (run `npm run voices`)');
  }
}

async function toDazzaAtRegister(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Day 2: The morning rush/ }).click();
  for (let i = 0; i < 60; i++) {
    const r = await rush(page);
    if (
      r &&
      r.phase === 'service' &&
      r.customers.some((c) => c.id === 'dazza' && c.state === 'register')
    )
      return;
    if (r?.phase === 'intro') await page.mouse.click(640, 300);
    await page.waitForTimeout(250);
  }
  throw new Error('Dazza never reached the register');
}

test.describe('voice on', () => {
  test.setTimeout(150_000);

  test('owner speaks after Start; subtitles and the sim follow the audio; output path active', async ({
    page,
  }) => {
    await page.goto('/?seed=7&ibis=0');
    await needClips(page);
    await page.getByRole('button', { name: 'Day 1: Start the trial' }).click();
    const ticks = await sample(page, 12_000);
    const a = await audio(page);
    const first = a.history[0]!;
    expect(first.via).toBe('clip');
    expect(Math.abs(first.bufferDuration - first.manifestDuration)).toBeLessThan(0.05);
    expect(first.endedAt).not.toBeNull();
    expect(first.interrupted).toBe(false);
    expect(first.endedAt! - first.startedAt).toBeGreaterThan(first.bufferDuration - 0.1);
    // Signal on the voice bus and after the master gain (the node feeding the device).
    expect(first.maxRms).toBeGreaterThan(0.02);
    expect(first.maxMasterRms).toBeGreaterThan(0.01);
    expect(a.output?.state).toBe('running');
    expect(a.output?.destinationChannels).toBeGreaterThanOrEqual(1);

    // While a line's clip plays, the sim is on that line and the subtitle is typing that line.
    const T = first.text;
    const during = ticks.filter((k) => k.clip?.text === T && k.clip.endedAt === null && k.playing);
    expect(during.length).toBeGreaterThan(20);
    expect(during.every((k) => k.line === T)).toBe(true);
    expect(during.every((k) => T.startsWith(k.subs))).toBe(true);
    expect(during.some((k) => k.subs === T)).toBe(true);
    // The audio clock advances while it plays.
    expect(during[during.length - 1]!.t).toBeGreaterThan(during[0]!.t + first.bufferDuration * 0.7);
    // The sim never moves on before the audio ends (no line is ever cut short), and moves on
    // within the 0.35 s tail after it, plus however far game time fell behind the audio clock
    // (slow software-GL frames are capped at 0.1 s of game time each).
    const moved = ticks.find((k) => k.line !== T && k.t > first.startedAt + 0.1);
    expect(moved).toBeDefined();
    expect(moved!.t).toBeGreaterThanOrEqual(first.endedAt! - 0.02);
    const a0 = during[0]!;
    const lag = moved!.t - a0.t - (moved!.sim - a0.sim);
    expect(moved!.t - first.endedAt!).toBeLessThan(0.35 + Math.max(0, lag) + 0.25);
    // Never two lines at full volume.
    expect(ticks.every((k) => k.live <= 1)).toBe(true);
    expect(a.voices.maxAudible).toBeLessThanOrEqual(1);
    console.log(
      `owner: "${T.slice(0, 40)}…" ${first.bufferDuration.toFixed(3)} s, voice RMS ${first.maxRms.toFixed(3)}, ` +
        `master RMS ${first.maxMasterRms.toFixed(3)}, sim moved on ${(moved!.t - first.endedAt!).toFixed(3)} s after the clip ` +
        `(game time ${lag.toFixed(3)} s behind audio over the line); ` +
        `output ${JSON.stringify(a.output)}`,
    );
  });

  test('a customer order is voiced; the order moves on when the audio ends; replay, interruption, pause', async ({
    page,
  }) => {
    await page.goto('/?seed=7&ibis=0');
    await needClips(page);
    await toDazzaAtRegister(page);
    await page.getByRole('button', { name: /Take Dazza's order/ }).click();
    const ticks = await sample(page, 7_000);
    let a = await audio(page);
    const order = a.history.find((h) => h.speaker === 'dazza')!;
    expect(order.via).toBe('clip');
    expect(Math.abs(order.bufferDuration - order.manifestDuration)).toBeLessThan(0.05);
    expect(order.endedAt).not.toBeNull();
    expect(order.maxRms).toBeGreaterThan(0.02);
    // Ordering while the clip plays; deciding (register open) only once it has ended.
    const playing = ticks.filter(
      (k) => k.clip?.text === order.text && k.clip.endedAt === null && k.playing,
    );
    expect(playing.length).toBeGreaterThan(10);
    expect(playing.every((k) => k.counter?.id === 'dazza' && k.counter.state === 'ordering')).toBe(
      true,
    );
    const decided = ticks.find((k) => k.counter?.state === 'deciding');
    expect(decided).toBeDefined();
    expect(decided!.t).toBeGreaterThanOrEqual(order.endedAt! - 0.02);
    const p0 = playing[0]!;
    const lag = decided!.t - p0.t - (decided!.sim - p0.sim);
    expect(decided!.t - order.endedAt!).toBeLessThan(0.35 + Math.max(0, lag) + 0.25);
    console.log(
      `order: "${order.text.slice(0, 40)}…" ${order.bufferDuration.toFixed(3)} s; register opened ` +
        `${(decided!.t - order.endedAt!).toFixed(3)} s after the clip (game time ${lag.toFixed(3)} s behind audio)`,
    );

    // Replay: the same clip again, counted by the sim.
    const pos = page.locator('#pos');
    await pos.getByRole('button', { name: /Replay/ }).click();
    await expect
      .poll(async () => (await audio(page)).history.filter((h) => h.text === order.text).length)
      .toBe(2);
    await expect
      .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.listen.replays)
      .toBe(1);
    await expect.poll(async () => (await audio(page)).history.at(-1)!.endedAt).not.toBeNull();
    const replayed = (await audio(page)).history.at(-1)!;
    expect(replayed.interrupted).toBe(false);
    expect(replayed.endedAt! - replayed.startedAt).toBeGreaterThan(replayed.bufferDuration - 0.1);

    // Interruption: asking a question mid-replay cuts the replay; only one line is ever audible.
    await pos.getByRole('button', { name: /Replay/ }).click();
    await page.waitForTimeout(500);
    await pos.getByRole('button', { name: 'Milk?' }).click();
    await expect.poll(async () => (await audio(page)).history.at(-1)!.speaker).toBe('dazza');
    await expect.poll(async () => (await audio(page)).history.at(-1)!.text).not.toBe(order.text);
    // The cut clip fades for 60 ms, then ends.
    await expect.poll(async () => (await audio(page)).history.at(-2)!.endedAt).not.toBeNull();
    a = await audio(page);
    const cut = a.history.at(-2)!;
    expect(cut.text).toBe(order.text);
    expect(cut.interrupted).toBe(true);
    expect(cut.endedAt! - cut.startedAt).toBeLessThan(cut.bufferDuration - 0.5);
    expect(a.voices.maxAudible).toBeLessThanOrEqual(1);

    // Pause mid-clip freezes the audio clock; resume finishes the same clip, uncut.
    await expect.poll(async () => (await audio(page)).history.at(-1)!.endedAt).not.toBeNull();
    await pos.getByRole('button', { name: /Replay/ }).click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await audio(page)).contextState).toBe('suspended');
    const frozen = (await audio(page)).currentTime;
    await page.waitForTimeout(800);
    expect((await audio(page)).currentTime).toBe(frozen);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await audio(page)).contextState).toBe('running');
    await expect
      .poll(async () => (await audio(page)).history.at(-1)!.endedAt, { timeout: 15_000 })
      .not.toBeNull();
    const resumed = (await audio(page)).history.at(-1)!;
    expect(resumed.interrupted).toBe(false);
    expect(Math.abs(resumed.endedAt! - resumed.startedAt - resumed.bufferDuration)).toBeLessThan(
      0.15,
    );
  });

  test('a customer clip that fails to load falls back to the browser voice; the order still moves on', async ({
    page,
  }) => {
    await page.route('**/assets/voice/dazza/**', (r) =>
      r.fulfill({ status: 404, body: 'missing' }),
    );
    await page.goto('/?seed=7&ibis=0');
    await needClips(page).catch(() => undefined); // dazza is 404 on purpose here
    const gazClip = manifest.clips.find((x) => x.characterId === 'gaz')!;
    test.skip(!(await page.request.get(`/${gazClip.file}`)).ok(), 'voice clips not rendered');
    await toDazzaAtRegister(page);
    await page.getByRole('button', { name: /Take Dazza's order/ }).click();
    await expect.poll(async () => (await audio(page)).history.at(-1)?.speaker).toBe('dazza');
    await expect.poll(async () => (await audio(page)).history.at(-1)?.via).toBe('tts');
    const a = await audio(page);
    expect(a.history.at(-1)!.error).toMatch(/404/);
    expect(a.status).toMatch(/fallback|error/);
    await expect(page.locator('#audioToast')).toBeVisible();
    // Gaz's lines still came from clips.
    expect(a.history.some((h) => h.speaker === 'gaz' && h.via === 'clip')).toBe(true);
    // The sim doesn't wait for audio: the register opens on the line's own timing.
    await expect
      .poll(async () => (await rush(page))!.customers.find((c) => c.id === 'dazza')!.state, {
        timeout: 15_000,
      })
      .toBe('deciding');
  });
});
