// The working station: grinder, espresso machine, portafilter, cup, milk jug, streams and steam.
// Reads trial state every frame and poses everything; never writes to it (AGENTS.md §4 rule 5).

import * as THREE from 'three';
import { extractionLevel, type EspressoState } from '../sim/espresso';
import { ESPRESSO_FILL, surfaceRadius, surfacing, type PourState } from '../sim/latte/field';
import { pitcherFlow, PITCHER_MILK, type PitcherState } from '../sim/latte/pitcher';
import { clamp, lerp, smoothstep } from '../sim/math';
import { milkVolume, tipDepth, type SteamState } from '../sim/steam';
import { createCoffeeSurface } from './coffeeSurface';
import { CT, CUP, LAYOUT, liquidDrop } from './layout';
import { reducedMotion } from './motion';
import { canvasTexture, disposeTree, StaticBuilder, std } from './util';

/** Inner rim radius: the pour sim's unit disc. */
export const RIM = CUP.rimR - CUP.wall;
const CUP_BASE_Y = 0.006; // cup sits on the saucer
const RIM_Y = CUP_BASE_Y + CUP.height;
/** While pouring the spout points left (and a touch forward), so the jug body and the hand sit
 *  off to the right instead of between the camera and the art. */
const POUR_YAW = Math.atan2(0.35, -1);
const STEAM_YAW = Math.PI / 2;
const JUG_TIP = new THREE.Vector3(0.052, 0.118, 0); // spout tip relative to the jug base (unscaled)
const JUG_SCALE = 0.8; // a small latte-art jug
/** While pouring, the jug and arm sit between the camera and the art. The spout stays solid (you
 *  aim with it); the body fades with distance from the spout tip, the arm almost completely. */
const GHOST_SPOUT = 0.01; // m around the spout tip that stays solid
const GHOST_BODY = 0.035; // m from the tip where the body reaches full fade
const ARM_GHOST = 0.92;
export const WAND_TIP = new THREE.Vector3(LAYOUT.wand.x, CT + 0.17, LAYOUT.wand.z);
/** Where the espresso leaves the portafilter (locked in the left group head). */
export const GROUP_SPOUT = new THREE.Vector3(LAYOUT.group.x, CT + 0.103, LAYOUT.machine.z + 0.27);
const JUG_REST = new THREE.Vector3(-0.38, CT, -1.0);
/** Day 2 long black: the cup sits under the hot-water tap first. */
const WATER_CUP = new THREE.Vector3(-1.45, CT + 0.035, -0.7);
const WATER_TAP = new THREE.Vector3(-1.45, CT + 0.24, -0.7);
const PUFFS = 26;
/** Gaz holds the cup up here to inspect it, tilted toward the player (who looks from -x, +z). */
export const INSPECT_CUP = new THREE.Vector3(0.27, 1.3, 0.08);
const INSPECT_TOWARD = new THREE.Vector3(-1, 0, 1).normalize();

/** What the station needs to know each frame. Day 1's Trial satisfies it as is; Day 2 builds one
 *  from its barista state (phases 'idle', 'water', 'shotSteam' and 'ready' are Day 2 only;
 *  'shotSteam' is the shot and the steam at once: cup under the group, jug at the wand). */
export interface StationView {
  phase: string;
  phaseTime: number;
  attempt: number;
  espresso: EspressoState;
  steam: SteamState;
  pour: PourState;
  pitcher: PitcherState;
  demoActive: boolean;
  demoEndedAt: number;
  /** Day 2: the drink being made. Day 1 is always a flat white. */
  drink?: 'flatWhite' | 'longBlack' | null;
  /** Day 2 long black: hot water in the cup (cup volumes) and whether the tap is running. */
  water?: number;
  dispensing?: boolean;
  /** Practice: heart guide on the coffee (0 = hidden, 1 = shown). */
  guide?: number;
}

export interface Station {
  root: THREE.Group;
  /** World position of the cup's rim centre (camera target). */
  readonly cupRim: THREE.Vector3;
  /** World height of the coffee surface (pointer plane while pouring). */
  readonly surfaceY: number;
  /** World position of the milk jug's spout tip (tests: is the jug on screen?). */
  readonly jugTip: THREE.Vector3;
  update(t: StationView, dt: number, now: number): void;
  dispose(): void;
}

interface Puff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

const steel = (): THREE.MeshStandardMaterial =>
  std({ color: '#c7ccd1', metalness: 0.9, roughness: 0.25 });

