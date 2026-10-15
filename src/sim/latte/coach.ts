// Coaching for the pour. Live: which of the four steps of a heart the pour has reached (the lesson
// strip, for the player and for Gaz's demo). Afterwards: why a pattern came out the way it did
// (the practice review). Scores still come only from the foam field (score.ts); this explains
// them, from the field first and from the pour's own history second.

import { clamp } from '../math';
import { CELL, GRID, type PourState } from './field';
import { pitcherFlow, type PitcherState } from './pitcher';
import type { PatternScore } from './score';

export type PourStep = 'fill' | 'lay' | 'lobes' | 'pull';
export const POUR_STEPS: readonly PourStep[] = ['fill', 'lay', 'lobes', 'pull'];

/** Step 1 is done once the cup is this full. */
export const FILL_DONE = 0.5;
/** Step 2: this much of the surface is white (foam has been laid down). */
export const LAY_DONE = 0.02;
/** Step 3: the white is wide enough for two full lobes. */
export const LOBES_DONE = 0.2;
/** Step 4: the spout travelled this far forward (rim radii) from where it laid the white. */
export const PULL_REACH = 0.5;
/** Forward travel that counts as the pull-through having started. */
const PULL_START = 0.2;

export interface PourLog {
  /** White (floating foam) share of the coffee surface. */
  white: number;
  /** Foam field version `white` was measured at. */
  version: number;
  /** Steps achieved so far (sticky), in POUR_STEPS order. */
  done: [boolean, boolean, boolean, boolean];
  /** First step not done yet (4 = all four done). */
  step: number;
  /** Cup fill when white first appeared, or -1. */
  dropFill: number;
  /** Where the spout was when the white first appeared. */
  layX: number;
  layY: number;
  /** Flow-weighted sums of spout height and x while drawing (see trackPour). */
  sumH: number;
  sumX: number;
  weight: number;
  /** Furthest forward travel from `layY` with milk still flowing. */
  pullReach: number;
  /** Heaviest flow while pulling through. */
  pullFlow: number;
  pullStarted: boolean;
}

export function createPourLog(): PourLog {
  return {
    white: 0,
    version: -1,
    done: [false, false, false, false],
    step: 0,
    dropFill: -1,
    layX: 0,
    layY: 0,
    sumH: 0,
    sumX: 0,
    weight: 0,
    pullReach: 0,
    pullFlow: 0,
    pullStarted: false,
  };
}

let discCells: Int32Array | null = null;
/** Grid cells inside the unit disc (the coffee surface). */
function disc(): Int32Array {
  if (discCells) return discCells;
  const cells: number[] = [];
  for (let k = 0; k < GRID * GRID; k++) {
    const x = -1 + ((k % GRID) + 0.5) * CELL;
    const y = -1 + (Math.floor(k / GRID) + 0.5) * CELL;
    if (x * x + y * y <= 1) cells.push(k);
  }
  discCells = Int32Array.from(cells);
  return discCells;
}

/** Share of the surface that is crisp white foam (same threshold the scorer uses). */
export function whiteCoverage(foam: Float32Array): number {
  const d = disc();
  let n = 0;
  for (let i = 0; i < d.length; i++) if ((foam[d[i] as number] as number) > 0.5) n++;
  return n / d.length;
}

/** Update the log after one pour step. No allocation. */
export function trackPour(log: PourLog, pour: PourState, pitcher: PitcherState): void {
  if (pour.version !== log.version) {
    log.version = pour.version;
    log.white = whiteCoverage(pour.foam);
  }
  const flow = pitcherFlow(pitcher);
  const d = log.done;
  if (pour.fill >= FILL_DONE) d[0] = true;
  if (log.white >= LAY_DONE && !d[1]) {
    d[1] = true;
    log.dropFill = pour.fill;
    log.layX = pitcher.x;
    log.layY = pitcher.y;
  }
  if (log.white >= LOBES_DONE) d[2] = true;
  if (d[1]) {
    const reach = pitcher.y - log.layY;
    if (flow > 0 && reach > log.pullReach) log.pullReach = reach;
    if (!log.pullStarted && flow > 0 && reach > PULL_START) log.pullStarted = true;
    if (log.pullStarted && flow > log.pullFlow) log.pullFlow = flow;
    if (log.pullStarted && flow === 0 && log.pullReach >= PULL_REACH) d[3] = true;
  }
  // Drawing: from the first white (or, if it never came, from three-quarters full) until the pull.
  if (flow > 0 && !log.pullStarted && (d[1] || pour.fill >= 0.75)) {
    log.sumH += pitcher.height * flow;
    log.sumX += pitcher.x * flow;
    log.weight += flow;
  }
  let s = 0;
  while (s < 4 && d[s]) s++;
  log.step = s;
}

/** Mean spout height while drawing, cm (or -1 if the player never poured past half full). */
export function drawHeight(log: PourLog): number {
  return log.weight > 0 ? log.sumH / log.weight : -1;
}

// ---------------------------------------------------------------- diagnosis

export type FindingId =
  | 'noWhite'
  | 'muddy'
  | 'split'
  | 'noPull'
  | 'shortPull'
  | 'noCleft'
  | 'lopsided'
  | 'offCentre'
  | 'tooSmall'
  | 'tooBig'
  | 'overflow'
  | 'spill'
  | 'underfilled'
  | 'textbook';

