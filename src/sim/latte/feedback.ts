// One actionable tip for the next pour, from what the judge (score.ts) and the coach (coach.ts:
// diagnose) already said about this one. It picks and words; it never re-judges: the numbers are
// the pattern score's and the findings are diagnose's, worst first.
//
//   1. diagnose found something: its worst finding, except that a cup left short after a
//      pull-through, with only a small or lopsided white to show for it, means the pull came too
//      early (a symptom isn't the thing to fix).
//   2. diagnose found nothing to name (or only that the cup is short) but the art is still short
//      of a proper heart: the score bar that lost the most art points, read the way diagnose
//      would read it.
//   3. A proper heart: keep doing that.
//
// The tip's text is the finding's own fix (data/coaching.ts), with the measurement behind it.

import { CAUSE_TEXT, DIR_TEXT, FINDING_TEXT, STEP_TEXT } from '../../data/coaching';
import { clamp } from '../math';
import { dirOf, type Finding, type FindingId } from './coach';
import { demoPullFill } from './demo';
import type { PatternScore } from './score';

/** A finding's tip, or one of the tips no single finding covers: the pull-through came too early,
 *  the point is there but blunt, or the white doesn't fill a heart's outline yet (the lobes). */
export type TipId = FindingId | 'pullEarly' | 'bluntPoint' | 'lobes';

export interface PourTip {
  id: TipId;
  /** The finding it answers: diagnose's, or one read off the weakest score bar (then severity 0
   *  and no cause). None for the lobes tip. */
  finding: Finding | null;
  /** What to do on the next pour. [x] marks a key. */
  text: string;
  /** The measurement behind it: the likely cause in the controls if diagnose named one, else what
   *  the foam field shows. */
  detail: string;
}

/** Art from here up is a proper heart (the practice verdict's "Proper heart"). */
export const PROPER_HEART = 0.85;

// Copy for the tips that aren't simply a finding's fix and why. TODO(lane 1C → data): move to
// data/coaching.ts with FINDING_TEXT (lane 1C doesn't own data/).
const TIP_TEXT = {
  pullEarly: {
    /** {n}: the cup fill (%) when Gaz starts his own pull-through. */
    text: 'Pull through later: stay low until the cup is about {n}% full, then lift [2] and sweep.',
    /** {n}: how full the cup ended up (%). */
    detail: 'The cup only got to {n}%: once you pull through, you can’t top it up.',
  },
  bluntPoint: {
    text: FINDING_TEXT.sweptLong.fix,
    /** {n}: width near the tip, % of the heart's width. */
    detail: 'The point is blunt: near the tip it’s still {n}% as wide as the heart.',
  },
  lobes: {
    text: STEP_TEXT.lobes.how,
    /** {n}: the heart-shape bar (%). */
    detail: 'The white doesn’t fill a heart’s outline yet: heart shape {n}%.',
  },
} as const;

/** Symptoms of pulling through before the white had spread, when the cup was left short. */
const EARLY_PULL_SIGNS: readonly FindingId[] = ['lopsided', 'tooSmall', 'underfilled'];

const pct = (v: number): number => Math.round(clamp(v) * 100);

/** Fill a coaching template's slots: {n} the finding's measurement, {c} its cause's, {dir} its
 *  direction ("lopsided" names a bare side: "on the right"). */
export function fillCopy(template: string, f: Finding): string {
  const dir = f.id === 'lopsided' ? f.dir : DIR_TEXT[f.dir];
  return template.replace('{n}', String(f.n)).replace('{c}', String(f.cn)).replace('{dir}', dir);
}

const synth = (id: FindingId, n: number, dir: Finding['dir'] = ''): Finding => ({
  id,
  severity: 0,
  n,
  dir,
  cause: null,
  cn: 0,
});

/** The finding's own fix, with the cause (or what the field shows) as the detail. */
function fromFinding(f: Finding): PourTip {
  const t = FINDING_TEXT[f.id];
  const detail = f.cause ? fillCopy(CAUSE_TEXT[f.cause], f) : fillCopy(t.why, f);
  return { id: f.id, finding: f, text: t.fix, detail };
}

/** Diagnose named nothing but the art is short: the bar that cost the most art points. */
function fromWeakestBar(p: PatternScore): PourTip {
  // art = 0.6 shape + gate (0.2 symmetry + 0.1 position + 0.1 definition), as score.ts adds it.
  const gate = clamp((p.heartness * p.size) / 0.6);
  const lost = {
    shape: 0.6 * (1 - p.shape),
    symmetry: 0.2 * gate * (1 - p.symmetry),
    position: 0.1 * gate * (1 - p.position),
    definition: 0.1 * gate * (1 - p.definition),
  };
  let worst: keyof typeof lost = 'shape';
  for (const k of ['symmetry', 'position', 'definition'] as const)
    if (lost[k] > lost[worst]) worst = k;

  if (worst === 'symmetry')
    return fromFinding(
      synth('lopsided', pct(Math.abs(p.balance)), p.balance > 0 ? 'right' : 'left'),
    );
  if (worst === 'position')
    return fromFinding(synth('offCentre', pct(p.offCentre), dirOf(p.cx, p.cy)));
  if (worst === 'definition') return fromFinding(synth('muddy', pct(p.crispRatio)));
  // Shape: the size of the white, then the two heart features, then the outline itself.
  if (p.coverage < 0.22) return fromFinding(synth('tooSmall', pct(p.coverage)));
  if (p.coverage > 0.55) return fromFinding(synth('tooBig', pct(p.coverage)));
  if (p.notchRatio > 1.9) return fromFinding(synth('split', pct(p.notchRatio)));
  // A point that is there but blunt: diagnose already calls a missing one (shortPull), so this is
  // a sweep with too much milk in it.
  if (p.tip < 0.8 && p.tip <= p.notch) {
    const n = pct(p.tipRatio);
    return {
      id: 'bluntPoint',
      finding: synth('sweptLong', n),
      text: TIP_TEXT.bluntPoint.text,
      detail: TIP_TEXT.bluntPoint.detail.replace('{n}', String(n)),
    };
  }
  if (p.notch < 0.8) return fromFinding(synth('noCleft', pct(p.notchRatio)));
  return {
    id: 'lobes',
    finding: null,
    text: TIP_TEXT.lobes.text,
    detail: TIP_TEXT.lobes.detail.replace('{n}', String(pct(p.shape))),
  };
}

/**
 * The one thing to do differently next pour. `findings` are diagnose's for this pattern, worst
 * first (as the practice review and Day 1's attempts keep them).
 */
export function pourTip(p: PatternScore, findings: readonly Finding[]): PourTip {
  const first = findings[0];
  const short = findings.find((f) => f.id === 'underfilled');
  if (
    short &&
    first &&
    EARLY_PULL_SIGNS.includes(first.id) &&
    p.heartness >= 0.5 &&
    p.art < PROPER_HEART
  ) {
    return {
      id: 'pullEarly',
      finding: short,
      text: TIP_TEXT.pullEarly.text.replace(
        '{n}',
        String(Math.round(demoPullFill() * 20) * 5), // as the lesson strip's "pull now" says it
      ),
      detail: TIP_TEXT.pullEarly.detail.replace('{n}', String(short.n)),
    };
  }
  // A short cup on its own says less than whatever kept the pattern from being a proper heart.
  if (first && !(first.id === 'underfilled' && p.art < PROPER_HEART)) return fromFinding(first);
  if (p.art < PROPER_HEART) return fromWeakestBar(p);
  if (first) return fromFinding(first);
  return fromFinding(synth('textbook', pct(p.art)));
}
