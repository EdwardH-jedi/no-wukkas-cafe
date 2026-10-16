// Space and a focused control (TODO 1.5.7): the game's window handler used to take every Space as
// "hold to pour" and cancel the focused button's press. A visible control outside the play HUD
// now keeps its Space; controls in the play HUD (clicked mid-pour) never take it from the game.

import { describe, expect, it } from 'vitest';
import { controlOwnsSpace, PLAY_AREA } from '../../src/ui/screens/keys';

/** Just enough of an Element: which selectors `closest` matches, and whether it's laid out. */
function el(matches: string[], visible = true) {
  return {
    closest: (sel: string) => (matches.includes(sel) ? {} : null),
    getClientRects: () => ({ length: visible ? 1 : 0 }),
  };
}
const CONTROL = 'button, input, select, textarea, a[href]';

describe('controlOwnsSpace', () => {
  it('a visible button on a card or menu presses with Space', () => {
    expect(controlOwnsSpace(el([CONTROL]) as unknown as EventTarget)).toBe(true);
  });

  it('a button in the play HUD leaves Space to the game (a click leaves it focused)', () => {
    expect(controlOwnsSpace(el([CONTROL, PLAY_AREA]) as unknown as EventTarget)).toBe(false);
  });

  it('a hidden control that kept focus (the title after Start) leaves Space to the game', () => {
    expect(controlOwnsSpace(el([CONTROL], false) as unknown as EventTarget)).toBe(false);
  });

  it('the page itself, the canvas and non-elements leave Space to the game', () => {
    expect(controlOwnsSpace(el([]) as unknown as EventTarget)).toBe(false);
    expect(controlOwnsSpace(null)).toBe(false);
    expect(controlOwnsSpace({} as EventTarget)).toBe(false);
  });
});
