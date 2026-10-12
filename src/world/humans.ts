// Customer bodies. Each one is cheap on purpose (AGENTS.md §7): the static body is merged into a
// single vertex-coloured mesh, the two legs swing as separate meshes, and the face is one small
// canvas redrawn only when the mood or mouth changes. 4 draw calls per person, no shadows.
// The spawner must call dispose() (CLAUDE.md; fixes the prototype's removeHuman() leak).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CustomerLook } from '../data/customers';
import type { Mood } from '../sim/owner';

export interface HumanHandle {
  root: THREE.Group;
  /** Right hand, for holding a cup on the way out. */
  hand: THREE.Object3D;
  setMood(m: Mood): void;
  setTalking(on: boolean): void;
  update(dt: number, walking: boolean, now: number): void;
  dispose(): void;
}

// Shared by every customer; never disposed with one person.
let bodyMat: THREE.MeshStandardMaterial | null = null;
const material = (): THREE.MeshStandardMaterial =>
  (bodyMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

class Parts {
  list: THREE.BufferGeometry[] = [];
  add(
    geo: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    s: [number, number, number] = [1, 1, 1],
  ): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    tmpE.set(rx, ry, rz);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(s[0], s[1], s[2]));
    g.applyMatrix4(tmpM);
    g.deleteAttribute('uv');
    tmpC.set(color);
    const n = g.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = tmpC.r;
      c[i * 3 + 1] = tmpC.g;
      c[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.list.push(g);
  }
  mesh(): THREE.Mesh {
    const merged = mergeGeometries(this.list, false) as THREE.BufferGeometry;
    this.list.forEach((g) => g.dispose());
    this.list = [];
    return new THREE.Mesh(merged, material());
  }
}

const SHOE = '#1d1a18';

