import { describe, expect, it } from 'vitest';
import { encodeTiles, Tile } from '../model/tiles';
import type { Room } from '../model/types';
import { baseTiles, buildWorld, floorSpot, roughIn } from './world';

const room = (id: string, x: number, y: number, w: number, h: number, tiles?: string): Room => ({
  id,
  name: id,
  x,
  y,
  w,
  h,
  ...(tiles ? { tiles } : {}),
});

describe('world', () => {
  it('uses painted tiles when they fit the room', () => {
    const g = roughIn({ w: 2, h: 2 });
    g[16 + 5] = Tile.Spikes;
    const r = room('A', 0, 0, 2, 2, encodeTiles(g));
    expect(baseTiles(r)).toEqual(g);
  });

  it('falls back to the rough-in for a mismatched layer', () => {
    expect(baseTiles(room('A', 0, 0, 2, 2, '0101'))).toEqual(roughIn({ w: 2, h: 2 }));
  });

  it('carves a doorway through painted walls where rooms touch', () => {
    const solid = encodeTiles(new Uint8Array(16 * 16).fill(Tile.Solid));
    const [a] = buildWorld([room('A', 0, 0, 2, 2, solid), room('B', 2, 0, 2, 2)]);
    // Right wall, a few tiles above the floor, is open.
    expect(a.g[13 * a.tw + a.tw - 1]).toBe(Tile.Empty);
  });

  it('puts the floor spot on a painted platform when the floor is a pit', () => {
    const g = new Uint8Array(16 * 16);
    for (let x = 0; x < 16; x++) g[10 * 16 + x] = Tile.Platform;
    const [r] = buildWorld([room('A', 0, 0, 2, 2, encodeTiles(g))]);
    expect(floorSpot(r)).toEqual({ x: 8.5, y: 10 });
  });
});
