import type { Room } from './types';

/** Cells that should become rooms, row by row: mask[y][x]. */
export type Mask = boolean[][];

/** Greedy rectangle cover: grow each uncovered cell right, then down while whole rows fit. */
export function maskToRects(mask: Mask): { x: number; y: number; w: number; h: number }[] {
  const h = mask.length;
  const w = h ? mask[0].length : 0;
  const used = mask.map((row) => row.map(() => false));
  const free = (x: number, y: number) => mask[y][x] && !used[y][x];
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!free(x, y)) continue;
      let rw = 1;
      while (x + rw < w && free(x + rw, y)) rw++;
      let rh = 1;
      while (y + rh < h && Array.from({ length: rw }, (_, i) => free(x + i, y + rh)).every(Boolean)) rh++;
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) used[y + j][x + i] = true;
      out.push({ x, y, w: rw, h: rh });
    }
  return out;
}

/** Turns a mask into named rooms, numbering on from `seq`. */
export function maskToRooms(mask: Mask, seq: number): { rooms: Room[]; seq: number } {
  const rooms = maskToRects(mask).map((r, i) => ({ id: `R${seq + i}`, name: `Room ${seq + i}`, ...r }));
  return { rooms, seq: seq + rooms.length };
}

/**
 * Samples an image into a grid: a cell becomes a room when enough of it is "ink",
 * meaning pixels that differ clearly from the image's background (its median brightness).
 * `threshold` 0-100: higher traces fainter, thinner strokes.
 */
export function imageToMask(
  data: Uint8ClampedArray,
  iw: number,
  ih: number,
  gw: number,
  gh: number,
  threshold: number,
): Mask {
  const lum = new Float32Array(iw * ih);
  for (let i = 0; i < iw * ih; i++) lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * (data[i * 4 + 3] / 255);
  const sorted = Float32Array.from(lum).sort();
  const bg = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const need = Math.max(0.02, (100 - threshold) / 100);
  return Array.from({ length: gh }, (_, gy) =>
    Array.from({ length: gw }, (_, gx) => {
      const x0 = Math.floor((gx * iw) / gw);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * iw) / gw));
      const y0 = Math.floor((gy * ih) / gh);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * ih) / gh));
      let ink = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (Math.abs(lum[y * iw + x] - bg) > 60) ink++;
      return ink / ((x1 - x0) * (y1 - y0)) >= need;
    }),
  );
}

export class ImportError extends Error {}

/** Reads a Tiled (.tmj) or LDtk (.ldtk) map: every non-empty tile of the first tile layer becomes a room cell. */
export function mapFileToMask(text: string): Mask {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new ImportError("This file isn't JSON. Export the Tiled map as .tmj (JSON).");
  }
  const o = j as Record<string, unknown>;
  const grid = (data: number[], w: number, h: number): Mask =>
    Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (data[y * w + x] ?? 0) !== 0));
  if (Array.isArray(o.layers)) {
    const layer = (o.layers as Record<string, unknown>[]).find((l) => l.type === 'tilelayer' && Array.isArray(l.data));
    if (!layer) throw new ImportError('The Tiled map has no tile layer with plain (CSV) data.');
    return grid(layer.data as number[], Number(layer.width), Number(layer.height));
  }
  if (Array.isArray(o.levels)) {
    const levels = o.levels as { layerInstances?: Record<string, unknown>[] }[];
    for (const lv of levels)
      for (const l of lv.layerInstances ?? []) {
        if (l.__type === 'IntGrid' && Array.isArray(l.intGridCsv)) return grid(l.intGridCsv as number[], Number(l.__cWid), Number(l.__cHei));
      }
    throw new ImportError('The LDtk project has no IntGrid layer.');
  }
  throw new ImportError("This isn't a Tiled or LDtk map.");
}
