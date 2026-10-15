// Draws a poured pattern as a flat picture for the result card: rotated 180° (the way Gaz turns
// the cup round to look at it) with his best-fit heart outline over the top. Practice adds the
// guide heart (where a textbook heart sits) and a mark from the cup centre to the white's centre.

import { GRID } from '../sim/latte/field';
import { GUIDE_SCALE, heartTemplate } from '../sim/latte/heart';
import type { PatternScore } from '../sim/latte/score';

export interface PatternExtras {
  /** Draw it as the barista sees it (far side up) rather than turned round for the customer. */
  barista?: boolean;
  /** The guide heart: textbook size, centred. */
  guide?: boolean;
  /** Cup centre, the white's centre, and a line between them. */
  centroid?: boolean;
}

const CREMA: [number, number, number] = [150, 98, 56];
const FOAM: [number, number, number] = [250, 243, 230];

export function drawPattern(
  canvas: HTMLCanvasElement,
  foam: Float32Array,
  score: PatternScore | null,
  overlay = true,
  extras: PatternExtras = {},
): void {
  const size = canvas.width;
  const flip = extras.barista !== true;
  const g = canvas.getContext('2d');
  if (!g) return;
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Canvas → field, rotated 180°: left/right and near/far swap (unless the barista's view).
      const u = ((px + 0.5) / size) * 2;
      const v = ((py + 0.5) / size) * 2;
      const fx = flip ? 1 - u : u - 1;
      const fy = flip ? v - 1 : 1 - v;
      const o = (py * size + px) * 4;
      const r2 = fx * fx + fy * fy;
      if (r2 > 1) {
        d[o + 3] = 0;
        continue;
      }
      const gx = Math.min(GRID - 1, Math.max(0, Math.floor(((fx + 1) / 2) * GRID)));
      const gy = Math.min(GRID - 1, Math.max(0, Math.floor(((fy + 1) / 2) * GRID)));
      const f = foam[gy * GRID + gx] as number;
      const w = Math.min(1, Math.max(0, (f - 0.38) / 0.24));
      const mud = Math.min(1, Math.max(0, (f - 0.08) / 0.4)) * 0.5;
      const rim = r2 > 0.8 ? 1 - (r2 - 0.8) * 1.2 : 1;
      for (let c = 0; c < 3; c++) {
        const base = (CREMA[c] as number) * rim;
        const m = base + ((FOAM[c] as number) * 0.8 - base) * mud;
        d[o + c] = m + ((FOAM[c] as number) - m) * w;
      }
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Field → canvas (rotated 180° unless the barista's view).
  const cx = (fx: number): number => ((flip ? 1 - fx : fx + 1) / 2) * size;
  const cy = (fy: number): number => ((flip ? fy + 1 : 1 - fy) / 2) * size;
  const t = heartTemplate();
  const heart = (x: number, y: number, scale: number, angle: number): void => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    g.beginPath();
    t.outline.forEach(([ox, oy], i) => {
      const px = cx(x + (ox * cos - oy * sin) * scale);
      const py = cy(y + (ox * sin + oy * cos) * scale);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.stroke();
  };
  g.save();
  g.lineWidth = Math.max(1.5, size / 110);
  if (extras.guide) {
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.setLineDash([size / 70, size / 50]);
    heart(0, 0, GUIDE_SCALE, 0);
  }
  if (overlay && score && score.fit.scale > 0) {
    g.strokeStyle = 'rgba(243,196,80,0.95)';
    g.setLineDash([size / 40, size / 60]);
    heart(score.fit.x, score.fit.y, score.fit.scale, score.fit.angle);
  }
  if (extras.centroid && score && score.coverage > 0) {
    const r = size / 60;
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(cx(0) - r, cy(0));
    g.lineTo(cx(0) + r, cy(0));
    g.moveTo(cx(0), cy(0) - r);
    g.lineTo(cx(0), cy(0) + r);
    g.stroke();
    g.strokeStyle = 'rgba(224,81,63,0.95)';
    g.beginPath();
    g.moveTo(cx(0), cy(0));
    g.lineTo(cx(score.cx), cy(score.cy));
    g.stroke();
    g.fillStyle = 'rgba(224,81,63,0.95)';
    g.beginPath();
    g.arc(cx(score.cx), cy(score.cy), r * 0.7, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
