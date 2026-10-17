// Shared contract for the week-1 lanes: the save. Version 2 was the first game save (no v1 ever
// shipped: roadmap 0.2 is unchecked and only listening settings are stored); version 3 adds the
// player's keys (Phase 7). migrate() is the only way to read stored data: it never throws, a v2
// save becomes v3 with the default keys, and anything else that isn't a valid save becomes a fresh
// one. Pure: no clock (createdAt comes from the caller), no storage (core/save does that).

import type { CustomerId } from '../../data/customers';
import type { Difficulty } from '../listening';
import type { ShiftGrade, ShiftSummary } from '../rush';
import { isDrinkId, type DrinkId, type Ticket } from './ticket';

export const SAVE_VERSION = 3;

/** The player's own keys for three actions (Phase 7 accessibility). Each works as well as its
 *  default (Space, R, 1), which keeps working too, so every key hint in the game stays true. */
export interface KeyMap {
  /** The station's main action (default Space). */
  action: string;
  /** Replay the last line (default R). */
  replay: string;
  /** Serve the first ticket on the rail (default 1). */
  serve: string;
}

export const DEFAULT_KEYS: Readonly<KeyMap> = { action: ' ', replay: 'r', serve: '1' };

/** Keys the game already uses (app/input.ts, rushWiring.ts, practiceWiring.ts, trialWiring.ts):
 *  never another action's key. */
export const RESERVED_KEYS: readonly string[] = [
  ' ',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  'arrowup',
  'arrowdown',
  'enter',
  'escape',
  'tab',
  'b',
  'd',
  'f',
  'g',
  'i',
  'l',
  'm',
  'p',
  'r',
  's',
  't',
  'v',
  'w',
];

/** May `key` (KeyboardEvent.key, lower case) be `action`'s key? Its own default, or a letter or
 *  digit the game doesn't use for anything else. */
export function keyAllowed(action: keyof KeyMap, key: string): boolean {
  if (key === DEFAULT_KEYS[action]) return true;
  return /^[a-z0-9]$/.test(key) && !RESERVED_KEYS.includes(key);
}

export interface RegularMemory {
  visits: number;
  affinity: number;
  lastOrder?: Ticket;
}

/** A shift report (the existing Day 2 receipt) and which shift it was for. */
export interface SavedReport {
  week: number;
  shift: number;
  summary: ShiftSummary;
}

/** The save (version 3). */
export interface Save {
  version: 3;
  /** ISO time the save was started. */
  createdAt: string;
  seed: number;
  difficulty: Difficulty;
  /** 1-based. */
  week: number;
  /** Next shift to play, 0-based within the week. */
  shift: number;
  unlockedDrinks: DrinkId[];
  /** Upgrade ids only; the catalogue lives in data/upgrades.ts. */
  upgrades: string[];
  /** Regulars the player has served (missing = never met). */
  regulars: Partial<Record<CustomerId, RegularMemory>>;
  reports: SavedReport[];
  /** Integer AUD cents. */
  cents: number;
  /** The player's keys (v3). */
  keys: KeyMap;
}

/** The current save's old name, still the v3 shape: the review's fuzz tests (tests/fuzz, not
 *  edited by this run) import it. New code says Save. */
export type SaveV2 = Save;

export interface SaveDefaults {
  seed?: number;
  createdAt?: string;
  difficulty?: Difficulty;
}

export const STARTING_DRINKS: readonly DrinkId[] = ['flatWhite', 'longBlack'];
export const DEFAULT_SEED = 20261012;
/** createdAt when the caller didn't say. */
export const UNKNOWN_TIME = '1970-01-01T00:00:00.000Z';

/** Customer ids a save may remember (tests check it matches data/customers.ts). */
export const REGULAR_IDS = [
  'dazza',
  'priya',
  'beryl',
  'mei',
  'jiwoo',
  'karen',
] as const satisfies readonly CustomerId[];

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const GRADES: readonly ShiftGrade[] = ['excellent', 'good', 'okay', 'poor', 'disaster'];
const SUMMARY_NUMBERS = [
  'customers',
  'ordersCompleted',
  'correctOrders',
  'walkouts',
  'avgServeSeconds',
  'satisfaction',
  'tipsCents',
  'wasted',
] as const;

