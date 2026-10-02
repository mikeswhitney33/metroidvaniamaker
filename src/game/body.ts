import { Tile } from '../model/tiles';
import type { Level } from './level';

/** An axis-aligned box in world tiles. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Body extends Box {
  vx: number;
  vy: number;
}

export interface MoveResult {
  /** Landed on something this step. */
  ground: boolean;
  wallL: boolean;
  wallR: boolean;
  ceiling: boolean;
  /** Solid tiles bumped into, for breaking blocks on contact. */
  bumped: { x: number; y: number }[];
}

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const EPS = 0.001;

/**
 * What a box overlaps that blocks it, as boxes. Platforms only count when `feet` (the
 * box's bottom edge before this move) was at or above their top, so you can jump up
 * through them; `extra` boxes (frozen enemies) work the same way as platforms from
 * above and as walls otherwise.
 */
export function blockers(level: Level, b: Box, feet?: number, extra: Box[] = []): (Box & { tile: boolean })[] {
  const out: (Box & { tile: boolean })[] = [];
  for (let x = Math.floor(b.x); x <= Math.floor(b.x + b.w - EPS); x++)
    for (let y = Math.floor(b.y); y <= Math.floor(b.y + b.h - EPS); y++) {
      if (level.solid(x, y)) out.push({ x, y, w: 1, h: 1, tile: true });
      else if (feet !== undefined && feet <= y + EPS && level.tile(x, y) === Tile.Platform) out.push({ x, y, w: 1, h: 1, tile: false });
    }
  extra.forEach((e) => overlaps(b, e) && out.push({ ...e, tile: false }));
  return out;
}

export const blocked = (level: Level, b: Box, feet?: number, extra: Box[] = []) => blockers(level, b, feet, extra).length > 0;

/**
 * Moves a body by its velocity over `dt`, one axis at a time, stopping at walls.
 * Sub-steps so a fast body can't skip a one-tile wall.
 */
export function move(level: Level, b: Body, dt: number, extra: Box[] = []): MoveResult {
  const r: MoveResult = { ground: false, wallL: false, wallR: false, ceiling: false, bumped: [] };
  const n = Math.max(1, Math.ceil((Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt) / 0.25));
  const h = dt / n;
  const bump = (hits: (Box & { tile: boolean })[]) => hits.forEach((o) => o.tile && r.bumped.push({ x: o.x, y: o.y }));
  for (let i = 0; i < n; i++) {
    if (b.vx) {
      const ox = b.x;
      b.x += b.vx * h;
      const hits = blockers(level, b).concat(extra.filter((e) => overlaps(b, e)).map((e) => ({ ...e, tile: false })));
      if (hits.length) {
        bump(hits);
        if (b.vx > 0) {
          b.x = Math.max(ox, Math.min(...hits.map((o) => o.x)) - b.w - EPS);
          r.wallR = true;
        } else {
          b.x = Math.min(ox, Math.max(...hits.map((o) => o.x + o.w)) + EPS);
          r.wallL = true;
        }
        if (blocked(level, b)) b.x = ox;
        b.vx = 0;
      }
    }
    if (b.vy) {
      const oy = b.y;
      const feet = b.y + b.h;
      b.y += b.vy * h;
      const hits = blockers(level, b, b.vy > 0 ? feet : undefined).concat(
        extra.filter((e) => overlaps(b, e) && (b.vy < 0 || feet <= e.y + 0.3)).map((e) => ({ ...e, tile: false })),
      );
      if (hits.length) {
        bump(hits);
        if (b.vy > 0) {
          b.y = Math.max(oy, Math.min(...hits.map((o) => o.y)) - b.h - EPS);
          r.ground = true;
        } else {
          b.y = Math.min(oy, Math.max(...hits.map((o) => o.y + o.h)) + EPS);
          r.ceiling = true;
        }
        b.vy = 0;
      }
    }
  }
  return r;
}

/** Standing on something: probes just below the feet. */
export function onGround(level: Level, b: Box, extra: Box[] = []): boolean {
  const feet = b.y + b.h;
  const probe = { x: b.x, y: feet, w: b.w, h: 0.05 };
  return blocked(level, probe, feet) || extra.some((e) => overlaps(probe, e) && feet <= e.y + 0.05);
}

/** Tile kinds overlapping a box (slightly inset so touching an edge doesn't count). */
export function tilesIn(level: Level, b: Box, inset = 0.05): Set<number> {
  const out = new Set<number>();
  for (let x = Math.floor(b.x + inset); x <= Math.floor(b.x + b.w - inset); x++)
    for (let y = Math.floor(b.y + inset); y <= Math.floor(b.y + b.h - inset); y++) out.add(level.tile(x, y));
  return out;
}
