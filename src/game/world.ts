import { adj } from '../model/graph';
import type { Room } from '../model/types';

/** Tiles per editor grid cell. */
export const TILES_PER_CELL = 8;
const T = TILES_PER_CELL;

/** A room baked into a tile grid; 1 = solid, 0 = open. */
export interface WorldRoom extends Room {
  tx: number;
  ty: number;
  tw: number;
  th: number;
  g: Uint8Array;
}

/** Turns editor rooms into walled tile rooms with platforms and doorways where rooms touch. */
export function buildWorld(rooms: Room[]): WorldRoom[] {
  const setter = (r: WorldRoom) => (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < r.tw && y < r.th) r.g[y * r.tw + x] = v;
  };
  const W: WorldRoom[] = rooms.map((r) => {
    const tw = r.w * T;
    const th = r.h * T;
    const wr: WorldRoom = { ...r, tx: r.x * T, ty: r.y * T, tw, th, g: new Uint8Array(tw * th) };
    const set = setter(wr);
    for (let x = 0; x < tw; x++) {
      set(x, 0, 1);
      set(x, th - 1, 1);
    }
    for (let y = 0; y < th; y++) {
      set(0, y, 1);
      set(tw - 1, y, 1);
    }
    // Tall rooms get alternating ledges so they can be climbed.
    if (th > 8) {
      const mid = Math.floor(tw / 2);
      let k = 0;
      for (let y = th - 5; y >= 3; y -= 4, k++) {
        const a = k % 2 === 0 ? 1 : mid + 1;
        const b = k % 2 === 0 ? mid - 2 : tw - 2;
        for (let x = a; x <= b; x++) set(x, y, 1);
      }
    }
    return wr;
  });

  W.forEach((a) =>
    W.forEach((b) => {
      if (a === b) return;
      const j = adj(a, b);
      if (!j) return;
      const set = setter(a);
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

/** Nearest open floor tile to the middle of a room's bottom edge, in world tiles. */
export function floorSpot(r: WorldRoom): { x: number; y: number } {
  const c = Math.floor(r.tw / 2);
  for (let d = 0; d < r.tw; d++) {
    for (const x of [c + d, c - d]) {
      if (
        x > 0 &&
        x < r.tw - 1 &&
        r.g[(r.th - 1) * r.tw + x] === 1 &&
        r.g[(r.th - 2) * r.tw + x] === 0 &&
        r.g[(r.th - 3) * r.tw + x] === 0
      ) {
        return { x: r.tx + x + 0.5, y: r.ty + r.th - 1 };
      }
    }
  }
  return { x: r.tx + c, y: r.ty + r.th - 1 };
}
