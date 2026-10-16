import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../../src/data/upgrades';
import { newSave } from '../../src/sim/contracts/save';
import { BASE_STATION, buyUpgrade, stationParams } from '../../src/sim/shop';

const price = (id: string): number => UPGRADES.find((u) => u.id === id)?.costCents ?? NaN;

describe('the upgrade shop', () => {
  it("with nothing owned the station is today's: every upgrade's `from`", () => {
    expect(stationParams([])).toEqual(BASE_STATION);
    for (const u of UPGRADES) expect(BASE_STATION[u.param]).toBe(u.from);
  });

  it('each owned upgrade sets its own parameter, and unknown ids do nothing', () => {
    const all = stationParams(UPGRADES.map((u) => u.id));
    for (const u of UPGRADES) expect(all[u.param]).toBe(u.to);
    expect(stationParams(['grinder', 'nope'])).toEqual({ ...BASE_STATION, grindSpeed: 1.4 });
  });

  it('buys out of the till in integer cents and records the id; the old save is untouched', () => {
    const save = { ...newSave({ seed: 3 }), cents: 50_000 };
    const r = buyUpgrade(save, 'grinder');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.cents).toBe(50_000 - price('grinder'));
    expect(Number.isInteger(r.save.cents)).toBe(true);
    expect(r.save.upgrades).toEqual(['grinder']);
    expect(save.cents).toBe(50_000);
    expect(save.upgrades).toEqual([]);
  });

  it("refuses what the till can't cover, what's owned, and what doesn't exist", () => {
    const save = { ...newSave(), cents: price('grinder') - 1 };
    expect(buyUpgrade(save, 'grinder')).toEqual({ ok: false, reason: 'short' });
    expect(buyUpgrade({ ...save, cents: 99_999, upgrades: ['grinder'] }, 'grinder')).toEqual({
      ok: false,
      reason: 'owned',
    });
    expect(buyUpgrade(save, 'espressoRobot')).toEqual({ ok: false, reason: 'unknown' });
    // Exactly enough is enough.
    const exact = buyUpgrade({ ...save, cents: price('docketRail') }, 'docketRail');
    expect(exact.ok && exact.save.cents).toBe(0);
  });
});
