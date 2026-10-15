import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { FINDING_TEXT, STEP_TEXT } from '../../src/data/coaching';
import { createPourLog, diagnose, trackPour, type Finding } from '../../src/sim/latte/coach';
import { controlsAt, demoPullFill, OWNER_DEMO, type TrackKey } from '../../src/sim/latte/demo';
import { fillCopy, pourTip, PROPER_HEART, type PourTip } from '../../src/sim/latte/feedback';
import { createPour } from '../../src/sim/latte/field';
import { createPitcher, stepPourFrame, type PitcherControls } from '../../src/sim/latte/pitcher';
import { scorePattern, type PatternScore } from '../../src/sim/latte/score';
import { SILKY_MILK } from '../../src/sim/milk';

/** Pour a track headless, judge it and diagnose it, as practice and Day 1 do after a pour. */
function judged(track: readonly TrackKey[], duration = 8.2) {
  const pour = createPour();
  const pitcher = createPitcher();
  const first = track[0];
  if (first) {
    pitcher.x = first.x;
    pitcher.y = first.y;
    pitcher.height = first.h;
  }
  const log = createPourLog();
  const c: PitcherControls = { targetX: 0, targetY: 0, targetHeight: 7, holding: false };
  for (let i = 0; i < Math.round(duration / STEP); i++) {
    controlsAt(track, i * STEP, c);
    stepPourFrame(pour, pitcher, c, SILKY_MILK, STEP);
    trackPour(log, pour, pitcher);
  }
  const score = scorePattern(pour.foam);
  return { score, findings: diagnose(score, pour, log), fill: pour.fill };
}

const tipFor = (track: readonly TrackKey[], duration?: number) => {
  const j = judged(track, duration);
  return { ...j, tip: pourTip(j.score, j.findings) };
};

const D = OWNER_DEMO;
/** Gaz's bloom and pull-through a second early: the cup is short and the white small. */
const EARLY_PULL: TrackKey[] = D.map((k) => (k.t >= 4.0 ? { ...k, t: k.t - 1 } : { ...k })).sort(
  (a, b) => a.t - b.t,
);
/** Lifted, let go, then swept forward dry (coach.test.ts's B1 track). */
const DIED: TrackKey[] = [
  ...D.filter((k) => k.t <= 6.4),
  { t: 6.5, x: 0, y: -0.4, h: 3, hold: false },
  { t: 7.1, x: 0, y: -0.4, h: 3, hold: false },
  { t: 7.4, x: 0, y: 0.85, h: 3, hold: false },
  { t: 8.0, x: 0, y: 0.6, h: 8, hold: false },
];
const OFF_RIGHT: TrackKey[] = D.map((k) => ({ ...k, x: k.x + 0.45 }));
/** Dropped in late (cup ~75% full): too little time to bloom, a thin little heart. */
const LATE_DROP: TrackKey[] = D.map((k) =>
  k.t === 3.6 ? { ...k, t: 5.2 } : k.t === 4.0 ? { ...k, t: 5.6 } : { ...k },
);
/** A held bloom that runs the cup over the brim before the pull-through. */
const OVERFLOW: TrackKey[] = D.map((k) => (k.t > 6.4 ? { ...k, t: k.t + 1.6 } : { ...k })).sort(
  (a, b) => a.t - b.t,
);
const BLOB: TrackKey[] = D.map((k) => (k.t >= 6.4 ? { ...k, x: 0, y: -0.35, h: 0.7 } : { ...k }));
const TOO_HIGH: TrackKey[] = D.map((k) => (k.h < 1 ? { ...k, h: 2.6 } : { ...k }));
/** Swept at 1 cm instead of lifting to [2]: the stream never thins, the point comes out blunt. */
const HEAVY_PULL: TrackKey[] = D.map((k) => (k.h === 3 ? { ...k, h: 1 } : { ...k }));

const noSlots = (t: PourTip): void => {
  for (const s of [t.text, t.detail]) {
    expect(s.length).toBeGreaterThan(10);
    expect(s).not.toMatch(/\{(n|c|dir)\}/);
  }
};

