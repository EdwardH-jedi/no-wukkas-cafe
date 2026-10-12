// Where things sit, in metres (three.js units). The player stands behind the counter facing -z.
import * as THREE from 'three';

/** Counter-top height (AGENTS.md §5). */
export const CT = 1.04;

export const LAYOUT = {
  grinder: new THREE.Vector3(-1.86, CT, -0.93),
  machine: new THREE.Vector3(-1.05, CT, -0.98),
  /** Cup spot under the left group head. */
  group: new THREE.Vector3(-1.25, CT + 0.035, -0.7),
  /** Jug spot under the steam wand (base of the jug at rest). */
  wand: new THREE.Vector3(-0.6, CT, -0.68),
  /** Pour mat: where the flat white gets its art. */
  cup: new THREE.Vector3(-0.16, CT + 0.008, -0.66),
  /** Gaz stands here, on the staff side, to the player's right. */
  owner: new THREE.Vector3(0.62, 0, -0.12),
};

/** Flat-white cup, metres. The pour sim's unit disc maps onto the inner rim. */
export const CUP = {
  rimR: 0.046,
  baseR: 0.03,
  height: 0.062,
  wall: 0.0045,
};
/** Visual depth of the liquid at fill 0 → 1, measured down from the rim. */
export function liquidDrop(fill: number): number {
  return (1 - fill) * (CUP.height - 0.012) + 0.004;
}
