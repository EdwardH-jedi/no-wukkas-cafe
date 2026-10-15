// The coffee surface: a disc whose colour comes from the pour simulation's foam field.
// The field is uploaded as a single-channel texture only when it changes; the shader turns
// it into crema, beige "mud" and crisp white foam (smoothstep on a bilinear sample gives
// sharp edges even at 128²). The same texture drives a bump map, so the microfoam sits a hair
// proud of the crema and its edge catches the light. Where the stream lands, the surface dimples
// and rings spread out; a heart guide (distance field) can be drawn on top for practice.

import * as THREE from 'three';
import { GRID } from '../sim/latte/field';
import { GUIDE_SCALE, heartTemplate } from '../sim/latte/heart';
const GUIDE_RES = 128;
/** Signed distance range stored in the guide texture, field units. */
const GUIDE_RANGE = 0.25;

export interface CoffeeSurface {
  mesh: THREE.Mesh;
  /** Upload the foam field if it changed since the last call. */
  setFoam(foam: Float32Array, version: number): void;
  clear(): void;
  /** 0 = straight espresso crema, 1 = fully milky. */
  setTone(t: number): void;
  /** Where the stream meets the surface (field coords), its flow 0–1, and how much of it dives
   *  under (1 = poured from high: a dark dimple; 0 = low: it lays foam). */
  setImpact(x: number, y: number, flow: number, sink: number): void;
  /** Heart guide opacity, 0 = hidden. */
  setGuide(alpha: number): void;
  /** View time, seconds (ripples). */
  setTime(t: number): void;
  dispose(): void;
}

