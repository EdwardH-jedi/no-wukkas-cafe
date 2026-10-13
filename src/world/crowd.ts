// Moves the Day 2 customers around the café from their rush state. Scripted waypoints only (no
// navigation): door → queue slot → register → waiting spot → (pick up) → door. Spawns a body when
// someone walks in and disposes it when they've gone. Also decides where each one looks (you at
// the register or when they speak, the pass while they wait) and plays their reactions.

import * as THREE from 'three';
import type { Rush, RushCustomer } from '../core/rush';
import type { Mood } from '../sim/owner';
import { makeHuman, type HumanHandle, type Reaction } from './humans';
import { CT } from './layout';

const DOOR = new THREE.Vector3(2.1, 0, -6.6);
const ENTRY = new THREE.Vector3(2.45, 0, -4.9);
const REGISTER = new THREE.Vector3(-0.15, 0, -1.68);
const PICKUP = new THREE.Vector3(0.55, 0, -1.62);
const QUEUE = [
  new THREE.Vector3(0.38, 0, -2.45),
  new THREE.Vector3(0.78, 0, -3.12),
  new THREE.Vector3(1.18, 0, -3.8),
  new THREE.Vector3(1.55, 0, -4.45),
];
const WAITING = [
  new THREE.Vector3(1.3, 0, -1.78),
  new THREE.Vector3(1.9, 0, -1.92),
  new THREE.Vector3(2.4, 0, -2.25),
  new THREE.Vector3(1.6, 0, -2.5),
];
const SPEED = 1.25;
/** Where waiting customers watch for their drink: the pass beside the machine. */
const PASS_LOOK = new THREE.Vector3(0.1, CT + 0.15, -0.75);

interface Walker {
  c: RushCustomer;
  h: HumanHandle;
  path: THREE.Vector3[];
  planned: string;
  heading: number;
  cup: THREE.Mesh | null;
}

export interface Crowd {
  /** `player`: the camera (where "you" are); `voice`: loudness of the line being spoken (0..1),
   *  or -1 when there's no recording playing. */
  update(r: Rush, dt: number, now: number, player?: THREE.Vector3, voice?: number): void;
  react(id: string, kind: Reaction): void;
  /** Where the customer at the register is (for Gaz's eyes); false if nobody. */
  registerPos(out: THREE.Vector3): boolean;
  readonly count: number;
  /** Remove everyone (mode change / restart). */
  clear(): void;
  dispose(): void;
}

