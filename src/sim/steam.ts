// Steaming milk. Hold the steam valve open; move the jug to set how deep the wand tip sits.
// Tip just under the surface → it "chirps" and stretches air in (do this early, while the milk
// is cold). Deeper → a whirlpool that heats and polishes the foam. Tip out of the milk → it
// screams and sprays big bubbles. Close the valve at 55–65 °C.

import { band, clamp } from './math';
import type { MilkQuality } from './milk';

export const START_TEMP = 5;
export const HEAT_RATE = 6.2; // °C per second with the valve open
export const TARGET_TEMP: readonly [number, number] = [55, 65];
export const SCALD_TEMP = 78;
export const AERATION_TARGET: readonly [number, number] = [0.3, 0.6];
/** Tip depth (cm below the surface) bands. */
export const CHIRP_DEPTH: readonly [number, number] = [0, 1.0];
/** How much the surface rises as foam builds, cm per unit of aeration. */
const FOAM_RISE_CM = 1.6;
const AERATE_RATE = 0.13; // aeration per second in the chirp zone (cold milk)

export type SteamZone = 'off' | 'screech' | 'chirp' | 'whirl';

export interface SteamState {
  temp: number;
  aeration: number;
  bubbles: number;
  valveOpen: boolean;
  /** Where the player holds the jug: tip depth before foam rise, cm. */
  jugDepth: number;
  zone: SteamZone;
  /** Seconds the valve has been open in total. */
  steamTime: number;
  done: boolean;
}

export function createSteam(): SteamState {
  return {
    temp: START_TEMP,
    aeration: 0,
    bubbles: 0,
    valveOpen: false,
    jugDepth: 1.5,
    zone: 'off',
    steamTime: 0,
    done: false,
  };
}

/** Actual tip depth: foam lifts the surface, so the tip ends up deeper unless you lower the jug. */
export function tipDepth(s: SteamState): number {
  return s.jugDepth + s.aeration * FOAM_RISE_CM;
}

/** Milk volume relative to the cold pour (foam takes up space). */
export function milkVolume(s: SteamState): number {
  return 1 + 0.55 * s.aeration;
}

export function stepSteam(s: SteamState, valveOpen: boolean, jugDepth: number, dt: number): void {
  s.valveOpen = valveOpen;
  s.jugDepth = jugDepth;
  if (!valveOpen) {
    s.zone = 'off';
    // Milk cools a touch and the bubbles settle while you hesitate.
    s.temp = Math.max(START_TEMP, s.temp - 0.15 * dt);
    return;
  }
  s.steamTime += dt;
  s.temp = Math.min(95, s.temp + HEAT_RATE * dt);
  const d = tipDepth(s);
  if (d < CHIRP_DEPTH[0]) {
    s.zone = 'screech';
    s.aeration += AERATE_RATE * 1.4 * dt;
    s.bubbles = clamp(s.bubbles + 0.35 * dt);
  } else if (d <= CHIRP_DEPTH[1]) {
    s.zone = 'chirp';
    // Stretching hot milk makes big bubbles instead of microfoam.
    const late = clamp((s.temp - 38) / 20);
    s.aeration += AERATE_RATE * (1 - 0.5 * late) * dt;
    s.bubbles = clamp(s.bubbles + 0.12 * late * dt);
  } else {
    s.zone = 'whirl';
    s.bubbles = clamp(s.bubbles - 0.22 * dt);
  }
  s.aeration = Math.min(1.2, s.aeration);
}

export function milkQuality(s: SteamState): MilkQuality {
  return { temp: s.temp, aeration: clamp(s.aeration), bubbles: s.bubbles };
}

export type MilkFault = 'milkCold' | 'milkHot' | 'scalded' | 'flatMilk' | 'stiffMilk' | 'bubbly';

export interface MilkScore {
  temp: number;
  texture: number;
  total: number;
  faults: MilkFault[];
}

export function scoreMilk(m: MilkQuality): MilkScore {
  const temp = band(m.temp, TARGET_TEMP[0], TARGET_TEMP[1], 15, 13);
  const texture =
    band(m.aeration, AERATION_TARGET[0], AERATION_TARGET[1], 0.25, 0.35) * (1 - 0.6 * m.bubbles);
  const faults: MilkFault[] = [];
  if (m.temp < TARGET_TEMP[0] - 4) faults.push('milkCold');
  if (m.temp >= SCALD_TEMP) faults.push('scalded');
  else if (m.temp > TARGET_TEMP[1] + 4) faults.push('milkHot');
  if (m.aeration < AERATION_TARGET[0] - 0.1) faults.push('flatMilk');
  if (m.aeration > AERATION_TARGET[1] + 0.12) faults.push('stiffMilk');
  if (m.bubbles > 0.35) faults.push('bubbly');
  return { temp, texture, total: 0.5 * temp + 0.5 * texture, faults };
}
