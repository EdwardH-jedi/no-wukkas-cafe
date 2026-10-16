// Scenario 7: the latte-art score comes from the simulated foam field (sim/latte/field.ts →
// sim/latte/score.ts), never from how the player moved: identical input with a different field
// scores differently, the same field always scores the same, and every place the game judges a
// pour (Day 1, Day 2, practice) scores exactly the field it ends with.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  createPractice,
  emptyPracticeInput,
  stepPractice,
  type Practice,
  type PracticeAttempt,
  type PracticeInput,
} from '../../src/core/practice';
import { canFinish, createTrial, emptyInput, stepTrial, type Trial } from '../../src/core/trial';
import { CELL, GRID } from '../../src/sim/latte/field';
import { controlsAt, OWNER_DEMO, runTrack } from '../../src/sim/latte/demo';
import { scorePattern } from '../../src/sim/latte/score';
import { SILKY_MILK } from '../../src/sim/milk';
import { playRush } from '../helpers/rushBot';

/** The player's hands following Gaz's demo (the same inputs the mouse produces). */
function demoInput(p: Practice, t: number): PracticeInput {
  const i = emptyPracticeInput();
  const c = controlsAt(OWNER_DEMO, t);
  i.hasCup = true;
  i.cupX = c.targetX;
  i.cupY = c.targetY;
  i.holding = c.holding;
  i.heightDelta = c.targetHeight - p.controls.targetHeight;
  return i;
}

/** One practice pour of the demo track; `tamper` may change the field after the first step. */
function practicePour(tamper?: (foam: Float32Array) => void) {
  const p = createPractice(1);
  const inputs: string[] = [];
  for (let n = 0; n < 20 / STEP && p.attempts.length === 0; n++) {
    const i = demoInput(p, p.phaseTime);
    inputs.push(JSON.stringify(i));
    stepPractice(p, i, STEP);
    p.events.length = 0;
    if (n === 0) tamper?.(p.pour.foam);
  }
  expect(p.phase).toBe('review');
  return { attempt: p.attempts[0] as PracticeAttempt, inputs };
}

/** White foam already on the far-right of the cup (as if it had been there all along). */
const fleck = (foam: Float32Array): void => {
  for (let k = 0; k < foam.length; k++) {
    const x = -1 + ((k % GRID) + 0.5) * CELL;
    const y = -1 + (Math.floor(k / GRID) + 0.5) * CELL;
    if ((x - 0.7) ** 2 + y * y < 0.04) foam[k] = 1;
  }
};

describe('S7: the latte is scored from the foam field', () => {
  it('practice: identical input, a different field: a different score, each from its own field', () => {
    const a = practicePour();
    const b = practicePour(fleck);
    expect(b.inputs).toEqual(a.inputs); // the hands did exactly the same thing
    expect(Array.from(b.attempt.foam)).not.toEqual(Array.from(a.attempt.foam));
    expect(b.attempt.score.art).not.toBeCloseTo(a.attempt.score.art, 3);
    expect(a.attempt.score).toEqual(scorePattern(a.attempt.foam));
    expect(b.attempt.score).toEqual(scorePattern(b.attempt.foam));
    expect(a.attempt.score.art).toBeGreaterThan(0.6); // the demo pour is a heart
  });

  it('the same input timing with different milk makes a different field, scored differently', () => {
    const silky = runTrack(OWNER_DEMO, SILKY_MILK).pour.foam;
    const thin = runTrack(OWNER_DEMO, { ...SILKY_MILK, aeration: 0.12 }).pour.foam;
    expect(Array.from(thin)).not.toEqual(Array.from(silky));
    expect(scorePattern(thin).art).not.toBeCloseTo(scorePattern(silky).art, 3);
  });

  it('the same field always scores the same, and scoring never changes the field', () => {
    const foam = runTrack(OWNER_DEMO, SILKY_MILK).pour.foam;
    const before = Array.from(foam);
    const first = scorePattern(foam);
    expect(scorePattern(foam)).toEqual(first);
    expect(scorePattern(foam.slice())).toEqual(first);
    expect(scorePattern(new Float32Array(before))).toEqual(first);
    expect(Array.from(foam)).toEqual(before);
  });

  it('Day 1: every attempt is scored from the field it left in the cup', () => {
    const t = createTrial(7);
    for (let n = 0; n < 600 / STEP && t.phase !== 'verdict'; n++) {
      stepTrial(t, trialBot(t, n), STEP);
      t.events.length = 0;
    }
    expect(t.results.length).toBeGreaterThanOrEqual(1);
    expect(t.patterns).toHaveLength(t.results.length);
    t.results.forEach((r, i) => expect(r.pattern).toEqual(scorePattern(t.patterns[i]!)));
  });

  it('Day 2: every flat white on the pass carries the score of the field in its cup', () => {
    let checked = 0;
    playRush({
      seed: 3,
      each: (r) => {
        const d = r.barista.ready;
        if (
          r.barista.phase === 'ready' &&
          d?.type === 'flatWhite' &&
          r.barista.phaseTime < 1.5 * STEP
        ) {
          expect(d.pattern).toEqual(scorePattern(r.barista.pour.foam));
          checked++;
        }
      },
    });
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('every place the game judges a pour passes the foam field and nothing else', () => {
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(join(import.meta.dirname, '../../src'));
    const calls = files
      .filter((f) => !f.endsWith(join('latte', 'score.ts')))
      .flatMap((f) =>
        [...readFileSync(f, 'utf8').matchAll(/scorePattern\(([^)]*)\)/g)].map(
          (m) => m[1] as string,
        ),
      );
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const arg of calls) expect(arg).toMatch(/^\w+\.pour\.foam$/);
  });
});

/** Day 1, a careful player (as tests/core/trial.test.ts drives it). */
function trialBot(t: Trial, step: number) {
  const i = emptyInput();
  const tick = step % 20 === 0;
  switch (t.phase) {
    case 'title':
      i.action = 'start';
      break;
    case 'intro':
    case 'inspect':
    case 'lock':
      i.pressed = tick;
      break;
    case 'grind':
      if (t.espresso.dose < 19) i.holding = true;
      else i.action = 'next';
      break;
    case 'shot':
      if (!t.espresso.extracting && !t.espresso.done) i.pressed = tick;
      if (t.espresso.extracting && t.espresso.shotTime >= 27) i.pressed = true;
      break;
    case 'steam':
      i.holding = !t.steam.done && t.steam.temp < 60;
      i.jugDepth = t.steam.aeration < 0.4 ? 0.2 : 2.5;
      break;
    case 'pour': {
      const c = controlsAt(OWNER_DEMO, t.phaseTime);
      i.hasCup = true;
      i.cupX = c.targetX;
      i.cupY = c.targetY;
      i.holding = c.holding;
      i.heightDelta = c.targetHeight - t.controls.targetHeight;
      break;
    }
    case 'feedback':
      i.action = canFinish(t) ? 'finish' : 'next';
      break;
    default:
      break;
  }
  return i;
}
