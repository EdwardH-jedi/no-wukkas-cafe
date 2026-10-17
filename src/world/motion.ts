// The player's "reduce motion" setting (the OS one, `prefers-reduced-motion`), read live so turning
// it on or off applies at once. The café keeps what carries information (the bird walks in, steam
// shows the wand is open) and drops the rest: bobbing, pecking, flapping, drifting puffs.

const query =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

/** True when the player has asked for less motion. */
export const reducedMotion = (): boolean => query?.matches === true;