/** What in the pour most likely caused a finding (needs the pour log). */
export type CauseId =
  | 'pouredHigh'
  | 'stayedLow'
  | 'stoppedShort'
  | 'heavyPull'
  | 'droppedEarly'
  | 'droppedLate'
  | 'drift';

/** Directions on the cup as the barista sees it: near = toward you, far = away. */
export type Dir =
  '' | 'far' | 'farRight' | 'right' | 'nearRight' | 'near' | 'nearLeft' | 'left' | 'farLeft';

export interface Finding {
  id: FindingId;
  /** How much it cost the pattern, 0–1; findings come worst first. */
  severity: number;
  /** The measurement behind it, in the units its copy uses (%, cm). */
  n: number;
  dir: Dir;
  cause: CauseId | null;
  /** The measurement behind the cause. */
  cn: number;
}

export interface CupTotals {
  fill: number;
  spill: number;
  overflow: number;
}

const DIRS: Dir[] = [
  'right',
  'farRight',
  'far',
  'farLeft',
  'left',
  'nearLeft',
  'near',
  'nearRight',
];

/** Compass direction of a field offset (field +x = right, +y = far side). */
export function dirOf(x: number, y: number): Dir {
  if (Math.hypot(x, y) < 1e-6) return '';
  const i = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  return DIRS[((i % 8) + 8) % 8] as Dir;
}

const pct = (v: number): number => Math.round(v * 100);
const cm = (v: number): number => Math.round(v * 10) / 10;

/**
 * Why the pattern looks the way it does, worst first. Works from the foam field's score; the pour
 * log (optional) adds the likely cause in terms of the controls.
 */
export function diagnose(p: PatternScore, cup: CupTotals, log: PourLog | null): Finding[] {
  const out: Finding[] = [];
  const add = (
    id: FindingId,
    severity: number,
    n = 0,
    dir: Dir = '',
    cause: CauseId | null = null,
    cn = 0,
  ): void => {
    out.push({ id, severity: clamp(severity), n, dir, cause, cn });
  };
  const h = log ? drawHeight(log) : -1;
  const highCause = h > 1.6 ? 'pouredHigh' : null;

  if (p.coverage < 0.04) {
    add('noWhite', 1, pct(p.coverage), '', highCause, cm(h));
  } else {
    const muddy = p.definition < 0.45;
    if (muddy) add('muddy', 1 - p.definition, pct(p.crispRatio), '', highCause, cm(h));
    if (p.notchRatio > 2.4) {
      const heavy = log !== null && log.pullFlow > 0.7;
      add('split', 0.8, pct(p.notchRatio), '', heavy ? 'heavyPull' : null, pct(log?.pullFlow ?? 0));
    } else if (p.heartness < 0.3 && !muddy) {
      if (log && !log.pullStarted) add('noPull', 0.9, 0, '', 'stayedLow');
      else if (p.tip < 0.45)
        add('shortPull', 0.85, pct(p.tipRatio), '', 'stoppedShort', pct(log?.pullReach ?? 0));
      else add('noCleft', 0.8, pct(p.notchRatio));
    } else {
      if (p.tip < 0.45 && p.notch >= 0.5) {
        const short = log !== null && log.pullReach < PULL_REACH + 0.25;
        add(
          'shortPull',
          0.7 * (1 - p.tip),
          pct(p.tipRatio),
          '',
          short ? 'stoppedShort' : null,
          pct(log?.pullReach ?? 0),
        );
      }
      if (p.notch < 0.45 && p.tip >= 0.5) add('noCleft', 0.7 * (1 - p.notch), pct(p.notchRatio));
    }
    if (p.symmetry < 0.55 && p.heartness >= 0.3) {
      const drift = log && log.weight > 0 ? log.sumX / log.weight - log.layX : 0;
      add(
        'lopsided',
        0.6 * (1 - p.symmetry),
        pct(Math.abs(p.balance)),
        p.balance > 0 ? 'right' : 'left',
        Math.abs(drift) > 0.06 ? 'drift' : null,
        pct(Math.abs(drift)),
      );
    }
    if (p.position < 0.6)
      add('offCentre', 0.5 * (1 - p.position), pct(p.offCentre), dirOf(p.cx, p.cy));
    if (p.coverage < 0.15) {
      const late = log !== null && log.dropFill > 0.8;
      add(
        'tooSmall',
        0.5 * (1 - p.coverage / 0.15),
        pct(p.coverage),
        '',
        late ? 'droppedLate' : null,
        pct(log?.dropFill ?? 0),
      );
    } else if (p.coverage > 0.62) {
      const early = log !== null && log.dropFill >= 0 && log.dropFill < 0.5;
      add(
        'tooBig',
        0.5 * clamp((p.coverage - 0.62) / 0.3),
        pct(p.coverage),
        '',
        early ? 'droppedEarly' : null,
        pct(log?.dropFill ?? 0),
      );
    }
  }
  if (cup.overflow > 0.02) add('overflow', 0.45, pct(cup.overflow));
  if (cup.spill - cup.overflow > 0.04) add('spill', 0.4, pct(cup.spill - cup.overflow));
  if (cup.fill < 0.85) add('underfilled', 0.3, pct(cup.fill));
  out.sort((a, b) => b.severity - a.severity);
  if (out.length === 0 && p.art >= 0.85) add('textbook', 0, pct(p.art));
  return out;
}
