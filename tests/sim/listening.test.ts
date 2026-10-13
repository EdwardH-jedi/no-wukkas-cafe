import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import {
  answerFor,
  cueSpans,
  DIFFICULTY,
  difficultyScore,
  normaliseOrder,
  orderTier,
  pickOrder,
  summariseListening,
  transcriptVisible,
  wrongFields,
  type ClarifyAnswers,
  type OrderLine,
} from '../../src/sim/listening';
import type { Order } from '../../src/sim/rush';

const FW = (o: Partial<Order> = {}): Order => ({
  type: 'flatWhite',
  milk: 'full',
  extraHot: false,
  heart: false,
  ...o,
});
const LB: Order = { type: 'longBlack', milk: null, extraHot: false, heart: false };

const line = (o: Partial<OrderLine> = {}): OrderLine => ({
  id: 'x.1',
  text: 'An oat flat white, extra hot, with a heart.',
  order: FW({ milk: 'oat', extraHot: true, heart: true }),
  pace: 'normal',
  connected: 0,
  slang: 0,
  chatter: 0,
  cues: { drink: 'flat white', milk: 'oat', temp: 'extra hot', heart: 'heart' },
  ...o,
});

const answers: ClarifyAnswers = {
  drink: { flatWhite: 'Flat white.', longBlack: 'Long black.' },
  milk: { full: 'Normal.', oat: 'Oat.', soy: 'Soy.', almond: 'Almond.', none: 'No milk.' },
  temp: { normal: 'Normal temp.', extraHot: 'Extra hot.', none: 'However.' },
  heart: { yes: 'Yes, a heart.', no: 'No heart.', none: 'Not on a long black.' },
};

describe('answer key', () => {
  it('a long black has no milk, temperature or art; a flat white defaults to full cream', () => {
    expect(normaliseOrder({ type: 'longBlack', milk: 'oat', extraHot: true, heart: true })).toEqual(
      LB,
    );
    expect(normaliseOrder({ ...FW(), milk: null })).toEqual(FW());
  });

  it('finds exactly the parts that were misheard', () => {
    expect(wrongFields(FW(), FW())).toEqual([]);
    expect(wrongFields(LB, LB)).toEqual([]);
    expect(wrongFields(FW(), LB)).toEqual(['drink']);
    expect(wrongFields(FW({ milk: 'soy' }), FW({ milk: 'oat' }))).toEqual(['milk']);
    expect(wrongFields(FW(), FW({ milk: 'almond', extraHot: true, heart: true }))).toEqual([
      'milk',
      'temp',
      'heart',
    ]);
    // Modifiers rung up on a long black don't count against it (they can't be made).
    expect(wrongFields({ ...LB, extraHot: true }, LB)).toEqual([]);
  });
});

describe('difficulty', () => {
  it('scores how an order is said, plus how much is in it', () => {
    expect(difficultyScore(line())).toBe(1 + 3);
    expect(orderTier(line({ order: FW(), cues: { drink: 'flat white' } }))).toBe(1);
    expect(orderTier(line())).toBe(2);
    expect(orderTier(line({ pace: 'fast', slang: 1 }))).toBe(3);
  });

  it('picks within the difficulty tiers, deterministically for a seed', () => {
    const lines = [
      line({ id: 'a', order: FW(), cues: { drink: 'flat white' } }), // tier 1
      line({ id: 'b' }), // tier 2
      line({ id: 'c', pace: 'fast', slang: 2, chatter: 2 }), // tier 3
    ];
    for (let s = 0; s < 20; s++) {
      expect(pickOrder(lines, 'easy', createRng(s)).id).toBe('a');
      expect(['a', 'b']).toContain(pickOrder(lines, 'normal', createRng(s)).id);
      expect(['b', 'c']).toContain(pickOrder(lines, 'hard', createRng(s)).id);
      expect(pickOrder(lines, 'normal', createRng(s)).id).toBe(
        pickOrder(lines, 'normal', createRng(s)).id,
      );
    }
  });

  it('falls back to the nearest tier when a customer has none in range', () => {
    const onlyHard = [line({ id: 'c', pace: 'fast', slang: 2, chatter: 2 })];
    expect(pickOrder(onlyHard, 'easy', createRng(1)).id).toBe('c');
  });

  it('harder settings are noisier and show fewer subtitles', () => {
    expect(DIFFICULTY.easy.noise).toBeLessThan(DIFFICULTY.normal.noise);
    expect(DIFFICULTY.normal.noise).toBeLessThan(DIFFICULTY.hard.noise);
    expect(DIFFICULTY.easy.subtitles).toBe('always');
    expect(DIFFICULTY.hard.subtitles).toBe('off');
  });
});

describe('clarifying answers come from the answer key', () => {
  it('answers each question with the truth', () => {
    const t = FW({ milk: 'oat', extraHot: true });
    expect(answerFor(answers, t, 'drink')).toBe('Flat white.');
    expect(answerFor(answers, t, 'milk')).toBe('Oat.');
    expect(answerFor(answers, t, 'temp')).toBe('Extra hot.');
    expect(answerFor(answers, t, 'heart')).toBe('No heart.');
    expect(answerFor(answers, FW(), 'milk')).toBe('Normal.');
  });
  it('a long black customer says so when asked about milk, temperature or art', () => {
    expect(answerFor(answers, LB, 'drink')).toBe('Long black.');
    expect(answerFor(answers, LB, 'milk')).toBe('No milk.');
    expect(answerFor(answers, LB, 'temp')).toBe('However.');
    expect(answerFor(answers, LB, 'heart')).toBe('Not on a long black.');
  });
});

describe('transcript visibility', () => {
  it('always: always shown', () => {
    for (const stage of ['speaking', 'deciding', 'rungUp'] as const)
      expect(transcriptVisible('always', false, stage, 0)).toBe(true);
  });
  it('afterRepeat: hidden until they repeat it', () => {
    expect(transcriptVisible('afterRepeat', false, 'speaking', 0)).toBe(false);
    expect(transcriptVisible('afterRepeat', false, 'deciding', 0)).toBe(false);
    expect(transcriptVisible('afterRepeat', false, 'deciding', 1)).toBe(true);
  });
  it('off: never shown while ordering, even after a repeat', () => {
    expect(transcriptVisible('off', false, 'speaking', 0)).toBe(false);
    expect(transcriptVisible('off', false, 'deciding', 2)).toBe(false);
    expect(transcriptVisible('off', false, 'rungUp', 2)).toBe(false);
  });
  it('learning mode reveals it once the ticket is rung up, never before', () => {
    expect(transcriptVisible('off', true, 'speaking', 0)).toBe(false);
    expect(transcriptVisible('off', true, 'deciding', 0)).toBe(false);
    expect(transcriptVisible('off', true, 'rungUp', 0)).toBe(true);
  });
});

describe('cues and summary', () => {
  it('locates the key words for highlighting', () => {
    const l = line();
    const spans = cueSpans(l);
    expect(spans.map((s) => l.text.slice(s.start, s.end))).toEqual([
      'oat',
      'flat white',
      'extra hot',
      'heart',
    ]);
  });
  it('summarises a shift of listening', () => {
    const rec = (wrong: Array<'milk'>, replays = 0) => ({
      customer: 'x',
      lineId: 'x.1',
      tier: 1 as const,
      truth: FW(),
      heard: FW(),
      wrong,
      replays,
      repeats: 1,
      clarified: ['milk' as const],
    });
    expect(summariseListening([rec([]), rec(['milk'], 2)])).toEqual({
      orders: 2,
      heardRight: 1,
      replays: 2,
      repeats: 2,
      questions: 2,
    });
  });
});
