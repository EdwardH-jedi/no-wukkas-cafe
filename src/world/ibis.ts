// The bin chicken in 3D: a low-poly Australian white ibis (white body, bare black head and neck,
// long down-curved bill, black plumes), the café's rubbish bin, and the mess if it raids the bin.
// All geometry is built here from primitives: no external models or textures.
// Reads sim/ibis.ts state; never changes it. ~8 draw calls when visible, nothing when not.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Ibis } from '../sim/ibis';

export interface IbisView {
  update(b: Ibis, dt: number, now: number): void;
  /** Is the pointer ray on the bird? (for shooing and noticing) */
  hit(ray: THREE.Raycaster): boolean;
  /** Bird position (for Gaz's eyes). */
  readonly position: THREE.Vector3;
  dispose(): void;
}

const WHITE = '#f1efe8';
const BLACK = '#18140f';
const LEG = '#4a3d3a';

/** Door → bin, down the right-hand side, clear of the queue and the tables, in view from the
 *  counter. */
const PATH = new THREE.CatmullRomCurve3([
  new THREE.Vector3(2.05, 0, -6.75),
  new THREE.Vector3(2.6, 0, -5.6),
  new THREE.Vector3(3.0, 0, -4.6),
  new THREE.Vector3(3.05, 0, -3.85),
]);
const BIN = new THREE.Vector3(3.3, 0, -4.3);
/** A touch larger than life so it reads from behind the counter. */
const BIRD_SCALE = 1.25;

function painted(geo: THREE.BufferGeometry, color: string, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.applyMatrix4(m);
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const at = (
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  s: [number, number, number] = [1, 1, 1],
) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(...s),
  );

