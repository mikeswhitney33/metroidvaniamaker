import type { Room } from './types';

/** Tiles per editor grid cell. */
export const TILES_PER_CELL = 8;

/** What a tile is. Stored as one digit per tile in `Room.tiles`. */
export const Tile = {
  Empty: 0,
  Solid: 1,
  /** One-way: stand on it from above, jump up through it. */
  Platform: 2,
  /** Sends the player back to where they entered the room. */
  Spikes: 3,
} as const;
export type TileKind = (typeof Tile)[keyof typeof Tile];

export const TILE_KINDS: { kind: TileKind; label: string; key: string }[] = [
  { kind: Tile.Solid, label: 'Solid', key: '1' },
  { kind: Tile.Platform, label: 'Platform', key: '2' },
  { kind: Tile.Spikes, label: 'Spikes', key: '3' },
  { kind: Tile.Empty, label: 'Empty', key: '4' },
];

/** Feet land on these. */
export const isFloor = (t: number) => t === Tile.Solid || t === Tile.Platform;

export function tileSize(r: Pick<Room, 'w' | 'h'>): { tw: number; th: number } {
  return { tw: r.w * TILES_PER_CELL, th: r.h * TILES_PER_CELL };
}

export function encodeTiles(g: Uint8Array): string {
  return Array.from(g, (v) => String(v)).join('');
}

/** Null unless `s` is a tile layer of exactly the room's size. */
export function decodeTiles(s: string, r: Pick<Room, 'w' | 'h'>): Uint8Array | null {
  const { tw, th } = tileSize(r);
  if (s.length !== tw * th || !/^[0-3]*$/.test(s)) return null;
  return Uint8Array.from(s, (c) => c.charCodeAt(0) - 48);
}