export function createCrowd(scene: THREE.Scene): Crowd {
  const walkers = new Map<string, Walker>();
  const cupGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.085, 12);
  const cupMat = new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.3 });
  const tmp = new THREE.Vector3();
  const regPos = new THREE.Vector3();
  let regHas = false;

  const slotIndex = (r: Rush, c: RushCustomer, states: readonly string[]): number => {
    let i = 0;
    for (const o of r.customers) {
      if (o === c) return i;
      if (states.includes(o.state)) i++;
    }
    return i;
  };

  const plan = (r: Rush, w: Walker): void => {
    const c = w.c;
    const pos = w.h.root.position;
    let key: string;
    let goal: THREE.Vector3;
    let via: THREE.Vector3[] = [];
    switch (c.state) {
      case 'entering':
      case 'queue': {
        const k = Math.min(QUEUE.length - 1, slotIndex(r, c, ['entering', 'queue']));
        goal = QUEUE[k] as THREE.Vector3;
        key = `queue${k}`;
        if (pos.z < -4.6) via = [ENTRY];
        break;
      }
      case 'register':
      case 'ordering':
      case 'deciding':
        goal = REGISTER;
        key = 'register';
        break;
      case 'waiting': {
        const k = Math.min(WAITING.length - 1, slotIndex(r, c, ['waiting']));
        goal = WAITING[k] as THREE.Vector3;
        key = `waiting${k}`;
        break;
      }
      default:
        goal = DOOR;
        key = 'leaving';
        via = c.outcome === 'served' ? [PICKUP, ENTRY] : [ENTRY];
        break;
    }
    if (key === w.planned) return;
    w.planned = key;
    w.path = [...via, goal];
  };

  const moodFor = (c: RushCustomer): Mood => {
    if (c.reaction) return c.reaction;
    if (
      c.state !== 'waiting' &&
      c.state !== 'register' &&
      c.state !== 'deciding' &&
      c.state !== 'queue'
    )
      return 'neutral';
    const f = c.patience / c.def.patience;
    return f > 0.5 ? 'neutral' : f > 0.22 ? 'annoyed' : 'furious';
  };

  return {
    get count() {
      return walkers.size;
    },
    react(id, kind) {
      walkers.get(id)?.h.react(kind);
    },
    update(r, dt, now, player, voice = -1) {
      regHas = false;
      for (const c of r.customers) {
        let w = walkers.get(c.def.id);
        if (!w && c.state !== 'outside' && c.state !== 'gone') {
          const h = makeHuman(c.def.look);
          h.root.position.copy(DOOR);
          scene.add(h.root);
          w = { c, h, path: [], planned: '', heading: Math.PI, cup: null };
          walkers.set(c.def.id, w);
        }
        if (!w) continue;
        if (c.state === 'gone') {
          w.cup?.removeFromParent();
          w.h.dispose();
          walkers.delete(c.def.id);
          continue;
        }
        w.c = c;
        plan(r, w);
        // Served: they leave holding the drink.
        if (c.outcome === 'served' && !w.cup) {
          w.cup = new THREE.Mesh(cupGeo, cupMat);
          w.h.hand.add(w.cup);
        }
        const pos = w.h.root.position;
        let walking = false;
        const next = w.path[0];
        if (next) {
          tmp.subVectors(next, pos);
          tmp.y = 0;
          const d = tmp.length();
          if (d < 0.04) w.path.shift();
          else {
            const step = Math.min(d, SPEED * dt);
            pos.addScaledVector(tmp, step / d);
            walking = true;
            const want = Math.atan2(tmp.x, tmp.z);
            const diff = Math.atan2(Math.sin(want - w.heading), Math.cos(want - w.heading));
            w.heading += diff * Math.min(1, dt * 10);
          }
        }
        if (!walking) {
          // Stand facing the counter (and the barista).
          const diff = Math.atan2(Math.sin(-w.heading), Math.cos(-w.heading));
          w.heading += diff * Math.min(1, dt * 6);
        }
        w.h.root.rotation.y = w.heading;
        w.h.setMood(moodFor(c));
        const talking = r.speech.current?.speaker === c.def.id;
        w.h.setTalking(talking);
        w.h.setTalkLevel(talking ? voice : -1);
        // Eye contact: you, when ordering or talking; otherwise the pass, waiting for the drink.
        const atCounter =
          c.state === 'register' || c.state === 'ordering' || c.state === 'deciding';
        if (walking || c.state === 'leaving' || !player) w.h.lookAt(null);
        else if (atCounter || talking) w.h.lookAt(player);
        else if (c.state === 'waiting') w.h.lookAt(PASS_LOOK);
        else w.h.lookAt(null);
        w.h.update(dt, walking, now);
        if (c.state === 'register' || c.state === 'ordering' || c.state === 'deciding') {
          regPos.set(pos.x, CT + 0.55, pos.z);
          regHas = true;
        }
      }
    },
    registerPos(out) {
      if (!regHas) return false;
      out.copy(regPos);
      return true;
    },
    clear() {
      for (const w of walkers.values()) {
        w.cup?.removeFromParent();
        w.h.dispose();
      }
      walkers.clear();
      regHas = false;
    },
    dispose() {
      for (const w of walkers.values()) {
        w.cup?.removeFromParent();
        w.h.dispose();
      }
      walkers.clear();
      cupGeo.dispose();
      cupMat.dispose();
    },
  };
}