export function buildStation(scene: THREE.Scene): Station {
  const root = new THREE.Group();
  scene.add(root);
  const steelM = steel();
  const blackM = std({ color: '#141414', roughness: 0.5 });
  const redM = std({ color: '#b33a2e', roughness: 0.4 });
  const ceramicM = std({ color: '#f7f4ee', roughness: 0.22 });
  ceramicM.side = THREE.DoubleSide;

  // ------------------------------------------------------------ espresso machine (static)
  const machine = new THREE.Group();
  machine.position.copy(LAYOUT.machine);
  root.add(machine);
  const mb = new StaticBuilder();
  mb.box(0.86, 0.44, 0.5, steelM, 0, 0.26, 0);
  mb.box(0.88, 0.045, 0.52, redM, 0, 0.5, 0);
  mb.box(0.72, 0.02, 0.3, std({ color: '#555', metalness: 0.6, roughness: 0.4 }), 0, 0.53, 0);
  for (let i = 0; i < 4; i++)
    mb.cyl(0.035, 0.03, 0.07, ceramicM, -0.25 + i * 0.16, 0.575, -0.05, 14);
  mb.box(
    0.82,
    0.03,
    0.24,
    std({ color: '#2b2b2b', metalness: 0.7, roughness: 0.35 }),
    0,
    0.016,
    0.3,
  );
  const grateM = std({ color: '#6d7176', metalness: 0.7, roughness: 0.45 });
  for (let i = 0; i < 9; i++) mb.box(0.012, 0.004, 0.2, grateM, -0.36 + i * 0.09, 0.034, 0.3);
  for (const x of [-0.2, 0.2]) {
    mb.cyl(0.058, 0.052, 0.08, steelM, x, 0.19, 0.27, 18);
    mb.box(0.12, 0.05, 0.03, blackM, x, 0.36, 0.255);
  }
  // Steam wand + knob on the right, hot-water tap on the left.
  mb.cyl(0.02, 0.02, 0.05, blackM, 0.45, 0.42, 0.22, 10);
  const wandLen = Math.hypot(0.25, 0.08);
  mb.add(
    new THREE.CylinderGeometry(0.0055, 0.0055, wandLen, 8),
    steelM,
    0.45,
    0.295,
    0.28,
    -Math.atan2(0.08, 0.25),
  );
  mb.cyl(0.02, 0.02, 0.05, blackM, -0.45, 0.42, 0.22, 10);
  mb.add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 8), steelM, -0.45, 0.32, 0.27, 0, 0, -0.2);
  mb.build(machine, true, true);
  const gaugeT = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#f4f1ea';
    g.beginPath();
    g.arc(64, 64, 60, 0, 7);
    g.fill();
    g.strokeStyle = '#b33a2e';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 64, 48, 2.5, 4.2);
    g.stroke();
    g.strokeStyle = '#111';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(100, 40);
    g.stroke();
  });
  const gaugeM = new THREE.MeshBasicMaterial({ map: gaugeT });
  for (const x of [-0.14, 0.14]) {
    const gm = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), gaugeM);
    gm.position.set(x, 0.4, 0.251);
    machine.add(gm);
  }
  const shotLightM = new THREE.MeshStandardMaterial({
    color: '#331100',
    emissive: '#ff8a3a',
    emissiveIntensity: 0,
  });
  const shotLight = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), shotLightM);
  shotLight.position.set(-0.2, 0.36, 0.272);
  machine.add(shotLight);

  // ------------------------------------------------------------ grinder
  const grinder = new THREE.Group();
  grinder.position.copy(LAYOUT.grinder);
  root.add(grinder);
  const gb = new StaticBuilder();
  gb.box(0.2, 0.36, 0.26, std({ color: '#1a1a1a', roughness: 0.35, metalness: 0.3 }), 0, 0.18, 0);
  gb.box(0.08, 0.05, 0.06, blackM, 0, 0.24, 0.14);
  gb.box(0.16, 0.012, 0.12, steelM, 0, 0.006, 0.13);
  gb.build(grinder, true, true);
  const hopper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.05, 0.24, 18, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#6b3b1c',
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      side: THREE.DoubleSide,
    }),
  );
  hopper.position.set(0, 0.48, 0);
  grinder.add(hopper);
  const beans = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.048, 0.13, 16),
    std({ color: '#3a1f0e', roughness: 0.8 }),
  );
  beans.position.set(0, 0.425, 0);
  grinder.add(beans);
  const groundsStream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.006, 0.07, 6),
    std({ color: '#4a2a14', roughness: 0.9 }),
  );
  groundsStream.position.set(0, 0.185, 0.14);
  grinder.add(groundsStream);

  // ------------------------------------------------------------ portafilter
  const porta = new THREE.Group();
  root.add(porta);
  const pb = new StaticBuilder();
  pb.cyl(0.05, 0.044, 0.03, steelM, 0, 0, 0, 20);
  pb.add(
    new THREE.CylinderGeometry(0.014, 0.017, 0.17, 10),
    blackM,
    0,
    -0.004,
    0.13,
    Math.PI / 2 - 0.12,
  );
  for (const s of [-1, 1]) pb.cyl(0.004, 0.003, 0.02, steelM, s * 0.012, -0.024, 0.0, 8);
  pb.build(porta, true, false);
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(0.044, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    std({ color: '#3d2412', roughness: 1 }),
  );
  mound.position.y = 0.008;
  porta.add(mound);
  const UNDER_GRINDER = new THREE.Vector3(LAYOUT.grinder.x, CT + 0.12, LAYOUT.grinder.z + 0.14);
  const TAMP = new THREE.Vector3(-1.55, CT + 0.15, -0.72);
  const IN_GROUP = new THREE.Vector3(LAYOUT.group.x, CT + 0.133, LAYOUT.machine.z + 0.27);

  // ------------------------------------------------------------ cup + saucer + coffee
  const cup = new THREE.Group();
  root.add(cup);
  const saucer = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0.002),
        new THREE.Vector2(0.05, 0.002),
        new THREE.Vector2(0.072, 0.009),
        new THREE.Vector2(0.075, 0.012),
        new THREE.Vector2(0.07, 0.011),
        new THREE.Vector2(0.048, 0.006),
        new THREE.Vector2(0, 0.006),
      ],
      40,
    ),
    ceramicM,
  );
  saucer.castShadow = saucer.receiveShadow = true;
  cup.add(saucer);
  const ri = RIM;
  const cupShell = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, CUP_BASE_Y),
        new THREE.Vector2(0.026, CUP_BASE_Y),
        new THREE.Vector2(0.031, CUP_BASE_Y + 0.004),
        new THREE.Vector2(0.038, CUP_BASE_Y + 0.02),
        new THREE.Vector2(0.0445, CUP_BASE_Y + 0.045),
        new THREE.Vector2(CUP.rimR, RIM_Y - 0.002),
        new THREE.Vector2(CUP.rimR - 0.002, RIM_Y),
        new THREE.Vector2(ri, RIM_Y - 0.001),
        new THREE.Vector2(ri - 0.002, RIM_Y - 0.02),
        new THREE.Vector2(0.034, CUP_BASE_Y + 0.02),
        new THREE.Vector2(0.026, CUP_BASE_Y + 0.009),
        new THREE.Vector2(0, CUP_BASE_Y + 0.008),
      ],
      48,
    ),
    ceramicM,
  );
  cupShell.castShadow = true;
  cupShell.receiveShadow = true;
  cup.add(cupShell);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.017, 0.0045, 8, 16, Math.PI * 1.25),
    ceramicM,
  );
  handle.position.set(CUP.rimR + 0.006, CUP_BASE_Y + 0.036, 0);
  handle.rotation.z = -Math.PI * 0.62;
  cup.add(handle);
  const coffee = createCoffeeSurface();
  cup.add(coffee.mesh);

  // ------------------------------------------------------------ milk jug
  const jug = new THREE.Group(); // origin = spout tip
  jug.rotation.order = 'YZX';
  jug.scale.setScalar(JUG_SCALE);
  root.add(jug);
  const jugBody = new THREE.Group();
  jugBody.position.set(-JUG_TIP.x, -JUG_TIP.y, 0);
  jug.add(jugBody);
  const jugGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.039, 0),
      new THREE.Vector2(0.042, 0.004),
      new THREE.Vector2(0.044, 0.035),
      new THREE.Vector2(0.04, 0.08),
      new THREE.Vector2(0.037, 0.105),
      new THREE.Vector2(0.04, 0.116),
    ],
    40,
  );
  // Pull a spout out of the rim on the +x side.
  const pos = jugGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = Math.pow(Math.max(0, Math.cos(a)), 10) * smoothstep(0.075, 0.116, y);
    pos.setXYZ(i, x + Math.cos(a) * 0.014 * k, y + 0.003 * k, z * (1 - 0.35 * k));
  }
  jugGeo.computeVertexNormals();
  const jugM = steel();
  jugM.side = THREE.DoubleSide;
  const jugMesh = new THREE.Mesh(jugGeo, jugM);
  jugMesh.castShadow = true;
  jugBody.add(jugMesh);
  const jugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 16, Math.PI), jugM);
  jugHandle.position.set(-0.046, 0.06, 0);
  jugHandle.rotation.z = Math.PI / 2;
  jugBody.add(jugHandle);
  const milkM = std({ color: '#fbf5ea', roughness: 0.3 });
  const milkTop = new THREE.Mesh(new THREE.CircleGeometry(0.038, 32), milkM);
  milkTop.rotation.x = -Math.PI / 2;
  jugBody.add(milkTop);
  // Arm holding the jug (the player's, or Gaz's during the demo).
  const skinM = std({ color: '#c99872', roughness: 0.6 });
  const sleeveM = std({ color: '#2d3a4a', roughness: 0.85 });
  // Whose arm is on the jug: the player's, or Gaz's during the demo.
  const PLAYER_SKIN = new THREE.Color('#c99872');
  const PLAYER_SLEEVE = new THREE.Color('#2d3a4a');
  const GAZ_SKIN = new THREE.Color('#e0b08e');
  const GAZ_SLEEVE = new THREE.Color('#7a3b2e');
  const arm = new THREE.Group();
  arm.position.set(-0.078, 0.06, 0);
  jugBody.add(arm);
  const ghostU = { spout: { value: new THREE.Vector3() }, ghost: { value: 0 } };
  for (const m of [jugM, milkM]) {
    m.transparent = true;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.spout = ghostU.spout;
      shader.uniforms.ghost = ghostU.ghost;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGhostPos;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvGhostPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vGhostPos;\nuniform vec3 spout;\nuniform float ghost;',
        )
        .replace(
          '#include <alphamap_fragment>',
          `#include <alphamap_fragment>
diffuseColor.a *= 1.0 - ghost * mix(0.12, 0.97, smoothstep(${GHOST_SPOUT}, ${GHOST_BODY}, distance(vGhostPos, spout)));`,
        );
    };
  }
  for (const m of [skinM, sleeveM]) m.transparent = true;
  let ghost = 0;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 10), skinM);
  hand.scale.set(1, 1.35, 0.8);
  arm.add(hand);
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.26, 12), skinM);
  forearm.position.set(-0.115, -0.06, 0);
  forearm.rotation.z = Math.PI / 2 + 0.45;
  arm.add(forearm);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.14, 12), sleeveM);
  sleeve.position.set(-0.25, -0.125, 0);
  sleeve.rotation.z = Math.PI / 2 + 0.45;
  arm.add(sleeve);

  // ------------------------------------------------------------ streams
  const streamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  streamGeo.translate(0, -0.5, 0);
  // The milk stream tapers as it falls and trails behind a moving jug (the milk at the bottom left
  // the spout a moment ago), with a little wobble: it reads as liquid, and shows the jug's motion.
  const milkGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 10, true);
  milkGeo.translate(0, -0.5, 0);
  const streamU = {
    taper: { value: 0.55 },
    bend: { value: new THREE.Vector2() },
    time: { value: 0 },
    wob: { value: 0.06 },
  };
  const milkStreamM = std({ color: '#fbf3e6', roughness: 0.25, emissive: '#3a3226' });
  milkStreamM.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, streamU);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float taper, time, wob;\nuniform vec2 bend;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float sFall = clamp(-transformed.y, 0.0, 1.0);
