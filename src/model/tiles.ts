import type { Room } from './types';

/** Tiles per editor grid cell. */
export const TILES_PER_CELL = 8;

/** What a tile is. Stored as one character per tile in `Room.tiles`: 0-9, then a-d. */
export const Tile = {
  Empty: 0,
  Solid: 1,
  /** One-way: stand on it from above, jump up through it. */
  Platform: 2,
  /** Hurts and knocks the player back. */
  Spikes: 3,
  /** Slows movement and jumping unless the player has the Tide Suit. */
  Water: 4,
  /** Burns unless the player has the Thermal Suit. */
  Lava: 5,
  /** Breakable blocks, each opened by a different capability. */
  ShotBlock: 6,
  BombBlock: 7,
  MissileBlock: 8,
  SuperBlock: 9,
  NovaBlock: 10,
  SpeedBlock: 11,
  BladeBlock: 12,
  /** Gives way a moment after it's stood on, then grows back. */
  Crumble: 13,
} as const;
export type TileKind = (typeof Tile)[keyof typeof Tile];

export interface TileInfo {
  kind: TileKind;
  label: string;
  /** Painter shortcut. */
  key?: string;
  /** Capability that breaks it (blocks only). */
  breaks?: string;
  /** Map/painter colour. */
  color: string;
}

export const TILE_INFO: TileInfo[] = [
  { kind: Tile.Solid, label: 'Solid', key: '1', color: '#8a8299' },
  { kind: Tile.Platform, label: 'Platform', key: '2', color: '#b8b0c8' },
  { kind: Tile.Spikes, label: 'Spikes', key: '3', color: '#ff6b6b' },
  { kind: Tile.Water, label: 'Water', key: '4', color: '#3f86d6' },
  { kind: Tile.Lava, label: 'Lava', key: '5', color: '#ff7a2f' },
  { kind: Tile.ShotBlock, label: 'Shot block', key: '6', breaks: 'shot', color: '#9fb4c8' },
  { kind: Tile.BombBlock, label: 'Bomb block', key: '7', breaks: 'bomb', color: '#c9a35b' },
  { kind: Tile.MissileBlock, label: 'Missile block', key: '8', breaks: 'missile', color: '#e0584f' },
  { kind: Tile.SuperBlock, label: 'Super block', key: '9', breaks: 'super', color: '#4fbf6a' },
  { kind: Tile.NovaBlock, label: 'Nova block', breaks: 'nova', color: '#e8c94a' },
  { kind: Tile.SpeedBlock, label: 'Speed block', breaks: 'speed', color: '#62d0e6' },
  { kind: Tile.BladeBlock, label: 'Blade block', breaks: 'blade', color: '#c27ee8' },
  { kind: Tile.Crumble, label: 'Crumble', color: '#7c6f60' },
  { kind: Tile.Empty, label: 'Empty', key: '0', color: '#000000' },
];

export const tileInfo = (t: number): TileInfo | undefined => TILE_INFO.find((i) => i.kind === t);

/** Blocks the player's body (breakable blocks count until broken). */
export const isSolid = (t: number) => t === Tile.Solid || (t >= Tile.ShotBlock && t <= Tile.Crumble);
/** Feet land on these. */
export const isFloor = (t: number) => isSolid(t) || t === Tile.Platform;
export const isBlock = (t: number) => t >= Tile.ShotBlock && t <= Tile.BladeBlock;
export const isLiquid = (t: number) => t === Tile.Water || t === Tile.Lava;

export function tileSize(r: Pick<Room, 'w' | 'h'>): { tw: number; th: number } {
  return { tw: r.w * TILES_PER_CELL, th: r.h * TILES_PER_CELL };
}

const CHARS = '0123456789abcd';

export function encodeTiles(g: Uint8Array): string {
  return Array.from(g, (v) => CHARS[v] ?? '0').join('');
}

/** Null unless `s` is a tile layer of exactly the room's size. */
export function decodeTiles(s: string, r: Pick<Room, 'w' | 'h'>): Uint8Array | null {
  const { tw, th } = tileSize(r);
  if (s.length !== tw * th || !/^[0-9a-d]*$/.test(s)) return null;
  return Uint8Array.from(s, (c) => CHARS.indexOf(c));
}
