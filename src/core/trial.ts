// The Day 1 trial shift: a small state machine that runs the sim modules in order and decides
// when Gaz talks. No DOM, no three: the view feeds it a TrialInput every fixed step and drains
// `events` each frame.

import { GREETING, GREETING_OPENERS, OWNER_LINES } from '../data/ownerLines';
import { spokenDuration } from '../data/voice';
import { ATTEMPTS, scoreAttempt, trialOutcome, bestValidIndex } from '../sim/attempt';
import type { AttemptResult, TrialOutcome } from '../sim/attempt';
import {
  createEspresso,
  scoreEspresso,
  SHOT_MAX,
  SHOT_TARGET,
  startShot,
  stepGrind,
  stepShot,
  stopShot,
} from '../sim/espresso';
import type { EspressoScore, EspressoState } from '../sim/espresso';
import { createPour, type PourState } from '../sim/latte/field';
import { controlsAt, DEMO_CUES, DEMO_DURATION, OWNER_DEMO } from '../sim/latte/demo';
import {
  createPitcher,
  HEIGHT_MAX,
  HEIGHT_MIN,
  HEIGHT_START,
  pitcherFlow,
  stepPourFrame,
} from '../sim/latte/pitcher';
import type { PitcherControls, PitcherState } from '../sim/latte/pitcher';
import { scorePattern } from '../sim/latte/score';
import { clamp } from '../sim/math';
import { SILKY_MILK, type MilkQuality } from '../sim/milk';
import {
  addFrustration,
  createOwner,
  ownerTier,
  pickLine,
  type LineDef,
  type OwnerState,
  type SpokenLine,
} from '../sim/owner';
import { createSteam, milkQuality, SCALD_TEMP, scoreMilk, stepSteam } from '../sim/steam';
import type { MilkScore, SteamState } from '../sim/steam';
import { createRng, type Rng } from './rng';

export type Phase =
  | 'title'
  | 'intro'
  | 'grind'
  | 'lock'
  | 'shot'
  | 'steam'
  | 'demo'
  | 'pour'
  | 'inspect'
  | 'feedback'
  | 'verdict';

export type TrialAction = 'start' | 'next' | 'demo' | 'finish' | 'restart';

export interface TrialInput {
  /** Pour / grind / steam button held (mouse button or Space). */
  holding: boolean;
  /** Button went down since the last step. */
  pressed: boolean;
  /** Pointer projected onto the cup, in cup-rim coordinates. */
  cupX: number;
  cupY: number;
  hasCup: boolean;
  /** Steaming: where the player holds the jug (tip depth before foam rise), cm. */
  jugDepth: number;
  /** Pouring: height change requested since the last step (scroll/keys), cm. */
  heightDelta: number;
  /** Pouring: jump the target height to this preset (cm), or null. */
  heightPreset: number | null;
  /** Advance the current subtitle. */
  skip: boolean;
  /** The current line's audio is still loading: hold its timer (see core/speech.ts). */
  voiceHold?: boolean;
  action: TrialAction | null;
}

export function emptyInput(): TrialInput {
  return {
    holding: false,
    pressed: false,
    cupX: 0,
    cupY: -0.2,
    hasCup: false,
    jugDepth: 1.5,
    heightDelta: 0,
    heightPreset: null,
    skip: false,
    action: null,
  };
}

export type SfxId = 'tamp' | 'lock' | 'clink' | 'good' | 'bad' | 'sting' | 'fanfare' | 'sad';

export type TrialEvent =
  | { type: 'say'; line: SpokenLine }
  | { type: 'phase'; phase: Phase; prev: Phase }
  | { type: 'sfx'; id: SfxId }
  | { type: 'attempt'; index: number; result: AttemptResult }
  | { type: 'verdict'; outcome: TrialOutcome };

interface Speech {
  current: SpokenLine | null;
  started: number;
  queue: SpokenLine[];
  lastLiveAt: number;
}

interface PourWatch {
  idle: number;
  lowEarly: number;
  bloom: number;
  bloomSaid: boolean;
  tooHighSaid: boolean;
  drySaid: boolean;
}

