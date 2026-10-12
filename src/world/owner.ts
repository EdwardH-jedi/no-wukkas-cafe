// Gaz, the owner. Built from primitives; the face is a small canvas texture redrawn only when
// his mood, mouth or blink changes (CLAUDE.md three.js notes). Poses blend smoothly; gestures
// play on top when he says something.

import * as THREE from 'three';
import type { Gesture, Mood } from '../sim/owner';
import { clamp } from '../sim/math';
import { LAYOUT } from './layout';
import { canvasTexture, disposeTree, std } from './util';

interface Pose {
  rShX: number;
  rShZ: number;
  rElb: number;
  lShX: number;
  lShZ: number;
  lElb: number;
  lean: number;
  twist: number;
  shrug: number;
}

const POSES: Record<string, Pose> = {
  crossed: {
    rShX: -0.42,
    rShZ: 0.3,
    rElb: -1.95,
    lShX: -0.48,
    lShZ: -0.3,
    lElb: -1.85,
    lean: 0,
    twist: 0,
    shrug: 0,
  },
  hips: {
    rShX: 0.05,
    rShZ: -0.16,
    rElb: -0.35,
    lShX: 0.05,
    lShZ: 0.16,
    lElb: -0.35,
    lean: -0.02,
    twist: 0,
    shrug: 0,
  },
  leanIn: {
    rShX: -0.75,
    rShZ: 0.08,
    rElb: -0.35,
    lShX: -0.75,
    lShZ: -0.08,
    lElb: -0.35,
    lean: 0.28,
    twist: 0,
    shrug: 0,
  },
  holdCup: {
    rShX: -0.6,
    rShZ: 0.22,
    rElb: -1.1,
    lShX: -0.6,
    lShZ: -0.22,
    lElb: -1.1,
    lean: 0.03,
    twist: 0,
    shrug: 0,
  },
  point: {
    rShX: -1.35,
    rShZ: -0.05,
    rElb: -0.15,
    lShX: 0.15,
    lShZ: 0.55,
    lElb: -1.5,
    lean: 0.05,
    twist: 0.12,
    shrug: 0,
  },
  throwHands: {
    rShX: -0.6,
    rShZ: -1.15,
    rElb: -1.35,
    lShX: -0.6,
    lShZ: 1.15,
    lElb: -1.35,
    lean: -0.05,
    twist: 0,
    shrug: 0.03,
  },
  facepalm: {
    rShX: -1.15,
    rShZ: 0.42,
    rElb: -2.35,
    lShX: 0.1,
    lShZ: 0.5,
    lElb: -1.45,
    lean: 0.12,
    twist: 0,
    shrug: 0,
  },
  thumbsUp: {
    rShX: -0.95,
    rShZ: -0.1,
    rElb: -1.25,
    lShX: 0.15,
    lShZ: 0.55,
    lElb: -1.5,
    lean: 0,
    twist: 0.1,
    shrug: 0,
  },
  tapWatch: {
    rShX: -0.7,
    rShZ: 0.35,
    rElb: -1.75,
    lShX: -0.85,
    lShZ: -0.2,
    lElb: -1.55,
    lean: 0.04,
    twist: 0,
    shrug: 0,
  },
  shrug: {
    rShX: -0.35,
    rShZ: -0.35,
    rElb: -1.5,
    lShX: -0.35,
    lShZ: 0.35,
    lElb: -1.5,
    lean: 0,
    twist: 0,
    shrug: 0.05,
  },
};

const GESTURE_POSE: Partial<Record<Gesture, string>> = {
  point: 'point',
  throwHands: 'throwHands',
  facepalm: 'facepalm',
  thumbsUp: 'thumbsUp',
  tapWatch: 'tapWatch',
  shrug: 'shrug',
  leanIn: 'leanIn',
};

/** What Gaz's body needs each frame. Day 1's Trial satisfies it; Day 2 passes its own. */
export interface OwnerScene {
  phase: string;
  speech: { current: unknown };
  owner: { frustration: number };
}

