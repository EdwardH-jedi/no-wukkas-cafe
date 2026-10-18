// Independent M2 acceptance: real app/core paths with persistent storage and recording HUDs.
// No DOM layout or hardware audio claim is made by these Node fixtures.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onShiftSummary } from '../../src/app/weekWiring';
import { stepPress } from '../../src/core/barista';
import { createRush } from '../../src/core/rush';
import { serve } from '../../src/core/rush/serve';
import { createSaveStore, SAVE_KEY, type KeyValueStorage } from '../../src/core/save/storage';
import { endlessFor, weekFor } from '../../src/core/week/session';
import { VOICE_MANIFEST } from '../../src/data/voice';
import { DEFAULT_KEYS, newSave } from '../../src/sim/contracts/save';
import type { ShiftSummary } from '../../src/sim/rush';
import { createHarness } from './harness';
import { drinkFor } from './leftCustomerSilent';

afterEach(() => vi.unstubAllGlobals());

const report: ShiftSummary = {
  customers: 1,
  ordersCompleted: 1,
  correctOrders: 0,
  walkouts: 0,
  avgServeSeconds: 30,
  satisfaction: 20,
  tipsCents: 40,
  wasted: 0,
  grade: 'disaster',
};

class Disk implements KeyValueStorage {
  raw: string;
  writes = 0;
  constructor(value: unknown) {
    this.raw = JSON.stringify(value);
  }
  getItem(key: string): string | null {
    return key === SAVE_KEY ? this.raw : null;
  }
  setItem(key: string, value: string): void {
    expect(key).toBe(SAVE_KEY);
    this.raw = value;
    this.writes++;
  }
}

describe('independent M2 save compatibility and app autosave', () => {
  for (const version of [2, 3]) {
    it(`v${version}: an incorrect accepted drink survives failed-shift autosave and a fresh reload without losing lastOrder`, () => {
      const lastOrder = { type: 'longBlack' as const, milk: null, extraHot: false, heart: false };
      const disk = new Disk({
        ...newSave({ seed: 7 }),
        version,
        keys: version === 2 ? undefined : { action: 'j', replay: 'k', serve: 'n' },
        shift: 1,
        regulars: { dazza: { visits: 4, affinity: 2, lastOrder } },
      });
      const h = createHarness();
      const app = { ...h.app, store: createSaveStore(disk) };
      const r = createRush(7, 'normal', {}, weekFor(app.store.load()));
      const c = r.customers.find((customer) => customer.def.id === 'dazza')!;
      c.order = { type: 'flatWhite', milk: 'full', extraHot: false, heart: false };
      c.heard = { ...c.order };
      c.state = 'waiting';
      c.ticket = 1;
      c.registerAt = r.time;
      r.barista.ready = { ...drinkFor(c, r.time), temp: 72 };
      r.barista.phase = 'ready';
      serve(r, c.key);
      expect(c.result).toMatchObject({ accepted: true, correct: false });
      // A duplicate click after acceptance cannot count the same drink twice.
      serve(r, c.key);
      expect(r.shiftEvents.visits).toEqual({ dazza: 1 });
      onShiftSummary(app, r, { type: 'summary', summary: report });
      expect(disk.writes).toBe(1);
      const loaded = createSaveStore(disk).load();
      expect(loaded.regulars.dazza).toEqual({ visits: 5, affinity: 2, lastOrder });
      expect(loaded).toMatchObject({ version: 3, shift: 1, cents: 40 });
      expect(loaded.reports).toHaveLength(1);
      expect(loaded.keys).toEqual(
        version === 2 ? DEFAULT_KEYS : { action: 'j', replay: 'k', serve: 'n' },
      );
    });
  }

  it.each(['day2', 'endless'] as const)(
    '%s summary must not persist visits or affinity',
    (mode) => {
      const disk = new Disk(newSave());
      const h = createHarness();
      const app = { ...h.app, store: createSaveStore(disk) };
      const before = disk.raw;
      const r = createRush(7, 'normal', {}, mode === 'endless' ? endlessFor(newSave()) : undefined);
      r.shiftEvents.visits.dazza = 1;
      r.shiftEvents.affinity.dazza = 1;
      onShiftSummary(app, r, { type: 'summary', summary: report });
      expect(disk.writes).toBe(0);
      expect(disk.raw).toBe(before);
    },
  );
});