export interface Trial {
  seed: number;
  rng: Rng;
  /** Game seconds since boot (pauses with the clock). */
  time: number;
  phase: Phase;
  phaseTime: number;
  owner: OwnerState;
  speech: Speech;
  espresso: EspressoState;
  espressoScore: EspressoScore | null;
  steam: SteamState;
  milk: MilkQuality | null;
  milkScore: MilkScore | null;
  pour: PourState;
  pitcher: PitcherState;
  controls: PitcherControls;
  /** True while the owner's hands are on the jug. */
  demoActive: boolean;
  demoTime: number;
  demoCue: number;
  demoSeen: boolean;
  demoEndedAt: number;
  demoReturn: 'pour' | 'feedback';
  /** 0-based attempt in progress (or just judged). */
  attempt: number;
  results: AttemptResult[];
  /** Final foam field of each attempt, for the result card. */
  patterns: Float32Array[];
  outcome: TrialOutcome | null;
  watch: PourWatch;
  /** Consecutive attempts that improved by 8+ / that failed (invalid or under 60). */
  streak: { improved: number; failed: number };
  flags: Record<string, boolean>;
  /** Phase-local timestamp (e.g. when a step finished), or -1. */
  mark: number;
  events: TrialEvent[];
}

export function createTrial(seed: number): Trial {
  return {
    seed,
    rng: createRng(seed),
    time: 0,
    phase: 'title',
    phaseTime: 0,
    owner: createOwner(),
    speech: { current: null, started: 0, queue: [], lastLiveAt: -99 },
    espresso: createEspresso(),
    espressoScore: null,
    steam: createSteam(),
    milk: null,
    milkScore: null,
    pour: createPour(),
    pitcher: createPitcher(),
    controls: { targetX: 0, targetY: -0.2, targetHeight: HEIGHT_START, holding: false },
    demoActive: false,
    demoTime: 0,
    demoCue: 0,
    demoSeen: false,
    demoEndedAt: -1,
    demoReturn: 'pour',
    attempt: 0,
    results: [],
    patterns: [],
    outcome: null,
    watch: freshWatch(),
    streak: { improved: 0, failed: 0 },
    flags: {},
    mark: -1,
    events: [],
  };
}

function freshWatch(): PourWatch {
  return { idle: 0, lowEarly: 0, bloom: 0, bloomSaid: false, tooHighSaid: false, drySaid: false };
}

/** Start over without reloading. Gaz keeps his memory of what he's said (no canned repeats). */
export function restartTrial(t: Trial): void {
  const owner = t.owner;
  const rng = t.rng;
  const time = t.time;
  Object.assign(t, createTrial(t.seed));
  t.rng = rng;
  t.time = time;
  t.owner = { ...owner, frustration: 0, lastAt: {} };
  go(t, 'intro');
}

// ---------------------------------------------------------------- speech

function startLine(t: Trial, line: SpokenLine): void {
  // Hold the floor for as long as the recording runs (reading time if there's no clip).
  line.duration = spokenDuration('gaz', line.text);
  t.speech.current = line;
  t.speech.started = t.time;
  t.events.push({ type: 'say', line });
}

function defLine(key: string, def: LineDef): SpokenLine {
  return {
    key,
    text: def.text,
    mood: def.mood ?? 'neutral',
    gesture: def.gesture ?? 'none',
    duration: spokenDuration('gaz', def.text),
    live: false,
  };
}

function enqueue(t: Trial, line: SpokenLine): void {
  if (!t.speech.current) startLine(t, line);
  else t.speech.queue.push(line);
}

/** Queue a line after whatever is being said. */
export function sayQueue(t: Trial, key: string): void {
  const line = pickLine(t.owner, OWNER_LINES, key, t.rng, t.time);
  if (line) enqueue(t, line);
}

/** Say it right now, dropping anything queued. */
export function sayNow(t: Trial, key: string): void {
  const line = pickLine(t.owner, OWNER_LINES, key, t.rng, t.time);
  if (!line) return;
  t.speech.queue.length = 0;
  startLine(t, line);
}

/**
 * Immediate reaction to something the player just did. Won't stomp on an instruction the player
 * hasn't had time to read, and won't machine-gun lines.
 */
