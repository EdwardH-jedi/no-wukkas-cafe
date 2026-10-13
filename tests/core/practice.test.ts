import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  createPractice,
  emptyPracticeInput,
  latestAttempt,
  previousAttempt,
  PRACTICE_KEEP,
  stepPractice,
  type Practice,
  type PracticeAction,
  type PracticeEvent,
  type PracticeInput,
} from '../../src/core/practice';
import { OWNER_LINES } from '../../src/data/ownerLines';
import { clipFor } from '../../src/data/voice';
import {
  controlsAt,
  DEMO_CHAPTERS,
  OWNER_DEMO,
  runTrack,
  type TrackKey,
} from '../../src/sim/latte/demo';
import { ESPRESSO_FILL } from '../../src/sim/latte/field';
import { scorePattern } from '../../src/sim/latte/score';
import { SILKY_MILK } from '../../src/sim/milk';

const BLOB_TRACK: TrackKey[] = OWNER_DEMO.map((k) =>
  k.t >= 6.4 ? { ...k, x: 0, y: -0.35, h: k.hold ? 0.7 : 8 } : { ...k },
);

/** The player's hands following a control track (same inputs the mouse produces). */
function trackInput(p: Practice, track: readonly TrackKey[], t: number): PracticeInput {
  const i = emptyPracticeInput();
  const c = controlsAt(track, t);
  i.hasCup = true;
  i.cupX = c.targetX;
  i.cupY = c.targetY;
  i.holding = c.holding;
  i.heightDelta = c.targetHeight - p.controls.targetHeight;
  return i;
}

function run(
  p: Practice,
  seconds: number,
  inputFor: (p: Practice, t: number) => PracticeInput = () => emptyPracticeInput(),
  until?: (p: Practice) => boolean,
): PracticeEvent[] {
  const events: PracticeEvent[] = [];
  const t0 = p.phaseTime;
  for (let n = 0; n < seconds / STEP; n++) {
    stepPractice(p, inputFor(p, p.phaseTime - t0), STEP);
    events.push(...p.events);
    p.events.length = 0;
    if (until?.(p)) break;
  }
  return events;
}

const act = (p: Practice, a: PracticeAction): PracticeEvent[] => {
  const i = emptyPracticeInput();
  i.action = a;
  stepPractice(p, i, STEP);
  const e = [...p.events];
  p.events.length = 0;
  return e;
};

const keysSaid = (e: PracticeEvent[]): string[] =>
  e.flatMap((x) => (x.type === 'say' ? [x.line.key] : []));

/** Pour a whole cup along a track and wait for the review. */
function pourTrack(p: Practice, track: readonly TrackKey[]): PracticeEvent[] {
  return run(
    p,
    20,
    (q, t) => trackInput(q, track, t),
    (q) => q.phase === 'review',
  );
}

