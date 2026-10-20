// Reviewer-owned M6 acceptance. Use real core/app/audio paths, with the existing controlled
// wall/audio-clock harness. These are wiring tests, not proof of browser pixels or hardware.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installInput } from '../../src/app/input';
import { soundHeld } from '../../src/app/pause';
import { practiceAct, startPractice } from '../../src/app/practiceWiring';
import { rushAct } from '../../src/app/rushWiring';
import { act } from '../../src/app/trialWiring';
import { STEP } from '../../src/core/clock';
import { startDrink, stepBarista, type BaristaInput } from '../../src/core/barista';
import { createSaveStore } from '../../src/core/save/storage';
import { createGauges } from '../../src/ui/gauges';
import { CLIP_BY_FILE, clickThroughIntro, createHarness, type Harness } from './harness';

afterEach(() => vi.unstubAllGlobals());

async function service(): Promise<Harness> {
  const h = createHarness();
  h.app.nav.startDay2();
  const step = { n: 0 };
  h.beforeStep = (app) => clickThroughIntro(app, step);
  expect(await h.until(() => h.app.rush?.phase === 'service', 120)).toBe(true);
  h.beforeStep = null;
  return h;
}

function keyboard(h: Harness) {
  const win = Object.assign(new EventTarget(), window);
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', new EventTarget());
  const canvasEvents = new EventTarget();
  h.app.canvas.addEventListener = canvasEvents.addEventListener.bind(canvasEvents);
  h.app.store.load = createSaveStore(null).load;
  // The boot capture listener is installed before the production input handlers.
  win.addEventListener('keydown', () => h.audio.unlock(), { capture: true });
  h.beforeStep = installInput(h.app);
  return (key: string) =>
    win.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key }));
}

describe('M6 sound interruption input boundary', () => {
  it('the key that restores sound must not also bin the current drink', async () => {
    const h = await service();
    const r = h.app.rush!;
    const press = keyboard(h);
    rushAct(h.app, { type: 'make', drink: 'flatWhite' });
    await h.frame();
    expect(r.barista.phase).toBe('grind');
    const binned = r.barista.binned;
    await h.ctx().suspend();
    await h.frame();
    expect(soundHeld(h.app)).toBe(true);

    // boot.ts's capture listener unlocks before input.ts dispatches the same key to rushKey.
    // A running context before the next RAF is a valid successful resume, not an extra action.
    press('b');
    await h.frame();
    expect(h.ctx().state).toBe('running');
    expect(r.barista.binned, 'the resume gesture discarded the drink').toBe(binned);
    expect(r.barista.phase).toBe('grind');
  });

  it('a short press released during sound hold must not stop the shot on resume', async () => {
    const h = await service();
    const b = h.app.rush!.barista;
    const input: BaristaInput = {
      holding: false,
      pressed: false,
      cupX: 0,
      cupY: 0,
      hasCup: false,
      jugDepth: 1.5,
      heightDelta: 0,
      heightPreset: null,
      next: false,
    };
    startDrink(b, 'flatWhite', []);
    // Prepare a real running shot through the station, not by assigning its press state.
    input.holding = true;
    for (let i = 0; i < 120; i++) stepBarista(b, input, STEP, 0, []);
    input.holding = false;
    input.next = true;
    stepBarista(b, input, STEP, 0, []);
    input.next = false;
    for (let i = 0; i < 150; i++) stepBarista(b, input, STEP, 0, []);
    input.pressed = true;
    stepBarista(b, input, STEP, 0, []);
    input.pressed = false;
    stepBarista(b, input, STEP, 0, []);
    expect(b.phase).toBe('shot');
    expect(b.espresso.extracting).toBe(true);
    // Start a new short hold; release happens while no sim steps run.
    h.app.input.holding = true;
    h.app.input.pressed = true;
    await h.frame();
    expect(b.press.held).toBeGreaterThan(0);
    await h.ctx().suspend();
    await h.frame();
    h.app.input.holding = false;
    await h.run(1);
    h.audio.unlock();
    await h.frame();
    expect(b.espresso.extracting, 'a release during interruption became a shot-stop click').toBe(
      true,
    );
  });
});

