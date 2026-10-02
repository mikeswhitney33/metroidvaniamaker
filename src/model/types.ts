export interface Room {
  id: string;
  name: string;
  /** Position and size in grid cells. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Painted tile layer, one `Tile` character per tile, row by row; absent means use the generated rough-in. */
  tiles?: string;
  /** Area the room belongs to; absent means the first area. */
  area?: string;
  /** Things placed on the room's tiles: stations, pickups, enemies, bosses, triggers. */
  entities?: Entity[];
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
  /** Keys: the ability (from the rulebook) picking this up grants. */
  ability?: string;
  /** Tile position inside its room; absent means the room's floor spot. */
  pos?: { x: number; y: number };
  /** Keys: the item is collected but does nothing until this world flag is set. */
  dormantUntil?: string;
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

/** A region of the world with its own look and music. */
export interface Area {
  id: string;
  name: string;
  /** Map colour. */
  color: string;
  /** Palette preset id; absent means the project style. */
  style?: string;
  /** Built-in music theme id. */
  music?: string;
  /** Image slot id of the area's tileset (see game/tileset.ts for the layout). */
  tileset?: string;
  /** Image slot id of a backdrop drawn behind the area's rooms with parallax. */
  backdrop?: string;
}

/** Hatch on a side doorway between two rooms; what opens it. */
export type DoorKind = 'open' | 'blue' | 'red' | 'green' | 'yellow' | 'grey';

export interface DoorSpec {
  kind: DoorKind;
  /** Grey doors open once this world flag is set (a boss falls, an event fires). */
  flag?: string;
}

export type EntityType = 'save' | 'recharge' | 'map' | 'statue' | 'pickup' | 'enemy' | 'boss' | 'trigger' | 'exit';

/** Something placed on a room tile; `props` hold the type's settings (see entities.ts). */
export interface Entity {
  id: string;
  type: EntityType;
  /** Tile position inside the room. */
  x: number;
  y: number;
  props: Record<string, string | number | boolean>;
}

/** A custom ability an author defines beyond the built-in rulebook. */
export interface AbilityDef {
  id: string;
  name: string;
  color: string;
  /** Capabilities it grants, which gate requirements name. */
  caps: string[];
  /** One-line description shown when it is picked up. */
  desc?: string;
}

/** A sprite sheet and the clips cut from it, for one character. */
export interface SpriteSheet {
  /** Image slot id in `images`. */
  image: string;
  frameW: number;
  frameH: number;
  /** Clip per animation state: frame indices into the sheet, row by row. */
  clips: Record<string, { frames: number[]; fps: number; loop: boolean }>;
}