export function sayLive(t: Trial, key: string): boolean {
  const cur = t.speech.current;
  const shown = t.time - t.speech.started;
  if (cur && !(cur.live ? shown > 1.1 : shown > cur.duration * 0.6)) return false;
  if (t.time - t.speech.lastLiveAt < 1.4) return false;
  const line = pickLine(t.owner, OWNER_LINES, key, t.rng, t.time, true);
  if (!line) return false;
  t.speech.lastLiveAt = t.time;
  startLine(t, line);
  return true;
}

export function speaking(t: Trial): boolean {
  return t.speech.current !== null || t.speech.queue.length > 0;
}

function updateSpeech(t: Trial, skip: boolean, hold = 0): void {
  const cur = t.speech.current;
  if (!cur) return;
  // Audio still loading: the line's clock waits, so it can't end before it's heard.
  if (hold > 0 && !skip) t.speech.started += hold;
  if (skip || t.time - t.speech.started >= cur.duration) {
    t.speech.current = null;
    const next = t.speech.queue.shift();
    if (next) startLine(t, next);
  }
}

// ---------------------------------------------------------------- phases

function go(t: Trial, phase: Phase): void {
  const prev = t.phase;
  t.phase = phase;
  t.phaseTime = 0;
  t.mark = -1;
  t.events.push({ type: 'phase', phase, prev });
  enter(t, phase);
}

function enter(t: Trial, phase: Phase): void {
  switch (phase) {
    case 'intro': {
      enqueue(t, defLine('greet.open', t.rng.pick(GREETING_OPENERS)));
      GREETING.forEach((d, i) => enqueue(t, defLine(`greet.${i}`, d)));
      break;
    }
    case 'grind':
      t.espresso = createEspresso();
      sayQueue(t, 'grind.intro');
      break;
    case 'lock':
      t.events.push({ type: 'sfx', id: 'tamp' });
      break;
    case 'shot':
      sayQueue(t, 'shot.intro');
      break;
    case 'steam':
      t.steam = createSteam();
      t.milk = null;
      t.milkScore = null;
      t.flags = {};
      if (t.attempt === 0) sayQueue(t, 'steam.intro');
      else {
        if (t.attempt === 1) sayQueue(t, 'shot.handoff');
        sayQueue(t, 'steam.again');
      }
      break;
    case 'demo':
      t.demoActive = false;
      t.demoTime = 0;
      t.demoCue = 0;
      t.demoEndedAt = -1;
      sayNow(t, t.demoSeen ? 'demo.again' : 'demo.intro');
      break;
    case 'pour':
      resetPour(t);
      sayNow(
        t,
        t.attempt === 0 ? 'pour.intro' : t.attempt === ATTEMPTS - 1 ? 'pour.last' : 'pour.again',
      );
      break;
    case 'inspect':
      judge(t);
      break;
    case 'verdict': {
      const outcome = trialOutcome(t.results);
      t.outcome = outcome;
      t.events.push({ type: 'verdict', outcome });
      t.events.push({
        type: 'sfx',
        id: outcome.band === 'hired' ? 'fanfare' : outcome.band === 'disaster' ? 'sad' : 'sting',
      });
      sayNow(t, `verdict.${outcome.band}`);
      if (outcome.band === 'hired') sayQueue(t, 'verdict.hiredAfter');
      break;
    }
    default:
      break;
  }
}

function resetPour(t: Trial): void {
  t.pour = createPour();
  t.pitcher = createPitcher();
  t.controls = {
    targetX: t.pitcher.x,
    targetY: t.pitcher.y,
    targetHeight: HEIGHT_START,
    holding: false,
  };
  t.watch = freshWatch();
}

