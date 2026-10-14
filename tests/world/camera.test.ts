import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { AIM_LIMIT } from '../../src/sim/latte/pitcher';
import { createCameraRig, type CameraFocus } from '../../src/world/camera';
import { CUP, LAYOUT } from '../../src/world/layout';
import { GROUP_SPOUT, RIM, WAND_TIP } from '../../src/world/station';

// The cup on the pour mat, as the station places it (rim = base + saucer + cup height).
const cupRim = new THREE.Vector3(LAYOUT.cup.x, LAYOUT.cup.y + 0.006 + CUP.height, LAYOUT.cup.z);
const focus: CameraFocus = { cupRim, ownerHead: new THREE.Vector3(0.62, 1.62, -0.12) };

function rigAt(w = 1280, h = 800) {
  const rig = createCameraRig();
  rig.resize(w, h);
  let now = 0;
  const run = (phase: string, seconds: number, onFrame?: (p: THREE.Vector3) => void): void => {
    for (let t = 0; t < seconds; t += STEP) {
      now += STEP;
      rig.update(phase, t, STEP, now, focus, 0.3, -0.2, false);
      onFrame?.(rig.camera.position.clone());
    }
  };
  return { rig, run, camera: rig.camera };
}

/** Screen position (NDC) of a point on the pour plane at cup-rim coordinates (x, y). */
function ndc(camera: THREE.PerspectiveCamera, x: number, y: number): THREE.Vector3 {
  camera.updateMatrixWorld();
  return new THREE.Vector3(cupRim.x + x * RIM, cupRim.y, cupRim.z - y * RIM).project(camera);
}

describe('camera: transitions into and out of the pour', () => {
  it('eases from the steam wand to the pour close-up smoothly, within a second', () => {
    const { run, camera } = rigAt();
    run('steam', 3);
    const from = camera.position.clone();
    const path: THREE.Vector3[] = [];
    run('pour', 1.5, (p) => path.push(p));
    const to = path[path.length - 1] as THREE.Vector3;
    const total = from.distanceTo(to);
    expect(total).toBeGreaterThan(0.2);
    // Settled by 1.0 s (the e2e driver aims the jug once the shot has settled).
    expect((path[Math.round(1.0 / STEP)] as THREE.Vector3).distanceTo(to)).toBeLessThan(1e-6);
    // Smooth: always closing in, never jumping more than a small slice of the way in one frame.
    // (The steam shot's 3 mm idle sway stops when the pour shot starts.)
    let prev = from;
    let prevLeft = total + 0.003;
    for (const p of path) {
      expect(p.distanceTo(prev)).toBeLessThan(total * 0.06);
      const left = p.distanceTo(to);
      expect(left).toBeLessThanOrEqual(prevLeft + 1e-9);
      prev = p;
      prevLeft = left;
    }
  });

  it('holds perfectly still while pouring (the pointer maps through it), whatever the time', () => {
    const { run, camera } = rigAt();
    run('pour', 2);
    const settled = camera.position.clone();
    const q = camera.quaternion.clone();
    run('pour', 5);
    expect(camera.position.distanceTo(settled)).toBe(0);
    expect(camera.quaternion.angleTo(q)).toBe(0);
  });

  it("Gaz's demo uses the same framing, so nothing moves when the player takes over", () => {
    const { run, camera } = rigAt();
    run('demo', 2);
    const demo = camera.position.clone();
    const path: THREE.Vector3[] = [];
    run('pour', 1, (p) => path.push(p));
    for (const p of path) expect(p.distanceTo(demo)).toBeLessThan(1e-9);
  });

  it('eases back out to Gaz for the inspection, and between practice review and the pour', () => {
    for (const [a, b] of [
      ['pour', 'inspect'],
      ['review', 'pour'],
      ['pour', 'review'],
    ] as const) {
      const { run, camera } = rigAt();
      run(a, 3);
      const from = camera.position.clone();
      const path: THREE.Vector3[] = [];
      run(b, 2, (p) => path.push(p));
      const to = path[path.length - 1] as THREE.Vector3;
      const total = from.distanceTo(to);
      expect(total, `${a}→${b}`).toBeGreaterThan(0.02);
      let prev = from;
      for (const p of path) {
        expect(p.distanceTo(prev), `${a}→${b}`).toBeLessThan(total * 0.06);
        prev = p;
      }
    }
  });
});

