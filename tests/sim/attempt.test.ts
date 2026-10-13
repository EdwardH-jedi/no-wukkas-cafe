import { describe, expect, it } from 'vitest';
import {
  artFaults,
  bandFor,
  bestValidIndex,
  scoreAttempt,
  trialOutcome,
  type AttemptResult,
} from '../../src/sim/attempt';
import type { EspressoScore } from '../../src/sim/espresso';
import type { PatternScore } from '../../src/sim/latte/score';
import type { MilkScore } from '../../src/sim/steam';

const pattern = (over: Partial<PatternScore> = {}): PatternScore => ({
  coverage: 0.35,
  iou: 0.85,
  notchDepth: 0.1,
  tipRatio: 0.2,
  notchRatio: 0.9,
  notch: 1,
  tip: 1,
  heartness: 1,
  size: 1,
  shape: 0.9,
  symmetryIoU: 0.95,
  symmetry: 1,
  offCentre: 0.02,
  cx: 0,
  cy: 0.02,
  balance: 0,
  position: 1,
  crispRatio: 0.9,
  definition: 1,
  art: 0.95,
  fit: { angle: 0, x: 0, y: 0, scale: 1 },
  ...over,
});
const milk: MilkScore = { temp: 1, texture: 1, total: 1, faults: [] };
const esp: EspressoScore = { dose: 1, time: 1, total: 1, faults: [] };
const pourOk = { fill: 0.95, spill: 0, overflow: 0, milkIn: 0.7 };

const fake = (total: number, valid = true): AttemptResult =>
  ({ total, valid, band: bandFor(total) }) as AttemptResult;

describe('bands', () => {
  it('uses the trial bands exactly', () => {
    expect(bandFor(0)).toBe('disaster');
    expect(bandFor(24)).toBe('disaster');
    expect(bandFor(25)).toBe('failed');
    expect(bandFor(59)).toBe('failed');
    expect(bandFor(60)).toBe('almost');
    expect(bandFor(84)).toBe('almost');
    expect(bandFor(85)).toBe('hired');
    expect(bandFor(100)).toBe('hired');
  });
});

describe('scoreAttempt', () => {
  it('adds art, cup, milk and shot points', () => {
    const r = scoreAttempt(pattern({ art: 1 }), pourOk, milk, esp);
    expect(r.total).toBe(100);
    expect(r.valid).toBe(true);
    expect(r.faults).toEqual([]);
  });

  it('rejects attempts that cannot be judged', () => {
    expect(scoreAttempt(pattern(), { ...pourOk, milkIn: 0.05 }, milk, esp).invalid).toBe(
      'nothingPoured',
    );
    expect(scoreAttempt(pattern(), { ...pourOk, spill: 0.5 }, milk, esp).invalid).toBe(
      'mostlySpilled',
    );
    expect(scoreAttempt(pattern(), { ...pourOk, fill: 0.5 }, milk, esp).invalid).toBe('halfEmpty');
  });

  it('lists the worst fault first', () => {
    const r = scoreAttempt(
      pattern({ heartness: 0.1, position: 0.3 }),
      { ...pourOk, overflow: 0.1, spill: 0.1 },
      { ...milk, faults: ['milkHot'] },
      esp,
    );
    expect(r.faults[0]).toBe('blob');
    expect(r.faults).toContain('overflow');
    expect(r.faults).toContain('offCentre');
    expect(r.faults.indexOf('overflow')).toBeLessThan(r.faults.indexOf('milkHot'));
  });

  it('spilling costs points', () => {
    const clean = scoreAttempt(pattern(), pourOk, milk, esp);
    const messy = scoreAttempt(pattern(), { ...pourOk, spill: 0.2 }, milk, esp);
    expect(messy.total).toBeLessThan(clean.total);
  });
});

describe('artFaults', () => {
  it('distinguishes the classic failures', () => {
    expect(artFaults(pattern({ coverage: 0.01 }))).toEqual(['noArt']);
    expect(artFaults(pattern({ heartness: 0.1 }))).toContain('blob');
    expect(artFaults(pattern({ notchRatio: 3 }))).toContain('split');
    expect(artFaults(pattern({ tip: 0.2 }))).toContain('noTip');
    expect(artFaults(pattern({ notch: 0.2 }))).toContain('noCleft');
    expect(artFaults(pattern({ symmetry: 0.3 }))).toContain('lopsided');
    expect(artFaults(pattern({ definition: 0.2 }))).toContain('muddy');
    expect(artFaults(pattern({ coverage: 0.1 }))).toContain('tooSmall');
  });
});

describe('best valid attempt', () => {
  it('takes the best score among valid attempts only', () => {
    expect(bestValidIndex([fake(40), fake(95, false), fake(70)])).toBe(2);
    expect(trialOutcome([fake(40), fake(95, false), fake(70)])).toEqual({
      band: 'almost',
      score: 70,
      bestIndex: 2,
    });
  });

  it('is a disaster when nothing counted', () => {
    expect(trialOutcome([fake(90, false), fake(80, false)])).toEqual({
      band: 'disaster',
      score: 0,
      bestIndex: -1,
    });
    expect(trialOutcome([])).toEqual({ band: 'disaster', score: 0, bestIndex: -1 });
  });
});