it('Q5 now applies to Day 1 too: requested text waits for the delayed voice', async () => {
  // Replaces the old M5 rush-only documentation concern under the now-answered Q5.
  const h = createHarness({ plan: () => ({ status: 200, delay: 3 }) });
  const requested: string[] = [];
  const shown: string[] = [];
  h.app.hud.onLine = (line) => requested.push(line.text);
  h.app.hud.onSay = (line) => shown.push(line.text);
  act(h.app, 'start');
  await h.run(0.5);
  expect(requested.length).toBeGreaterThan(0);
  expect(shown).toEqual([]);
  expect(await h.until(() => shown.length > 0, 4)).toBe(true);
  expect(h.starts[0]!.text).toBe(requested[0]);
  expect(shown[0]).toBe(requested[0]);
});

function practice(delay: number) {
  const h = createHarness({
    plan: (file) => ({
      status: 200,
      delay: CLIP_BY_FILE.get(file)?.characterId === 'gaz' ? delay : 0,
    }),
  });
  const shown: string[] = [];
  h.app.practiceHud = {
    ...h.app.practiceHud,
    onPhase: vi.fn(),
    update: vi.fn(),
    onSay: (line) => shown.push(line.text),
  };
  startPractice(h.app);
  return { h, shown };
}

describe('M6 practice captions and cancellation (Q5)', () => {
  it('skipping a loading demo must cancel its pending narration and subtitle', async () => {
    const { h, shown } = practice(3);
    practiceAct(h.app, 'demo');
    await h.run(0.5);
    expect(h.audio.loading).toBe(true);
    expect(shown).toEqual([]);
    practiceAct(h.app, 'skip');
    await h.frame();
    expect(h.app.practice!.phase).toBe('pour');
    expect(h.app.practice!.speech.current).toBeNull();
    await h.run(4);
    expect
      .soft(h.starts, 'cancelled demo narration played after returning to practice')
      .toEqual([]);
    expect(shown, 'cancelled demo dispatched a late subtitle').toEqual([]);
  });

  it('an unskipped slow demo waits for audio and then shows its requested words', async () => {
    const { h, shown } = practice(3);
    practiceAct(h.app, 'demo');
    await h.run(0.5);
    const text = h.app.practice!.speech.current!.text;
    expect(shown).toEqual([]);
    expect(await h.until(() => shown.length > 0, 4)).toBe(true);
    expect(h.starts[0]!.text).toBe(text);
    expect(shown).toEqual([text]);
  });

  it('voices off shows the practice line immediately', async () => {
    const { h, shown } = practice(3);
    h.audio.voiceEnabled = false;
    practiceAct(h.app, 'demo');
    await h.frame();
    expect(shown).toEqual([h.app.practice!.speech.current!.text]);
    expect(h.starts).toEqual([]);
  });
});

it('Q4 renders and rebuilds the actual milk card target on a hot-to-normal ticket switch', () => {
  // This adapter captures the production HTML; it does not calculate the target for the HUD.
  // Dynamic gauge needles are unrelated to this card-markup assertion.
  const root = {
    innerHTML: '',
    classList: { toggle: vi.fn() },
    querySelectorAll: () => [],
  };
  const g = createGauges(root as unknown as HTMLElement, false);
  const h = createHarness();
  const v = { ...h.app.trial, extraHot: true };
  g.update('steam', v);
  expect(root.innerHTML).toContain('68–74 °C');
  const zone = root.innerHTML.match(/class="zone" style="bottom:([\d.]+)%;height:([\d.]+)%/);
  expect(zone).not.toBeNull();
  expect(Number(zone![1])).toBeCloseTo((68 / 85) * 100, 1);
  expect(Number(zone![2])).toBeCloseTo((6 / 85) * 100, 1);
  g.update('steam', { ...v, extraHot: false });
  expect(root.innerHTML).toContain('55–65 °C');
  expect(root.innerHTML).not.toContain('68–74 °C');
});

it('T6.5 must not be ticked while its broader branch verifier is explicitly pending', () => {
  const todo = readFileSync(new URL('../../todo.md', import.meta.url), 'utf8');
  const task = todo.match(/^- \[([ x!])\] T6\.5\b[\s\S]*?(?=\n- \[|\n\n)/m);
  expect(task, 'retain the task and its verification contract').not.toBeNull();
  if (task![1] !== 'x') return; // Marking the unresolved task incomplete is honest too.
  const broadVerifier = /every remaining branch.*unmerged.*worktree/.test(task![0]);
  const pending = /T6\.5's verify[\s\S]*?waits on that/.test(todo);
  // Narrowing the verifier to Q2's approved list resolves this without deleting extra refs.
  expect(
    broadVerifier && pending,
    'T6.5 is complete but its own remaining-branches verifier still waits on Edward',
  ).toBe(false);
});
