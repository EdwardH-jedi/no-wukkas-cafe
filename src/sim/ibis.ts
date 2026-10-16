// The bin chicken: an occasional Australian white ibis that wanders in through the café door,
// goes for the rubbish bin, and has to be shooed out (gently: a wave and a clap, the bird walks
// out on its own feet). A small deterministic state machine, separate from the rush: its own
// seeded RNG, its own state, driven by inputs. No DOM, no three.
//
//   absent ─(its time comes, door open, no one mid-order)→ entering ─→ foraging ─(shoo)→ herded
//      herded ─(3 shoos)→ leaving ─→ gone        herded ─(left alone 7 s)→ foraging
//      foraging ─(ignored 30 s)→ leaving (bin raided) ─→ gone

import { createRng } from '../core/rng';

export type IbisState = 'absent' | 'entering' | 'foraging' | 'herded' | 'leaving' | 'gone';

export type IbisEvent =
  | { type: 'enter' }
  | { type: 'atBin' }
  | { type: 'honk' }
  | { type: 'alert' }
  | { type: 'shooed'; shoos: number }
  | { type: 'leave'; how: 'shooed' | 'ignored' };

export interface Ibis {
  /** Service time it shows up (if the door is open), or null: not this shift. */
  scheduledAt: number | null;
  state: IbisState;
  stateTime: number;
  /** 0 = at the door, 1 = at the bin. The view walks it along the path. */
  pos: number;
  /** Where it's heading along the path. */
  target: number;
  shoos: number;
  sinceShoo: number;
  /** Looked up at the player already (only once per visit). */
  alerted: boolean;
  /** Left on its own after raiding the bin. */
  binRaided: boolean;
  nextHonk: number;
  events: IbisEvent[];
}

export interface IbisInput {
  /** Seconds since the doors opened. */
  serviceTime: number;
  /** The front door is open (someone is walking in or out). */
  doorOpen: boolean;
  /** A customer is saying their order or an answer (or is about to): the bird waits outside for
   *  the next open door, so it never walks in, honking, over a line the player must hear. */
  midOrder: boolean;
  /** The player clapped/waved at it this step. */
  shoo: boolean;
  /** The player is looking at it (pointer over it). */
  noticed: boolean;
}

export const IBIS = {
  /** Chance a shift has a bin chicken. */
  chance: 0.3,
  /** Window (service seconds) it can turn up in. */
  earliest: 40,
  latest: 150,
  /** Walking speed along the door→bin path (path lengths per second). */
  walk: 1 / 3,
  /** Faster when herded or leaving. */
  hurry: 0.55,
  shoosToLeave: 3,
  /** Ignore it this long at the bin and it helps itself, then leaves. */
  forageMax: 30,
  /** Herded but left alone this long: back to the bin. */
  herdTimeout: 7,
  shooCooldown: 0.4,
  honkEvery: 5,
} as const;

const SALT = 0x1b15;

/** Does this shift get a bin chicken, and when? Deterministic per seed. */
export function scheduleIbis(seed: number, force = false): number | null {
  const rng = createRng((seed ^ SALT) >>> 0);
  const roll = rng.next();
  const at = IBIS.earliest + rng.next() * (IBIS.latest - IBIS.earliest);
  if (force) return 30;
  return roll < IBIS.chance ? Math.round(at * 10) / 10 : null;
}

export function createIbis(seed: number, force = false): Ibis {
  return {
    scheduledAt: scheduleIbis(seed, force),
    state: 'absent',
    stateTime: 0,
    pos: 0,
    target: 0,
    shoos: 0,
    sinceShoo: 99,
    alerted: false,
    binRaided: false,
    nextHonk: IBIS.honkEvery,
    events: [],
  };
}

const go = (b: Ibis, s: IbisState): void => {
  b.state = s;
  b.stateTime = 0;
};

export const ibisPresent = (b: Ibis): boolean => b.state !== 'absent' && b.state !== 'gone';

export function stepIbis(b: Ibis, input: IbisInput, dt: number): void {
  b.stateTime += dt;
  b.sinceShoo += dt;
  const shoo =
    input.shoo && b.sinceShoo >= IBIS.shooCooldown && ibisPresent(b) && b.state !== 'leaving';
  if (shoo) b.sinceShoo = 0;

  // Walk toward the target.
  const speed = b.state === 'herded' || b.state === 'leaving' ? IBIS.hurry : IBIS.walk;
  if (b.pos < b.target) b.pos = Math.min(b.target, b.pos + speed * dt);
  else if (b.pos > b.target) b.pos = Math.max(b.target, b.pos - speed * dt);

  switch (b.state) {
    case 'absent':
      if (
        b.scheduledAt !== null &&
        input.serviceTime >= b.scheduledAt &&
        input.doorOpen &&
        !input.midOrder
      ) {
        go(b, 'entering');
        b.target = 1;
        b.events.push({ type: 'enter' });
      }
      break;
    case 'entering':
      if (shoo) herd(b);
      else if (b.pos >= 1) {
        go(b, 'foraging');
        b.events.push({ type: 'atBin' });
        b.nextHonk = IBIS.honkEvery;
      }
      break;
    case 'foraging':
      if (shoo) {
        herd(b);
        break;
      }
      if (input.noticed && !b.alerted) {
        b.alerted = true;
        b.events.push({ type: 'alert' });
      }
      if (b.stateTime >= b.nextHonk) {
        b.nextHonk += IBIS.honkEvery;
        b.events.push({ type: 'honk' });
      }
      if (b.stateTime >= IBIS.forageMax) {
        b.binRaided = true;
        go(b, 'leaving');
        b.target = 0;
        b.events.push({ type: 'leave', how: 'ignored' });
      }
      break;
    case 'herded':
      if (shoo) herd(b);
      else if (b.sinceShoo >= IBIS.herdTimeout) {
        // Nobody's bothering it any more: back to breakfast.
        go(b, 'foraging');
        b.target = 1;
      }
      break;
    case 'leaving':
      if (b.pos <= 0) go(b, 'gone');
      break;
    case 'gone':
      break;
  }
}

/** One wave/clap: it backs off toward the door; enough of them and it leaves. */
function herd(b: Ibis): void {
  b.shoos++;
  b.events.push({ type: 'shooed', shoos: b.shoos });
  if (b.shoos >= IBIS.shoosToLeave) {
    go(b, 'leaving');
    b.target = 0;
    b.events.push({ type: 'leave', how: 'shooed' });
    return;
  }
  go(b, 'herded');
  b.target = Math.max(0.05, Math.min(b.pos, 1 - b.shoos / IBIS.shoosToLeave));
}
