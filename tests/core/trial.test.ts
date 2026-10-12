import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  canFinish,
  createTrial,
  emptyInput,
  stepTrial,
  type Phase,
  type Trial,
  type TrialInput,
} from '../../src/core/trial';
import { OWNER_LINES } from '../../src/data/ownerLines';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';

type Style = 'good' | 'lazy' | 'messy';

/** A headless player. Drives the trial through the same inputs the mouse produces. */
function botInput(t: Trial, style: Style, step: number): TrialInput {
  const i = emptyInput();
  const tick = step % 20 === 0;
  switch (t.phase) {
    case 'title':
      i.action = 'start';
      break;
    case 'intro':
    case 'inspect':
    case 'lock':
      i.pressed = tick; // click through subtitles
      break;
    case 'grind':
      if (t.espresso.dose < 19) i.holding = true;
      else i.action = 'next';
      break;
    case 'shot': {
      const e = t.espresso;
      if (!e.extracting && !e.done) i.pressed = tick;
      if (e.extracting && e.shotTime >= (style === 'good' ? 27 : 18)) i.pressed = true;
      break;
    }
    case 'steam': {
      const s = t.steam;
      i.holding = !s.done && s.temp < 60;
      i.jugDepth = s.aeration < 0.4 ? 0.2 : 2.5;
      break;
    }
    case 'pour': {
      if (style === 'lazy') {
        if (t.phaseTime > 8) i.action = 'next';
        break;
      }
      const c = controlsAt(OWNER_DEMO, t.phaseTime);
      i.hasCup = true;
      i.cupX = style === 'messy' ? c.targetX + 1.3 : c.targetX;
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

function play(style: Style, seed = 7, maxSeconds = 600) {
  const t = createTrial(seed);
  const phases: Phase[] = [];
  const said: string[] = [];
  for (let n = 0; n < maxSeconds / STEP; n++) {
    stepTrial(t, botInput(t, style, n), STEP);
    for (const e of t.events) {
      if (e.type === 'phase') phases.push(e.phase);
      if (e.type === 'say') said.push(e.line.key);
    }
    t.events.length = 0;
    if (t.phase === 'verdict' && t.phaseTime > 1) break;
  }
  return { t, phases, said };
}

describe('trial shift, played headless', () => {
  it('a good barista gets through every step and is hired', () => {
    const { t, phases, said } = play('good');
    expect(phases.slice(0, 7)).toEqual(['intro', 'grind', 'lock', 'shot', 'steam', 'demo', 'pour']);
    expect(phases).toContain('inspect');
    expect(phases).toContain('feedback');
    expect(t.phase).toBe('verdict');
    expect(t.outcome?.band).toBe('hired');
    expect(t.results[0]?.valid).toBe(true);
    expect(said).toContain('demo.fill');
    expect(said).toContain('verdict.hired');
  });

  it('the owner demonstrates before the first attempt only', () => {
    const { phases } = play('messy');
    expect(phases.filter((p) => p === 'demo')).toHaveLength(1);
    expect(phases.indexOf('demo')).toBeLessThan(phases.indexOf('pour'));
  });

  it('pouring on the counter every time is three invalid attempts and a disaster', () => {
    const { t, said } = play('messy');
    expect(t.results).toHaveLength(3);
    expect(t.results.every((r) => !r.valid)).toBe(true);
    expect(t.outcome?.band).toBe('disaster');
    expect(said).toContain('pour.outside');
    expect(said.filter((k) => k.startsWith('invalid.')).length).toBe(3);
  });

  it('gets crankier with repeated failure', () => {
    const { t, said } = play('lazy');
    expect(t.owner.frustration).toBeGreaterThan(3.5);
    expect(t.outcome?.band).toBe('disaster');
    expect(said).toContain('shot.short');
  });

  it('every line key the trial uses exists', () => {
    for (const style of ['good', 'messy', 'lazy'] as const) {
      const { said } = play(style);
      for (const k of said) if (!k.startsWith('greet.')) expect(OWNER_LINES[k], k).toBeDefined();
    }
  });

  it('never says the same line twice in a row', () => {
    for (const style of ['good', 'messy', 'lazy'] as const) {
      const t = createTrial(3);
      let last = '';
      for (let n = 0; n < 600 / STEP; n++) {
        stepTrial(t, botInput(t, style, n), STEP);
        for (const e of t.events) {
          if (e.type === 'say') {
            expect(e.line.text).not.toBe(last);
            last = e.line.text;
          }
        }
        t.events.length = 0;
        if (t.phase === 'verdict' && t.phaseTime > 1) break;
      }
    }
  });

  it('is reproducible for a seed', () => {
    const a = play('good', 11);
    const b = play('good', 11);
    expect(a.said).toEqual(b.said);
    expect(a.t.results.map((r) => r.total)).toEqual(b.t.results.map((r) => r.total));
  });

  it('"Watch Gaz again" replays the demo and returns to the same result card', () => {
    const t = createTrial(5);
    const phases: Phase[] = [];
    let replayed = false;
    for (let n = 0; n < 600 / STEP; n++) {
      const input = botInput(t, 'good', n);
      if (t.phase === 'feedback') {
        if (replayed) break;
        input.action = 'demo';
        replayed = true;
      }
      stepTrial(t, input, STEP);
      for (const e of t.events) if (e.type === 'phase') phases.push(e.phase);
      t.events.length = 0;
    }
    expect(replayed).toBe(true);
    const fb = phases.indexOf('feedback');
    expect(phases.slice(fb, fb + 3)).toEqual(['feedback', 'demo', 'feedback']);
    expect(t.phase).toBe('feedback');
    expect(t.results).toHaveLength(1);
    expect(t.demoSeen).toBe(true);
    expect(t.attempt).toBe(0);
  });

  it('only says "last go" on the last attempt', () => {
    const { said } = play('lazy');
    const pours = said.filter(
      (k) => k.startsWith('pour.intro') || k === 'pour.again' || k === 'pour.last',
    );
    expect(pours).toEqual(['pour.intro', 'pour.again', 'pour.last']);
  });

  it('restart goes back to the greeting with a clean slate', () => {
    const { t } = play('lazy');
    const input = emptyInput();
    input.action = 'restart';
    stepTrial(t, input, STEP);
    expect(t.phase).toBe('intro');
    expect(t.results).toHaveLength(0);
    expect(t.attempt).toBe(0);
    expect(t.owner.frustration).toBe(0);
    expect(t.demoSeen).toBe(false);
  });
});
