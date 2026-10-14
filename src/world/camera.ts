// First-person camera: a framed "shot" per phase, smooth eased transitions between them, and a
// subtle head-look that follows the pointer with dead zones when the pointer isn't a control.

import * as THREE from 'three';
import { clamp } from '../sim/math';
import { CT, LAYOUT } from './layout';
import { INSPECT_CUP } from './station';

/** Head-look tuning (CLAUDE.md: keep it configurable). */
export const LOOK = { deadZone: 0.28, maxYaw: 0.12, maxPitch: 0.07, follow: 4 };

export interface CameraFocus {
  cupRim: THREE.Vector3;
  ownerHead: THREE.Vector3;
}

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  /** Pointer in -1..1 (x right, y down); `look` false while the pointer drives a control. */
  update(
    phase: string,
    phaseTime: number,
    dt: number,
    now: number,
    focus: CameraFocus,
    px: number,
    py: number,
    look: boolean,
  ): void;
  resize(w: number, h: number): void;
}

type Shot =
  | 'service'
  | 'title'
  | 'intro'
  | 'grind'
  | 'lock'
  | 'shot'
  | 'shotSteam'
  | 'steam'
  | 'pour'
  | 'review'
  | 'closeUp'
  | 'inspect'
  | 'feedback'
  | 'verdict';

const SHOTS = new Set<string>([
  'title',
  'intro',
  'grind',
  'lock',
  'shot',
  'shotSteam',
  'steam',
  'pour',
  'review',
  'inspect',
  'feedback',
  'verdict',
]);

