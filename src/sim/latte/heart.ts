// Procedural heart template used to judge latte art.
// Template space: the heart's centroid sits at the origin, its area is 1, and the tip points
// toward +y (the far side of the cup, the way a barista pulls through).

const RES = 256;
const EXTENT = 1.25; // template lookup covers [-EXTENT, EXTENT]²

function outline(samples: number): Array<[number, number]> {
  // A rounder, latte-style heart: fuller lobes and a shorter cleft than the emoji curve.
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y =
      13 * Math.cos(t) - 4.2 * Math.cos(2 * t) - 1.7 * Math.cos(3 * t) - 0.7 * Math.cos(4 * t);
    pts.push([x, -y]); // flip: lobes toward -y (barista), tip toward +y
  }
  return pts;
}

function polygonArea(p: Array<[number, number]>): { area: number; cx: number; cy: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i] as [number, number];
    const [x1, y1] = p[(i + 1) % p.length] as [number, number];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  a /= 2;
  return { area: Math.abs(a), cx: cx / (6 * a), cy: cy / (6 * a) };
}

function inside(p: Array<[number, number]>, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i] as [number, number];
    const [xj, yj] = p[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export interface HeartTemplate {
  /** 1 where the unit-area heart covers the lookup cell. */
  mask: Uint8Array;
  res: number;
  extent: number;
  /** Normalised outline, for drawing the owner's overlay. */
  outline: Array<[number, number]>;
}

function build(): HeartTemplate {
  const raw = outline(240);
  const { area, cx, cy } = polygonArea(raw);
  const k = 1 / Math.sqrt(area);
  const norm = raw.map(([x, y]) => [(x - cx) * k, (y - cy) * k] as [number, number]);
  const mask = new Uint8Array(RES * RES);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = ((i + 0.5) / RES) * 2 * EXTENT - EXTENT;
      const y = ((j + 0.5) / RES) * 2 * EXTENT - EXTENT;
      mask[j * RES + i] = inside(norm, x, y) ? 1 : 0;
    }
  }
  return { mask, res: RES, extent: EXTENT, outline: norm };
}

let cached: HeartTemplate | null = null;
export function heartTemplate(): HeartTemplate {
  cached ??= build();
  return cached;
}

/** Is template-space point (x, y) inside the unit-area heart? */
export function inHeart(t: HeartTemplate, x: number, y: number): boolean {
  const i = Math.floor(((x + t.extent) / (2 * t.extent)) * t.res);
  const j = Math.floor(((y + t.extent) / (2 * t.extent)) * t.res);
  if (i < 0 || j < 0 || i >= t.res || j >= t.res) return false;
  return t.mask[j * t.res + i] === 1;
}