describe('pourTip: one actionable tip from the score breakdown', () => {
  it("a great pour (Gaz's own) gets the textbook pat on the back", () => {
    const { tip, score } = tipFor(D);
    expect(score.art).toBeGreaterThanOrEqual(PROPER_HEART);
    expect(tip.id).toBe('textbook');
    expect(tip.text).toBe(FINDING_TEXT.textbook.fix);
    expect(tip.detail).toBe(`Art ${Math.round(score.art * 100)}%. Nothing to fix.`);
  });

  it('a too-early pull-through: pull later, at the fill Gaz pulls at, not "fill the cup"', () => {
    const { tip, findings, fill } = tipFor(EARLY_PULL);
    expect(findings.map((f) => f.id)).toContain('underfilled');
    expect(tip.id).toBe('pullEarly');
    expect(tip.text).toContain(`about ${Math.round(demoPullFill() * 20) * 5}% full`);
    expect(tip.text).toContain('[2]');
    expect(tip.detail).toContain(`${Math.round(fill * 100)}%`);
    noSlots(tip);
  });

  it('an early pull that left the white lopsided is still the early pull, not the drift', () => {
    const early: TrackKey[] = [
      ...D.filter((k) => k.t <= 4.0),
      { t: 4.9, x: 0, y: -0.35, h: 0.7, hold: true },
      { t: 5.05, x: 0, y: -0.2, h: 3, hold: true },
      { t: 5.5, x: 0, y: 0.85, h: 3, hold: false },
      { t: 6.1, x: 0, y: 0.6, h: 8, hold: false },
    ];
    const { tip, findings } = tipFor(early);
    expect(findings[0]?.id).toBe('lopsided');
    expect(tip.id).toBe('pullEarly');
  });

  it('stream died: keep pouring through the sweep', () => {
    const { tip } = tipFor(DIED, 8.8);
    expect(tip.id).toBe('streamDied');
    expect(tip.text).toBe(FINDING_TEXT.streamDied.fix);
    expect(tip.detail).toMatch(/after the milk had stopped/);
    noSlots(tip);
  });

  it('off centre: drop in the other way, and says which way it sat', () => {
    const { tip } = tipFor(OFF_RIGHT);
    expect(tip.id).toBe('offCentre');
    expect(tip.text).toBe(FINDING_TEXT.offCentre.fix);
    expect(tip.detail).toMatch(
      /off centre, (to the right|toward the far right|toward you, on the right)/,
    );
    noSlots(tip);
  });

  it('too thin a heart with nothing diagnose names: read off the weakest bar (white too small)', () => {
    const { tip, findings, score } = tipFor(LATE_DROP);
    expect(findings).toEqual([]);
    expect(score.art).toBeLessThan(PROPER_HEART);
    expect(tip.id).toBe('tooSmall');
    expect(tip.text).toBe(FINDING_TEXT.tooSmall.fix);
    expect(tip.finding?.severity).toBe(0);
    expect(tip.detail).toContain(`${Math.round(score.coverage * 100)}%`);
  });

  it('overflow: let go at the brim', () => {
    const { tip } = tipFor(OVERFLOW, 10);
    expect(tip.id).toBe('overflow');
    expect(tip.text).toBe(FINDING_TEXT.overflow.fix);
    expect(tip.detail).toMatch(/ran over the brim/);
  });

  it('a blob: lift and sweep, blamed on staying low', () => {
    const { tip } = tipFor(BLOB);
    expect(tip.id).toBe('noPull');
    expect(tip.finding?.cause).toBe('stayedLow');
    expect(tip.detail).toMatch(/stayed low/);
  });

  it('drawn from too high: the height that caused it', () => {
    const { tip } = tipFor(TOO_HIGH);
    expect(tip.id).toBe('muddy');
    expect(tip.text).toContain('[3]');
    expect(tip.detail).toContain('2.6 cm');
  });

  it('a heavy sweep with no finding: the point is blunt, thin the stream', () => {
    const { tip, findings, score } = tipFor(HEAVY_PULL);
    expect(findings).toEqual([]);
    expect(tip.id).toBe('bluntPoint');
    expect(tip.text).toBe(FINDING_TEXT.sweptLong.fix);
    expect(tip.detail).toContain(`${Math.round(score.tipRatio * 100)}% as wide`);
  });

  it('every representative pour gets exactly one tip with every slot filled', () => {
    const all: Array<[readonly TrackKey[], number?]> = [
      [D],
      [EARLY_PULL],
      [DIED, 8.8],
      [OFF_RIGHT],
      [LATE_DROP],
      [OVERFLOW, 10],
      [BLOB],
      [TOO_HIGH],
      [HEAVY_PULL],
    ];
    for (const [track, d] of all) noSlots(tipFor(track, d).tip);
  });
});