export function newSave(d: SaveDefaults = {}): Save {
  return {
    version: 3,
    createdAt: d.createdAt ?? UNKNOWN_TIME,
    seed: d.seed === undefined ? DEFAULT_SEED : d.seed >>> 0,
    difficulty: d.difficulty ?? 'normal',
    week: 1,
    shift: 0,
    unlockedDrinks: [...STARTING_DRINKS],
    upgrades: [],
    regulars: {},
    reports: [],
    cents: 0,
    keys: { ...DEFAULT_KEYS },
  };
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown, min: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min;
const isDifficulty = (x: unknown): x is Difficulty =>
  typeof x === 'string' && (DIFFICULTIES as readonly string[]).includes(x);

function isTicket(x: unknown): x is Ticket {
  if (!isObj(x)) return false;
  const milkOk = x.milk === null || ['full', 'oat', 'soy', 'almond'].includes(x.milk as string);
  return (
    (x.type === 'flatWhite' || x.type === 'longBlack') &&
    milkOk &&
    typeof x.extraHot === 'boolean' &&
    typeof x.heart === 'boolean'
  );
}

function isSummary(x: unknown): x is ShiftSummary {
  return (
    isObj(x) &&
    SUMMARY_NUMBERS.every((k) => typeof x[k] === 'number' && Number.isFinite(x[k])) &&
    (GRADES as readonly unknown[]).includes(x.grade)
  );
}

function readRegulars(x: unknown): Save['regulars'] {
  const out: Save['regulars'] = {};
  if (!isObj(x)) return out;
  for (const id of REGULAR_IDS) {
    const r = x[id];
    if (!isObj(r) || !isInt(r.visits, 0)) continue;
    if (typeof r.affinity !== 'number' || !Number.isFinite(r.affinity)) continue;
    const m: RegularMemory = { visits: r.visits, affinity: r.affinity };
    if (isTicket(r.lastOrder)) m.lastOrder = { ...r.lastOrder };
    out[id] = m;
  }
  return out;
}

function readReports(x: unknown): SavedReport[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(
      (r): r is Obj => isObj(r) && isInt(r.week, 1) && isInt(r.shift, 0) && isSummary(r.summary),
    )
    .map((r) => ({
      week: r.week as number,
      shift: r.shift as number,
      summary: { ...(r.summary as ShiftSummary) },
    }));
}

/** The player's keys from a stored save: each one allowed and not already taken, else that
 *  action's default (a v2 save has none: all defaults). */
function readKeys(x: unknown): KeyMap {
  const out: KeyMap = { ...DEFAULT_KEYS };
  if (!isObj(x)) return out;
  const used = new Set<string>();
  for (const a of ['action', 'replay', 'serve'] as const) {
    const k = x[a];
    if (typeof k === 'string' && keyAllowed(a, k) && !used.has(k)) out[a] = k;
    used.add(out[a]);
  }
  return out;
}

/** A v2 or v3 save, field by field (a v2 one gets the default keys). */
function readSave(o: Obj, d: SaveDefaults): Save {
  const base = newSave(d);
  const drinks = Array.isArray(o.unlockedDrinks) ? o.unlockedDrinks.filter(isDrinkId) : [];
  const upgrades = Array.isArray(o.upgrades)
    ? o.upgrades.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  return {
    version: 3,
    createdAt: typeof o.createdAt === 'string' && o.createdAt ? o.createdAt : base.createdAt,
    seed: typeof o.seed === 'number' && Number.isFinite(o.seed) ? o.seed >>> 0 : base.seed,
    difficulty: isDifficulty(o.difficulty) ? o.difficulty : base.difficulty,
    week: isInt(o.week, 1) ? o.week : 1,
    shift: isInt(o.shift, 0) ? o.shift : 0,
    unlockedDrinks: [...new Set([...STARTING_DRINKS, ...drinks])],
    upgrades: [...new Set(upgrades)],
    regulars: readRegulars(o.regulars),
    reports: readReports(o.reports),
    cents: typeof o.cents === 'number' && Number.isFinite(o.cents) ? Math.round(o.cents) : 0,
    keys: readKeys(o.keys),
  };
}

/** Stored data (parsed or still a JSON string) → a valid Save (v3). Never throws. */
export function migrate(raw: unknown, d: SaveDefaults = {}): Save {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      value = undefined;
    }
  }
  // v2 → v3: the same fields, plus the default keys.
  if (isObj(value) && (value.version === SAVE_VERSION || value.version === 2))
    return readSave(value, d);
  // Not a v2 or v3 save (empty, corrupt, or a shape from before saves existed): start fresh, keeping
  // only a difficulty and seed that are clearly valid.
  const keep: SaveDefaults = { ...d };
  if (isObj(value)) {
    if (isDifficulty(value.difficulty)) keep.difficulty = value.difficulty;
    if (typeof value.seed === 'number' && Number.isFinite(value.seed)) keep.seed = value.seed;
  }
  return newSave(keep);
}
