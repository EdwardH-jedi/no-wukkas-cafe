// Words for latte-art coaching: the four steps of a heart (the lesson strip, shown for the
// player's pour and for Gaz's demo) and why a pattern came out the way it did (practice review).
// Slots: {n} the finding's measurement, {c} the cause's, {dir} a direction. [x] marks a key.

import type { CauseId, Dir, FindingId, PourStep } from '../sim/latte/coach';

export interface StepText {
  title: string;
  /** Mouse / trackpad / keyboard. */
  how: string;
  /** Touch screens. */
  touch: string;
}

export const STEP_TEXT: Record<PourStep, StepText> = {
  fill: {
    title: 'Pour high to fill',
    how: 'Jug up high [1], hold [Space] or the mouse button. The milk dives under the crema.',
    touch: 'Jug up high (▲), press and hold. The milk dives under the crema.',
  },
  lay: {
    title: 'Drop low to lay foam',
    how: 'About half full, press [3]: spout right down on the coffee. White comes up.',
    touch: 'About half full, ▼ right down onto the coffee. White comes up.',
  },
  lobes: {
    title: 'Hold steady: grow the lobes',
    how: 'Stay low and still, just short of the middle. Let the white spread wide.',
    touch: 'Stay low and still, just short of the middle. Let the white spread wide.',
  },
  pull: {
    title: 'Lift and pull through',
    how: 'Lift a touch [2], keep pouring, and sweep forward through the white. Let go at the far edge.',
    touch:
      'Lift a touch (▲), keep pressing, and sweep forward through the white. Let go at the far edge.',
  },
};

/** Live nudges under the lesson strip, when the pour is going off the rails. */
export const LESSON_HINT = {
  held: 'Let go, then press again to pour.',
  miss: "You're pouring on the bench. Keep the ring inside the rim.",
  full: "Cup's full. Let go.",
  tooLowEarly: 'Too early to go low: fill from up high first [1].',
  goLow: 'Half full. Drop right down now [3].',
  tooHighToDraw: 'Too high to draw: the foam is sinking. Lower [3].',
  pullNow: 'Wide enough. Lift [2], keep pouring and sweep forward.',
  done: 'Done. Hands off and let it settle.',
} as const;

export const FINDING_TEXT: Record<FindingId, { label: string; why: string; fix: string }> = {
  noWhite: {
    label: 'No white',
    why: 'Only {n}% of the surface turned white.',
    fix: 'Once the cup is half full, press [3] and bring the spout right down onto the coffee.',
  },
  muddy: {
    label: 'Muddy',
    why: 'Only {n}% of the foam is crisp white; the rest mixed in and went beige.',
    fix: 'Draw with the spout under 1 cm [3]. Any higher and the foam dives under.',
  },
  split: {
    label: 'Cut in half',
    why: 'The dip runs {n}% as deep as a textbook heart’s.',
    fix: 'Lift [2] before you sweep: up there the stream thins. Low and heavy, it slices the heart apart.',
  },
  noPull: {
    label: 'Blob, no pull-through',
    why: 'Nothing was dragged through the white, so there’s no dip and no point.',
    fix: 'Lift a touch [2], keep pouring, and sweep forward through the white. Let go at the far edge.',
  },
  streamDied: {
    label: 'Stream died',
    why: 'The jug moved {n}% of the radius forward after the milk had stopped, so nothing was dragged through the white.',
    fix: 'You let go before the sweep. Keep pouring through it, let go at the far edge.',
  },
  shortPull: {
    label: 'No point',
    why: 'Near the tip it’s still {n}% as wide as the heart: the pull stopped too soon.',
    fix: 'Keep sweeping past the far edge of the white so the stream drags out a point.',
  },
  noCleft: {
    label: 'No dip at the top',
    why: 'The dip between the lobes is only {n}% as deep as it should be.',
    fix: 'Start the pull-through from the near edge of the white, not the middle.',
  },
  sweptLong: {
    label: 'Too much in the sweep',
    why: 'The sweep poured heavy past the middle, or ran on past the far rim, and washed the dip out.',
    fix: 'Too much milk in the sweep. Lift, thin the stream, one pass.',
  },
  lopsided: {
    label: 'Lopsided',
    why: 'Most of the white with nothing opposite it is on the {dir}: that lobe is heavier.',
    fix: 'Hold the jug still while it blooms, and pull dead straight away from you.',
  },
  offCentre: {
    label: 'Off centre',
    why: 'The heart sits {n}% of the radius off centre, {dir}.',
    fix: 'Drop in a little the other way. The white rolls forward, so start just short of the middle.',
  },
  tooSmall: {
    label: 'Too small',
    why: 'The white covers {n}% of the surface; a heart wants about 25–50%.',
    fix: 'Drop in earlier, or hold the bloom longer before you pull through.',
  },
  tooBig: {
    label: 'Too big',
    why: 'The white covers {n}% of the surface; a heart wants about 25–50%.',
    fix: 'Drop in later, when the cup is fuller, and pull through sooner.',
  },
  overflow: {
    label: 'Overflowed',
    why: '{n}% of a cup ran over the brim.',
    fix: 'Let go as the cup reaches the top. The jug keeps dribbling for a moment.',
  },
  spill: {
    label: 'Spilled',
    why: '{n}% of a cup missed the cup.',
    fix: 'Keep the aim ring inside the rim.',
  },
  underfilled: {
    label: 'Not full',
    why: 'The cup is only {n}% full.',
    fix: 'A flat white goes right to the brim.',
  },
  textbook: {
    label: 'Textbook',
    why: 'Art {n}%. Nothing to fix.',
    fix: 'Now do it again, and make it look easy.',
  },
};

export const CAUSE_TEXT: Record<CauseId, string> = {
  pouredHigh: 'You drew from about {c} cm up; foam only floats below about 1 cm.',
  stayedLow: 'You stayed low and stopped, without lifting and sweeping forward.',
  stoppedShort: 'The stream only travelled {c}% of the cup’s radius forward before it stopped.',
  heavyPull: 'The stream was still at {c}% flow during the pull-through.',
  droppedEarly: 'You dropped in when the cup was only {c}% full.',
  droppedLate: 'You dropped in at {c}% full, leaving little room to bloom.',
  drift: 'The jug drifted {c}% of the radius sideways while it bloomed.',
};

export const DIR_TEXT: Record<Dir, string> = {
  '': 'in the middle',
  far: 'toward the far side',
  farRight: 'toward the far right',
  right: 'to the right',
  nearRight: 'toward you, on the right',
  near: 'toward you',
  nearLeft: 'toward you, on the left',
  left: 'to the left',
  farLeft: 'toward the far left',
};
