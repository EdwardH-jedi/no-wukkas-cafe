import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, type Rng } from '../core/rng';

/** Cosmetic randomness for textures/props, still seeded so the café looks the same every run. */
export const decoRng: Rng = createRng(0xcafe);

export type Draw2D = (g: CanvasRenderingContext2D, w: number, h: number) => void;

export function canvasTexture(
  w: number,
  h: number,
  draw: Draw2D,
  repeat?: [number, number],
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Redraw a canvas texture in place (e.g. once web fonts have loaded). */
export function redraw(t: THREE.CanvasTexture, draw: Draw2D): void {
  const c = t.image as HTMLCanvasElement;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, c.width, c.height);
  draw(g, c.width, c.height);
  t.needsUpdate = true;
}

export function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...p });
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/**
 * Collects static geometry in world space and merges it per material, so the whole café costs
 * one draw call per material instead of one per prop (AGENTS.md §7).
 */
export class StaticBuilder {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    s: [number, number, number] = [1, 1, 1],
  ): void {
    tmpE.set(rx, ry, rz);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(s[0], s[1], s[2]));
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(tmpM);
    if (!g.getAttribute('uv')) {
      g.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2),
      );
    }
    let list = this.groups.get(mat);
    if (!list) {
      list = [];
      this.groups.set(mat, list);
    }
    list.push(g);
  }

  box(
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    ry = 0,
  ): void {
    this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry);
  }

  cyl(
    rt: number,
    rb: number,
    h: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    seg = 18,
  ): void {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
  }

  build(parent: THREE.Object3D, cast: boolean, receive: boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = cast;
      m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      parent.add(m);
      out.push(m);
    }
    this.groups.clear();
    return out;
  }
}

/** Dispose every geometry, material and texture under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
