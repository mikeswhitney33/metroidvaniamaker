import { Tile, tileSize } from './tiles';
import type { Room } from './types';
import { roughIn } from './world';

/** Starting layouts for a room's tiles. Each fills the whole room; doorways are still carved on top. */
export interface RoomTemplate {
  id: string;
  name: string;
  desc: string;
  build(r: Pick<Room, 'w' | 'h'>): Uint8Array;
}

function box(r: Pick<Room, 'w' | 'h'>) {
  const { tw, th } = tileSize(r);
  const g = new Uint8Array(tw * th);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < tw && y < th) g[y * tw + x] = v;
  };
  const fill = (x0: number, y0: number, x1: number, y1: number, v: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v);
  };
  fill(0, 0, tw - 1, 0, Tile.Solid);
  fill(0, th - 1, tw - 1, th - 1, Tile.Solid);
  fill(0, 0, 0, th - 1, Tile.Solid);
  fill(tw - 1, 0, tw - 1, th - 1, Tile.Solid);
  return { g, tw, th, set, fill };
}

export const TEMPLATES: RoomTemplate[] = [
  { id: 'rough', name: 'Generated', desc: 'Walls all round, ledges in tall rooms.', build: roughIn },
  {
    id: 'empty',
    name: 'Empty box',
    desc: 'Just the walls.',
    build: (r) => box(r).g,
  },
  {
    id: 'shaft',
    name: 'Climbing shaft',
    desc: 'Platforms zig-zag up a tall room, each within a normal jump.',
    build: (r) => {
      const { g, tw, th, fill } = box(r);
      let k = 0;
      for (let y = th - 5; y >= 3; y -= 4, k++) {
        const w = Math.max(3, Math.floor(tw / 3));
        const x = k % 2 === 0 ? 1 : tw - 1 - w;
        fill(x, y, x + w - 1, y, Tile.Platform);
      }
      return g;
    },
  },
  {
    id: 'arena',
    name: 'Boss arena',
    desc: 'A flat floor with two raised ledges to dodge onto.',
    build: (r) => {
      const { g, tw, th, fill } = box(r);
      const y = th - 6;
      if (y > 3) {
        fill(2, y, Math.max(4, Math.floor(tw * 0.2)), y, Tile.Platform);
        fill(tw - 1 - Math.max(3, Math.floor(tw * 0.2)), y, tw - 3, y, Tile.Platform);
      }
      return g;
    },
  },
  {
    id: 'pool',
    name: 'Flooded room',
    desc: 'Water fills the lower half; a platform runs above it.',
    build: (r) => {
      const { g, tw, th, fill } = box(r);
      fill(1, Math.floor(th / 2), tw - 2, th - 2, Tile.Water);
      fill(Math.floor(tw / 3), Math.floor(th / 2) - 3, Math.floor((tw * 2) / 3), Math.floor(th / 2) - 3, Tile.Platform);
      return g;
    },
  },
  {
    id: 'lava',
    name: 'Lava pit',
    desc: 'A lava floor crossed by stepping stones.',
    build: (r) => {
      const { g, tw, th, fill } = box(r);
      fill(1, th - 3, tw - 2, th - 2, Tile.Lava);
      fill(1, th - 4, 3, th - 4, Tile.Solid);
      fill(tw - 4, th - 4, tw - 2, th - 4, Tile.Solid);
      for (let x = 6; x < tw - 6; x += 5) fill(x, th - 5, x + 1, th - 5, Tile.Solid);
      return g;
    },
  },
  {
    id: 'tunnel',
    name: 'Roll tunnel',
    desc: 'A one-tile crawlspace along the floor (needs Roll Form).',
    build: (r) => {
      const { g, tw, th, fill } = box(r);
      fill(1, 1, tw - 2, th - 3, Tile.Solid);
      fill(1, th - 2, tw - 2, th - 2, Tile.Empty);
      return g;
    },
  },
];
