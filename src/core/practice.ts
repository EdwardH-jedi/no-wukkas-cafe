// Latte-art practice: no steaming, no attempt limit and no Gaz breathing down your neck. Pour, see
// what the foam field actually made (with the heart guide and the reasons), reset, go again. Gaz
// only speaks when asked to demonstrate. Like the trial: no DOM, no three; the view feeds a
// PracticeInput every fixed step and drains `events`.

import { OWNER_LINES } from '../data/ownerLines';
import { spokenDuration } from '../data/voice';
import { createPourLog, diagnose, trackPour, type Finding, type PourLog } from '../sim/latte/coach';
import { createPour, type PourState } from '../sim/latte/field';
import { createDemoPlayer, startDemo, stepDemoPlayer, type DemoPlayer } from '../sim/latte/demo';
import {
  applyPourInput,
  createPitcher,
  createPourGate,
  HEIGHT_START,
  pitcherFlow,
  stepPourFrame,
  type PitcherControls,
  type PitcherState,
  type PourControlInput,
  type PourGate,
} from '../sim/latte/pitcher';
import { scorePattern, type PatternScore } from '../sim/latte/score';
import { SILKY_MILK } from '../sim/milk';
import { createOwner, pickLine, type OwnerState, type SpokenLine } from '../sim/owner';
import { createRng, type Rng } from './rng';
import type { SfxId } from './trial';

export type PracticePhase = 'pour' | 'review' | 'demo';

/** done: hand the cup over for review · reset: fresh cup now · again: pour again after a review ·
 *  demo: ask Gaz to show you · skip: stop his demo · guide: heart guide on/off. */
export type PracticeAction = 'done' | 'reset' | 'again' | 'demo' | 'skip' | 'guide';

export interface PracticeInput extends PourControlInput {
  /** Advance the current subtitle. */
  skip: boolean;
  /** The current line's audio is still loading: hold its timer. */
  voiceHold?: boolean;
  action: PracticeAction | null;
}

export function emptyPracticeInput(): PracticeInput {
  return {
    hasCup: false,
    cupX: 0,
    cupY: -0.2,
    heightDelta: 0,
    heightPreset: null,
    holding: false,
    skip: false,
    action: null,
  };
}

export interface PracticeAttempt {
  /** 1-based count since practice began. */
  n: number;
  score: PatternScore;
  /** Why it came out like that, worst first. */
  findings: Finding[];
  fill: number;
  spill: number;
  overflow: number;
  /** The final foam field, for the review picture. */
  foam: Float32Array;
}

export type PracticeEvent =
  | { type: 'say'; line: SpokenLine }
  | { type: 'phase'; phase: PracticePhase; prev: PracticePhase }
  | { type: 'sfx'; id: SfxId }
  | { type: 'attempt'; attempt: PracticeAttempt }
  | { type: 'reset' };

/** How many past attempts (with their foam fields) are kept for comparison. */
export const PRACTICE_KEEP = 12;
/** The cup goes for review once it's this full and the jug has been still for IDLE_REVIEW s. */
const FULL = 0.88;
const IDLE_REVIEW = 1.1;

export interface Practice {
  seed: number;
  rng: Rng;
  time: number;
  phase: PracticePhase;
  phaseTime: number;
  owner: OwnerState;
  speech: { current: SpokenLine | null; started: number };
  pour: PourState;
  pitcher: PitcherState;
  controls: PitcherControls;
  gate: PourGate;
  log: PourLog;
  /** Gaz's demonstration (Day 1's player, same physics). */
  demo: DemoPlayer;
  demoActive: boolean;
  demoEndedAt: number;
  demosWatched: number;
  /** Heart guide drawn on the coffee (G). */
  guide: boolean;
  /** Most recent last, at most PRACTICE_KEEP. */
  attempts: PracticeAttempt[];
  count: number;
  /** Best art score so far, 0–1 (−1 before the first). */
  best: number;
  /** Seconds the jug has been still after pouring (hand-over timer). */
  idle: number;
  events: PracticeEvent[];
}

export function createPractice(seed: number): Practice {
  const p: Practice = {
    seed,
    rng: createRng(seed),
    time: 0,
    phase: 'pour',
    phaseTime: 0,
    owner: createOwner(),
    speech: { current: null, started: 0 },
    pour: createPour(),
    pitcher: createPitcher(),
    controls: { targetX: 0, targetY: -0.2, targetHeight: HEIGHT_START, holding: false },
    gate: createPourGate(),
    log: createPourLog(),
    demo: createDemoPlayer(),
    demoActive: false,
    demoEndedAt: -1,
    demosWatched: 0,
    guide: true,
    attempts: [],
    count: 0,
    best: -1,
    idle: 0,
    events: [],
  };
  freshCup(p);
  return p;
}

/** A new cup with the shot in it and a full jug; the button must be let go before it pours. */
function freshCup(p: Practice): void {
  p.pour = createPour();
  p.pitcher = createPitcher();
  p.controls = {
    targetX: p.pitcher.x,
    targetY: p.pitcher.y,
    targetHeight: HEIGHT_START,
    holding: false,
  };
  p.gate = createPourGate();
  p.log = createPourLog();
  p.idle = 0;
}