describe('pourTip: from synthetic breakdowns', () => {
  const great = judged(D).score;
  const f = (over: Partial<Finding>): Finding => ({
    id: 'underfilled',
    severity: 0.3,
    n: 80,
    dir: '',
    cause: null,
    cn: 0,
    ...over,
  });
  const withScore = (over: Partial<PatternScore>): PatternScore => ({ ...great, ...over });

  it('no findings and a proper heart: textbook', () => {
    expect(pourTip(great, []).id).toBe('textbook');
  });

  it('a short cup under a proper heart is just "fill it to the brim"', () => {
    const t = pourTip(great, [f({ n: 82 })]);
    expect(t.id).toBe('underfilled');
    expect(t.text).toBe(FINDING_TEXT.underfilled.fix);
    expect(t.detail).toBe('The cup is only 82% full.');
  });

  it("diagnose's worst finding wins, with its cause as the detail", () => {
    const t = pourTip(withScore({ art: 0.5 }), [
      f({ id: 'tooBig', severity: 0.4, n: 70, cause: 'droppedEarly', cn: 35 }),
      f({ id: 'offCentre', severity: 0.2, n: 30, dir: 'far' }),
    ]);
    expect(t.id).toBe('tooBig');
    expect(t.detail).toBe('You dropped in when the cup was only 35% full.');
  });

  it('weakest bar: symmetry names the heavier side, position the direction', () => {
    const lop = pourTip(withScore({ art: 0.7, symmetry: 0.1, balance: -0.4 }), []);
    expect(lop.id).toBe('lopsided');
    expect(lop.detail).toContain('on the left');
    const off = pourTip(withScore({ art: 0.7, position: 0, offCentre: 0.5, cx: 0, cy: -0.5 }), []);
    expect(off.id).toBe('offCentre');
    expect(off.detail).toBe('The heart sits 50% of the radius off centre, toward you.');
  });

  it('weakest bar: an outline that just isn’t a heart yet gets the lobes step', () => {
    const t = pourTip(withScore({ art: 0.7, shape: 0.5, notch: 1, tip: 1, coverage: 0.35 }), []);
    expect(t.id).toBe('lobes');
    expect(t.finding).toBeNull();
    expect(t.text).toBe(STEP_TEXT.lobes.how);
    expect(t.detail).toContain('heart shape 50%');
  });

  it('is pure: same answer twice, inputs untouched', () => {
    const findings = Object.freeze([
      Object.freeze(f({ id: 'lopsided', severity: 0.4, n: 30, dir: 'right' })),
      Object.freeze(f({})),
    ]);
    const score = Object.freeze(withScore({ art: 0.6 }));
    const a = pourTip(score, findings);
    const b = pourTip(score, findings);
    expect(a).toEqual(b);
    expect(findings).toHaveLength(2);
  });

  it('fillCopy fills {n}, {c} and {dir} (a lopsided side is a bare word)', () => {
    expect(fillCopy('{n}% {c} {dir}', f({ id: 'offCentre', n: 12, cn: 3, dir: 'nearLeft' }))).toBe(
      '12% 3 toward you, on the left',
    );
    expect(fillCopy('on the {dir}', f({ id: 'lopsided', dir: 'right' }))).toBe('on the right');
  });
});
