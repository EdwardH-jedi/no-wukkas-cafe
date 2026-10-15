import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  createPourLog,
  diagnose,
  dirOf,
  drawHeight,
  LOBES_DONE,
  trackPour,
  whiteCoverage,
} from '../../src/sim/latte/coach';
import {
  controlsAt,
  createDemoPlayer,
  DEMO_CHAPTERS,
  OWNER_DEMO,
  runTrack,
  startDemo,
  stepDemoPlayer,
  type TrackKey,
} from '../../src/sim/latte/demo';
import { CELL, createPour, GRID } from '../../src/sim/latte/field';
import { createPitcher, stepPourFrame, type PitcherControls } from '../../src/sim/latte/pitcher';
import { scorePattern } from '../../src/sim/latte/score';
import { SILKY_MILK } from '../../src/sim/milk';

/** Pour a track headless with the log attached; also records when each step was ticked off. */
function pourLogged(track: readonly TrackKey[], duration = 8.2) {
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
  const stepAt: number[] = [-1, -1, -1, -1];
  const steps = Math.round(duration / STEP);
  for (let i = 0; i < steps; i++) {
    controlsAt(track, i * STEP, c);
    stepPourFrame(pour, pitcher, c, SILKY_MILK, STEP);
    trackPour(log, pour, pitcher);
    for (let s = 0; s < 4; s++) if (log.done[s] && stepAt[s] === -1) stepAt[s] = i * STEP;
  }
  return { pour, pitcher, log, stepAt };
}

const BLOB_TRACK: TrackKey[] = OWNER_DEMO.map((k) =>
  k.t >= 6.4 ? { ...k, x: 0, y: -0.35, h: k.hold ? 0.7 : 8 } : { ...k },
);

describe('pour log: the four steps of a heart', () => {
  const demo = pourLogged(OWNER_DEMO);

  it("ticks off all four steps, in order, on Gaz's own pour", () => {
    expect(demo.log.step).toBe(4);
    const [fill, lay, lobes, pull] = demo.stepAt as [number, number, number, number];
    expect(fill).toBeGreaterThan(0);
    expect(lay).toBeGreaterThan(fill);
    expect(lobes).toBeGreaterThan(lay);
    expect(pull).toBeGreaterThan(lobes);
  });

  it("steps line up with the demo's narrated chapters", () => {
    // Each step completes inside its own chapter (or just after it), never before it starts.
    DEMO_CHAPTERS.forEach((ch, i) => {
      const done = demo.stepAt[i] as number;
      const nextStart = DEMO_CHAPTERS[i + 1]?.t ?? 8.2;
      expect(done, ch.step).toBeGreaterThanOrEqual(ch.t);
      expect(done, ch.step).toBeLessThanOrEqual(nextStart + 0.6);
    });
  });

  it('measures white coverage the way the scorer does', () => {
    expect(demo.log.white).toBeCloseTo(scorePattern(demo.pour.foam).coverage, 6);
    expect(demo.log.white).toBeGreaterThan(LOBES_DONE);
    expect(whiteCoverage(new Float32Array(GRID * GRID))).toBe(0);
  });

  it('remembers how the pour was done: dropped in about half full, low, then pulled through', () => {
    expect(demo.log.dropFill).toBeGreaterThan(0.45);
    expect(demo.log.dropFill).toBeLessThan(0.8);
    expect(drawHeight(demo.log)).toBeLessThan(1.6);
    expect(demo.log.pullStarted).toBe(true);
    expect(demo.log.pullReach).toBeGreaterThan(0.5);
  });

  it('a pour that never pulls through stops at step 3', () => {
    const r = pourLogged(BLOB_TRACK);
    expect(r.log.step).toBe(3);
    expect(r.log.pullStarted).toBe(false);
  });

  it('a pour from up high never lays any white down', () => {
    const high = OWNER_DEMO.map((k) => ({ ...k, h: Math.max(k.h, 6.5) }));
    const r = pourLogged(high);
    expect(r.log.done[0]).toBe(true);
    expect(r.log.done[1]).toBe(false);
    expect(r.log.step).toBe(1);
    expect(drawHeight(r.log)).toBeGreaterThan(6);
  });
});