function go(p: Practice, phase: PracticePhase): void {
  const prev = p.phase;
  p.phase = phase;
  p.phaseTime = 0;
  p.events.push({ type: 'phase', phase, prev });
  if (phase === 'pour') freshCup(p);
  else if (phase === 'review') judge(p);
  else {
    p.demoActive = false;
    p.demo = createDemoPlayer();
    p.demoEndedAt = -1;
    say(p, p.demosWatched === 0 ? 'demo.intro' : 'demo.again');
  }
}

// ---------------------------------------------------------------- speech (demo narration only)

function say(p: Practice, key: string): void {
  const line = pickLine(p.owner, OWNER_LINES, key, p.rng, p.time);
  if (!line) return;
  line.duration = spokenDuration('gaz', line.text);
  p.speech.current = line;
  p.speech.started = p.time;
  p.events.push({ type: 'say', line });
}

function narrationLeft(p: Practice): number {
  const cur = p.speech.current;
  return cur ? Math.max(0, cur.duration - (p.time - p.speech.started)) : 0;
}

function updateSpeech(p: Practice, skip: boolean, hold: number): void {
  const cur = p.speech.current;
  if (!cur) return;
  if (hold > 0 && !skip) p.speech.started += hold;
  if (skip || p.time - p.speech.started >= cur.duration) p.speech.current = null;
}

// ---------------------------------------------------------------- judging

function judge(p: Practice): void {
  p.controls.holding = false;
  const score = scorePattern(p.pour.foam);
  const findings = diagnose(score, p.pour, p.log);
  p.count++;
  const attempt: PracticeAttempt = {
    n: p.count,
    score,
    findings,
    fill: p.pour.fill,
    spill: p.pour.spill,
    overflow: p.pour.overflow,
    foam: p.pour.foam.slice(),
  };
  p.attempts.push(attempt);
  if (p.attempts.length > PRACTICE_KEEP) p.attempts.shift();
  p.best = Math.max(p.best, score.art);
  p.events.push({ type: 'attempt', attempt });
  p.events.push({ type: 'sfx', id: 'clink' });
  p.events.push({ type: 'sfx', id: score.art >= 0.6 ? 'good' : 'bad' });
}

export function latestAttempt(p: Practice): PracticeAttempt | null {
  return p.attempts[p.attempts.length - 1] ?? null;
}

/** The attempt before the latest one (for "compared with last time"), or null. */
export function previousAttempt(p: Practice): PracticeAttempt | null {
  return p.attempts[p.attempts.length - 2] ?? null;
}

// ---------------------------------------------------------------- step

export function stepPractice(p: Practice, input: PracticeInput, dt: number): void {
  p.time += dt;
  p.phaseTime += dt;
  updateSpeech(p, input.skip, input.voiceHold ? dt : 0);
  if (input.action === 'guide') p.guide = !p.guide;

  switch (p.phase) {
    case 'pour':
      stepPour(p, input, dt);
      break;
    case 'review':
      if (input.action === 'again' || input.action === 'reset') go(p, 'pour');
      else if (input.action === 'demo') go(p, 'demo');
      break;
    case 'demo':
      stepDemo(p, input, dt);
      break;
  }
}

function stepPour(p: Practice, input: PracticeInput, dt: number): void {
  if (input.action === 'reset') {
    freshCup(p);
    p.events.push({ type: 'reset' });
    return;
  }
  if (input.action === 'demo') {
    go(p, 'demo');
    return;
  }
  const c = p.controls;
  applyPourInput(c, p.gate, input);
  stepPourFrame(p.pour, p.pitcher, c, SILKY_MILK, dt);
  trackPour(p.log, p.pour, p.pitcher);
  const pour = p.pour;
  const flowing = pitcherFlow(p.pitcher) > 0;
  if (!flowing && pour.poured > 0) p.idle += dt;
  else p.idle = 0;
  const full = pour.fill >= FULL && p.idle >= IDLE_REVIEW;
  const dry = p.pitcher.milk <= 0 && p.idle >= 0.6;
  const done = input.action === 'done' && pour.poured > 0;
  if (full || dry || done) go(p, 'review');
}

/** Leave the demo for a fresh cup of your own. */
function endDemo(p: Practice): void {
  p.speech.current = null;
  p.demoActive = false;
  p.demosWatched++;
  go(p, 'pour');
}

function stepDemo(p: Practice, input: PracticeInput, dt: number): void {
  if (input.action === 'skip') {
    endDemo(p);
    return;
  }
  if (!p.demoActive) {
    if (p.demoEndedAt < 0 && p.phaseTime > 0.6 && !p.speech.current) {
      p.demoActive = true;
      p.demo = createDemoPlayer();
      freshCup(p);
      startDemo(p.pitcher);
    } else if (p.demoEndedAt >= 0 && p.phaseTime - p.demoEndedAt > 1.4 && !p.speech.current)
      endDemo(p);
    return;
  }
  const cue = stepDemoPlayer(
    p.demo,
    p.pour,
    p.pitcher,
    p.controls,
    SILKY_MILK,
    narrationLeft(p),
    dt,
  );
  trackPour(p.log, p.pour, p.pitcher);
  if (cue) say(p, cue);
  if (p.demo.done) {
    p.demoActive = false;
    p.controls.holding = false;
    p.demoEndedAt = p.phaseTime;
  }
}
