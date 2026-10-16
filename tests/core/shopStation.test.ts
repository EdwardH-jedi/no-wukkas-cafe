// Upgrades bought in the shop reach the machine through the week context (core/week/session.ts →
// createRush → the barista), survive a save round-trip, and leave Day 2's station as it was.

import { describe, expect, it } from 'vitest';
import { createBarista, stepBarista, type BaristaInput } from '../../src/core/barista';
import { createRush, restartRush } from '../../src/core/rush';
import { createSaveStore, type KeyValueStorage } from '../../src/core/save/storage';
import { endlessFor, weekFor } from '../../src/core/week/session';
import { UPGRADES } from '../../src/data/upgrades';
import { newSave } from '../../src/sim/contracts/save';
import { BASE_STATION, buyUpgrade, stationParams } from '../../src/sim/shop';
import { railOrder } from '../../src/ui/rushHud';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

const ALL = UPGRADES.map((u) => u.id);
const hold: BaristaInput = {
  holding: true,
  pressed: false,
  cupX: 0,
  cupY: 0,
  hasCup: false,
  jugDepth: 1.5,
  heightDelta: 0,
  heightPreset: null,
  next: false,
};

describe('upgrades at the station', () => {
  it("Day 2 and an upgrade-free week keep today's station", () => {
    expect(createRush(7).barista.station).toEqual(BASE_STATION);
    const week = weekFor(newSave({ seed: 7 }));
    expect(createRush(7, 'normal', {}, week).barista.station).toEqual(BASE_STATION);
  });

  it("the save's upgrades reach the machine for a week shift, Endless and a restart", () => {
    const save = { ...newSave({ seed: 7 }), upgrades: ALL };
    const want = stationParams(ALL);
    expect(want).toEqual({ grindSpeed: 1.4, groupHeads: 2, steamSpeed: 1.3, ticketsShown: 6 });
    const r = createRush(7, 'normal', {}, weekFor(save));
    expect(r.barista.station).toEqual(want);
    expect(createRush(7, 'normal', {}, endlessFor(save)).barista.station).toEqual(want);
    restartRush(r);
    expect(r.barista.station).toEqual(want);
  });

  it('a better grinder doses faster and a better wand heats faster', () => {
    const dose = (ids: string[]): number => {
      const b = createBarista(stationParams(ids));
      b.phase = 'grind';
      stepBarista(b, hold, 1, 0, []);
      return b.espresso.dose;
    };
    expect(dose(['grinder']) / dose([])).toBeCloseTo(1.4, 9);
    const temp = (ids: string[]): number => {
      const b = createBarista(stationParams(ids));
      b.phase = 'steam';
      b.drink = 'flatWhite';
      for (let i = 0; i < 30; i++) stepBarista(b, hold, 1 / 60, i / 60, []);
      return b.steam.temp;
    };
    expect(temp(['steamWand'])).toBeGreaterThan(temp([]));
  });

  it('the docket rail shows three tickets in week mode, six with the upgrade; Day 2 shows all', () => {
    const wait = (r: ReturnType<typeof createRush>): void => {
      r.customers.forEach((c, i) => {
        c.state = 'waiting';
        c.ticket = i + 1;
      });
    };
    const plain = createRush(7, 'normal', {}, weekFor({ ...newSave({ seed: 7 }), shift: 4 }));
    wait(plain);
    expect(plain.customers.length).toBeGreaterThan(6);
    expect(railOrder(plain).map((c) => c.ticket)).toEqual([1, 2, 3]);
    const railed = createRush(
      7,
      'normal',
      {},
      weekFor({ ...newSave({ seed: 7 }), shift: 4, upgrades: ['docketRail'] }),
    );
    wait(railed);
    expect(railOrder(railed)).toHaveLength(6);
    const day2 = createRush(7);
    wait(day2);
    expect(railOrder(day2)).toHaveLength(day2.customers.length);
  });

  it('a bought upgrade survives a save round-trip', () => {
    const disk = new MemoryStorage();
    const store = createSaveStore(disk, { seed: 9 });
    store.save({ ...store.load(), cents: 130_000 });
    const bought = buyUpgrade(store.load(), 'secondGroup');
    expect(bought.ok).toBe(true);
    if (bought.ok) store.save(bought.save);
    const again = createSaveStore(disk, { seed: 9 }).load();
    expect(again.upgrades).toEqual(['secondGroup']);
    const price = UPGRADES.find((u) => u.id === 'secondGroup')?.costCents ?? NaN;
    expect(again.cents).toBe(130_000 - price);
    expect(weekFor(again).station?.groupHeads).toBe(2);
  });
});