describe('camera: pour framing', () => {
  it('pushing the mouse up the screen moves the jug forward (the pull-through goes up)', () => {
    const { run, camera } = rigAt();
    run('pour', 2);
    const near = ndc(camera, 0, -1);
    const far = ndc(camera, 0, 1);
    expect(far.y).toBeGreaterThan(near.y + 0.3);
    // Straight on: forward is (nearly) straight up, not off on a diagonal (it was 41° before).
    const angle = Math.atan2(far.x - near.x, far.y - near.y);
    expect(Math.abs(angle)).toBeLessThan((10 * Math.PI) / 180);
  });

  it('is a close-up: the cup fills a good part of the screen', () => {
    const { run, camera } = rigAt();
    run('pour', 2);
    const left = ndc(camera, -1, 0);
    const right = ndc(camera, 1, 0);
    // The inner rim spans about a third of the screen width at 16:10 (15% before the close-up).
    expect((right.x - left.x) / 2).toBeGreaterThan(0.3);
  });

  // Landscape: everywhere the jug can aim. Portrait phones: the touch point is always on screen
  // anyway, so what matters is the rim plus the spill zone around it.
  for (const [w, h, name, reach] of [
    [1280, 800, 'MacBook 16:10', AIM_LIMIT],
    [1024, 640, 'e2e viewport', AIM_LIMIT],
    [1024, 768, '4:3', AIM_LIMIT],
    [390, 844, 'iPhone portrait', 1.3],
  ] as const) {
    it(`keeps the cup and its surroundings on screen (${name})`, () => {
      const { run, camera } = rigAt(w, h);
      run('pour', 2);
      for (let a = 0; a < 32; a++) {
        const t = (a / 32) * Math.PI * 2;
        const p = ndc(camera, Math.cos(t) * reach, Math.sin(t) * reach);
        expect(Math.abs(p.x), `${name} x at ${a}`).toBeLessThan(1);
        expect(Math.abs(p.y), `${name} y at ${a}`).toBeLessThan(1);
      }
    });
  }

  it('two hands (shot + steam): the group head and the jug at the wand are both in frame', () => {
    const { run, camera } = rigAt(1280, 800);
    run('shotSteam', 3);
    camera.updateMatrixWorld();
    const jugRim = WAND_TIP.clone().add(new THREE.Vector3(0.012, 0.065, 0.01));
    const cupUnderGroup = new THREE.Vector3(
      LAYOUT.group.x,
      LAYOUT.group.y + CUP.height,
      LAYOUT.group.z,
    );
    for (const [name, p] of [
      ['portafilter spout', GROUP_SPOUT],
      ['cup under the group', cupUnderGroup],
      ['jug rim at the wand', jugRim],
      ['wand tip', WAND_TIP],
    ] as const) {
      const s = p.clone().project(camera);
      expect(Math.abs(s.x), `${name} x`).toBeLessThan(0.85);
      expect(Math.abs(s.y), `${name} y`).toBeLessThan(0.85);
      expect(s.z, `${name} in front`).toBeLessThan(1);
    }
  });

  it('practice review looks straight down, with the cup clear of the card', () => {
    const { run, camera } = rigAt();
    run('review', 2);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    expect(dir.y).toBeLessThan(-0.95); // nearly straight down
    expect(ndc(camera, 0, 0).x).toBeLessThan(-0.15); // left of centre: the card sits on the right
    expect(ndc(camera, 0, 1).y).toBeGreaterThan(ndc(camera, 0, -1).y); // far side up, as poured
  });
});
