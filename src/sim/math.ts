export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, v: number): number => {
  const t = clamp((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** 1 inside [lo, hi], falling linearly to 0 at [lo - fallLo, hi + fallHi]. */
export const band = (
  v: number,
  lo: number,
  hi: number,
  fallLo: number,
  fallHi = fallLo,
): number => {
  if (v < lo) return clamp(1 - (lo - v) / fallLo);
  if (v > hi) return clamp(1 - (v - hi) / fallHi);
  return 1;
};