function judge(t: Trial): void {
  const milkScore = t.milkScore ?? scoreMilk(SILKY_MILK);
  const espScore = t.espressoScore ?? scoreEspresso(t.espresso);
  const pattern = scorePattern(t.pour.foam);
  const result = scoreAttempt(pattern, t.pour, milkScore, espScore);
  const last = t.results[t.results.length - 1] ?? null;
  t.results.push(result);
  t.patterns.push(t.pour.foam.slice());
  t.events.push({ type: 'attempt', index: t.attempt, result });

  if (!result.valid) addFrustration(t.owner, 2);
  else if (result.band === 'hired') addFrustration(t.owner, -1);
  else if (result.band === 'almost') addFrustration(t.owner, -0.2);
  else addFrustration(t.owner, 1.3);

  // Streaks: Gaz remembers the last cup.
  const failed = !result.valid || result.total < 60;
  const improved = last !== null && result.total - last.total >= 8;
  const worse = last !== null && last.total - result.total >= 8;
  t.streak.improved = improved ? t.streak.improved + 1 : 0;
  t.streak.failed = failed ? t.streak.failed + 1 : 0;
  const artFault = result.faults.find((f) => `art.${f}` in OWNER_LINES);
  const lastArtFault = last?.faults.find((f) => `art.${f}` in OWNER_LINES);
  const sameMistake =
    result.valid &&
    last !== null &&
    last.valid &&
    artFault !== undefined &&
    artFault === lastArtFault;

  sayNow(t, 'inspect.look');
  if (!result.valid && result.invalid) {
    sayQueue(t, `invalid.${result.invalid}`);
    if (t.streak.failed >= 2) sayQueue(t, 'extra.failedAgain');
    return finishJudging(t, result);
  }
  if (result.total >= 85) sayQueue(t, 'art.great');
  else if (artFault) sayQueue(t, `art.${artFault}`);
  else sayQueue(t, 'art.decent');
  // One follow-up line at most, most important first.
  if (result.faults.includes('overflow')) sayQueue(t, 'extra.overflow');
  else if (result.faults.includes('spill')) sayQueue(t, 'extra.spill');
  else if (sameMistake) sayQueue(t, 'extra.sameMistake');
  else if (t.streak.improved >= 2) sayQueue(t, 'extra.improvedAgain');
  else if (improved) sayQueue(t, 'extra.improved');
  else if (t.streak.failed >= 2) sayQueue(t, 'extra.failedAgain');
  else if (worse) sayQueue(t, 'extra.worse');
  else if (result.faults.includes('underfilled')) sayQueue(t, 'extra.underfilled');
  finishJudging(t, result);
}

function finishJudging(t: Trial, result: AttemptResult): void {
  t.events.push({ type: 'sfx', id: result.valid && result.total >= 60 ? 'good' : 'bad' });
}

/** Can the player end the trial now? After the last attempt, or once they've earned the job. */
export function canFinish(t: Trial): boolean {
  if (t.attempt >= ATTEMPTS - 1) return true;
  const i = bestValidIndex(t.results);
  return i >= 0 && (t.results[i] as AttemptResult).total >= 85;
}

export function attemptsLeft(t: Trial): number {
  return ATTEMPTS - 1 - t.attempt;
}

// ---------------------------------------------------------------- step

export function stepTrial(t: Trial, input: TrialInput, dt: number): void {
  t.time += dt;
  t.phaseTime += dt;
  // Clicks only skip subtitles in phases where the click isn't a gameplay input.
  const passive =
    t.phase === 'intro' || t.phase === 'inspect' || t.phase === 'verdict' || t.phase === 'lock';
  updateSpeech(t, input.skip || (passive && input.pressed), input.voiceHold ? dt : 0);

  // Restart is available from anywhere once the trial has begun (pause menu, verdict).
  if (input.action === 'restart' && t.phase !== 'title') {
    restartTrial(t);
    return;
  }

  switch (t.phase) {
    case 'title':
      if (input.action === 'start') go(t, 'intro');
      break;
    case 'intro':
      if (!speaking(t) && t.phaseTime > 0.4) go(t, 'grind');
      break;
    case 'grind':
      stepGrindPhase(t, input, dt);
      break;
    case 'lock':
      if (t.phaseTime >= 0.75 && !t.flags.locked) {
        t.flags.locked = true;
        t.events.push({ type: 'sfx', id: 'lock' });
      }
      if (t.phaseTime >= 1.5 && !speaking(t)) go(t, 'shot');
      break;
    case 'shot':
      stepShotPhase(t, input, dt);
      break;
    case 'steam':
      stepSteamPhase(t, input, dt);
      break;
    case 'demo':
      stepDemoPhase(t, input, dt);
      break;
    case 'pour':
      stepPourPhase(t, input, dt);
      break;
    case 'inspect':
      if (t.phaseTime > 2.2 && !speaking(t)) go(t, 'feedback');
      break;
    case 'feedback':
      if (input.action === 'demo') {
        t.demoReturn = 'feedback';
        go(t, 'demo');
      } else if (input.action === 'finish' && canFinish(t)) go(t, 'verdict');
      else if (input.action === 'next') {
        if (t.attempt >= ATTEMPTS - 1) go(t, 'verdict');
        else {
          t.attempt++;
          go(t, 'steam');
        }
      }
      break;
    case 'verdict':
      break;
  }
}

