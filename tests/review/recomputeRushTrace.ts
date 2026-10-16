// Run with: node --import ./tests/review/nodeReviewLoader.mjs tests/review/recomputeRushTrace.ts
// Run the same script in a git archive of each reviewed revision, with that revision's bot.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { playRush, type ListenBot } from '../helpers/rushBot';

const profiles: Record<string, ListenBot> = {
  normal: { seed: 3 },
  hard: { seed: 11, difficulty: 'hard' },
  easy: { seed: 5, difficulty: 'easy' },
  aids: {
    seed: 9,
    aids: () => [{ type: 'replay' }, { type: 'repeat' }, { type: 'clarify', field: 'milk' }],
  },
  misheard: {
    seed: 4,
    heard: (c) =>
      c.order.type === 'flatWhite'
        ? { type: 'longBlack', milk: null, extraHot: false, heart: false }
        : { type: 'flatWhite', milk: 'oat', extraHot: false, heart: false },
  },
  hurry: { seed: 6, hurry: true },
  idle: { seed: 8, idle: true },
};

const traces = Object.fromEntries(
  Object.entries(profiles).map(([name, options]) => {
    const { r, events } = playRush(options);
    return [name, { events, summary: r.summary, listening: r.listening }];
  }),
);
const hash = (value: unknown) => createHash('sha1').update(JSON.stringify(value)).digest('hex');
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(traces).map(([name, trace]) => [
        name,
        {
          sha1: hash(trace),
          withoutGone: hash({
            ...trace,
            events: trace.events.filter((e) => String(e.type) !== 'gone'),
          }),
        },
      ]),
    ),
    null,
    2,
  ),
);
if (process.env.REVIEW_TRACE_OUT)
  writeFileSync(process.env.REVIEW_TRACE_OUT, JSON.stringify(traces));