transformed.xz *= mix(1.0, taper, sqrt(sFall)) * (1.0 + wob * sin(sFall * 23.0 - time * 31.0));
transformed.xz += bend * sFall * sFall;`,
      );
  };
  const milkStream = new THREE.Mesh(milkGeo, milkStreamM);
  root.add(milkStream);
  const streamVel = new THREE.Vector3();
  const lastTip = new THREE.Vector3();
  let hasLastTip = false;
  const espStreamM = std({ color: '#3b1d0c', roughness: 0.2 });
  const espStreams = [-1, 1].map((s) => {
    const m = new THREE.Mesh(streamGeo, espStreamM);
    m.userData.side = s;
    root.add(m);
    return m;
  });
  const waterStream = new THREE.Mesh(
    streamGeo,
    new THREE.MeshStandardMaterial({
      color: '#e8f4f7',
      roughness: 0.1,
      transparent: true,
      opacity: 0.8,
    }),
  );
  waterStream.visible = false;
  root.add(waterStream);
  const espColA = new THREE.Color('#2e1407');
  const espColB = new THREE.Color('#8a4f24');
  const espColC = new THREE.Color('#d1a45f');

  // ------------------------------------------------------------ aim ring: where the stream will land
  const aimM = new THREE.MeshBasicMaterial({
    color: '#f3c450',
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const AIM_MISS = new THREE.Color('#e0513f');
  const AIM_LOW = new THREE.Color('#74a98c');
  const AIM_HIGH = new THREE.Color('#f3c450');
  const aim = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), aimM);
  aim.rotation.x = -Math.PI / 2;
  aim.visible = false;
  root.add(aim);
  // A faint plumb line from the spout to the aim ring while the stream is off: shows how high the
  // jug is, which the top-down view otherwise hides.
  const plumbM = new THREE.MeshBasicMaterial({
    color: '#f3c450',
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  const plumb = new THREE.Mesh(streamGeo, plumbM);
  plumb.visible = false;
  root.add(plumb);
  let guideAlpha = 0;
  let impactFlow = 0;
  let impactSink = 0;

  // ------------------------------------------------------------ puddle on the counter
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(1, 28),
    new THREE.MeshStandardMaterial({
      color: '#f4eadb',
      roughness: 0.12,
      transparent: true,
      opacity: 0.92,
    }),
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.visible = false;
  root.add(puddle);

  // ------------------------------------------------------------ steam puffs
  const puffT = canvasTexture(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
  const puffs: Puff[] = [];
  for (let i = 0; i < PUFFS; i++) {
    const mat = new THREE.SpriteMaterial({
      map: puffT,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    root.add(sprite);
    puffs.push({ sprite, mat, life: 0, vx: 0, vy: 0, vz: 0, size: 0.03 });
  }
  let puffCursor = 0;
  let puffAcc = 0;
  let cupSteamAcc = 0;
  const spawnPuff = (
    x: number,
    y: number,
    z: number,
    speed: number,
    size: number,
    spread: number,
    seed: number,
  ): void => {
    const p = puffs[puffCursor] as Puff;
    puffCursor = (puffCursor + 1) % PUFFS;
    p.life = 1;
    p.sprite.position.set(x, y, z);
    p.vx = Math.sin(seed * 12.9898) * spread;
    p.vz = Math.cos(seed * 78.233) * spread;
    p.vy = speed;
    p.size = size;
    p.sprite.visible = true;
  };

  // ------------------------------------------------------------ per-frame pose
  const cupRim = new THREE.Vector3();
  let surfaceYNow = CT;
  const cupPos = new THREE.Vector3().copy(LAYOUT.group);
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const tiltAxis = new THREE.Vector3()
    .crossVectors(new THREE.Vector3(0, 1, 0), INSPECT_TOWARD)
    .normalize();
  const yAxis = new THREE.Vector3(0, 1, 0);
  // Turn the cup so the heart's tip (field +y = cup -z) faces the viewer, i.e. reads upright.
  const inspectYaw = Math.atan2(INSPECT_TOWARD.x, INSPECT_TOWARD.z) + Math.PI;
  const eTmp = new THREE.Euler(0, 0, 0, 'YZX');
  let cupSlide = 1;
  let lastPhase = '';
  let lastAttempt = -1;
  let missX = 0;
  let missZ = 0;
  let jugBlend = 0; // 0 = resting/steam pose, 1 = pour pose
  const tipWorld = new THREE.Vector3();

  const setJugPose = (base: THREE.Vector3, yaw: number, tiltAngle: number): void => {
    eTmp.set(0, yaw, -tiltAngle, 'YZX');
    jug.rotation.copy(eTmp);
    qTmp.setFromEuler(eTmp);
    v2.copy(JUG_TIP).multiplyScalar(JUG_SCALE).applyQuaternion(qTmp);
    jug.position.copy(base).add(v2);
  };

  function update(t: StationView, dt: number, now: number): void {
    const phase = t.phase;
    if (phase !== lastPhase || t.attempt !== lastAttempt) {
      if (phase === 'steam' && t.attempt === 0) cupSlide = 0;
      if (phase === 'steam' && t.attempt > 0) cupSlide = 1;
      // Milk finished during the shot: the cup goes from the group straight to the pour.
      if (phase === 'pour' && lastPhase === 'shotSteam') cupSlide = 0;
      lastPhase = phase;
      lastAttempt = t.attempt;
    }
    const e = t.espresso;

    // --- grinder + portafilter
    const grinding = phase === 'grind' && e.grinding;
    grinder.position.set(
      LAYOUT.grinder.x + (grinding ? Math.sin(now * 90) * 0.0012 : 0),
      LAYOUT.grinder.y,
      LAYOUT.grinder.z,
    );
    groundsStream.visible = grinding;
    const early = phase === 'title' || phase === 'intro' || phase === 'grind';
    if (early) porta.position.copy(UNDER_GRINDER);
    else if (phase === 'lock') {
      const k = t.phaseTime;
      if (k < 0.6) porta.position.lerpVectors(UNDER_GRINDER, TAMP, smoothstep(0, 0.6, k));
      else porta.position.lerpVectors(TAMP, IN_GROUP, smoothstep(0.6, 1.3, k));
    } else porta.position.copy(IN_GROUP);
    porta.rotation.y =
      phase === 'lock' ? -0.35 * smoothstep(1.0, 1.4, t.phaseTime) : early ? 0 : -0.35;
    const doseK = clamp(e.dose / 20, 0, 1.4);
    mound.visible = e.dose > 0.3;
    mound.scale.set(
      0.6 + 0.4 * Math.min(1, doseK),
      Math.max(0.05, 0.25 * doseK),
      0.6 + 0.4 * Math.min(1, doseK),
    );
    if (phase === 'lock' && t.phaseTime > 0.5) mound.scale.y = Math.min(mound.scale.y, 0.12);

    // --- shot light + espresso streams
    const atShot = phase === 'shot' || phase === 'shotSteam';
    const extracting = atShot && e.extracting;
    shotLightM.emissiveIntensity = extracting ? 2.5 : 0.1;
    const dripping = extracting && e.shotTime > 4;
    const lvl = extractionLevel(e);
    if (lvl < 0.5) espStreamM.color.lerpColors(espColA, espColB, lvl / 0.5);
    else espStreamM.color.lerpColors(espColB, espColC, (lvl - 0.5) / 0.5);

    // --- cup position
    if (phase === 'steam' || phase === 'demo' || phase === 'pour')
      cupSlide = Math.min(1, cupSlide + dt / 0.7);
    const longBlack = t.drink === 'longBlack';
    const atMachine = early || phase === 'lock' || atShot;
    const held = phase === 'inspect' || phase === 'feedback';
    // Day 2: no cup out while idle; long blacks start under the hot-water tap.
    cup.visible = phase !== 'idle';
    if (held) {
      const k = phase === 'inspect' ? smoothstep(0.1, 0.9, t.phaseTime) : 1;
      v1.set(LAYOUT.cup.x, LAYOUT.cup.y, LAYOUT.cup.z);
      cupPos.lerpVectors(v1, INSPECT_CUP, k);
      cupPos.y += Math.sin(k * Math.PI) * 0.06;
      qYaw.setFromAxisAngle(yAxis, inspectYaw * k);
      qTilt.setFromAxisAngle(tiltAxis, 0.95 * k);
      cup.quaternion.multiplyQuaternions(qTilt, qYaw);
    } else if (phase === 'water') {
      cupPos.copy(WATER_CUP);
      cup.rotation.set(0, 0, 0);
    } else if (atMachine) {
      if (longBlack && phase === 'shot')
        cupPos.lerpVectors(WATER_CUP, LAYOUT.group, smoothstep(0, 0.4, t.phaseTime));
      else cupPos.copy(LAYOUT.group);
      cup.rotation.set(0, 0, 0);
    } else {
      const k =
        (phase === 'steam' && t.attempt === 0) || phase === 'pour' ? smoothstep(0, 1, cupSlide) : 1;
      cupPos.lerpVectors(LAYOUT.group, LAYOUT.cup, k);
      cupPos.y = lerp(LAYOUT.group.y, LAYOUT.cup.y, k) + Math.sin(k * Math.PI) * 0.03;
      cup.rotation.set(0, 0, 0);
    }
    cup.position.copy(cupPos);

    // --- coffee level + art
    const pourView =
      phase === 'pour' ||
      phase === 'review' ||
      (phase === 'ready' && !longBlack) ||
      (phase === 'demo' && (t.demoActive || t.demoEndedAt >= 0)) ||
      held ||
      phase === 'verdict';
    let fill: number;
    const water = t.water ?? 0;
    if (longBlack && (phase === 'water' || phase === 'shot' || phase === 'ready')) {
      // Water first, then the shot lands on top: all crema, no milk.
      const shot =
        phase === 'water'
          ? 0
          : phase === 'ready'
            ? ESPRESSO_FILL
            : clamp(e.yield / 38) * ESPRESSO_FILL;
      fill = Math.min(1, water + shot);
      coffee.clear();
    } else if (early || phase === 'lock') {
      fill = 0;
      coffee.clear();
    } else if (atShot) {
      fill = clamp(e.yield / 38) * ESPRESSO_FILL;
      coffee.clear();
    } else if (pourView) {
      fill = t.pour.fill;
      coffee.setFoam(t.pour.foam, t.pour.version);
    } else {
      fill = ESPRESSO_FILL;
      coffee.clear();
    }
    coffee.mesh.visible = fill > 0.01;
    const rs = surfaceRadius(fill) * RIM * 0.985;
    coffee.mesh.scale.set(rs, rs, 1);
    coffee.mesh.position.y = RIM_Y - liquidDrop(fill);
    coffee.setTone(longBlack ? 0 : clamp((fill - ESPRESSO_FILL) / (1 - ESPRESSO_FILL)) * 0.72);
    cupRim.set(cupPos.x, cupPos.y + RIM_Y, cupPos.z);
    const surfaceY = cupPos.y + coffee.mesh.position.y;
    surfaceYNow = surfaceY;

    for (const s of espStreams) {
      s.visible = dripping;
      if (!dripping) continue;
      const top = IN_GROUP.y - 0.03;
      const len = Math.max(0.01, top - surfaceY);
      s.position.set(IN_GROUP.x + (s.userData.side as number) * 0.012, top, IN_GROUP.z);
      const r = 0.0011 + 0.0004 * Math.sin(now * 40 + (s.userData.side as number));
      s.scale.set(r, len, r);
    }

    // --- hot water (Day 2 long black)
    waterStream.visible = phase === 'water' && t.dispensing === true;
    if (waterStream.visible) {
      const len = Math.max(0.005, WATER_TAP.y - surfaceY);
      const r = 0.0042 + 0.0004 * Math.sin(now * 33);
      waterStream.position.copy(WATER_TAP);
      waterStream.scale.set(r, len, r);
    }

    // --- milk jug
    const pouring = phase === 'pour' || (phase === 'demo' && t.demoActive);
    const atWand = phase === 'steam' || phase === 'shotSteam';
    const steaming = atWand && !t.steam.done;
    jugBlend = pouring ? Math.min(1, jugBlend + dt / 0.35) : Math.max(0, jugBlend - dt / 0.5);
    arm.visible = pouring || steaming;
    sleeveM.color.copy(phase === 'demo' ? GAZ_SLEEVE : PLAYER_SLEEVE);
    skinM.color.copy(phase === 'demo' ? GAZ_SKIN : PLAYER_SKIN);
    // Ghost the jug and arm once they're over the cup, so the art is never hidden.
    const wantGhost = pouring && jugBlend > 0.85 ? 1 : 0;
    ghost += (wantGhost - ghost) * Math.min(1, dt * 8);
    if (Math.abs(ghost - wantGhost) < 0.005) ghost = wantGhost;
    ghostU.ghost.value = ghost;
    jugM.depthWrite = milkM.depthWrite = ghost < 0.01;
    for (const m of [skinM, sleeveM]) {
      m.opacity = 1 - ghost * ARM_GHOST;
      m.depthWrite = ghost < 0.01;
    }
    let milkFrac = 1;
    let milkY = 0.075;
    if (pouring || jugBlend > 0) {
      const p = t.pitcher;
      milkFrac = clamp(p.milk / PITCHER_MILK);
      tipWorld.set(cupPos.x + p.x * RIM, surfaceY + p.height / 100, cupPos.z - p.y * RIM);
      const tiltAngle = 0.18 + p.tilt * 0.95;
      if (jugBlend >= 1) {
        eTmp.set(0, POUR_YAW, -tiltAngle, 'YZX');
        jug.rotation.copy(eTmp);
        jug.position.copy(tipWorld);
      } else {
        // Lift the jug over from where it was resting.
        setJugPose(JUG_REST, STEAM_YAW, 0);
        const k = smoothstep(0, 1, jugBlend);
        jug.position.lerp(tipWorld, k);
        jug.position.y += Math.sin(k * Math.PI) * 0.08;
        jug.rotation.set(0, lerp(STEAM_YAW, POUR_YAW, k), -tiltAngle * k, 'YZX');
      }
      milkY = 0.02 + 0.075 * milkFrac;
    } else if (atWand) {
      const s = t.steam;
      milkY = 0.06 * milkVolume(s);
      const depth = s.done ? -0.5 : tipDepth(s);
      // Jug base so the wand tip sits `depth` cm under the milk surface.
      v1.set(WAND_TIP.x + 0.012, WAND_TIP.y + depth / 100 - milkY * JUG_SCALE, WAND_TIP.z + 0.01);
      if (s.done) v1.y = Math.max(CT, v1.y - 0.05);
      setJugPose(v1, STEAM_YAW, 0);
      if (s.zone === 'screech') jug.position.x += Math.sin(now * 70) * 0.0015;
    } else {
      setJugPose(JUG_REST, STEAM_YAW, 0);
    }
    ghostU.spout.value.copy(jug.position);
    milkTop.visible = milkFrac > 0.02;
    milkTop.position.y = milkY;
    milkTop.scale.setScalar(
      clamp(0.8 + milkY * 2.4, 0.8, 1.05) * (1 - 0.25 * (pouring ? t.pitcher.tilt : 0)),
    );

    // --- milk stream
    const flow = pouring ? pitcherFlow(t.pitcher) : 0;
    // Spout velocity (smoothed), for the trailing stream.
    if (pouring && hasLastTip && dt > 0) {
      v1.subVectors(tipWorld, lastTip).divideScalar(dt);
      streamVel.lerp(v1, 1 - Math.exp(-dt / 0.08));
    } else streamVel.set(0, 0, 0);
    lastTip.copy(tipWorld);
    hasLastTip = pouring;
    milkStream.visible = flow > 0.01;
    if (milkStream.visible) {
      const p = t.pitcher;
      const miss = Math.hypot(p.x, p.y) > 1.02;
      const bottom = miss ? CT + 0.002 : surfaceY;
      const len = Math.max(0.005, tipWorld.y - bottom);
      const w = 0.0016 + 0.0034 * Math.sqrt(flow);
      milkStream.position.copy(tipWorld);
      milkStream.scale.set(w, len, w);
      // The bottom of the stream left the spout one fall-time ago.
      const lag = Math.sqrt((2 * len) / 9.81) * 0.6;
      let bx = -streamVel.x * lag;
      let bz = -streamVel.z * lag;
      const bl = Math.hypot(bx, bz);
      const cap = len * 0.5;
      if (bl > cap) {
        bx *= cap / bl;
        bz *= cap / bl;
      }
      streamU.bend.value.set(bx / w, bz / w);
      streamU.time.value = now;
      streamU.taper.value = 0.42 + 0.25 * flow;
      if (miss) {
        missX = p.x;
        missZ = p.y;
      }
    }
    // The surface answers the stream: a dimple and rings where it lands (fading after it stops).
    const onCup = milkStream.visible && Math.hypot(t.pitcher.x, t.pitcher.y) < 0.98;
    const wantFlow = onCup ? flow : 0;
    impactFlow += (wantFlow - impactFlow) * Math.min(1, dt * (wantFlow > impactFlow ? 12 : 2.5));
    if (onCup) {
      const rsF = surfaceRadius(t.pour.fill);
      impactSink = 1 - surfacing(t.pitcher.height);
      coffee.setImpact(t.pitcher.x / rsF, t.pitcher.y / rsF, impactFlow, impactSink);
    } else coffee.setImpact(0, 0, impactFlow, impactSink);
    coffee.setTime(now);
    const wantGuide = pourView && !held ? (t.guide ?? 0) : 0;
    guideAlpha += (wantGuide - guideAlpha) * Math.min(1, dt * 6);
    if (Math.abs(guideAlpha - wantGuide) < 0.01) guideAlpha = wantGuide;
    coffee.setGuide(guideAlpha);

    // --- aim ring (player's pour only): fades out while the stream is running
    aim.visible = phase === 'pour';
    if (aim.visible) {
      const p = t.pitcher;
      const miss = Math.hypot(p.x, p.y) > 1.02;
      aim.position.set(cupPos.x + p.x * RIM, (miss ? CT : surfaceY) + 0.0008, cupPos.z - p.y * RIM);
      // Like the jug's shadow: wide when it's high, tight when it's right down on the coffee.
      aim.scale.setScalar(0.0033 + 0.00055 * p.height + 0.0003 * Math.sin(now * 5));
      aimM.opacity = flow > 0.01 ? 0.15 : 0.75;
      aimM.color.copy(miss ? AIM_MISS : p.height <= 1.1 ? AIM_LOW : AIM_HIGH);
    }
    plumb.visible = aim.visible && flow <= 0.01 && t.pitcher.height > 0.6;
    if (plumb.visible) {
      const len = Math.max(0.001, tipWorld.y - aim.position.y);
      plumb.position.copy(tipWorld);
      plumb.scale.set(0.00028, len, 0.00028);
      plumbM.color.copy(aimM.color);
    }

    // --- puddle from spills
    const spill = pourView ? t.pour.spill : 0;
    puddle.visible = spill > 0.005 && !held;
    if (puddle.visible) {
      const overflowed = t.pour.overflow > spill * 0.5;
      const len = Math.hypot(missX, missZ) || 1;
      const s = 0.02 + Math.sqrt(spill) * 0.09;
      const off = Math.max(0.085, RIM * 1.6);
      puddle.position.set(
        LAYOUT.cup.x + (overflowed ? 0 : (missX / len) * off),
        CT + 0.0015,
        LAYOUT.cup.z + (overflowed ? 0 : -(missZ / len) * off),
      );
      puddle.scale.set(s, s * 0.8, 1);
    }

    // --- steam puffs from the wand and the hot cup. Reduced motion: a few slow puffs that rise
    // straight up (the wand still shows it's open), none swirling off sideways.
    const calm = reducedMotion();
    const rate = calm ? 0.25 : 1;
    const drift = calm ? 0 : 1;
    if (steaming && t.steam.valveOpen) {
      const z = t.steam.zone;
      puffAcc += dt * (z === 'screech' ? 40 : z === 'chirp' ? 22 : 14) * rate;
      while (puffAcc >= 1) {
        puffAcc -= 1;
        spawnPuff(
          WAND_TIP.x + 0.02,
          WAND_TIP.y + 0.03,
          WAND_TIP.z + 0.01,
          calm ? 0.06 : 0.16,
          0.035,
          0.05 * drift,
          now * 7 + puffAcc,
        );
      }
    }
    if ((pourView || phase === 'steam' || phase === 'ready') && !held && fill > 0.5) {
      cupSteamAcc += dt * 2.2 * rate;
      while (cupSteamAcc >= 1) {
        cupSteamAcc -= 1;
        spawnPuff(cupPos.x, surfaceY + 0.01, cupPos.z, 0.05, 0.03, 0.012 * drift, now * 3.1);
      }
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 0.9;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;
      const age = 1 - p.life;
      p.sprite.scale.setScalar(p.size * (0.5 + age * 2.2));
      p.mat.opacity = Math.sin(age * Math.PI) * 0.32;
    }
  }

  return {
    root,
    cupRim,
    get jugTip() {
      return jug.position;
    },
    get surfaceY() {
      return surfaceYNow;
    },
    update,
    dispose() {
      coffee.dispose();
      disposeTree(root);
      scene.remove(root);
    },
  };
}