function stepGrindPhase(t: Trial, input: TrialInput, dt: number): void {
  const e = t.espresso;
  stepGrind(e, input.holding, dt);
  if (e.grinding && e.dose > 21.5 && !t.flags.grindOver)
    t.flags.grindOver = sayLive(t, 'grind.over');
  if (input.action === 'next') {
    if (e.dose < 8) {
      sayLive(t, 'grind.empty');
      return;
    }
    e.grinding = false;
    sayNow(t, e.dose < 16.5 ? 'dose.light' : e.dose > 21.5 ? 'dose.heavy' : 'dose.good');
    if (e.dose < 16.5 || e.dose > 21.5) addFrustration(t.owner, 0.3);
    go(t, 'lock');
  }
}

function stepShotPhase(t: Trial, input: TrialInput, dt: number): void {
  const e = t.espresso;
  if (!e.done && input.pressed) {
    if (!e.extracting) startShot(e);
    else stopShot(e);
  }
  stepShot(e, dt);
  if (e.extracting && e.shotTime > SHOT_TARGET[1] + 2) sayLive(t, 'shot.long');
  if (e.done && t.mark < 0) {
    t.mark = t.phaseTime;
    const s = scoreEspresso(e);
    t.espressoScore = s;
    t.events.push({ type: 'sfx', id: s.total > 0.75 ? 'good' : 'bad' });
    if (s.faults.includes('shotLong') || e.shotTime >= SHOT_MAX) sayNow(t, 'shot.over');
    else if (s.faults.includes('shotShort')) sayNow(t, 'shot.short');
    else sayNow(t, 'shot.good');
    addFrustration(t.owner, s.faults.length * 0.3);
  }
  if (t.mark >= 0 && t.phaseTime - t.mark > 1.2 && !speaking(t)) go(t, 'steam');
}

function stepSteamPhase(t: Trial, input: TrialInput, dt: number): void {
  const s = t.steam;
  if (!s.done) {
    const wasOpen = s.valveOpen;
    stepSteam(s, input.holding, input.jugDepth, dt);
    if (s.valveOpen) {
      if (s.zone === 'screech') sayLive(t, 'steam.screech');
      if (s.temp > 42 && s.aeration < 0.12 && !t.flags.noAir)
        t.flags.noAir = sayLive(t, 'steam.noAir');
      if (s.aeration > 0.78 && !t.flags.tooMuch) t.flags.tooMuch = sayLive(t, 'steam.tooMuchAir');
      if (s.temp >= 66 && !t.flags.hot) t.flags.hot = sayLive(t, 'steam.hot');
    }
    const released = wasOpen && !s.valveOpen;
    if (s.temp >= SCALD_TEMP) finishSteam(t);
    else if (released && s.temp < 45) sayLive(t, 'steam.tooEarly');
    else if (released) finishSteam(t);
  } else if (t.phaseTime - t.mark > 1.2 && !speaking(t)) {
    if (!t.demoSeen) {
      t.demoReturn = 'pour';
      go(t, 'demo');
    } else go(t, 'pour');
  }
}

function finishSteam(t: Trial): void {
  const s = t.steam;
  s.done = true;
  s.valveOpen = false;
  s.zone = 'off';
  t.mark = t.phaseTime;
  const milk = milkQuality(s);
  const score = scoreMilk(milk);
  t.milk = milk;
  t.milkScore = score;
  const f = score.faults;
  const key = f.includes('scalded')
    ? 'steam.scalded'
    : f.includes('milkHot')
      ? 'steam.hotDone'
      : f.includes('milkCold')
        ? 'steam.cold'
        : f.includes('flatMilk')
          ? 'steam.flat'
          : f.includes('stiffMilk')
            ? 'steam.stiff'
            : 'steam.good';
  sayNow(t, key);
  addFrustration(t.owner, f.length ? f.length * 0.3 : -0.2);
}