describe('independent shared pause harness coverage', () => {
  it('pause must synchronise all HUDs and audio and prevent a released hold becoming a click', async () => {
    const h = createHarness();
    h.audio.unlock();
    h.app.mode = 'rush';
    h.app.rush = createRush(7);
    const huds = [h.app.hud, h.app.rushHud, h.app.practiceHud].map((hud) =>
      vi.spyOn(hud, 'setPaused'),
    );
    h.app.held = h.app.spaceHeld = true;
    const press = h.app.rush.barista.press;
    press.gate.armed = true;
    press.held = 0.1;
    h.app.setPaused(true);
    expect(h.app.clock.paused).toBe(true);
    expect(h.ctx().state).toBe('suspended');
    expect([h.app.held, h.app.spaceHeld]).toEqual([false, false]);
    const time = h.ctx().currentTime;
    await h.run(0.2);
    expect(h.ctx().currentTime).toBe(time);
    h.app.resumeAll();
    expect(h.app.clock.paused).toBe(false);
    expect(h.ctx().state).toBe('running');
    expect(stepPress(press, { holding: false, pressed: false }, 1 / 60)).toEqual({
      click: false,
      steam: false,
    });
    for (const hud of huds) expect(hud.mock.calls).toEqual([[true], [false]]);
  });

  it('title pause is a no-op, but a subsequent rush pause must actually suspend audio', () => {
    const h = createHarness();
    h.audio.unlock();
    h.app.setPaused(true);
    expect(h.app.clock.paused).toBe(false);
    expect(h.ctx().state).toBe('running');
    h.app.mode = 'rush';
    h.app.rush = createRush(7);
    h.app.setPaused(true);
    expect(h.app.clock.paused).toBe(true);
    expect(h.ctx().state).toBe('suspended');
  });

  for (const mode of ['trial', 'practice', 'rush'] as const) {
    it(`${mode}: replay captions must wait for resumed audio and target exactly that HUD`, async () => {
      const h = createHarness();
      h.audio.unlock();
      const clip = VOICE_MANIFEST.clips.find((c) => c.characterId === 'dazza')!;
      h.audio.say({ speaker: clip.characterId, text: clip.transcript });
      await h.run(0.1);
      expect(h.audio.speaking).toBe(true);
      const replay = {
        trial: vi.spyOn(h.app.hud, 'onReplay'),
        practice: vi.spyOn(h.app.practiceHud, 'onReplay'),
        rush: vi.spyOn(h.app.rushHud, 'onReplay'),
      };
      const stopped = vi.spyOn(h.app.rushHud, 'onStop');
      h.app.mode = mode;
      await h.ctx().suspend();
      h.replay();
      // Do not drive gameplay here: these are isolated audio/wall-clock tasks.
      for (let i = 0; i < 20; i++) await Promise.resolve();
      h.audio.update();
      for (const spy of Object.values(replay)) expect(spy).not.toHaveBeenCalled();
      await h.ctx().resume();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      h.audio.update();
      expect(replay[mode]).toHaveBeenCalledTimes(1);
      expect(replay[mode].mock.calls[0]).toContain(clip.transcript);
      for (const other of ['trial', 'practice', 'rush'] as const)
        if (other !== mode) expect(replay[other]).not.toHaveBeenCalled();
      h.audio.stopVoice({ forget: true });
      expect(stopped).toHaveBeenCalledTimes(mode === 'rush' ? 1 : 0);
    });
  }
});