describe('practice mode: pour, review, go again', () => {
  it('starts at the pour with a fresh cup, the heart guide on and no Gaz', () => {
    const p = createPractice(7);
    expect(p.phase).toBe('pour');
    expect(p.guide).toBe(true);
    expect(p.pour.fill).toBe(ESPRESSO_FILL);
    expect(p.pour.poured).toBe(0);
    expect(keysSaid(run(p, 3))).toEqual([]);
  });

  it('a finished cup goes for review on its own, scored from the foam field', () => {
    const p = createPractice(7);
    const e = pourTrack(p, OWNER_DEMO);
    expect(p.phase).toBe('review');
    const a = latestAttempt(p);
    expect(a).not.toBeNull();
    expect(a?.score).toEqual(scorePattern(a?.foam as Float32Array));
    expect(a?.score.art).toBeGreaterThan(0.85);
    expect(a?.findings.map((f) => f.id)).toEqual(['textbook']);
    expect(e.some((x) => x.type === 'attempt')).toBe(true);
    expect(e.flatMap((x) => (x.type === 'sfx' ? [x.id] : []))).toEqual(['clink', 'good']);
  });

  it('the player pours the same heart as the headless track (same physics, same inputs)', () => {
    const p = createPractice(7);
    pourTrack(p, OWNER_DEMO);
    const ref = scorePattern(runTrack(OWNER_DEMO, SILKY_MILK).pour.foam);
    expect(latestAttempt(p)?.score.art).toBeCloseTo(ref.art, 1);
  });

  it('"again" gives a fresh cup and keeps the history; the next attempt compares with it', () => {
    const p = createPractice(7);
    pourTrack(p, OWNER_DEMO);
    act(p, 'again');
    expect(p.phase).toBe('pour');
    expect(p.pour.poured).toBe(0);
    expect(p.pour.fill).toBe(ESPRESSO_FILL);
    expect(p.log.step).toBe(0);
    pourTrack(p, BLOB_TRACK);
    expect(p.count).toBe(2);
    expect(previousAttempt(p)?.n).toBe(1);
    expect(latestAttempt(p)?.n).toBe(2);
    expect(latestAttempt(p)?.findings[0]?.id).toBe('noPull');
    expect(p.best).toBe(Math.max(...p.attempts.map((a) => a.score.art)));
  });

  it('reset mid-pour throws the cup away: fresh cup, still pouring, nothing judged', () => {
    const p = createPractice(7);
    run(p, 3, (q, t) => trackInput(q, OWNER_DEMO, t));
    expect(p.pour.poured).toBeGreaterThan(0);
    const e = act(p, 'reset');
    expect(e.map((x) => x.type)).toEqual(['reset']);
    expect(p.phase).toBe('pour');
    expect(p.pour.poured).toBe(0);
    expect(p.attempts).toHaveLength(0);
  });

  it('after a reset, a button still held from before does not pour until let go', () => {
    const p = createPractice(7);
    const holdAt = (q: Practice): PracticeInput => {
      const i = trackInput(q, OWNER_DEMO, 2);
      i.holding = true;
      return i;
    };
    run(p, 0.1, (q) => trackInput(q, OWNER_DEMO, 0));
    run(p, 2, holdAt);
    expect(p.pour.poured).toBeGreaterThan(0);
    act(p, 'reset');
    run(p, 1.5, holdAt);
    expect(p.pour.poured).toBe(0);
    run(p, 0.1, (q) => trackInput(q, OWNER_DEMO, 0)); // let go...
    run(p, 1, holdAt); // ...and press again
    expect(p.pour.poured).toBeGreaterThan(0);
  });

  it('"done" hands the cup over early, but not before anything is poured', () => {
    const p = createPractice(7);
    act(p, 'done');
    expect(p.phase).toBe('pour');
    run(p, 3, (q, t) => trackInput(q, OWNER_DEMO, t));
    act(p, 'done');
    expect(p.phase).toBe('review');
    expect(latestAttempt(p)?.findings.length).toBeGreaterThan(0);
  });

  it('G toggles the heart guide in any phase', () => {
    const p = createPractice(7);
    act(p, 'guide');
    expect(p.guide).toBe(false);
    pourTrack(p, OWNER_DEMO);
    act(p, 'guide');
    expect(p.guide).toBe(true);
  });

  it(`keeps the last ${PRACTICE_KEEP} attempts, but counts them all`, () => {
    const p = createPractice(7);
    for (let i = 0; i < PRACTICE_KEEP + 2; i++) {
      run(p, 1, (q, t) => trackInput(q, OWNER_DEMO, t));
      act(p, 'done');
      act(p, 'again');
    }
    expect(p.count).toBe(PRACTICE_KEEP + 2);
    expect(p.attempts).toHaveLength(PRACTICE_KEEP);
    expect(p.attempts[0]?.n).toBe(3);
  });

  it('is reproducible: same seed and inputs, same attempts', () => {
    const a = createPractice(9);
    const b = createPractice(9);
    for (const p of [a, b]) {
      pourTrack(p, OWNER_DEMO);
      act(p, 'again');
      pourTrack(p, BLOB_TRACK);
    }
    expect(a.attempts.map((x) => x.score)).toEqual(b.attempts.map((x) => x.score));
    expect(Array.from(latestAttempt(a)?.foam ?? [])).toEqual(
      Array.from(latestAttempt(b)?.foam ?? []),
    );
  });
});

describe('practice mode: watching Gaz', () => {
  it('Gaz demonstrates on request, narrating the four steps, then hands back a fresh cup', () => {
    const p = createPractice(7);
    pourTrack(p, BLOB_TRACK);
    const started = act(p, 'demo');
    expect(p.phase).toBe('demo');
    const e = [
      ...started,
      ...run(
        p,
        60,
        () => emptyPracticeInput(),
        (q) => q.phase === 'pour',
      ),
    ];
    const said = keysSaid(e);
    expect(said[0]).toBe('demo.intro');
    expect(said.slice(1)).toEqual(DEMO_CHAPTERS.map((c) => c.cue));
    expect(p.phase).toBe('pour');
    expect(p.pour.poured).toBe(0);
    expect(p.demosWatched).toBe(1);
    expect(p.count).toBe(1); // the demo isn't one of your attempts
    // The second time round he grumbles instead.
    expect(keysSaid([...act(p, 'demo'), ...run(p, 2)])).toEqual(['demo.again']);
  });

  it("the demo pours Gaz's heart through the real physics", () => {
    const p = createPractice(7);
    act(p, 'demo');
    run(
      p,
      60,
      () => emptyPracticeInput(),
      (q) => q.demo.done,
    );
    expect(Array.from(p.pour.foam)).toEqual(Array.from(runTrack(OWNER_DEMO, SILKY_MILK).pour.foam));
    expect(scorePattern(p.pour.foam).art).toBeGreaterThan(0.85);
  });

  it('skip stops the demo straight away and gives you the cup', () => {
    const p = createPractice(7);
    act(p, 'demo');
    run(p, 3);
    act(p, 'skip');
    expect(p.phase).toBe('pour');
    expect(p.speech.current).toBeNull();
    expect(p.pour.poured).toBe(0);
  });

  it('every line practice can say has a recording (no new voice lines)', () => {
    for (const key of ['demo.intro', 'demo.again', ...DEMO_CHAPTERS.map((c) => c.cue)])
      for (const d of OWNER_LINES[key]?.tiers.flat() ?? [])
        expect(clipFor('gaz', d.text), d.text).not.toBeNull();
  });
});
