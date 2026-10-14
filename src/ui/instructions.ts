// What to do right now, in plain words. Derived from trial state each frame.

import type { EspressoState } from '../sim/espresso';
import { SURF_LOW, type PourState } from '../sim/latte/field';
import type { PitcherState } from '../sim/latte/pitcher';
import type { SteamState } from '../sim/steam';

export interface Instruction {
  title: string;
  html: string;
}

/** What the instruction panel needs (Day 1's Trial and Day 2's station both provide it). */
export interface InstructionView {
  phase: string;
  /** Day 2: the drink being made (a flat white's milk can be steamed during its shot). */
  drink?: string | null;
  espresso: EspressoState;
  steam: SteamState;
  pour: PourState;
  pitcher: PitcherState;
}

/** Day 2, a flat white's shot running: both hands. Once steaming, a click would just grab the jug,
 *  so the shot stops on Enter (or its card). */
const twoHands = (touch: boolean, steaming: boolean): Instruction => ({
  title: 'Shot + milk',
  html: steaming
    ? touch
      ? 'Hold to steam. Tap <b>Stop</b> on the shot timer at <b>25–31 s</b>.'
      : 'Hold to steam. <kbd>Enter</kbd> stops the shot at <b>25–31 s</b>.'
    : touch
      ? "Shot's running — hold to steam the milk now, tap to stop the shot at <b>25–31 s</b>."
      : "Shot's running — hold (<kbd>Space</kbd>) to steam the milk now, click (tap <kbd>Space</kbd>) to stop the shot at <b>25–31 s</b>.",
});

export function instruction(t: InstructionView, touch: boolean): Instruction | null {
  const hold = touch ? 'Press and hold' : 'Hold the mouse button (or <kbd>Space</kbd>)';
  const e = t.espresso;
  if (t.phase === 'shotSteam' || (t.phase === 'shot' && t.drink === 'flatWhite' && e.extracting))
    return e.done
      ? instruction({ ...t, phase: 'steam' }, touch)
      : twoHands(touch, t.phase === 'shotSteam');
  switch (t.phase) {
    case 'grind':
      if (e.dose < 0.5) return { title: 'Grind', html: `${hold} to grind into the basket.` };
      if (e.grinding) return { title: 'Grind', html: 'Let go at <b>18–20 g</b>.' };
      return {
        title: 'Grind',
        html: `More? Hold again. Happy with it? <b>Tamp &amp; lock in</b>${touch ? '' : ' (<kbd>Enter</kbd>)'}.`,
      };
    case 'lock':
      return { title: 'Tamp', html: 'Tamping and locking the portafilter in…' };
    case 'shot':
      if (e.done) return null;
      if (!e.extracting)
        return {
          title: 'Pull the shot',
          html: `${touch ? 'Tap' : 'Click (or <kbd>Space</kbd>)'} to start the pump.`,
        };
      return {
        title: 'Pull the shot',
        html: `${touch ? 'Tap' : 'Click'} again to stop between <b>25 and 31 s</b>.`,
      };
    case 'steam': {
      if (t.steam.done) return null;
      const move = touch ? 'Drag' : 'Move the mouse';
      return {
        title: 'Steam the milk',
        html: `${hold} to open the steam. ${move} <b>down</b> to bring the tip to the surface (<i>tss-tss</i> = air going in), <b>up</b> to sink it and spin. Let go at <b>55–65 °C</b>.`,
      };
    }
    case 'water':
      return {
        title: 'Hot water first',
        html: `${hold} to run hot water into the cup. Let go when it's in the green band (about two-thirds); the shot goes on top to keep the crema.`,
      };
    case 'demo':
      return {
        title: 'Watch Gaz',
        html: 'High to fill → drop <b>low</b> to bloom → lift, ease off and <b>pull through</b> away from you.',
      };
    case 'pour': {
      const p = t.pour;
      const height = touch
        ? 'the ▲▼ buttons'
        : '<kbd>1</kbd> high · <kbd>2</kbd> lift · <kbd>3</kbd> low (or scroll, <kbd>W</kbd>/<kbd>S</kbd>)';
      if (p.poured === 0)
        return {
          title: 'Pour the heart',
          html: `${touch ? 'Drag' : 'Mouse'} = jug position. ${hold} to tip and pour; the longer you hold, the more it flows. ${height} = height.`,
        };
      if (p.fill < 0.55)
        return {
          title: 'Fill',
          html: 'Pour from up high so the milk sinks under the crema and fills the cup.',
        };
      if (t.pitcher.height > SURF_LOW + 0.9 && !p.drawing)
        return {
          title: 'Drop in',
          html: `Now bring the jug right down to the surface (${height}).`,
        };
      if (p.fill < 0.97)
        return {
          title: 'Bloom, then pull through',
          html: `Let the white bloom… then lift a touch${touch ? '' : ' (<kbd>2</kbd>)'}, let go and push <b>forward</b> through it.`,
        };
      return { title: 'Stop!', html: 'Cup is full. Let go.' };
    }
    default:
      return null;
  }
}
