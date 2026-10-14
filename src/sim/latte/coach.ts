// Coaching for the pour. Live: which of the four steps of a heart the pour has reached (the lesson
// strip, for the player and for Gaz's demo). Afterwards: why a pattern came out the way it did
// (the practice review). Scores still come only from the foam field (score.ts); this explains
// them, from the field first and from the pour's own history second.

import { clamp } from '../math';
import type { PourState } from './field';
import { demoPullFill } from './demo';
import { FILL_DONE, LAY_DONE, whiteCoverage } from './lay';
import { pitcherFlow, type PitcherState } from './pitcher';
import type { PatternScore } from './score';

export type PourStep = 'fill' | 'lay' | 'lobes' | 'pull';
export const POUR_STEPS: readonly PourStep[] = ['fill', 'lay', 'lobes', 'pull'];

// Steps 1–2 (half full, white laid) live in lay.ts: the pitcher reads them too.
export { FILL_DONE, LAY_DONE, whiteCoverage };
/** Step 3: the white is wide enough for two full lobes. */
export const LOBES_DONE = 0.2;
/** Step 4: the spout travelled this far forward (rim radii) from where it laid the white. */
export const PULL_REACH = 0.5;
/** Forward travel that counts as the pull-through having started. */
const PULL_START = 0.2;
/** Spout height (cm) that counts as having lifted for the pull-through. */
export const LIFTED_HEIGHT = 2.5;
/** Forward travel with no milk coming out, after lifting, that means the stream died (rim radii). */
export const DRY_TRAVEL = 0.25;
/** Flow past the middle of the cup that is too heavy for a pull-through. */
export const HEAVY_SWEEP = 0.6;

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
  /** Heaviest flow while pulling through with the spout past the middle of the cup. */
  farFlow: number;
  pullStarted: boolean;
  /** Pour time the spout first rose to LIFTED_HEIGHT after the white appeared, or -1. */
  liftedAt: number;
  /** Forward travel (rim radii) with no milk coming out, after lifting. */
  travelDry: number;
  /** Spout y at the last step. */
  lastY: number;
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
    farFlow: 0,
    pullStarted: false,
    liftedAt: -1,
    travelDry: 0,
    lastY: 0,
  };
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
    if (log.pullStarted && pitcher.y > 0 && flow > log.farFlow) log.farFlow = flow;
    if (log.pullStarted && flow === 0 && log.pullReach >= PULL_REACH) d[3] = true;
    if (log.liftedAt < 0 && pitcher.height >= LIFTED_HEIGHT) log.liftedAt = pour.time;
    const dy = pitcher.y - log.lastY;
    if (log.liftedAt >= 0 && flow === 0 && dy > 0) log.travelDry += dy;
  }
  log.lastY = pitcher.y;
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

/** Time for step 4 ("pull now"): the white is wide enough, and the cup is as full as it is when
 *  Gaz starts his own pull-through (pull earlier and the cup can't be topped up after). */
export function readyToPull(log: PourLog, fill: number): boolean {
  return log.step === 3 && !log.pullStarted && fill >= demoPullFill();
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
  /** Lifted for the pull-through, but the stream had stopped before the sweep. */
  | 'streamDied'
  | 'shortPull'
  | 'noCleft'
  /** Too much milk in the sweep: heavy past the middle, or on past the far rim. */
  | 'sweptLong'
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
  // The pull-through, from the pour's own history: lifted but swept dry, or swept too much milk.
  const died = log !== null && log.liftedAt >= 0 && log.travelDry >= DRY_TRAVEL;
  const swept =
    log !== null && log.pullStarted && (log.layY + log.pullReach > 1 || log.farFlow > HEAVY_SWEEP);
  const noCleft = (severity: number): void =>
    swept
      ? add('sweptLong', severity, pct(log?.farFlow ?? 0))
      : add('noCleft', severity, pct(p.notchRatio));

  if (p.coverage < 0.04) {
    add('noWhite', 1, pct(p.coverage), '', highCause, cm(h));
  } else {
    const muddy = p.definition < 0.45;
    if (muddy) add('muddy', 1 - p.definition, pct(p.crispRatio), '', highCause, cm(h));
    if (p.notchRatio > 2.4) {
      const heavy = log !== null && log.pullFlow > 0.7;
      add('split', 0.8, pct(p.notchRatio), '', heavy ? 'heavyPull' : null, pct(log?.pullFlow ?? 0));
    } else if (p.heartness < 0.3 && !muddy) {
      if (died && (!log.pullStarted || p.tip < 0.45)) add('streamDied', 0.9, pct(log.travelDry));
      else if (log && !log.pullStarted)
        add('noPull', 0.9, 0, '', log.liftedAt < 0 ? 'stayedLow' : null);
      else if (p.tip < 0.45)
        add('shortPull', 0.85, pct(p.tipRatio), '', 'stoppedShort', pct(log?.pullReach ?? 0));
      else noCleft(0.8);
    } else {
      if (p.tip < 0.45 && p.notch >= 0.5) {
        const short = log !== null && log.pullReach < PULL_REACH + 0.25;
        if (died) add('streamDied', 0.7 * (1 - p.tip), pct(log.travelDry));
        else
          add(
            'shortPull',
            0.7 * (1 - p.tip),
            pct(p.tipRatio),
            '',
            short ? 'stoppedShort' : null,
            pct(log?.pullReach ?? 0),
          );
      }
      if (p.notch < 0.45 && p.tip >= 0.5) noCleft(0.7 * (1 - p.notch));
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
