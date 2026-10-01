export interface Room {
  id: string;
  name: string;
  /** Position and size in grid cells. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NodeKind = 'start' | 'key' | 'gate' | 'boss';

/** A node in the lock & key graph: the start, an ability/key, a gate it opens, or the boss. */
export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Only keys carry their own colour; gates inherit from the key that opens them. */
  color?: string;
  /** Id of the room the node is placed in, or null when unplaced. */
  room: string | null;
  /** Ids of the nodes that must be satisfied first. */
  req: string[];
}

export interface StylePreset {
  id: string;
  name: string;
  bg: string;
  bg2: string;
  wall: string;
  edge: string;
  player: string;
}

/** Tile size the art style is drawn at. */
export type TileSize = '8px' | '16px' | '32px';
