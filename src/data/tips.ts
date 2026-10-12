// Short labels and coaching tips for each fault, shown on the result card between attempts.

import type { Fault, InvalidReason } from '../sim/attempt';

export const FAULT_TEXT: Record<Fault, { label: string; tip: string }> = {
  noArt: {
    label: 'No art',
    tip: 'Drop the spout right onto the surface once the cup is about 60% full.',
  },
  muddy: {
    label: 'Muddy',
    tip: 'Go lower. Below 2 cm the foam floats; higher, it mixes in and turns beige.',
  },
  blob: {
    label: 'Blob, no heart',
    tip: 'Finish with the pull-through: lift a touch, ease off, and push forward across the cup.',
  },
  split: {
    label: 'Cut in half',
    tip: 'Ease off before you pull through. A heavy stream slices the heart apart.',
  },
  noTip: {
    label: 'No point',
    tip: 'Keep going past the far edge of the white so the stream drags a point out.',
  },
  noCleft: {
    label: 'No dip at the top',
    tip: 'Start the pull-through from the back edge of the white, nearest you.',
  },
  lopsided: {
    label: 'Lopsided',
    tip: 'Hold the jug steady while it blooms, and pull straight away from you.',
  },
  offCentre: {
    label: 'Off centre',
    tip: 'Pour into the middle of the cup. The white rolls a little forward, so start just short of centre.',
  },
  tooSmall: { label: 'Too small', tip: 'Go low earlier, or hold the bloom longer.' },
  tooBig: { label: 'Too big', tip: 'Drop in later, when the cup is fuller.' },
  overflow: {
    label: 'Overflowed',
    tip: 'Let go of the button as the cup reaches the brim. The jug keeps dribbling for a moment.',
  },
  spill: { label: 'Spilled', tip: 'Keep the spout inside the rim.' },
  underfilled: { label: 'Not full', tip: 'Fill to the brim. A flat white goes right to the top.' },
  milkCold: { label: 'Milk too cold', tip: 'Keep steaming until the thermometer hits 55–65 °C.' },
  milkHot: { label: 'Milk too hot', tip: 'Close the valve at 60 °C. It keeps climbing a little.' },
  scalded: { label: 'Scalded milk', tip: 'Above 75 °C the milk cooks. Let go much earlier.' },
  flatMilk: {
    label: 'Flat milk',
    tip: 'Start with the tip just under the surface (the tss-tss sound) to stretch some air in.',
  },
  stiffMilk: {
    label: 'Stiff milk',
    tip: 'Stretch for less time, then raise the jug so the tip spins the milk.',
  },
  bubbly: {
    label: 'Big bubbles',
    tip: 'Stretch early while the milk is cold, and keep the tip in the milk.',
  },
  shotShort: { label: 'Shot too short', tip: 'Let the shot run to 25–31 s on the timer.' },
  shotLong: { label: 'Shot too long', tip: 'Stop the shot by 31 s or it turns bitter.' },
  doseLight: { label: 'Dose too light', tip: 'Grind 18–20 g.' },
  doseHeavy: { label: 'Dose too heavy', tip: 'Grind 18–20 g. More coffee chokes the shot.' },
};

export const INVALID_TEXT: Record<InvalidReason, string> = {
  nothingPoured: 'Nothing poured. Doesn’t count.',
  mostlySpilled: 'Mostly spilled. Doesn’t count.',
  halfEmpty: 'Cup under 60% full. Doesn’t count.',
};

export const BAND_TEXT = {
  disaster: { title: 'Disaster', sub: 'Shown the door' },
  failed: { title: 'Failed trial', sub: 'Not today' },
  almost: { title: 'Almost hired', sub: 'Come back Saturday' },
  hired: { title: 'Hired', sub: 'Six sharp Monday' },
} as const;
