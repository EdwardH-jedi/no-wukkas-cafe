// The coffee surface: a disc whose colour comes from the pour simulation's foam field.
// The field is uploaded as a single-channel texture only when it changes; the shader turns
// it into crema, beige "mud" and crisp white foam (smoothstep on a bilinear sample gives
// sharp edges even at 128²).

import * as THREE from 'three';
import { GRID } from '../sim/latte/field';

export interface CoffeeSurface {
  mesh: THREE.Mesh;
  /** Upload the foam field if it changed since the last call. */
  setFoam(foam: Float32Array, version: number): void;
  clear(): void;
  /** 0 = straight espresso crema, 1 = fully milky. */
  setTone(t: number): void;
  dispose(): void;
}

export function createCoffeeSurface(): CoffeeSurface {
  const data = new Uint8Array(GRID * GRID);
  const tex = new THREE.DataTexture(data, GRID, GRID, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;

  const uniforms = {
    foamMap: { value: tex },
    tone: { value: 0 },
    cremaA: { value: new THREE.Color('#4a260f') },
    cremaB: { value: new THREE.Color('#8e5426') },
    latteC: { value: new THREE.Color('#8a5a33') },
    foamC: { value: new THREE.Color('#fbf3e6') },
  };

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 });
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
uniform sampler2D foamMap;
uniform float tone;
uniform vec3 cremaA, cremaB, latteC, foamC;
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `float foamF = texture2D(foamMap, vFoamUv).r;
vec2 cp = vFoamUv * 2.0 - 1.0;
float cr = length(cp);
float mott = vnoise(cp * 9.0) * 0.6 + vnoise(cp * 23.0) * 0.4;
vec3 crema = mix(cremaA, cremaB, clamp(mott * 0.7 + (1.0 - cr) * 0.45, 0.0, 1.0));
crema = mix(crema, latteC * (0.92 + 0.16 * mott), tone);
crema *= mix(1.0, 0.7, smoothstep(0.8, 1.0, cr));
vec3 beige = mix(crema, foamC * vec3(0.88, 0.76, 0.6), 0.62);
vec3 coffeeCol = mix(crema, beige, smoothstep(0.08, 0.46, foamF) * 0.85);
float whiteF = smoothstep(0.44, 0.58, foamF);
float edgeF = smoothstep(0.16, 0.42, foamF) * (1.0 - whiteF);
coffeeCol *= 1.0 - edgeF * 0.28;
vec3 foamCol = foamC * (0.965 + 0.035 * vnoise(cp * 60.0));
coffeeCol = mix(coffeeCol, foamCol, whiteF);
diffuseColor.rgb = coffeeCol;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(0.26, 0.6, whiteF);`,
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
      data.fill(0);
      lastFoam = null;
      lastVersion = -1;
      tex.needsUpdate = true;
    },
    setTone(t) {
      uniforms.tone.value = t;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
