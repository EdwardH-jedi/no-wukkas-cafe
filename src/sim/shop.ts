// The café upgrade shop: what the player's upgrades make the station do, and buying one out of the
// save's till. Pure: no DOM, no randomness, integer cents. The catalogue and its prices are
// data/upgrades.ts.

import { UPGRADES, type Upgrade } from '../data/upgrades';
import type { Save } from './contracts/save';

export type StationParams = Record<Upgrade['param'], number>;

/** The station before any upgrade: today's behaviour (every upgrade's `from`). */
export const BASE_STATION: Readonly<StationParams> = {
  grindSpeed: 1,
  groupHeads: 1,
  steamSpeed: 1,
  ticketsShown: 3,
};

/** What the station does with these upgrades owned (unknown ids are ignored). */
export function stationParams(owned: readonly string[]): StationParams {
  const s: StationParams = { ...BASE_STATION };
  for (const u of UPGRADES) if (owned.includes(u.id)) s[u.param] = u.to;
  return s;
}

export type BuyResult =
  { ok: true; save: Save; upgrade: Upgrade } | { ok: false; reason: 'unknown' | 'owned' | 'short' };

/** Buy an upgrade with the save's cents. Returns a new save; the one passed in is untouched. */
export function buyUpgrade(save: Save, id: string): BuyResult {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return { ok: false, reason: 'unknown' };
  if (save.upgrades.includes(id)) return { ok: false, reason: 'owned' };
  if (save.cents < u.costCents) return { ok: false, reason: 'short' };
  return {
    ok: true,
    save: { ...save, cents: save.cents - u.costCents, upgrades: [...save.upgrades, id] },
    upgrade: u,
  };
}