/** A line he says (mood + gesture drive his face and arms). */
export interface OwnerLine {
  mood: Mood;
  gesture: Gesture;
  duration: number;
}

export interface OwnerView {
  root: THREE.Group;
  /** World position of his face (camera target). */
  readonly head: THREE.Vector3;
  onSay(line: OwnerLine, now: number): void;
  update(t: OwnerScene, dt: number, now: number, look: THREE.Vector3): void;
  dispose(): void;
}

type Mouth = 'closed' | 'open' | 'wide';

export function buildOwner(scene: THREE.Scene): OwnerView {
  const root = new THREE.Group();
  root.position.copy(LAYOUT.owner);
  root.rotation.y = -1.05;
  scene.add(root);

  const skin = std({ color: '#e2ad8c', roughness: 0.6 });
  const shirt = std({ color: '#3b4048', roughness: 0.85 });
  const apron = std({ color: '#2f4a3a', roughness: 0.9 });
  const denim = std({ color: '#2c3a52', roughness: 0.85 });
  const shoe = std({ color: '#1a1410', roughness: 0.6 });
  const hairM = std({ color: '#9a948c', roughness: 0.9 });

  const body = new THREE.Group();
  root.add(body);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.7, 6, 12), denim);
    leg.position.set(s * 0.1, 0.45, 0);
    body.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.26), shoe);
    foot.position.set(s * 0.1, 0.035, 0.05);
    body.add(foot);
  }
  const torso = new THREE.Group(); // pivots at the hips
  torso.position.y = 0.9;
  body.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.36, 6, 16), shirt);
  chest.position.y = 0.3;
  chest.scale.set(1.08, 1, 0.78);
  torso.add(chest);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), shirt);
  belly.position.set(0, 0.16, 0.04);
  belly.scale.set(1, 0.9, 0.85);
  torso.add(belly);
  const apronLogo = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2f4a3a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(243,196,80,.9)';
    g.font = '400 40px "Bowlby One", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('NO', w / 2, 110);
    g.fillText('WUKKAS', w / 2, 152);
  });
  const apronFront = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.62),
    std({ map: apronLogo, roughness: 0.9 }),
  );
  apronFront.position.set(0, 0.18, 0.205);
  apronFront.rotation.x = -0.05;
  torso.add(apronFront);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), apron);
  strap.position.set(0, 0.5, 0.1);
  strap.rotation.x = -0.6;
  torso.add(strap);
  const towel = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.32, 0.03),
    std({ color: '#e9eef2', roughness: 0.95 }),
  );
  towel.position.set(0.17, 0.48, 0.02);
  towel.rotation.set(0.1, 0, 0.12);
  torso.add(towel);
  const stripeM = std({ color: '#4f8fbd' });
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.018, 0.032), stripeM);
    stripe.position.set(0.17 + 0.01 * i, 0.42 - i * 0.05, 0.02);
    stripe.rotation.set(0.1, 0, 0.12);
    torso.add(stripe);
  }

  // Arms: shoulder → upper arm → elbow → forearm → hand.
  const makeArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.235, 0.56, 0);
    torso.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.2, 4, 10), shirt);
    upper.position.y = -0.14;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.047, 0.19, 4, 10), skin);
    fore.position.y = -0.12;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), skin);
    hand.position.y = -0.255;
    hand.scale.set(0.9, 1.15, 0.7);
    elbow.add(hand);
    return { shoulder, elbow, hand };
  };
  const rArm = makeArm(-1); // his right is -x (he faces +z)
  const lArm = makeArm(1);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.035, 4, 6), skin);
  thumb.position.set(0.035, -0.26, 0.02);
  thumb.visible = false;
  rArm.elbow.add(thumb);

  // Head.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), skin);
  neck.position.y = 0.71;
  torso.add(neck);
  const headG = new THREE.Group();
  headG.position.y = 0.82;
  torso.add(headG);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 18), skin);
  skull.scale.set(0.95, 1.06, 1);
  headG.add(skull);
  // Grey short back and sides, bald on top.
  // Hair band round the back and sides only (the front ±0.95 rad is his face).
  const sides = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.121,
      24,
      12,
      Math.PI / 2 + 0.95,
      Math.PI * 2 - 1.9,
      Math.PI * 0.3,
      Math.PI * 0.27,
    ),
    hairM,
  );
  sides.scale.set(0.97, 1.06, 1.0);
  headG.add(sides);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 20), shirt);
  collar.position.y = 0.665;
  collar.rotation.x = Math.PI / 2;
  torso.add(collar);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin);
    ear.position.set(s * 0.115, -0.005, -0.005);
    ear.scale.set(0.5, 1, 0.8);
    headG.add(ear);
  }
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 12, 10),
    std({ color: '#e19b84', roughness: 0.55 }),
  );
  nose.position.set(0, -0.01, 0.118);
  nose.scale.set(0.85, 1, 1.1);
  headG.add(nose);
  // Face canvas.
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceCanvas.height = 256;
  const fg = faceCanvas.getContext('2d') as CanvasRenderingContext2D;
  const faceT = new THREE.CanvasTexture(faceCanvas);
  faceT.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.1205, 24, 16, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.85, 1.7),
    new THREE.MeshStandardMaterial({
      map: faceT,
      transparent: true,
      roughness: 0.6,
      depthWrite: false,
    }),
  );
  face.scale.copy(skull.scale);
  headG.add(face);

  // Stubble: drawn once, composited under every redraw.
  const stubble = document.createElement('canvas');
  stubble.width = stubble.height = 256;
  {
    const g = stubble.getContext('2d') as CanvasRenderingContext2D;
    let s = 7;
    const rnd = (): number => (s = (s * 16807) % 2147483647) / 2147483647;
    g.fillStyle = 'rgba(90,80,72,0.28)';
    for (let i = 0; i < 1400; i++) {
      const a = rnd() * Math.PI;
      const r = 50 + rnd() * 40;
      const x = 128 + Math.cos(a) * r * 0.95;
      const y = 150 + Math.sin(a) * r * 0.75;
      if (y > 150) g.fillRect(x, y, 1.6, 1.6);
    }
  }

  let drawnKey = '';
  const drawFace = (mood: Mood, mouth: Mouth, blink: boolean): void => {
    const key = `${mood}|${mouth}|${blink}`;
    if (key === drawnKey) return;
    drawnKey = key;
    const g = fg;
    g.clearRect(0, 0, 256, 256);
    g.drawImage(stubble, 0, 0);
    if (mood === 'furious') {
      g.fillStyle = 'rgba(220,70,60,.35)';
      g.beginPath();
      g.ellipse(70, 150, 22, 12, 0, 0, 7);
      g.ellipse(186, 150, 22, 12, 0, 0, 7);
      g.fill();
    } else if (mood === 'pleased' || mood === 'impressed') {
      g.fillStyle = 'rgba(230,110,110,.25)';
      g.beginPath();
      g.ellipse(70, 150, 18, 10, 0, 0, 7);
      g.ellipse(186, 150, 18, 10, 0, 0, 7);
      g.fill();
    }
    // Eyes.
    const ey = 112;
    const wide = mood === 'shocked' ? 1.35 : mood === 'impressed' ? 1.15 : 1;
    const eyes: Array<[number, number]> = [
      [0, 92],
      [1, 164],
    ];
    for (const [i, x] of eyes) {
      let lid = 0;
      if (blink) lid = 1;
      else if (mood === 'smug') lid = 0.45;
      else if (mood === 'sceptical' && i === 1) lid = 0.4;
      else if (mood === 'annoyed' || mood === 'furious') lid = 0.25;
      g.fillStyle = '#fbf7f0';
      g.beginPath();
      g.ellipse(x, ey, 19, 14 * wide, 0, 0, 7);
      g.fill();
      g.fillStyle = '#4a6a7a';
      g.beginPath();
      g.arc(x + 1, ey + 1, 9.5 * Math.min(wide, 1.1), 0, 7);
      g.fill();
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(x + 1, ey + 1, 4.6, 0, 7);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x + 4, ey - 2, 1.8, 0, 7);
      g.fill();
      if (lid > 0) {
        g.fillStyle = '#d99f80';
        g.fillRect(x - 21, ey - 16 * wide, 42, 30 * wide * lid + 1);
        g.strokeStyle = '#7a4a36';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x - 19, ey - 16 * wide + 30 * wide * lid);
        g.lineTo(x + 19, ey - 16 * wide + 30 * wide * lid);
        g.stroke();
      }
    }
    // Bushy grey eyebrows.
    g.strokeStyle = '#6e665e';
    g.lineCap = 'round';
    g.lineWidth = 13;
    const brow = (x0: number, y0: number, x1: number, y1: number): void => {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };
    switch (mood) {
      case 'furious':
        brow(70, 84, 110, 100);
        brow(186, 84, 146, 100);
        break;
      case 'annoyed':
        brow(72, 88, 110, 96);
        brow(184, 88, 146, 96);
        break;
      case 'shocked':
        brow(72, 76, 110, 70);
        brow(184, 76, 146, 70);
        break;
      case 'sceptical':
        brow(72, 92, 110, 92);
        brow(146, 80, 184, 72);
        break;
      case 'impressed':
        brow(72, 82, 110, 78);
        brow(184, 82, 146, 78);
        break;
      case 'smug':
        brow(72, 92, 110, 88);
        brow(146, 84, 184, 88);
        break;
      default:
        brow(72, 90, 110, 88);
        brow(184, 90, 146, 88);
    }
    // Moustache.
    g.fillStyle = '#7d756c';
    g.beginPath();
    g.ellipse(112, 168, 26, 9, 0.18, 0, 7);
    g.ellipse(144, 168, 26, 9, -0.18, 0, 7);
    g.fill();
    // Mouth.
    g.strokeStyle = '#6b2a22';
    g.fillStyle = '#5a1e16';
    g.lineWidth = 5;
    const my = 186;
    if (mouth !== 'closed') {
      const h = mouth === 'wide' ? 16 : 9;
      g.beginPath();
      g.ellipse(128, my, mood === 'shocked' ? 12 : 18, h, 0, 0, 7);
      g.fill();
      if (mood === 'furious') {
        g.fillStyle = '#f2ece2';
        g.fillRect(112, my - h * 0.6, 32, 5);
      }
    } else {
      g.beginPath();
      switch (mood) {
        case 'pleased':
        case 'impressed':
          g.arc(128, my - 12, 20, 0.35, Math.PI - 0.35);
          break;
        case 'smug':
        case 'sceptical':
          g.moveTo(108, my + 2);
          g.quadraticCurveTo(132, my + 4, 150, my - 6);
          break;
        case 'annoyed':
        case 'furious':
          g.arc(128, my + 16, 18, Math.PI + 0.5, -0.5);
          break;
        case 'shocked':
          g.ellipse(128, my, 9, 11, 0, 0, 7);
          break;
        default:
          g.moveTo(110, my);
          g.lineTo(146, my);
      }
      g.stroke();
    }
    faceT.needsUpdate = true;
  };
  drawFace('sceptical', 'closed', false);

  // ------------------------------------------------------------ animation state
  const cur: Pose = { ...(POSES.hips as Pose) };
  let gesture: Gesture = 'none';
  let gestureStart = -10;
  let mood: Mood = 'sceptical';
  let moodUntil = 0;
  let nextBlink = 2.5;
  let blinkUntil = 0;
  let headYaw = 0;
  let headPitch = 0;
  const head = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const poseKeys = Object.keys(cur) as Array<keyof Pose>;

  const blend = (target: Pose, k: number): void => {
    for (const key of poseKeys) cur[key] += (target[key] - cur[key]) * k;
  };

  return {
    root,
    head,
    onSay(line, now) {
      mood = line.mood;
      moodUntil = now + line.duration + 2.2;
      if (line.gesture !== 'none') {
        gesture = line.gesture;
        gestureStart = now;
      }
    },
    update(t, dt, now, look) {
      // Base pose for the phase, gesture on top for ~1.9 s.
      let base = 'crossed';
      if (
        t.phase === 'title' ||
        t.phase === 'intro' ||
        t.phase === 'verdict' ||
        t.phase === 'summary'
      )
        base = 'hips';
      else if (t.phase === 'inspect' || t.phase === 'feedback') base = 'holdCup';
      else if (t.phase === 'pour') base = 'leanIn';
      const gAge = now - gestureStart;
      const gPose = GESTURE_POSE[gesture];
      const useGesture = gPose !== undefined && gAge < 1.9 && base !== 'holdCup';
      blend((useGesture ? POSES[gPose] : POSES[base]) as Pose, 1 - Math.exp(-dt * 7));
      thumb.visible = useGesture && gesture === 'thumbsUp';

      const breathe = Math.sin(now * 1.6) * 0.008;
      torso.rotation.x = cur.lean + breathe * 0.5;
      torso.rotation.y = cur.twist;
      torso.position.y = 0.9 + breathe * 0.4 + cur.shrug * 0.3;
      rArm.shoulder.rotation.set(cur.rShX, 0, cur.rShZ);
      lArm.shoulder.rotation.set(cur.lShX, 0, cur.lShZ);
      rArm.shoulder.position.y = 0.56 + cur.shrug;
      lArm.shoulder.position.y = 0.56 + cur.shrug;
      rArm.elbow.rotation.x = cur.rElb;
      lArm.elbow.rotation.x = cur.lElb;
      body.position.x = Math.sin(now * 0.5) * 0.008;

      // Head: look at the target, plus nods/shakes.
      root.updateMatrixWorld();
      inv.copy(torso.matrixWorld).invert();
      tmp.copy(look).applyMatrix4(inv).sub(headG.position);
      const wantYaw = clamp(Math.atan2(tmp.x, tmp.z), -0.9, 0.9);
      const wantPitch = clamp(-Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.45, 0.6);
      const k = 1 - Math.exp(-dt * 6);
      headYaw += (wantYaw - headYaw) * k;
      headPitch += (wantPitch - headPitch) * k;
      let nod = 0;
      let shake = 0;
      if (gAge < 1.4 && gesture === 'nod') nod = Math.sin(gAge * 14) * 0.12 * (1 - gAge / 1.4);
      if (gAge < 1.4 && gesture === 'shakeHead')
        shake = Math.sin(gAge * 16) * 0.18 * (1 - gAge / 1.4);
      if (gAge < 1.9 && gesture === 'facepalm') nod += 0.25;
      if (gAge < 1.9 && gesture === 'tapWatch') nod += 0.3;
      const speaking = t.speech.current !== null;
      const talkBob = speaking ? Math.sin(now * 11) * 0.025 : 0;
      headG.rotation.set(
        headPitch + nod + talkBob,
        headYaw + shake,
        mood === 'sceptical' ? 0.06 : 0,
        'YXZ',
      );
      headG.getWorldPosition(head);

      // Face.
      if (now > moodUntil) {
        if (t.owner.frustration >= 3.5) mood = 'annoyed';
        else mood = t.phase === 'pour' || t.phase === 'steam' ? 'neutral' : 'sceptical';
      }
      if (now > nextBlink) {
        blinkUntil = now + 0.12;
        nextBlink = now + 2.2 + ((now * 7.31) % 2.8);
      }
      let mouth: Mouth = 'closed';
      if (speaking) {
        const step = Math.floor(now * 9.5) % 3;
        mouth = step === 0 ? 'closed' : step === 1 ? 'open' : 'wide';
      }
      drawFace(mood, mouth, now < blinkUntil);
    },
    dispose() {
      disposeTree(root);
      faceT.dispose();
      scene.remove(root);
    },
  };
}
