import type { Physics } from './project';

/** How water slows a player without the Tide Suit. The runtime and the solver both use these. */
export const WATER = { jump: 0.6, gravity: 0.5, run: 0.6 } as const;

/** Player body in tiles. */
export const BODY = { w: 0.75, h: 1.5, rolled: 0.75 } as const;

/** Highest ledge, in whole tiles above the feet, a jump of this take-off speed lands on. */
export function jumpTiles(speed: number, gravity: number): number {
  return Math.max(1, Math.floor((speed * speed) / (2 * gravity) - 0.25));
}

export interface JumpReach {
  normal: number;
  spring: number;
  water: number;
  springWater: number;
  /** One bomb bounce while rolled. */
  bomb: number;
}

export function jumpReach(p: Physics): JumpReach {
  return {
    normal: jumpTiles(p.jump, p.gravity),
    spring: jumpTiles(p.springJump, p.gravity),
    water: jumpTiles(p.jump * WATER.jump, p.gravity * WATER.gravity),
    springWater: jumpTiles(p.springJump * WATER.jump, p.gravity * WATER.gravity),
    bomb: 2,
  };
}

/** Upward speed a bomb bounce gives a rolled player. */
export const bombBounce = (gravity: number) => Math.sqrt(2 * gravity * 2.4);
