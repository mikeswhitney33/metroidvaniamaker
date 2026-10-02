import { meets } from '../model/abilities';
import { tileInfo } from '../model/tiles';
import type { Box } from './body';
import type { Level } from './level';

export type ShotKind = 'beam' | 'missiles' | 'supers' | 'enemy';

/** A projectile in flight. */
export interface Shot extends Box {
  kind: ShotKind;
  vx: number;
  vy: number;
  /** Capabilities it carries for blocks, hatches and enemy weak points. */
  caps: Set<string>;
  damage: number;
  /** Seconds left before it fizzles. */
  life: number;
  pierce: boolean;
  phase: boolean;
  charged: boolean;
  /** Enemy shots fall when this is set. */
  gravity?: number;
  /** Enemies already hit by a piercing shot. */
  hit?: Set<unknown>;
  dead?: boolean;
}

export interface Blast {
  x: number;
  y: number;
  /** Radius now, growing to `max`. */
  r: number;
  max: number;
  /** Seconds left. */
  t: number;
  caps: Set<string>;
  damage: number;
  nova: boolean;
  hit: Set<unknown>;
}

/** A bomb waiting to go off. */
export interface Bomb {
  x: number;
  y: number;
  fuse: number;
  nova: boolean;
}

const has = (caps: Set<string>) => ({ caps, counts: {} });

/** Whether a set of capabilities breaks this tile. */
export function breaks(t: number, caps: Set<string>): boolean {
  const need = tileInfo(t)?.breaks;
  if (!need) return false;
  if (need === 'missile') return caps.has('missile') || caps.has('super');
  return caps.has(need);
}

/**
 * Applies a projectile or blast to the tile it touches: breaks blocks it can break and opens
 * hatches it meets the requirement of. Returns whether the tile stops it.
 */
export function strike(level: Level, tx: number, ty: number, caps: Set<string>, onOpen?: (link: string) => void): boolean {
  const d = level.doorAt(tx, ty);
  if (d && !level.doorOpen(d.room, d.door)) {
    if (d.door.spec.kind !== 'grey' && meets(level.doorNeeds(d.door), has(caps))) {
      level.opened.add(d.door.link);
      onOpen?.(d.door.link);
    }
    return true;
  }
  const t = level.tile(tx, ty);
  if (breaks(t, caps)) {
    level.breakTile(tx, ty);
    return true;
  }
  return level.solid(tx, ty);
}

/** Moves a shot; returns false once it's spent. */
export function stepShot(s: Shot, level: Level, dt: number, onOpen?: (link: string) => void): boolean {
  s.life -= dt;
  if (s.life <= 0) return false;
  if (s.gravity) s.vy += s.gravity * dt;
  const n = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vy) * dt) / 0.3));
  for (let i = 0; i < n; i++) {
    s.x += (s.vx * dt) / n;
    s.y += (s.vy * dt) / n;
    const tx = Math.floor(s.x + s.w / 2);
    const ty = Math.floor(s.y + s.h / 2);
    if (s.kind === 'enemy') {
      if (level.solid(tx, ty)) return false;
      continue;
    }
    if (strike(level, tx, ty, s.caps, onOpen) && !s.phase) return false;
  }
  return true;
}

/** Breaks and opens everything a blast's circle reaches; returns links opened. */
export function blastTiles(b: Blast, level: Level, onOpen?: (link: string) => void) {
  const r = b.r;
  for (let x = Math.floor(b.x - r); x <= Math.floor(b.x + r); x++)
    for (let y = Math.floor(b.y - r); y <= Math.floor(b.y + r); y++) {
      const dx = Math.max(x - b.x, 0, b.x - (x + 1));
      const dy = Math.max(y - b.y, 0, b.y - (y + 1));
      if (dx * dx + dy * dy <= r * r) strike(level, x, y, b.caps, onOpen);
    }
}

export const circleHits = (c: { x: number; y: number; r: number }, b: Box) => {
  const dx = Math.max(b.x - c.x, 0, c.x - (b.x + b.w));
  const dy = Math.max(b.y - c.y, 0, c.y - (b.y + b.h));
  return dx * dx + dy * dy <= c.r * c.r;
};
