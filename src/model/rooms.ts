import { linkKey } from './entities';
import { encodeTiles, Tile, TILES_PER_CELL, tileSize } from './tiles';
import type { DoorSpec, GraphNode, Room } from './types';
import { baseTiles } from './world';

const T = TILES_PER_CELL;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** True when `r` fits on the map (non-negative) without overlapping any room outside `ignore`. */
export function fits(r: Rect, rooms: Room[], ignore: Set<string> = new Set()): boolean {
  if (r.x < 0 || r.y < 0 || r.w < 1 || r.h < 1) return false;
  return !rooms.some((o) => !ignore.has(o.id) && overlaps(r, o));
}

/**
 * The room moved or resized to `to`. Painted tiles and entities keep their place in the world:
 * whatever falls outside is dropped, new space is empty with a wall round the new edge, and old
 * edge walls that end up inside the room are opened up.
 */
export function reshapeRoom(room: Room, to: Rect): Room {
  const dx = (room.x - to.x) * T;
  const dy = (room.y - to.y) * T;
  const next: Room = { ...room, x: to.x, y: to.y, w: to.w, h: to.h };
  if (room.w === to.w && room.h === to.h) return next;
  const { tw, th } = tileSize(to);
  if (room.tiles !== undefined) {
    const old = baseTiles(room);
    const ow = room.w * T;
    const oh = room.h * T;
    const g = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const ox = x - dx;
        const oy = y - dy;
        const edge = x === 0 || y === 0 || x === tw - 1 || y === th - 1;
        if (ox < 0 || oy < 0 || ox >= ow || oy >= oh) {
          g[y * tw + x] = edge ? Tile.Solid : Tile.Empty;
          continue;
        }
        const v = old[oy * ow + ox];
        const oldEdge = ox === 0 || oy === 0 || ox === ow - 1 || oy === oh - 1;
        g[y * tw + x] = edge ? (v === Tile.Empty ? Tile.Solid : v) : oldEdge && v === Tile.Solid ? Tile.Empty : v;
      }
    next.tiles = encodeTiles(g);
  }
  if (room.entities) {
    next.entities = room.entities
      .map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }))
      .filter((e) => e.x >= 0 && e.y >= 0 && e.x < tw && e.y < th);
  }
  return next;
}

/** Item positions inside a reshaped room, shifted with it; ones that fall outside go back to the floor spot. */
export function reshapeNodes(nodes: GraphNode[], before: Room, after: Room): GraphNode[] {
  if (before.x === after.x && before.y === after.y && before.w === after.w && before.h === after.h) return nodes;
  const dx = (before.x - after.x) * T;
  const dy = (before.y - after.y) * T;
  const { tw, th } = tileSize(after);
  return nodes.map((n) => {
    if (n.room !== before.id || !n.pos) return n;
    const p = { x: n.pos.x + dx, y: n.pos.y + dy };
    return p.x >= 0 && p.y >= 0 && p.x < tw && p.y < th ? { ...n, pos: p } : { ...n, pos: undefined };
  });
}

/** Rooms copied to the clipboard: the rooms themselves and the hatches between them. */
export interface RoomClip {
  rooms: Room[];
  doors: Record<string, DoorSpec>;
}

export function copyRooms(rooms: Room[], doors: Record<string, DoorSpec>): RoomClip {
  const ids = new Set(rooms.map((r) => r.id));
  const inner: Record<string, DoorSpec> = {};
  Object.entries(doors).forEach(([k, d]) => {
    const [a, b] = k.split('|');
    if (ids.has(a) && ids.has(b)) inner[k] = d;
  });
  return { rooms: structuredClone(rooms), doors: structuredClone(inner) };
}

/**
 * Places a copy of the clipped rooms with fresh ids, at `at` (top-left of the group) if it fits,
 * else the nearest free spot to its right or below. Null when nothing fits on a map this big.
 */
export function pasteRooms(
  clip: RoomClip,
  existing: Room[],
  seq: number,
  at: { x: number; y: number },
  grid: { w: number; h: number },
): { rooms: Room[]; doors: Record<string, DoorSpec>; seq: number } | null {
  if (!clip.rooms.length) return null;
  const minX = Math.min(...clip.rooms.map((r) => r.x));
  const minY = Math.min(...clip.rooms.map((r) => r.y));
  const tries: [number, number][] = [];
  for (let d = 0; d < Math.max(grid.w, grid.h) * 2; d++)
    for (let k = 0; k <= d; k++) tries.push([at.x + k, at.y + d - k]);
  for (const [ox, oy] of tries) {
    const moved = clip.rooms.map((r) => ({ ...r, x: r.x - minX + ox, y: r.y - minY + oy }));
    if (moved.some((r) => !fits(r, existing))) continue;
    let s = seq;
    const ids: Record<string, string> = {};
    const rooms = moved.map((r) => {
      let id = `R${s++}`;
      while (existing.some((x) => x.id === id)) id = `R${s++}`;
      ids[r.id] = id;
      return { ...structuredClone(r), id, name: `${r.name} copy` };
    });
    const doors: Record<string, DoorSpec> = {};
    Object.entries(clip.doors).forEach(([k, d]) => {
      const [a, b] = k.split('|');
      if (ids[a] && ids[b]) doors[linkKey(ids[a], ids[b])] = d;
    });
    return { rooms, doors, seq: s };
  }
  return null;
}