const demoControls: PitcherControls = { targetX: 0, targetY: 0, targetHeight: 7, holding: false };

function stepDemoPhase(t: Trial, input: TrialInput, dt: number): void {
  if (!t.demoActive) {
    if (t.demoEndedAt < 0 && t.phaseTime > 0.6 && !speaking(t)) {
      t.demoActive = true;
      t.demoTime = 0;
      t.demoCue = 0;
      resetPour(t);
      const k = OWNER_DEMO[0];
      if (k) {
        t.pitcher.x = k.x;
        t.pitcher.y = k.y;
        t.pitcher.height = k.h;
      }
    } else if (t.demoEndedAt >= 0) {
      if (t.phaseTime - t.demoEndedAt > 1.6 && !t.flags.demoAfter) {
        t.flags.demoAfter = true;
        if (!t.demoSeen) sayNow(t, 'demo.after');
        t.demoSeen = true;
      }
      if (t.flags.demoAfter && !speaking(t)) {
        t.flags.demoAfter = false;
        go(t, t.demoReturn);
      }
    }
    return;
  }
  // Same physics as the player: the track only drives the controls.
  controlsAt(OWNER_DEMO, t.demoTime, demoControls);
  t.controls.targetX = demoControls.targetX;
  t.controls.targetY = demoControls.targetY;
  t.controls.targetHeight = demoControls.targetHeight;
  t.controls.holding = demoControls.holding;
  stepPourFrame(t.pour, t.pitcher, t.controls, SILKY_MILK, dt);
  const cue = DEMO_CUES[t.demoCue];
  if (cue && t.demoTime >= cue.t) {
    t.demoCue++;
    sayNow(t, cue.key);
  }
  t.demoTime += dt;
  const skipReplay = input.action === 'next' && t.demoSeen;
  if (t.demoTime >= DEMO_DURATION || skipReplay) {
    t.demoActive = false;
    t.demoEndedAt = t.phaseTime;
  }
}

function stepPourPhase(t: Trial, input: TrialInput, dt: number): void {
  const c = t.controls;
  if (input.hasCup) {
    c.targetX = input.cupX;
    c.targetY = input.cupY;
  }
  if (input.heightPreset !== null) c.targetHeight = input.heightPreset;
  c.targetHeight = clamp(c.targetHeight + input.heightDelta, HEIGHT_MIN, HEIGHT_MAX);
  c.holding = input.holding;
  const milk = t.milk ?? SILKY_MILK;
  stepPourFrame(t.pour, t.pitcher, c, milk, dt);

  const p = t.pour;
  const w = t.watch;
  const flowing = pitcherFlow(t.pitcher) > 0;
  if (p.missing) sayLive(t, 'pour.outside');
  else if (p.overflowing) sayLive(t, 'pour.overflow');
  else if (p.lateHighTime > 1.0 && !w.tooHighSaid) w.tooHighSaid = sayLive(t, 'pour.tooHigh');
  if (flowing && t.pitcher.height < 2 && p.fill < 0.4) {
    w.lowEarly += dt;
    if (w.lowEarly > 0.7) sayLive(t, 'pour.earlyLow');
  }
  if (p.drawing && t.pitcher.height < 2 && p.fill > 0.5) {
    w.bloom += dt;
    if (w.bloom > 0.9 && !w.bloomSaid && ownerTier(t.owner) < 2)
      w.bloomSaid = sayLive(t, 'pour.bloom');
  }
  if (p.poured === 0 && t.phaseTime > 6) sayLive(t, 'pour.hesitate');
  if (t.pitcher.milk <= 0 && !w.drySaid) w.drySaid = sayLive(t, 'pour.dry');

  // When is the cup handed over?
  if (!flowing && p.poured > 0) w.idle += dt;
  else w.idle = 0;
  const full = p.fill >= 0.88 && w.idle >= 1.1;
  const dry = t.pitcher.milk <= 0 && w.idle >= 0.6;
  if (full || dry || input.action === 'next' || t.phaseTime > 45) {
    c.holding = false;
    t.events.push({ type: 'sfx', id: 'clink' });
    go(t, 'inspect');
  }
}
