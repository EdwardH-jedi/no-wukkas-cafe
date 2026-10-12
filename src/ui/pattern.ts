// Draws a poured pattern as a flat picture for the result card: rotated 180° (the way Gaz turns
// the cup round to look at it) with his best-fit heart outline over the top.

import { GRID } from '../sim/latte/field';
import { heartTemplate } from '../sim/latte/heart';
import type { PatternScore } from '../sim/latte/score';

const CREMA: [number, number, number] = [150, 98, 56];
const FOAM: [number, number, number] = [250, 243, 230];

export function drawPattern(
  canvas: HTMLCanvasElement,
  foam: Float32Array,
  score: PatternScore | null,
  overlay = true,
): void {
  const size = canvas.width;
  const g = canvas.getContext('2d');
  if (!g) return;
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Canvas → field, rotated 180°: left/right and near/far swap.
      const fx = 1 - ((px + 0.5) / size) * 2;
      const fy = ((py + 0.5) / size) * 2 - 1;
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
  if (!overlay || !score || score.fit.scale <= 0) return;
  const t = heartTemplate();
  const { angle, x, y, scale } = score.fit;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  g.save();
  g.strokeStyle = 'rgba(243,196,80,0.95)';
  g.lineWidth = Math.max(1.5, size / 110);
  g.setLineDash([size / 40, size / 60]);
  g.beginPath();
  t.outline.forEach(([ox, oy], i) => {
    const fx = x + (ox * cos - oy * sin) * scale;
    const fy = y + (ox * sin + oy * cos) * scale;
    const px = ((1 - fx) / 2) * size;
    const py = ((fy + 1) / 2) * size;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.closePath();
  g.stroke();
  g.restore();
}