describe('demo player (teaching pace, same physics)', () => {
  function playDemo(narration: (cue: string, n: number) => number, dt = STEP) {
    const pour = createPour();
    const pitcher = createPitcher();
    startDemo(pitcher);
    const d = createDemoPlayer();
    const c: PitcherControls = { targetX: 0, targetY: 0, targetHeight: 7, holding: false };
    const cues: string[] = [];
    let left = 0;
    let n = 0;
    let real = 0;
    let minRate = 1;
    while (!d.done && real < 120) {
      const cue = stepDemoPlayer(d, pour, pitcher, c, SILKY_MILK, left, dt);
      if (cue) {
        cues.push(cue);
        left = narration(cue, n++);
      } else left = Math.max(0, left - dt);
      if (d.rate > 0) minRate = Math.min(minRate, d.rate);
      real += dt;
    }
    return { pour, cues, real, minRate };
  }
  const reference = runTrack(OWNER_DEMO, SILKY_MILK);

  it('pours exactly the same heart as the headless track, whatever the narration does', () => {
    const quiet = playDemo(() => 0);
    const long = playDemo(() => 4.5);
    const mixed = playDemo((_, i) => [0.4, 6, 0, 2.2][i] ?? 0);
    const choppy = playDemo((_, i) => i * 1.7, 1 / 30); // and a slow frame rate
    for (const r of [quiet, long, mixed, choppy])
      expect(Array.from(r.pour.foam)).toEqual(Array.from(reference.pour.foam));
    expect(long.pour.fill).toBe(reference.pour.fill);
  });

  it('narrates the four chapters in order, one cue each', () => {
    const r = playDemo(() => 1);
    expect(r.cues).toEqual(DEMO_CHAPTERS.map((c) => c.cue));
  });

  it('slows down while Gaz talks (never below the floor) and waits for him at a boundary', () => {
    const quiet = playDemo(() => 0);
    const talky = playDemo(() => 4);
    expect(quiet.real).toBeLessThan(8.3); // the track, plus one step per chapter cue
    expect(quiet.minRate).toBe(1);
    expect(talky.real).toBeGreaterThan(quiet.real + 4);
    expect(talky.minRate).toBeGreaterThanOrEqual(0.3);
    expect(talky.minRate).toBeLessThan(1);
  });
});

describe('diagnosis: why the pattern came out like that', () => {
  const demo = pourLogged(OWNER_DEMO);
  const demoScore = scorePattern(demo.pour.foam);
  const cupOk = { fill: 0.95, spill: 0, overflow: 0 };

  it("finds nothing wrong with Gaz's heart", () => {
    const f = diagnose(demoScore, demo.pour, demo.log);
    expect(f.map((x) => x.id)).toEqual(['textbook']);
  });

  it('a blob without a pull-through is blamed on staying low, not on shape maths', () => {
    const r = pourLogged(BLOB_TRACK);
    const f = diagnose(scorePattern(r.pour.foam), r.pour, r.log);
    expect(f[0]?.id).toBe('noPull');
    expect(f[0]?.cause).toBe('stayedLow');
  });

  it('says which way an off-centre heart sits', () => {
    const right: TrackKey[] = OWNER_DEMO.map((k) => ({ ...k, x: k.x + 0.45 }));
    const r = pourLogged(right);
    const s = scorePattern(r.pour.foam);
    const off = diagnose(s, r.pour, r.log).find((x) => x.id === 'offCentre');
    expect(off).toBeDefined();
    expect(['right', 'farRight', 'nearRight']).toContain(off?.dir);
    expect(off?.n).toBe(Math.round(s.offCentre * 100));
  });

  it('a pattern drawn from too high is muddy (or blank), with the height that caused it', () => {
    const mid: TrackKey[] = OWNER_DEMO.map((k) => (k.h < 1 ? { ...k, h: 2.6 } : { ...k }));
    const r = pourLogged(mid);
    const f = diagnose(scorePattern(r.pour.foam), r.pour, r.log);
    const bad = f.find((x) => x.id === 'muddy' || x.id === 'noWhite');
    expect(bad).toBeDefined();
    expect(bad?.cause).toBe('pouredHigh');
    expect(bad?.cn).toBeGreaterThan(1.6);
  });

  it('a lopsided heart names the heavier side', () => {
    const half = demo.pour.foam.slice();
    for (let k = 0; k < half.length; k++) {
      const x = -1 + ((k % GRID) + 0.5) * CELL;
      const y = -1 + (Math.floor(k / GRID) + 0.5) * CELL;
      if (x < -0.05 && y < 0.1) half[k] = 0;
    }
    const s = scorePattern(half);
    expect(s.balance).toBeGreaterThan(0.1);
    const lop = diagnose(s, cupOk, null).find((x) => x.id === 'lopsided');
    expect(lop?.dir).toBe('right');
  });

  it('works from the field alone (no log) and reads the cup totals', () => {
    const empty = scorePattern(new Float32Array(GRID * GRID));
    const f = diagnose(empty, { fill: 0.5, spill: 0.2, overflow: 0.1 }, null);
    expect(f.map((x) => x.id)).toEqual(['noWhite', 'overflow', 'spill', 'underfilled']);
    expect(f[0]?.cause).toBeNull();
  });

  it('is deterministic', () => {
    const a = diagnose(demoScore, cupOk, demo.log);
    const b = diagnose(scorePattern(demo.pour.foam), cupOk, demo.log);
    expect(a).toEqual(b);
  });

  it('compass directions follow the field axes (+x right, +y far)', () => {
    expect(dirOf(1, 0)).toBe('right');
    expect(dirOf(0, 1)).toBe('far');
    expect(dirOf(-1, 0)).toBe('left');
    expect(dirOf(0, -1)).toBe('near');
    expect(dirOf(-0.5, -0.5)).toBe('nearLeft');
    expect(dirOf(0, 0)).toBe('');
  });
});
