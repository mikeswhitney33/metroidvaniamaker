import { Tile } from '../model/tiles';
import type { StylePreset } from '../model/types';
import { drawTiles } from './render';

/**
 * Tileset image layout, in cells of the project's tile size, 4 columns by 7 rows:
 * rows 0-3 are solid wall pieces picked by which neighbours are also solid
 * (index = up 1 + right 2 + down 4 + left 8), and rows 4-6 hold one tile each for
 * platform, spikes, water, lava, then the shot, bomb, missile, super, nova, speed and
 * blade blocks, and crumble. A cell left transparent falls back to the built-in look.
 */
export const TILESET_COLS = 4;
export const TILESET_ROWS = 7;
const OTHER: number[] = [
  Tile.Platform,
  Tile.Spikes,
  Tile.Water,
  Tile.Lava,
  Tile.ShotBlock,
  Tile.BombBlock,
  Tile.MissileBlock,
  Tile.SuperBlock,
  Tile.NovaBlock,
  Tile.SpeedBlock,
  Tile.BladeBlock,
  Tile.Crumble,
];
export const OTHER_LABELS = ['Platform', 'Spikes', 'Water', 'Lava', 'Shot', 'Bomb', 'Missile', 'Super', 'Nova', 'Speed', 'Blade', 'Crumble'];

/** Cell index in the tileset for a tile, given its neighbours; -1 for empty. */
export function tilesetIndex(t: number, at: (dx: number, dy: number) => number): number {
  if (t === Tile.Empty) return -1;
  if (t === Tile.Solid) {
    const solid = (v: number) => v === Tile.Solid || (v >= Tile.ShotBlock && v <= Tile.Crumble);
    return (solid(at(0, -1)) ? 1 : 0) + (solid(at(1, 0)) ? 2 : 0) + (solid(at(0, 1)) ? 4 : 0) + (solid(at(-1, 0)) ? 8 : 0);
  }
  const i = OTHER.indexOf(t);
  return i < 0 ? -1 : 16 + i;
}

export interface Tileset {
  img: CanvasImageSource;
  /** Cell size in image pixels. */
  ts: number;
  /** Which cells have any pixels drawn. */
  filled: boolean[];
}

const cache = new WeakMap<HTMLImageElement, Map<number, Tileset | null>>();

/** The image read as a tileset at `ts` pixels per cell, or null until it has loaded. */
export function tilesetOf(img: HTMLImageElement | undefined, ts: number): Tileset | null {
  if (!img || !img.complete || !img.naturalWidth || typeof document === 'undefined') return null;
  let m = cache.get(img);
  if (!m) cache.set(img, (m = new Map()));
  if (m.has(ts)) return m.get(ts)!;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  let out: Tileset | null = null;
  if (ctx) {
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const filled: boolean[] = [];
    for (let i = 0; i < TILESET_COLS * TILESET_ROWS; i++) {
      const cx = (i % TILESET_COLS) * ts;
      const cy = Math.floor(i / TILESET_COLS) * ts;
      let any = false;
      for (let y = cy; y < cy + ts && y < c.height && !any; y++) for (let x = cx; x < cx + ts && x < c.width; x++) if (data[(y * c.width + x) * 4 + 3] > 8) (any = true);
      filled.push(any);
    }
    out = { img, ts, filled };
  }
  m.set(ts, out);
  return out;
}

/** Draws tiles from a tileset, falling back to the palette look for cells the tileset leaves empty. */
export function drawTileset(
  ctx: CanvasRenderingContext2D,
  at: (x: number, y: number) => number,
  tw: number,
  th: number,
  set: Tileset,
  P: Pick<StylePreset, 'wall' | 'edge'>,
  s: number,
  ox: number,
  oy: number,
  opts: { liquids?: boolean } = {},
) {
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < th; y++)
    for (let x = 0; x < tw; x++) {
      const t = at(x, y);
      if (opts.liquids === false && (t === Tile.Water || t === Tile.Lava)) continue;
      const i = tilesetIndex(t, (dx, dy) => at(x + dx, y + dy));
      if (i < 0) continue;
      if (set.filled[i]) ctx.drawImage(set.img, (i % TILESET_COLS) * set.ts, Math.floor(i / TILESET_COLS) * set.ts, set.ts, set.ts, ox + x * s, oy + y * s, s, s);
      else drawTiles(ctx, at, tw, P, s, ox, oy, x, y, x + 1, y + 1, opts);
    }
  ctx.imageSmoothingEnabled = smooth;
}

/**
 * A starter tileset image in the layout above, drawn in the palette's colours with each
 * cell labelled, as a PNG data URL. Authors paint over it.
 */
export function tilesetTemplate(P: StylePreset, ts: number): string {
  const c = document.createElement('canvas');
  c.width = TILESET_COLS * ts;
  c.height = TILESET_ROWS * ts;
  const ctx = c.getContext('2d')!;
  for (let mask = 0; mask < 16; mask++) {
    const X = (mask % TILESET_COLS) * ts;
    const Y = Math.floor(mask / TILESET_COLS) * ts;
    ctx.fillStyle = P.wall;
    ctx.fillRect(X, Y, ts, ts);
    ctx.fillStyle = P.edge;
    const e = Math.max(1, Math.round(ts / 8));
    if (!(mask & 1)) ctx.fillRect(X, Y, ts, e);
    if (!(mask & 2)) ctx.fillRect(X + ts - e, Y, e, ts);
    if (!(mask & 4)) ctx.fillRect(X, Y + ts - e, ts, e);
    if (!(mask & 8)) ctx.fillRect(X, Y, e, ts);
  }
  OTHER.forEach((t, i) => {
    const X = (i % TILESET_COLS) * ts;
    const Y = (4 + Math.floor(i / TILESET_COLS)) * ts;
    drawTiles(ctx, (x, y) => (x === 0 && y === 0 ? t : Tile.Empty), 1, P, ts, X, Y, 0, 0, 1, 1);
  });
  return c.toDataURL('image/png');
}