/** Signed distance to the guide heart's outline, packed into a texture (0.5 = on the line). */
function buildGuide(): THREE.DataTexture {
  const t = heartTemplate();
  const pts = t.outline.map(([x, y]) => [x * GUIDE_SCALE, y * GUIDE_SCALE] as const);
  const n = pts.length;
  const data = new Uint8Array(GUIDE_RES * GUIDE_RES);
  for (let j = 0; j < GUIDE_RES; j++) {
    const y = ((j + 0.5) / GUIDE_RES) * 2 - 1;
    for (let i = 0; i < GUIDE_RES; i++) {
      const x = ((i + 0.5) / GUIDE_RES) * 2 - 1;
      let best = Infinity;
      let inside = false;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const [ax, ay] = pts[a] as readonly [number, number];
        const [bx, by] = pts[b] as readonly [number, number];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
        const ex = bx - ax;
        const ey = by - ay;
        const u = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
        const dx = x - (ax + ex * u);
        const dy = y - (ay + ey * u);
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      const d = Math.sqrt(best) * (inside ? -1 : 1);
      data[j * GUIDE_RES + i] = Math.round(
        Math.max(0, Math.min(1, 0.5 + d / (2 * GUIDE_RANGE))) * 255,
      );
    }
  }
  const tex = new THREE.DataTexture(
    data,
    GUIDE_RES,
    GUIDE_RES,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createCoffeeSurface(): CoffeeSurface {
  const data = new Uint8Array(GRID * GRID);
  const tex = new THREE.DataTexture(data, GRID, GRID, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  // A 1×1 stand-in until the guide is first shown (building the distance field takes a moment).
  const noGuide = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
  noGuide.needsUpdate = true;
  let guideTex: THREE.DataTexture | null = null;

  const uniforms = {
    foamMap: { value: tex },
    guideMap: { value: noGuide as THREE.Texture },
    guideAlpha: { value: 0 },
    tone: { value: 0 },
    time: { value: 0 },
    impact: { value: new THREE.Vector2(0, 0) },
    impactFlow: { value: 0 },
    impactSink: { value: 0 },
    cremaA: { value: new THREE.Color('#3f1f0b') },
    cremaB: { value: new THREE.Color('#9a5c2a') },
    latteC: { value: new THREE.Color('#8a5a33') },
    foamC: { value: new THREE.Color('#fbf3e6') },
    guideC: { value: new THREE.Color('#f3c450') },
  };

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 });
  // The foam field doubles as a height map: the white stands a little proud of the crema.
  mat.bumpMap = tex;
  mat.bumpScale = 0.9;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFoamUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFoamUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vFoamUv;
uniform sampler2D foamMap, guideMap;
uniform float tone, time, impactFlow, impactSink, guideAlpha;
uniform vec2 impact;
uniform vec3 cremaA, cremaB, latteC, foamC, guideC;
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `float foamF = texture2D(foamMap, vFoamUv).r;
vec2 cp = vFoamUv * 2.0 - 1.0;
float cr = length(cp);
// Crema: caramel mottling, fine speckle, darker toward the cup wall.
float mott = vnoise(cp * 9.0) * 0.6 + vnoise(cp * 23.0) * 0.4;
vec3 crema = mix(cremaA, cremaB, clamp(mott * 0.7 + (1.0 - cr) * 0.5, 0.0, 1.0));
crema *= 0.93 + 0.12 * vnoise(cp * 95.0) * (1.0 - tone);
crema = mix(crema, latteC * (0.92 + 0.16 * mott), tone);
crema *= mix(1.0, 0.6, smoothstep(0.76, 1.0, cr));
// Where the stream lands: rings spread out; from high it punches a dark dimple with a pale halo.
float di = distance(cp, impact);
float ripH = sin(di * 62.0 - time * 17.0) * exp(-di * 6.5) * impactFlow * smoothstep(0.0, 0.05, di);
float dimple = exp(-di * di / 0.0022) * impactFlow * impactSink;
crema = mix(crema, foamC * vec3(0.86, 0.72, 0.55), exp(-di * di / 0.008) * impactFlow * impactSink * 0.3);
crema *= 1.0 - dimple * 0.45;
vec3 beige = mix(crema, foamC * vec3(0.88, 0.76, 0.6), 0.62);
vec3 coffeeCol = mix(crema, beige, smoothstep(0.08, 0.46, foamF) * 0.85);
float whiteF = smoothstep(0.44, 0.58, foamF);
// A thin brown rim where the foam meets the crema: the contrast that makes latte art read.
float edgeF = smoothstep(0.16, 0.42, foamF) * (1.0 - whiteF);
coffeeCol *= 1.0 - edgeF * 0.32;
// Microfoam: warm cream rather than paper white, a touch brighter where it's thickest.
vec3 foamCol = foamC * (0.965 + 0.035 * vnoise(cp * 60.0)) * mix(0.95, 1.02, smoothstep(0.6, 1.0, foamF));
coffeeCol = mix(coffeeCol, foamCol, whiteF);
coffeeCol *= 1.0 + ripH * 0.05;
// Heart guide: a dashed gold outline (practice).
float gd = (texture2D(guideMap, vFoamUv).r - 0.5) * ${(2 * GUIDE_RANGE).toFixed(3)};
float gw = fwidth(gd);
float guideLine = (1.0 - smoothstep(0.007, 0.007 + gw * 1.5, abs(gd)))
  * step(0.42, fract(atan(cp.y, cp.x) / 6.2831853 * 36.0)) * guideAlpha * (1.0 - 0.5 * whiteF);
coffeeCol = mix(coffeeCol, guideC, guideLine * 0.85);
diffuseColor.rgb = coffeeCol;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(0.24, 0.58, whiteF);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = perturbNormalArb(-vViewPosition, normal, vec2(dFdx(ripH), dFdy(ripH)) * 0.6, faceDirection);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += guideC * guideLine * 0.35;`,
      );
  };

  const geo = new THREE.CircleGeometry(1, 72);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; // local +y (field far side) → world -z
  mesh.receiveShadow = true;

  let lastVersion = -1;
  let lastFoam: Float32Array | null = null;
  return {
    mesh,
    setFoam(foam, version) {
      if (foam === lastFoam && version === lastVersion) return;
      lastFoam = foam;
      lastVersion = version;
      for (let i = 0; i < data.length; i++) {
        const v = foam[i] as number;
        data[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0;
      }
      tex.needsUpdate = true;
    },
    clear() {
      if (lastFoam === null && lastVersion === -1) return;
      data.fill(0);
      lastFoam = null;
      lastVersion = -1;
      tex.needsUpdate = true;
    },
    setTone(t) {
      uniforms.tone.value = t;
    },
    setImpact(x, y, flow, sink) {
      uniforms.impact.value.set(x, y);
      uniforms.impactFlow.value = flow;
      uniforms.impactSink.value = sink;
    },
    setGuide(alpha) {
      if (alpha > 0 && !guideTex) {
        guideTex = buildGuide();
        uniforms.guideMap.value = guideTex;
      }
      uniforms.guideAlpha.value = alpha;
    },
    setTime(t) {
      uniforms.time.value = t;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
      noGuide.dispose();
      guideTex?.dispose();
    },
  };
}
