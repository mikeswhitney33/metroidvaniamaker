import { adj } from '../model/graph';
import { decodeTiles, isFloor, Tile, TILES_PER_CELL, tileSize } from '../model/tiles';
import type { Room } from '../model/types';

export { TILES_PER_CELL };
const T = TILES_PER_CELL;

/** A room baked into a tile grid of `Tile` values. */
export interface WorldRoom extends Room {
  tx: number;
  ty: number;
  tw: number;
  th: number;
  g: Uint8Array;
}

const setter = (g: Uint8Array, tw: number, th: number) => (x: number, y: number, v: number) => {
  if (x >= 0 && y >= 0 && x < tw && y < th) g[y * tw + x] = v;
};

/** Generated starting tiles for a room: walls all round, and climbable ledges in tall rooms. */
export function roughIn(r: Pick<Room, 'w' | 'h'>): Uint8Array {
  const { tw, th } = tileSize(r);
  const g = new Uint8Array(tw * th);
  const set = setter(g, tw, th);
  for (let x = 0; x < tw; x++) {
    set(x, 0, Tile.Solid);
    set(x, th - 1, Tile.Solid);
  }
  for (let y = 0; y < th; y++) {
    set(0, y, Tile.Solid);
    set(tw - 1, y, Tile.Solid);
  }
  if (th > 8) {
    const mid = Math.floor(tw / 2);
    let k = 0;
    for (let y = th - 5; y >= 3; y -= 4, k++) {
      const a = k % 2 === 0 ? 1 : mid + 1;
      const b = k % 2 === 0 ? mid - 2 : tw - 2;
      for (let x = a; x <= b; x++) set(x, y, Tile.Solid);
    }
  }
  return g;
}

/** The room's own tiles: what the author painted, or the generated rough-in. */
export function baseTiles(r: Room): Uint8Array {
  return (r.tiles && decodeTiles(r.tiles, r)) || roughIn(r);
}

/** Turns editor rooms into tile rooms, carving doorways where rooms touch. */
export function buildWorld(rooms: Room[]): WorldRoom[] {
  const W: WorldRoom[] = rooms.map((r) => {
    const { tw, th } = tileSize(r);
    return { ...r, tx: r.x * T, ty: r.y * T, tw, th, g: baseTiles(r).slice() };
  });

  W.forEach((a) =>
    W.forEach((b) => {
      if (a === b) return;
      const j = adj(a, b);
      if (!j) return;
      const set = setter(a.g, a.tw, a.th);
      if (j.v) {
        // Side doorway at the bottom of the shared span, with a small step below it.
        const lx = j.at === a.x ? 0 : a.tw - 1;
        const dir = lx === 0 ? 1 : -1;
        const hi = j.hi * T - a.ty;
        for (let i = 0; i <= 4; i++) for (let y = hi - 4; y <= hi - 2; y++) set(lx + dir * i, y, 0);
        if (hi - 1 < a.th - 1) for (let i = 1; i <= 4; i++) set(lx + dir * i, hi - 1, 1);
      } else {
        // Floor/ceiling hatch across the shared span.
        const ly = j.at === a.y ? 0 : a.th - 1;
        const x0 = j.lo * T + 2 - a.tx;
        const x1 = j.hi * T - 3 - a.tx;
        for (let x = x0; x <= x1; x++) set(x, ly, 0);
        if (ly === 0 && a.tw > 12) {
          for (let x = x0 - 1; x <= x1 + 1; x++) {
            if (x < 1 || x > a.tw - 2) continue;
            for (let y = 1; y <= 3; y++) set(x, y, 0);
            set(x, 4, 1);
          }
        }
      }
    }),
  );
  return W;
}

/** Lowest standable floor nearest the middle of a room, in world tiles (y = the floor tile's top). */
export function floorSpot(r: WorldRoom): { x: number; y: number } {
  const c = Math.floor(r.tw / 2);
  const at = (x: number, y: number) => r.g[y * r.tw + x];
  for (let y = r.th - 1; y >= 2; y--) {
    for (let d = 0; d < r.tw; d++) {
      for (const x of [c + d, c - d]) {
        if (x > 0 && x < r.tw - 1 && isFloor(at(x, y)) && at(x, y - 1) === Tile.Empty && at(x, y - 2) === Tile.Empty) {
          return { x: r.tx + x + 0.5, y: r.ty + y };
        }
      }
    }
  }
  return { x: r.tx + c, y: r.ty + r.th - 1 };
}
