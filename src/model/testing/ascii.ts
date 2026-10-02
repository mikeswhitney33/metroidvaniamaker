import { encodeTiles, Tile, TILES_PER_CELL } from '../tiles';
import type { Room } from '../types';

/** Characters for drawing rooms in tests and built-in content. */
export const ASCII: Record<string, number> = {
  '.': Tile.Empty,
  ' ': Tile.Empty,
  '#': Tile.Solid,
  '=': Tile.Platform,
  '^': Tile.Spikes,
  '~': Tile.Water,
  L: Tile.Lava,
  s: Tile.ShotBlock,
  b: Tile.BombBlock,
  m: Tile.MissileBlock,
  g: Tile.SuperBlock,
  n: Tile.NovaBlock,
  v: Tile.SpeedBlock,
  x: Tile.BladeBlock,
  c: Tile.Crumble,
};

/**
 * A room from rows of characters. Rows shorter than the room are padded with walls;
 * the size in cells is taken from the rows (rounded up to whole cells).
 */
export function asciiRoom(id: string, x: number, y: number, rows: string[], extra: Partial<Room> = {}): Room {
  const T = TILES_PER_CELL;
  const w = Math.ceil(Math.max(...rows.map((r) => r.length)) / T);
  const h = Math.ceil(rows.length / T);
  const tw = w * T;
  const th = h * T;
  const g = new Uint8Array(tw * th).fill(Tile.Solid);
  rows.forEach((row, ty) => [...row].forEach((ch, tx) => (g[ty * tw + tx] = ASCII[ch] ?? Tile.Solid)));
  return { id, name: id, x, y, w, h, tiles: encodeTiles(g), ...extra };
}