export function createIbisView(scene: THREE.Scene): IbisView {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const geos: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };

  // ---------------------------------------------------------------- the bin (and its mess)
  const binGeo = track(
    mergeGeometries([
      painted(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 18), '#2f5d46', at(BIN.x, 0.31, BIN.z)),
      painted(
        new THREE.TorusGeometry(0.2, 0.015, 6, 18),
        '#24493a',
        at(BIN.x, 0.62, BIN.z, Math.PI / 2),
      ),
    ]) as THREE.BufferGeometry,
  );
  const bin = new THREE.Mesh(binGeo, mat);
  scene.add(bin);
  const lid = new THREE.Mesh(
    track(painted(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 18), '#20402f', at(0, 0, 0))),
    mat,
  );
  lid.position.set(BIN.x, 0.64, BIN.z);
  scene.add(lid);
  const messParts: THREE.BufferGeometry[] = [];
  const bits: Array<[number, number, string]> = [
    [-0.35, 0.15, '#e9e2d0'],
    [-0.2, 0.32, '#c9a46c'],
    [-0.45, -0.1, '#f2f2f2'],
    [-0.1, 0.45, '#8c6a4b'],
    [-0.3, 0.5, '#e9e2d0'],
  ];
  for (const [i, [dx, dz, c]] of bits.entries())
    messParts.push(
      painted(
        new THREE.DodecahedronGeometry(0.035 + (i % 2) * 0.015),
        c,
        at(BIN.x + dx, 0.03, BIN.z + dz, i, i * 2, 0),
      ),
    );
  const mess = new THREE.Mesh(track(mergeGeometries(messParts) as THREE.BufferGeometry), mat);
  mess.visible = false;
  scene.add(mess);

  // ---------------------------------------------------------------- the bird
  const root = new THREE.Group();
  root.visible = false;
  root.scale.setScalar(BIRD_SCALE);
  scene.add(root);
  const body = new THREE.Mesh(
    track(
      mergeGeometries([
        painted(
          new THREE.SphereGeometry(1, 14, 10),
          WHITE,
          at(0, 0.36, 0, -0.15, 0, 0, [0.11, 0.1, 0.19]),
        ),
        // Black plumes over the tail.
        painted(
          new THREE.ConeGeometry(0.06, 0.18, 8),
          BLACK,
          at(0, 0.36, -0.2, -Math.PI / 2 - 0.3),
        ),
      ]) as THREE.BufferGeometry,
    ),
    mat,
  );
  root.add(body);
  const legs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(
      track(
        mergeGeometries([
          painted(new THREE.CylinderGeometry(0.008, 0.007, 0.28, 6), LEG, at(0, -0.14, 0)),
          painted(new THREE.BoxGeometry(0.05, 0.01, 0.07), LEG, at(0, -0.28, 0.02)),
        ]) as THREE.BufferGeometry,
      ),
      mat,
    );
    leg.position.set(s * 0.04, 0.29, 0);
    root.add(leg);
    legs.push(leg);
  }
  // Neck, head and bill pivot at the front of the body so it can peck and look up.
  const neck = new THREE.Group();
  neck.position.set(0, 0.42, 0.13);
  root.add(neck);
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.09, 0.03),
    new THREE.Vector3(0, 0.16, 0.08),
  ]);
  const billCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.16, 0.1),
    new THREE.Vector3(0, 0.13, 0.18),
    new THREE.Vector3(0, 0.07, 0.25),
  ]);
  const head = new THREE.Mesh(
    track(
      mergeGeometries([
        painted(new THREE.TubeGeometry(neckCurve, 8, 0.022, 6), BLACK, at(0, 0, 0)),
        painted(new THREE.SphereGeometry(0.034, 10, 8), BLACK, at(0, 0.165, 0.085)),
        painted(new THREE.TubeGeometry(billCurve, 10, 0.007, 5), BLACK, at(0, 0, 0)),
      ]) as THREE.BufferGeometry,
    ),
    mat,
  );
  neck.add(head);
  const wings: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(
      track(
        mergeGeometries([
          painted(new THREE.BoxGeometry(0.012, 0.08, 0.24), WHITE, at(0, 0, -0.02)),
          painted(new THREE.BoxGeometry(0.013, 0.05, 0.06), BLACK, at(0, -0.01, -0.15)),
        ]) as THREE.BufferGeometry,
      ),
      mat,
    );
    w.position.set(s * 0.105, 0.39, 0);
    root.add(w);
    wings.push(w);
  }

  const position = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let lastPos = 0;
  let heading = 0;
  let walkT = 0;
  let flapUntil = 0;
  let lidTilt = 0;
  let wasPresent = false;
  const hitTargets: THREE.Object3D[] = [body, head, ...wings];

  return {
    position,
    update(b, dt, now) {
      const present = b.state !== 'absent' && b.state !== 'gone';
      root.visible = present;
      mess.visible = b.binRaided;
      // The lid gets nudged while it rummages.
      const rummaging = b.state === 'foraging';
      lidTilt += ((rummaging ? 0.35 + Math.sin(now * 5) * 0.1 : 0) - lidTilt) * Math.min(1, dt * 6);
      lid.rotation.set(0, 0, lidTilt);
      lid.position.set(BIN.x - lidTilt * 0.15, 0.64 + lidTilt * 0.08, BIN.z);
      if (!present) {
        wasPresent = false;
        return;
      }
      if (!wasPresent) {
        lastPos = b.pos;
        wasPresent = true;
      }
      PATH.getPointAt(Math.min(1, Math.max(0, b.pos)), position);
      root.position.copy(position);
      const moving = Math.abs(b.pos - lastPos) > 1e-5;
      // Face the way it's walking; at the bin, face the bin.
      let want = heading;
      if (moving) {
        PATH.getTangentAt(Math.min(1, Math.max(0, b.pos)), tangent);
        if (b.pos < lastPos) tangent.negate();
        want = Math.atan2(tangent.x, tangent.z);
      } else if (b.state === 'foraging') want = Math.atan2(BIN.x - position.x, BIN.z - position.z);
      heading +=
        Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * Math.min(1, dt * 8);
      root.rotation.y = heading;
      lastPos = b.pos;

      // Legs and head bob while walking; peck while foraging; look up and flap when bothered.
      if (moving) {
        walkT += dt * (b.state === 'entering' ? 9 : 13);
        legs[0]!.rotation.x = Math.sin(walkT) * 0.45;
        legs[1]!.rotation.x = -Math.sin(walkT) * 0.45;
        body.position.y = Math.abs(Math.sin(walkT)) * 0.012;
        neck.rotation.x = 0.15 + Math.sin(walkT * 2) * 0.12;
      } else {
        for (const l of legs) l.rotation.x *= 0.8;
        body.position.y = 0;
        neck.rotation.x = rummaging ? 1.05 + Math.max(0, Math.sin(now * 9)) * 0.35 : 0.05;
      }
      if (b.state === 'herded' || b.state === 'leaving' || (b.alerted && b.stateTime < 1.2))
        flapUntil = Math.max(flapUntil, now + 0.6);
      const flap = now < flapUntil ? Math.abs(Math.sin(now * 16)) * 0.9 : 0;
      wings[0]!.rotation.z = -flap;
      wings[1]!.rotation.z = flap;
      if (flap > 0) neck.rotation.x = -0.2;
    },
    hit(ray) {
      return root.visible && ray.intersectObjects(hitTargets, false).length > 0;
    },
    dispose() {
      for (const g of geos) g.dispose();
      mat.dispose();
      scene.remove(root, bin, lid, mess);
    },
  };
}