export function makeHuman(look: CustomerLook): HumanHandle {
  const root = new THREE.Group();
  const b = look.build;
  const top = look.top === 'hivis' ? '#f36f1c' : look.top;

  // ---- static body: torso, arms, head, hair, hat, accessories
  const p = new Parts();
  p.add(new THREE.CapsuleGeometry(0.135 * b, 0.44, 4, 12), top, 0, 1.2, 0, 0, 0, 0, [1.12, 1, 0.7]);
  if (look.top === 'hivis') {
    for (const y of [1.12, 1.3])
      p.add(
        new THREE.CylinderGeometry(0.168 * b, 0.168 * b, 0.035, 14, 1, true),
        '#d8dde0',
        0,
        y,
        0,
        0,
        0,
        0,
        [1.05, 1, 0.73],
      );
  }
  for (const s of [-1, 1]) {
    p.add(
      new THREE.CapsuleGeometry(0.048 * b, 0.42, 4, 8),
      top,
      s * 0.215 * b,
      1.13,
      0.02,
      0.12,
      0,
      s * 0.1,
    );
    p.add(new THREE.SphereGeometry(0.043, 8, 6), look.skin, s * 0.22 * b, 0.87, 0.06);
  }
  p.add(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), look.skin, 0, 1.53, 0);
  p.add(new THREE.SphereGeometry(0.118, 16, 12), look.skin, 0, 1.66, 0, 0, 0, 0, [0.95, 1.06, 1]);
  for (const s of [-1, 1])
    p.add(
      new THREE.SphereGeometry(0.026, 8, 6),
      look.skin,
      s * 0.112,
      1.65,
      -0.005,
      0,
      0,
      0,
      [0.5, 1, 0.8],
    );
  p.add(new THREE.SphereGeometry(0.02, 8, 6), look.skin, 0, 1.645, 0.115);
  const hairCap = (theta: number, tilt = -0.25): void =>
    p.add(
      new THREE.SphereGeometry(0.124, 16, 8, 0, Math.PI * 2, 0, theta),
      look.hairC,
      0,
      1.665,
      0,
      tilt,
      0,
      0,
      [0.98, 1.08, 1.03],
    );
  switch (look.hair) {
    case 'short':
      hairCap(1.15);
      break;
    case 'pony':
      hairCap(1.25);
      p.add(new THREE.SphereGeometry(0.045, 8, 6), look.hairC, 0, 1.69, -0.13);
      p.add(new THREE.CylinderGeometry(0.03, 0.015, 0.2, 8), look.hairC, 0, 1.58, -0.16, 0.3);
      break;
    case 'curly':
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const e = 0.25 + (i % 3) * 0.35;
        p.add(
          new THREE.SphereGeometry(0.045, 8, 6),
          look.hairC,
          Math.sin(e) * Math.cos(a) * 0.12,
          1.665 + Math.cos(e) * 0.12,
          Math.sin(e) * Math.sin(a) * 0.12 - 0.02,
        );
      }
      break;
    case 'long':
      hairCap(1.3, -0.2);
      p.add(new THREE.BoxGeometry(0.24, 0.34, 0.05), look.hairC, 0, 1.52, -0.1);
      break;
    case 'bob':
      hairCap(1.3, -0.2);
      p.add(
        new THREE.CylinderGeometry(0.135, 0.145, 0.16, 16, 1, true, Math.PI * 0.32, Math.PI * 1.36),
        look.hairC,
        0,
        1.6,
        0,
      );
      break;
    default:
      break;
  }
  if (look.hat === 'hardhat') {
    p.add(
      new THREE.SphereGeometry(0.142, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      '#f5d23a',
      0,
      1.69,
      0,
    );
    p.add(new THREE.CylinderGeometry(0.17, 0.17, 0.014, 16), '#f5d23a', 0, 1.69, 0.02);
  } else if (look.hat === 'cap') {
    p.add(
      new THREE.SphereGeometry(0.132, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      look.hatC ?? '#223',
      0,
      1.69,
      0,
    );
    p.add(new THREE.BoxGeometry(0.15, 0.012, 0.11), look.hatC ?? '#223', 0, 1.7, 0.15);
  }
  if (look.glasses) {
    for (const s of [-1, 1])
      p.add(new THREE.TorusGeometry(0.026, 0.004, 6, 14), '#1a1a1a', s * 0.043, 1.675, 0.118);
    p.add(new THREE.BoxGeometry(0.03, 0.005, 0.005), '#1a1a1a', 0, 1.678, 0.122);
  }
  if (look.sunnies)
    for (const s of [-1, 1])
      p.add(new THREE.BoxGeometry(0.06, 0.03, 0.02), '#111', s * 0.044, 1.775, 0.085, -0.6);
  if (look.bag)
    p.add(new THREE.BoxGeometry(0.06, 0.32, 0.26), look.bag, 0.2 * b, 1.0, -0.02, 0, 0, 0.08);
  const body = p.mesh();
  root.add(body);

  // ---- legs (swing while walking)
  const legs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const lp = new Parts();
    lp.add(new THREE.CapsuleGeometry(0.066 * b, 0.68, 4, 8), look.legs, 0, -0.41, 0);
    lp.add(new THREE.BoxGeometry(0.1, 0.07, 0.22), SHOE, 0, -0.81, 0.04);
    const leg = lp.mesh();
    leg.position.set(s * 0.09 * b, 0.86, 0);
    root.add(leg);
    legs.push(leg);
  }

  // ---- face
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const faceT = new THREE.CanvasTexture(canvas);
  faceT.colorSpace = THREE.SRGBColorSpace;
  const faceM = new THREE.MeshStandardMaterial({
    map: faceT,
    transparent: true,
    roughness: 0.6,
    depthWrite: false,
  });
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.1205, 18, 12, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.85, 1.7),
    faceM,
  );
  face.position.set(0, 1.66, 0);
  face.scale.set(0.95, 1.06, 1);
  root.add(face);

  let mood: Mood = 'neutral';
  let talking = false;
  let mouthOpen = false;
  let drawn = '';
  const draw = (): void => {
    const key = `${mood}|${mouthOpen}`;
    if (key === drawn) return;
    drawn = key;
    g.clearRect(0, 0, 128, 128);
    const ey = 58;
    const shock = mood === 'shocked';
    for (const x of [44, 84]) {
      g.fillStyle = '#1b120c';
      g.beginPath();
      g.ellipse(x, ey, 5.5, shock ? 8 : 6.5, 0, 0, 7);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x + 1.8, ey - 2.5, 1.7, 0, 7);
      g.fill();
    }
    g.strokeStyle = '#2a1a10';
    g.lineCap = 'round';
    g.lineWidth = 4;
    const brow = (x0: number, y0: number, x1: number, y1: number): void => {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };
    if (mood === 'furious') {
      brow(32, 40, 52, 48);
      brow(96, 40, 76, 48);
    } else if (mood === 'annoyed') {
      brow(33, 43, 52, 46);
      brow(95, 43, 76, 46);
    } else if (mood === 'pleased') {
      brow(33, 42, 52, 38);
      brow(95, 42, 76, 38);
    } else {
      brow(34, 44, 52, 42);
      brow(94, 44, 76, 42);
    }
    if (mood === 'pleased') {
      g.fillStyle = 'rgba(230,110,110,.3)';
      g.beginPath();
      g.ellipse(32, 76, 8, 5, 0, 0, 7);
      g.ellipse(96, 76, 8, 5, 0, 0, 7);
      g.fill();
    }
    g.strokeStyle = '#5a1e16';
    g.fillStyle = '#5a1e16';
    g.lineWidth = 3.5;
    g.beginPath();
    if (mouthOpen) {
      g.ellipse(64, 86, 8, 6, 0, 0, 7);
      g.fill();
    } else {
      if (mood === 'pleased') g.arc(64, 78, 12, 0.3, Math.PI - 0.3);
      else if (mood === 'annoyed' || mood === 'furious') g.arc(64, 98, 11, Math.PI + 0.45, -0.45);
      else {
        g.moveTo(56, 86);
        g.lineTo(72, 86);
      }
      g.stroke();
    }
    faceT.needsUpdate = true;
  };
  draw();

  const hand = new THREE.Object3D();
  hand.position.set(-0.24 * b, 0.88, 0.1);
  root.add(hand);

  root.scale.setScalar(look.height);
  let walkT = 0;
  let mouthT = 0;

  return {
    root,
    hand,
    setMood(m) {
      if (m === mood) return;
      mood = m;
      draw();
    },
    setTalking(on) {
      talking = on;
      if (!on && mouthOpen) {
        mouthOpen = false;
        draw();
      }
    },
    update(dt, walking, now) {
      if (walking) {
        walkT += dt * 7.5;
        const s = Math.sin(walkT) * 0.5;
        (legs[0] as THREE.Mesh).rotation.x = s;
        (legs[1] as THREE.Mesh).rotation.x = -s;
        body.position.y = Math.abs(Math.cos(walkT)) * 0.025;
      } else {
        for (const l of legs) l.rotation.x *= 0.8;
        body.position.y = Math.sin(now * 1.7 + look.height * 10) * 0.004;
      }
      if (talking) {
        mouthT += dt;
        if (mouthT > 0.11) {
          mouthT = 0;
          mouthOpen = !mouthOpen;
          draw();
        }
      }
      face.position.y = 1.66 + body.position.y;
    },
    dispose() {
      body.geometry.dispose();
      for (const l of legs) l.geometry.dispose();
      face.geometry.dispose();
      faceM.dispose();
      faceT.dispose();
      root.removeFromParent();
    },
  };
}