const shotFor = (p: string, phaseTime: number): Shot => {
  if (p === 'demo') return 'pour';
  // Inspection: a close look at the cup in Gaz's hands, then pull back for his reaction.
  if (p === 'inspect') return phaseTime < 2.3 ? 'closeUp' : 'inspect';
  // Day 2: the hot water is poured at the machine; the shift summary faces Gaz.
  if (p === 'water') return 'shot';
  if (p === 'summary' || p === 'wrapup') return 'verdict';
  return SHOTS.has(p) ? (p as Shot) : 'service';
};

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.02, 80);
  camera.position.set(0.2, 1.7, 0.9);
  const pos = new THREE.Vector3().copy(camera.position);
  const target = new THREE.Vector3(-0.5, 1.4, -4);
  const fromPos = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantTarget = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let fov = 55;
  let fromFov = 55;
  let wantFov = 55;
  let shot: Shot = 'title';
  let progress = 1;
  let duration = 1;
  let yaw = 0;
  let pitch = 0;
  let aspect = 1;

  const frame = (s: Shot, f: CameraFocus, now: number): void => {
    switch (s) {
      case 'service':
        // Behind the counter, looking out at the register, the queue and the door.
        wantPos.set(-0.62, 1.62, 0.5);
        wantTarget.set(0.3, 1.18, -2.6);
        wantFov = 56;
        break;
      case 'title':
        wantPos.set(-0.9 + Math.sin(now * 0.1) * 0.25, 1.66, 0.95);
        wantTarget.set(-0.9 + Math.sin(now * 0.13) * 1.2, 1.3, -4.5);
        wantFov = 55;
        break;
      case 'intro':
        wantPos.set(-0.95, 1.62, 0.95);
        wantTarget.copy(f.ownerHead).lerp(tmp.set(-0.6, CT + 0.2, -0.8), 0.38);
        wantFov = 50;
        break;
      case 'grind':
        wantPos.set(-1.6, 1.56, 0.22);
        wantTarget.set(LAYOUT.grinder.x + 0.05, CT + 0.2, LAYOUT.grinder.z + 0.05);
        wantFov = 48;
        break;
      case 'lock':
        wantPos.set(-1.4, 1.48, 0.06);
        wantTarget.set(-1.42, CT + 0.12, -0.74);
        wantFov = 48;
        break;
      case 'shot':
        wantPos.set(-1.13, 1.36, -0.1);
        wantTarget.set(LAYOUT.group.x, CT + 0.1, LAYOUT.group.z);
        wantFov = 44;
        break;
      case 'shotSteam':
        // Two hands: the shot running in the group head and the jug on the wand, side by side.
        wantPos.set(-0.9, 1.43, -0.02);
        wantTarget.set((LAYOUT.group.x + LAYOUT.wand.x) / 2, CT + 0.13, LAYOUT.group.z);
        wantFov = 50;
        break;
      case 'steam':
        wantPos.set(-0.45, 1.42, -0.12);
        wantTarget.set(LAYOUT.wand.x + 0.02, CT + 0.14, LAYOUT.wand.z);
        wantFov = 44;
        break;
      case 'pour':
        // Close in, straight from the barista's side and looking down at the coffee: the cup
        // fills about half the screen, the far side of the cup is up, so pushing the mouse up
        // pulls the jug forward (the pull-through) and the heart's point grows up the screen.
        // The jug hangs off to the right. It never moves while you pour (steering maps the
        // pointer through this camera).
        wantPos.copy(f.cupRim).add(tmp.set(-0.012, 0.19, 0.1));
        wantTarget.copy(f.cupRim).add(tmp.set(0, -0.018, -0.004));
        wantFov = 40;
        break;
      case 'review':
        // Practice: straight down on the cup so the heart reads undistorted, the cup shifted
        // clear of the review card (right on wide screens, below on narrow ones).
        wantPos.copy(f.cupRim).add(tmp.set(0, 0.24, 0.045));
        wantTarget.copy(f.cupRim).add(tmp.set(0, -0.03, 0));
        if (aspect > 1.1) {
          wantPos.x += 0.05;
          wantTarget.x += 0.05;
        } else {
          wantPos.z += 0.055;
          wantTarget.z += 0.055;
        }
        wantFov = 40;
        break;
      case 'closeUp':
        wantPos.copy(INSPECT_CUP).add(tmp.set(-0.16, 0.13, 0.16));
        wantTarget.copy(INSPECT_CUP).add(tmp.set(0.004, 0.012, 0));
        wantFov = 40;
        break;
      case 'inspect':
      case 'feedback': {
        const side = s === 'feedback' && aspect > 1 ? 0.16 : 0;
        wantPos.set(-0.32 + side * 0.4, 1.5, 0.62);
        wantTarget.copy(INSPECT_CUP).lerp(f.ownerHead, 0.55);
        wantTarget.x += side;
        wantFov = 44;
        break;
      }
      case 'verdict':
        wantPos.set(-0.36, 1.62, 0.66);
        wantTarget.copy(f.ownerHead);
        wantTarget.y -= 0.12;
        if (aspect > 1.1) wantTarget.x += 0.3; // the verdict card sits on the right
        wantFov = 48;
        break;
    }
    if (aspect < 1) wantFov = Math.min(80, wantFov * (1 + (1 - aspect) * 0.9));
  };

  return {
    camera,
    update(phase, phaseTime, dt, now, focus, px, py, look) {
      const s = shotFor(phase, phaseTime);
      if (s !== shot) {
        fromPos.copy(pos);
        fromTarget.copy(target);
        fromFov = fov;
        duration = s === 'pour' || shot === 'pour' || s === 'closeUp' || s === 'review' ? 0.9 : 1.1;
        if (shot === 'title') duration = 1.8;
        shot = s;
        progress = 0;
      }
      frame(shot, focus, now);
      progress = Math.min(1, progress + dt / duration);
      const k = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      pos.lerpVectors(fromPos, wantPos, k);
      target.lerpVectors(fromTarget, wantTarget, k);
      fov = fromFov + (wantFov - fromFov) * k;

      // Head look with dead zones.
      const ez = (v: number): number =>
        Math.sign(v) *
        Math.pow(Math.max(0, Math.abs(v) - LOOK.deadZone) / (1 - LOOK.deadZone), 1.5);
      const wantYaw = look ? -ez(clamp(px, -1, 1)) * LOOK.maxYaw : 0;
      const wantPitch = look ? -ez(clamp(py, -1, 1)) * LOOK.maxPitch : 0;
      const f = 1 - Math.exp(-dt * LOOK.follow);
      yaw += (wantYaw - yaw) * f;
      pitch += (wantPitch - pitch) * f;

      camera.position.copy(pos);
      // A breath of idle sway, except over the cup: there the pointer maps through this camera,
      // so it holds perfectly still.
      if (shot !== 'pour' && shot !== 'review') camera.position.y += Math.sin(now * 1.1) * 0.003;
      camera.lookAt(target);
      camera.rotateY(yaw);
      camera.rotateX(pitch);
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
    resize(w, h) {
      aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
  };
}
