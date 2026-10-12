// The café room: built once, merged per material, never touched again.
import * as THREE from 'three';
import { CT } from './layout';
import { canvasTexture, decoRng as R, redraw, StaticBuilder, std, type Draw2D } from './util';

export interface Cafe {
  /** Redraw text textures once web fonts are ready (AGENTS.md §8). */
  refreshText(): void;
  sun: THREE.DirectionalLight;
  pendants: THREE.PointLight[];
}

const pick = <T>(a: readonly T[]): T => R.pick(a);

export function buildCafe(scene: THREE.Scene): Cafe {
  const room = new StaticBuilder();
  const props = new StaticBuilder();

  // ---------------------------------------------------------------- textures
  const floorT = canvasTexture(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#6b4a33';
      g.fillRect(0, 0, w, h);
      const cols = ['#7a553a', '#6e4b32', '#5f3f29', '#83603f', '#71503a'];
      for (let y = -64; y < h + 64; y += 32)
        for (let x = -64; x < w + 64; x += 64) {
          const o = (y / 32) & 1 ? 32 : 0;
          g.save();
          g.translate(x + o, y);
          g.fillStyle = pick(cols);
          g.fillRect(0, 0, 62, 30);
          g.strokeStyle = 'rgba(0,0,0,.25)';
          g.strokeRect(0, 0, 62, 30);
          g.globalAlpha = 0.08;
          for (let i = 0; i < 6; i++) {
            g.fillStyle = '#000';
            g.fillRect(0, R.range(0, 30), 62, 1);
          }
          g.restore();
        }
    },
    [5, 5],
  );
  const brickT = canvasTexture(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#c9bfb3';
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32)
        for (let x = -64; x < w; x += 64) {
          const o = (y / 32) & 1 ? 32 : 0;
          g.fillStyle = `hsl(${R.range(14, 24)},${R.range(30, 45)}%,${R.range(52, 63)}%)`;
          g.fillRect(x + o + 2, y + 2, 60, 28);
        }
      g.globalAlpha = 0.16;
      for (let i = 0; i < 900; i++) {
        g.fillStyle = R.next() < 0.5 ? '#fff' : '#000';
        g.fillRect(R.range(0, w), R.range(0, h), 2, 2);
      }
    },
    [5, 2],
  );
  const plasterT = canvasTexture(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#e9e2d6';
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.05;
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = R.next() < 0.5 ? '#000' : '#fff';
        g.fillRect(R.range(0, w), R.range(0, h), 2, 2);
      }
    },
    [4, 2],
  );
  const slatT = canvasTexture(
    512,
    256,
    (g, w, h) => {
      for (let x = 0; x < w; x += 16) {
        g.fillStyle = `hsl(28,${R.range(28, 38)}%,${R.range(26, 33)}%)`;
        g.fillRect(x, 0, 14, h);
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.fillRect(x + 14, 0, 2, h);
      }
    },
    [4, 1],
  );
  const terrazzoT = canvasTexture(
    1024,
    512,
    (g, w, h) => {
      g.fillStyle = '#ece6dc';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1100; i++) {
        g.fillStyle = pick(['#d9774b', '#3e6b5a', '#e3b35e', '#8a8378', '#c9c1b3', '#2f3f55']);
        g.beginPath();
        const r = R.range(2, 7);
        g.ellipse(R.range(0, w), R.range(0, h), r, r * R.range(0.5, 1), R.range(0, 3), 0, 7);
        g.fill();
      }
    },
    [7, 1.2],
  );

  const floorM = std({ map: floorT, roughness: 0.55 });
  const brickM = std({ map: brickT, roughness: 0.92 });
  const plasterM = std({ map: plasterT, roughness: 0.95 });
  const ceilM = std({ color: '#2b2420', roughness: 0.95 });
  const frameM = std({ color: '#20302b', roughness: 0.6 });
  const woodM = std({ color: '#7a5536', roughness: 0.6 });
  const darkWoodM = std({ color: '#4a3324', roughness: 0.65 });
  const brassM = std({ color: '#c9a45c', metalness: 0.85, roughness: 0.3 });
  const metalM = std({ color: '#1d1d1d', metalness: 0.6, roughness: 0.4 });
  const tableM = std({ color: '#e9e1d2', roughness: 0.4 });
  const seatM = std({ color: '#b5643f', roughness: 0.6 });
  const potM = std({ color: '#c86f45', roughness: 0.8 });
  const leafM = std({ color: '#3f7a4f', roughness: 0.8 });

  // ---------------------------------------------------------------- room shell
  const RX = 4.6;
  const FZ = -7; // front (street) wall
  const BZ = 1.7; // back wall behind the player
  const H = 3.3;
  room.add(new THREE.PlaneGeometry(RX * 2, BZ - FZ), floorM, 0, 0, (BZ + FZ) / 2, -Math.PI / 2);
  room.add(new THREE.PlaneGeometry(RX * 2, BZ - FZ), ceilM, 0, H, (BZ + FZ) / 2, Math.PI / 2);
  room.add(new THREE.PlaneGeometry(BZ - FZ, H), brickM, -RX, H / 2, (BZ + FZ) / 2, 0, Math.PI / 2);
  room.add(
    new THREE.PlaneGeometry(BZ - FZ, H),
    plasterM,
    RX,
    H / 2,
    (BZ + FZ) / 2,
    0,
    -Math.PI / 2,
  );
  room.add(new THREE.PlaneGeometry(RX * 2, H), plasterM, 0, H / 2, BZ, 0, Math.PI);
  // Front wall with a big shopfront window and a door.
  room.box(RX * 2, 0.75, 0.2, frameM, 0, 0.375, FZ);
  room.box(RX * 2, 0.55, 0.2, frameM, 0, H - 0.275, FZ);
  room.box(0.5, H, 0.2, frameM, -RX + 0.25, H / 2, FZ);
  room.box(0.5, H, 0.2, frameM, RX - 0.25, H / 2, FZ);
  for (const x of [-2.2, 0, 1.4, 2.6])
    room.box(0.08, H - 1.3, 0.14, frameM, x, 0.75 + (H - 1.3) / 2, FZ);
  room.box(1.1, 0.75, 0.2, frameM, 2.0, 0.375, FZ + 0.01); // under door glass
  room.box(5.6, 0.05, 0.36, woodM, -1.6, 0.78, FZ + 0.12); // sill
  const glassM = new THREE.MeshStandardMaterial({
    color: '#cfe6ee',
    transparent: true,
    opacity: 0.08,
    roughness: 0.05,
    metalness: 0.1,
    depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2 - 1, H - 1.3), glassM);
  glass.position.set(0, 0.75 + (H - 1.3) / 2, FZ + 0.02);
  scene.add(glass);

  // Street outside: one painted backdrop (Surry Hills terraces in the early light).
  const streetT = canvasTexture(2048, 640, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, '#9fc3dc');
    sky.addColorStop(1, '#f3d9b5');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const tw = R.range(150, 230);
      const th = R.range(250, 330);
      g.fillStyle = pick(['#c98d6b', '#d9b48a', '#b9746a', '#e3d2b8', '#8fa3a0', '#d6a77a']);
      g.fillRect(x, h * 0.78 - th, tw - 4, th);
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillRect(x + 6, h * 0.78 - th + 70, tw - 16, 10); // iron-lace balcony rail
      for (let i = 0; i < 9; i++)
        g.fillRect(x + 10 + i * ((tw - 24) / 8), h * 0.78 - th + 70, 2, 46);
      g.fillStyle = 'rgba(30,40,50,.55)';
      g.fillRect(x + 22, h * 0.78 - th + 140, tw * 0.3, 70);
      g.fillRect(x + tw * 0.55, h * 0.78 - th + 140, tw * 0.3, 70);
      g.fillRect(x + tw * 0.38, h * 0.78 - 110, tw * 0.24, 110);
      x += tw;
    }
    for (let i = 0; i < 4; i++) {
      const cx = 250 + i * 520;
      g.fillStyle = '#4a3a30';
      g.fillRect(cx - 8, h * 0.45, 16, h * 0.35);
      g.fillStyle = 'rgba(143,111,209,.9)';
      for (let k = 0; k < 14; k++) {
        g.beginPath();
        g.arc(cx + R.range(-110, 110), h * 0.42 + R.range(-70, 40), R.range(40, 70), 0, 7);
        g.fill();
      }
    }
    g.fillStyle = '#8f8a83';
    g.fillRect(0, h * 0.78, w, h * 0.06);
    g.fillStyle = '#3b3e42';
    g.fillRect(0, h * 0.84, w, h * 0.16);
  });
  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 6.9),
    new THREE.MeshBasicMaterial({ map: streetT, toneMapped: false }),
  );
  street.position.set(0, 2.6, FZ - 5);
  scene.add(street);

  // ---------------------------------------------------------------- counter
  const counterFront = std({ map: slatT, roughness: 0.75 });
  const top = std({ map: terrazzoT, roughness: 0.32 });
  props.box(5.2, 0.98, 0.7, counterFront, -0.2, 0.49, -0.9);
  props.box(5.3, 0.06, 0.8, top, -0.2, CT - 0.03, -0.9);
  props.box(5.2, 0.05, 0.05, brassM, -0.2, 0.12, -1.27);
  // Return counter on the right (where the pastry cabinet lives).
  props.box(0.7, 0.98, 1.6, counterFront, 2.75, 0.49, -0.35);
  props.box(0.8, 0.06, 1.7, top, 2.75, CT - 0.03, -0.35);
  // Rubber mats.
  props.box(0.26, 0.008, 0.2, std({ color: '#1f1f1f', roughness: 0.95 }), -0.16, CT + 0.004, -0.66);
  // Knock box + tamping station between grinder and machine.
  props.cyl(0.07, 0.065, 0.12, metalM, -1.55, CT + 0.06, -0.72);
  props.cyl(
    0.055,
    0.055,
    0.008,
    std({ color: '#2a2a2a', roughness: 0.4 }),
    -1.55,
    CT + 0.124,
    -0.72,
  );

  // Back bench + shelves behind the player.
  props.box(4.2, 0.9, 0.6, darkWoodM, -0.3, 0.45, 1.3);
  props.box(4.3, 0.05, 0.65, top, -0.3, 0.92, 1.3);
  for (const y of [1.45, 1.95, 2.45]) props.box(4, 0.04, 0.3, woodM, -0.3, y, 1.53);
  for (let i = 0; i < 18; i++) {
    const c = pick(['#2f5d50', '#c9563a', '#e3b35e', '#1f2b3a', '#efe6d6', '#6b3b1c']);
    props.box(
      0.16,
      R.range(0.18, 0.3),
      0.12,
      std({ color: c, roughness: 0.6 }),
      -2.1 + i * 0.22,
      1.45 + 0.13 + (i % 3) * 0.5,
      1.53,
    );
  }

  // ---------------------------------------------------------------- tables (chairs still up)
  for (const [x, z] of [
    [-2.6, -3.4],
    [-0.4, -4.3],
    [1.9, -3.6],
    [-2.9, -5.6],
    [1.2, -5.7],
  ] as Array<[number, number]>) {
    props.cyl(0.42, 0.42, 0.04, tableM, x, 0.74, z, 28);
    props.cyl(0.03, 0.03, 0.72, metalM, x, 0.37, z, 8);
    props.cyl(0.25, 0.25, 0.02, metalM, x, 0.01, z, 16);
    for (const a of [0.4, 0.4 + Math.PI]) {
      // Chairs flipped onto the table top: seat down, legs up.
      const cx = x + Math.sin(a) * 0.18;
      const cz = z + Math.cos(a) * 0.18;
      props.cyl(0.18, 0.18, 0.04, seatM, cx, 0.78, cz, 16);
      for (const [dx, dz] of [
        [0.11, 0.11],
        [-0.11, 0.11],
        [0.11, -0.11],
        [-0.11, -0.11],
      ] as Array<[number, number]>)
        props.cyl(0.011, 0.011, 0.44, metalM, cx + dx, 1.02, cz + dz, 5);
    }
  }
  // Window bench.
  props.box(5.4, 0.05, 0.42, woodM, -1.6, 1.0, FZ + 0.35);

  // ---------------------------------------------------------------- plants
  const plant = (x: number, z: number, s: number): void => {
    props.cyl(0.18 * s, 0.14 * s, 0.35 * s, potM, x, 0.175 * s, z, 14);
    for (let i = 0; i < 8; i++) {
      props.add(
        new THREE.SphereGeometry(0.16 * s, 8, 6),
        leafM,
        x + R.range(-0.12, 0.12) * s,
        R.range(0.45, 0.9) * s,
        z + R.range(-0.12, 0.12) * s,
        R.range(-0.5, 0.5),
        R.range(0, 3),
        R.range(-0.6, 0.6),
        [1, R.range(1.2, 1.8), 0.5],
      );
    }
  };
  plant(-4.1, -6.4, 1.4);
  plant(4.1, -6.4, 1.2);
  plant(-4.1, 0.9, 1.5);
  plant(4.1, -2.4, 1.1);

  // ---------------------------------------------------------------- pastry cabinet (mostly empty pre-open)
  props.box(0.7, 0.04, 1.2, std({ color: '#222' }), 2.75, CT + 0.02, -0.35);
  props.box(0.66, 0.015, 1.16, std({ color: '#eee' }), 2.75, CT + 0.26, -0.35);
  const cakeM = std({ color: '#d9a95b', roughness: 0.7 });
  for (let i = 0; i < 3; i++)
    props.add(
      new THREE.TorusGeometry(0.045, 0.025, 8, 12, Math.PI),
      cakeM,
      2.7,
      CT + 0.29,
      -0.7 + i * 0.18,
      -Math.PI / 2,
    );
  for (let i = 0; i < 4; i++)
    props.box(0.12, 0.07, 0.09, std({ color: '#8a5a33' }), 2.75, CT + 0.075, -0.75 + i * 0.22);
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.5, 1.2),
    new THREE.MeshStandardMaterial({
      color: '#dff0f5',
      transparent: true,
      opacity: 0.12,
      roughness: 0.05,
      depthWrite: false,
    }),
  );
  cab.position.set(2.75, CT + 0.27, -0.35);
  scene.add(cab);

  // ---------------------------------------------------------------- pendant lights over the counter
  const shadeM = new THREE.MeshStandardMaterial({
    color: '#1f3b33',
    metalness: 0.3,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  const bulbM = new THREE.MeshBasicMaterial({ color: '#ffe2b0' });
  const pendants: THREE.PointLight[] = [];
  for (const x of [-1.5, -0.2, 1.1]) {
    props.cyl(0.004, 0.004, 0.95, metalM, x, H - 0.475, -0.75, 4);
    props.add(new THREE.ConeGeometry(0.17, 0.19, 20, 1, true), shadeM, x, H - 1.0, -0.75);
    props.add(new THREE.SphereGeometry(0.045, 10, 8), bulbM, x, H - 1.08, -0.75);
    const pl = new THREE.PointLight('#ffc98a', 2.4, 0, 2);
    pl.position.set(x, H - 1.13, -0.75);
    scene.add(pl);
    pendants.push(pl);
  }

  // ---------------------------------------------------------------- signs
  const neonDraw: Draw2D = (g, w, h) => {
    g.font = 'italic 400 118px "Bowlby One", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff8a5b';
    g.shadowBlur = 30;
    g.fillStyle = '#ffd9c2';
    g.fillText('no wukkas', w / 2, h / 2);
    g.shadowBlur = 10;
    g.fillText('no wukkas', w / 2, h / 2);
  };
  const neonT = canvasTexture(1024, 256, neonDraw);
  const neon = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 0.7),
    new THREE.MeshBasicMaterial({
      map: neonT,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  neon.position.set(-0.8, H - 0.45, FZ + 0.16);
  scene.add(neon);

  const menuDraw: Draw2D = (g, w, h) => {
    g.fillStyle = '#1d2420';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a6a48';
    g.lineWidth = 26;
    g.strokeRect(0, 0, w, h);
    g.fillStyle = '#f3efe6';
    g.font = '64px "Bowlby One", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('COFFEE', w / 2, 100);
    g.font = '600 30px ui-monospace, Menlo, monospace';
    g.textAlign = 'left';
    const items = [
      ['Flat white', '5.20'],
      ['Latte / Cap', '5.20'],
      ['Long black', '4.80'],
      ['Magic', '5.00'],
      ['Piccolo', '4.60'],
      ['Mocha', '5.80'],
      ['Chai latte', '5.50'],
      ['Iced long black', '5.40'],
      ['Hot chocky', '5.00'],
      ['Babycino', '2.00'],
    ];
    items.forEach(([a, b], i) => {
      const col = i < 5 ? 0 : 1;
      const y = 180 + (i % 5) * 72;
      g.fillStyle = '#f3efe6';
      g.fillText(a as string, 70 + col * 470, y);
      g.fillStyle = '#f0c060';
      g.fillText(b as string, 340 + col * 470, y);
    });
    g.fillStyle = '#9fc9b3';
    g.font = 'italic 28px Figtree, sans-serif';
    g.textAlign = 'center';
    g.fillText('Now hiring baristas. Ask Gaz (at your own risk).', w / 2, h - 60);
  };
  const menuT = canvasTexture(1024, 640, menuDraw);
  const menu = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.5),
    std({ map: menuT, roughness: 0.95 }),
  );
  menu.position.set(-RX + 0.02, 2.05, -2.6);
  menu.rotation.y = Math.PI / 2;
  scene.add(menu);

  const posterDraw: Draw2D = (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#f2b25e');
    gr.addColorStop(0.6, '#e46f4a');
    gr.addColorStop(1, '#2f4f6f');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a2330';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(w / 2, h * 0.95, w * 0.42, Math.PI, 0);
    g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + (i * Math.PI) / 13;
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * w * 0.42, h * 0.95 + Math.sin(a) * w * 0.42);
      g.lineTo(w / 2 + Math.cos(a) * w * 0.42, h * 0.8);
      g.stroke();
    }
    g.fillStyle = '#fff6e6';
    g.font = '60px "Bowlby One", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('SYDNEY', w / 2, 120);
    g.font = '600 26px Figtree, sans-serif';
    g.fillText('CROWN ST · SURRY HILLS', w / 2, 165);
  };
  const posterT = canvasTexture(512, 700, posterDraw);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.23), std({ map: posterT }));
  poster.position.set(RX - 0.02, 1.85, -1.4);
  poster.rotation.y = -Math.PI / 2;
  scene.add(poster);

  room.build(scene, false, true);
  props.build(scene, true, true);

  // ---------------------------------------------------------------- light
  scene.add(new THREE.HemisphereLight('#fff1dc', '#3a2a20', 0.7));
  const sun = new THREE.DirectionalLight('#ffe0b8', 2.4);
  sun.position.set(-5, 7, -14);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const work = new THREE.SpotLight('#fff0dc', 9, 4, 0.75, 0.6, 2);
  work.position.set(-0.6, 2.6, 0.4);
  work.target.position.set(-0.8, CT, -0.8);
  scene.add(work, work.target);

  return {
    refreshText() {
      redraw(neonT, neonDraw);
      redraw(menuT, menuDraw);
      redraw(posterT, posterDraw);
    },
    sun,
    pendants,
  };
}
