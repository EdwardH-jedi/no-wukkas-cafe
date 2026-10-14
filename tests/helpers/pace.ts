// Day 2 pacing measurements: play a shift with a bot profile and record what a player feels —
// walk-outs, how long people wait, how long each drink takes to make, and how much patience each
// customer has left when their drink arrives. Shared by `npm run pace` and the pacing tests.

import { CUSTOMERS, type CustomerId } from '../../src/data/customers';
import type { Difficulty } from '../../src/sim/listening';
import type { DrinkType } from '../../src/sim/rush';
import { playRush, type ListenBot } from './rushBot';

export interface PaceRun {
  seed: number;
  difficulty: Difficulty;
  walkouts: CustomerId[];
  /** Mean seconds from reaching the register to an accepted drink. */
  meanServe: number;
  /** Seconds from "make" to the drink on the pass, per drink finished. */
  make: Record<DrinkType, number[]>;
  /** Patience (seconds) left when each customer was served. */
  left: Partial<Record<CustomerId, number>>;
}

export function paceRun(bot: ListenBot, seed: number, difficulty: Difficulty): PaceRun {
  const make: PaceRun['make'] = { flatWhite: [], longBlack: [] };
  const left: PaceRun['left'] = {};
  let started: { at: number; drink: DrinkType } | null = null;
  let phase = 'idle';
  const { r } = playRush({
    ...bot,
    seed,
    difficulty,
    each: (s) => {
      const b = s.barista;
      if (b.phase !== phase) {
        if (phase === 'idle' && b.phase === 'grind' && b.drink)
          started = { at: s.time, drink: b.drink };
        if (b.phase === 'ready' && started) make[started.drink].push(s.time - started.at);
        if (b.phase === 'ready' || b.phase === 'idle') started = null;
        phase = b.phase;
      }
      for (const c of s.customers)
        if (c.outcome === 'served' && left[c.def.id] === undefined) left[c.def.id] = c.patience;
    },
  });
  return {
    seed,
    difficulty,
    walkouts: r.customers.filter((c) => c.outcome === 'walkout').map((c) => c.def.id),
    meanServe: r.summary?.avgServeSeconds ?? 0,
    make,
    left,
  };
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f0 = (x: number): string => x.toFixed(0);

/** One Markdown row summarising runs of a profile at one difficulty. Patience cells read
 *  "worst/mean" seconds left at serve, with "✗n" when n of the runs ended in a walk-out. */
export function paceRow(profile: string, runs: PaceRun[]): string {
  const walk = runs.map((x) => x.walkouts.length);
  const early = runs.map(
    (x) => x.walkouts.filter((id) => CUSTOMERS.findIndex((c) => c.id === id) < 3).length,
  );
  const fw = runs.flatMap((x) => x.make.flatWhite);
  const lb = runs.flatMap((x) => x.make.longBlack);
  const cells = CUSTOMERS.map((c) => {
    const got = runs.map((x) => x.left[c.id]).filter((v): v is number => v !== undefined);
    const gone = runs.length - got.length;
    const s = got.length ? `${f0(Math.min(...got))}/${f0(mean(got))}` : '–';
    return gone ? `${s} ✗${gone}` : s;
  });
  return `| ${profile} | ${runs[0]?.difficulty ?? ''} | ${walk.reduce((a, b) => a + b, 0)} / ${Math.max(...walk)} / ${Math.max(...early)} | ${mean(runs.map((x) => x.meanServe)).toFixed(1)} | ${fw.length ? mean(fw).toFixed(1) : '–'} | ${lb.length ? mean(lb).toFixed(1) : '–'} | ${cells.join(' | ')} |`;
}

export const PACE_HEADER = `| bot | difficulty | walk-outs (total / worst seed / worst in 1–3) | mean serve s | make FW s | make LB s | ${CUSTOMERS.map((c) => c.callName).join(' | ')} |
|---|---|---|---|---|---|${CUSTOMERS.map(() => '---|').join('')}`;
