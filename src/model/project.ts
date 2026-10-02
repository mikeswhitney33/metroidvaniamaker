import { ENTITY_SPECS } from './entities';
import { GRID_H, GRID_W, SAMPLE_NODES, SAMPLE_ROOMS } from './sampleProject';
import { decodeTiles } from './tiles';
import type {
  AbilityDef,
  Area,
  DoorKind,
  DoorSpec,
  Entity,
  EntityType,
  GraphNode,
  NodeKind,
  Room,
  SpriteSheet,
  TileSize,
} from './types';

/** Marks a JSON file as a Vaultwright project. */
export const PROJECT_FORMAT = 'vaultwright-project';
/** Bump when the saved shape changes, and add a migration from the previous version. */
export const PROJECT_VERSION = 3;

/** Movement tuning, in tiles and seconds. */
export interface Physics {
  /** Jump take-off speed. */
  jump: number;
  /** Take-off speed with Spring Boots. */
  springJump: number;
  gravity: number;
  run: number;
  /** Grace period to still jump after running off a ledge. */
  coyoteMs: number;
  /** A jump pressed this early before landing still happens. */
  bufferMs: number;
}

export const DEFAULT_PHYSICS: Physics = { jump: 30, springJump: 37, gravity: 70, run: 10, coyoteMs: 100, bufferMs: 100 };

/** Everything the author makes: what gets saved, exported and undone. */
export interface ProjectContent {
  name: string;
  rooms: Room[];
  nodes: GraphNode[];
  style: string;
  tile: TileSize;
  prompt: string;
  threshold: number;
  seed: number;
  /** Counter for naming newly drawn rooms and entities. */
  seq: number;
  /** Reference images and sprite sheets by slot id, as data URLs. */
  images: Record<string, string>;
  /** Map size in cells. */
  grid: { w: number; h: number };
  areas: Area[];
  /** Hatches on side doorways, by `linkKey` of the two rooms. Missing means open. */
  doors: Record<string, DoorSpec>;
  /** Author-defined abilities, on top of the built-in rulebook. */
  abilities: AbilityDef[];
  /** Sequence-break tricks the solver may rely on. */
  tricks: string[];
  /** Sprite sheets by character id ("player", or an enemy archetype / boss kind). */
  sprites: Record<string, SpriteSheet>;
  physics: Physics;
}

export const CONTENT_KEYS = [
  'name',
  'rooms',
  'nodes',
  'style',
  'tile',
  'prompt',
  'threshold',
  'seed',
  'seq',
  'images',
  'grid',
  'areas',
  'doors',
  'abilities',
  'tricks',
  'sprites',
  'physics',
] as const satisfies readonly (keyof ProjectContent)[];

export interface ProjectFile extends ProjectContent {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
}

/** A file that can't be opened as a project; the message is shown to the author. */
export class ProjectError extends Error {}

export function pickContent(s: ProjectContent): ProjectContent {
  const c = {} as Record<string, unknown>;
  CONTENT_KEYS.forEach((k) => (c[k] = s[k]));
  return c as unknown as ProjectContent;
}

export const DEFAULT_AREA: Area = { id: 'main', name: 'Main', color: '#a597c4' };

export function sampleContent(): ProjectContent {
  return {
    name: 'Hollow Depths',
    rooms: SAMPLE_ROOMS,
    nodes: SAMPLE_NODES,
    style: 'ashen',
    tile: '16px',
    prompt: 'Crumbling cathedral carved into a dead volcano. Drifting ash, candlelit alcoves, rusted ironwork.',
    threshold: 55,
    seed: 4821,
    seq: 16,
    images: {},
    grid: { w: GRID_W, h: GRID_H },
    areas: [DEFAULT_AREA],
    doors: {},
    abilities: [],
    tricks: [],
    sprites: {},
    physics: DEFAULT_PHYSICS,
  };
}

/** An empty map with just the start and the boss, both waiting to be placed. */
export function blankContent(): ProjectContent {
  return {
    ...sampleContent(),
    name: 'Untitled project',
    rooms: [],
    nodes: [
      { id: 'start', kind: 'start', label: 'Start', room: null, req: [] },
      { id: 'boss', kind: 'boss', label: 'Boss', room: null, req: [] },
    ],
    prompt: '',
    seq: 1,
  };
}

export function toProjectFile(c: ProjectContent, now = new Date()): ProjectFile {
  return { format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt: now.toISOString(), ...pickContent(c) };
}

type Json = Record<string, unknown>;

/** Steps from version n to n + 1, keyed by n. */
const MIGRATIONS: Record<number, (p: Json) => Json> = {
  // Version 2 added optional painted tiles to rooms; version 1 files need no change.
  1: (p) => p,
  // Version 3 added the grid, areas, doors, abilities, tricks, sprites and physics; defaults fill them in.
  2: (p) => p,
};

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const int = (v: unknown) => typeof v === 'number' && Number.isInteger(v);

const KINDS: NodeKind[] = ['start', 'key', 'gate', 'boss'];
const TILES: TileSize[] = ['8px', '16px', '32px'];
const DOORS: DoorKind[] = ['open', 'blue', 'red', 'green', 'yellow', 'grey'];

function entity(v: unknown, roomId: string): Entity {
  if (!isObj(v) || typeof v.id !== 'string' || !(String(v.type) in ENTITY_SPECS) || !int(v.x) || !int(v.y)) {
    throw new ProjectError(`Room ${roomId} has an entity that can't be read.`);
  }
  const props: Entity['props'] = {};
  if (isObj(v.props))
    Object.entries(v.props).forEach(([k, p]) => {
      if (typeof p === 'string' || typeof p === 'number' || typeof p === 'boolean') props[k] = p;
    });
  return { id: v.id, type: v.type as EntityType, x: v.x as number, y: v.y as number, props };
}

function room(v: unknown, i: number): Room {
  if (!isObj(v) || typeof v.id !== 'string') throw new ProjectError(`Room ${i + 1} has no id.`);
  const n = (k: string) => {
    const x = v[k];
    if (!int(x)) throw new ProjectError(`Room ${v.id} has no valid ${k}.`);
    return x as number;
  };
  const r: Room = { id: v.id, name: str(v.name, v.id), x: n('x'), y: n('y'), w: n('w'), h: n('h') };
  if (v.tiles !== undefined) {
    if (typeof v.tiles !== 'string' || !decodeTiles(v.tiles, r)) {
      throw new ProjectError(`Room ${v.id} has a tile layer that doesn't match its size.`);
    }
    r.tiles = v.tiles;
  }
  if (typeof v.area === 'string') r.area = v.area;
  if (Array.isArray(v.entities)) r.entities = v.entities.map((e) => entity(e, r.id));
  return r;
}

function node(v: unknown, i: number): GraphNode {
  if (!isObj(v) || typeof v.id !== 'string') throw new ProjectError(`Graph node ${i + 1} has no id.`);
  if (!KINDS.includes(v.kind as NodeKind)) throw new ProjectError(`Graph node ${v.id} has an unknown kind.`);
  const n: GraphNode = {
    id: v.id,
    kind: v.kind as NodeKind,
    label: str(v.label, v.id),
    room: typeof v.room === 'string' ? v.room : null,
    req: Array.isArray(v.req) ? v.req.filter((r): r is string => typeof r === 'string') : [],
  };
  if (typeof v.color === 'string') n.color = v.color;
  if (typeof v.ability === 'string') n.ability = v.ability;
  if (typeof v.dormantUntil === 'string') n.dormantUntil = v.dormantUntil;
  if (isObj(v.pos) && int(v.pos.x) && int(v.pos.y)) n.pos = { x: v.pos.x as number, y: v.pos.y as number };
  return n;
}

function area(v: unknown): Area | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const a: Area = { id: v.id, name: str(v.name, v.id), color: str(v.color, DEFAULT_AREA.color) };
  if (typeof v.style === 'string') a.style = v.style;
  if (typeof v.music === 'string') a.music = v.music;
  return a;
}

function ability(v: unknown): AbilityDef | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  const caps = Array.isArray(v.caps) ? v.caps.filter((c): c is string => typeof c === 'string') : [];
  const a: AbilityDef = { id: v.id, name: str(v.name, v.id), color: str(v.color, '#9aa1ad'), caps };
  if (typeof v.desc === 'string') a.desc = v.desc;
  return a;
}

function sprite(v: unknown): SpriteSheet | null {
  if (!isObj(v) || typeof v.image !== 'string' || !int(v.frameW) || !int(v.frameH)) return null;
  const clips: SpriteSheet['clips'] = {};
  if (isObj(v.clips))
    Object.entries(v.clips).forEach(([k, c]) => {
      if (!isObj(c) || !Array.isArray(c.frames)) return;
      clips[k] = { frames: c.frames.filter(int) as number[], fps: num(c.fps, 10), loop: c.loop !== false };
    });
  return { image: v.image, frameW: v.frameW as number, frameH: v.frameH as number, clips };
}

/** Reads a saved project, migrating older versions; throws ProjectError when it can't. */
export function parseProject(text: string): ProjectContent {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError("This file isn't valid JSON.");
  }
  if (!isObj(raw) || raw.format !== PROJECT_FORMAT) throw new ProjectError("This file isn't a Vaultwright project.");
  let p = raw;
  let v = num(p.version, 0);
  if (v > PROJECT_VERSION) throw new ProjectError('This project was saved by a newer version of Vaultwright.');
  for (; v < PROJECT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new ProjectError(`Can't upgrade a version ${v} project.`);
    p = step(p);
  }
  if (!Array.isArray(p.rooms) || !Array.isArray(p.nodes)) throw new ProjectError('The project has no rooms or graph.');
  const d = sampleContent();
  const images: Record<string, string> = {};
  if (isObj(p.images)) Object.entries(p.images).forEach(([k, img]) => typeof img === 'string' && (images[k] = img));
  const rooms = p.rooms.map(room);
  const fit = rooms.reduce((m, r) => ({ w: Math.max(m.w, r.x + r.w), h: Math.max(m.h, r.y + r.h) }), { w: 1, h: 1 });
  const grid = isObj(p.grid) && int(p.grid.w) && int(p.grid.h) ? { w: p.grid.w as number, h: p.grid.h as number } : d.grid;
  const areas = Array.isArray(p.areas) ? p.areas.map(area).filter((a): a is Area => !!a) : [];
  const doors: Record<string, DoorSpec> = {};
  if (isObj(p.doors))
    Object.entries(p.doors).forEach(([k, s]) => {
      if (isObj(s) && DOORS.includes(s.kind as DoorKind)) {
        doors[k] = { kind: s.kind as DoorKind, ...(typeof s.flag === 'string' ? { flag: s.flag } : {}) };
      }
    });
  const sprites: Record<string, SpriteSheet> = {};
  if (isObj(p.sprites))
    Object.entries(p.sprites).forEach(([k, s]) => {
      const sh = sprite(s);
      if (sh) sprites[k] = sh;
    });
  const ph = isObj(p.physics) ? p.physics : {};
  return {
    name: str(p.name, 'Untitled project'),
    rooms,
    nodes: p.nodes.map(node),
    style: str(p.style, d.style),
    tile: TILES.includes(p.tile as TileSize) ? (p.tile as TileSize) : d.tile,
    prompt: str(p.prompt, ''),
    threshold: num(p.threshold, d.threshold),
    seed: num(p.seed, d.seed),
    seq: num(p.seq, p.rooms.length + 1),
    images,
    grid: { w: Math.max(grid.w, fit.w), h: Math.max(grid.h, fit.h) },
    areas: areas.length ? areas : [DEFAULT_AREA],
    doors,
    abilities: Array.isArray(p.abilities) ? p.abilities.map(ability).filter((a): a is AbilityDef => !!a) : [],
    tricks: Array.isArray(p.tricks) ? p.tricks.filter((t): t is string => typeof t === 'string') : [],
    sprites,
    physics: {
      jump: num(ph.jump, DEFAULT_PHYSICS.jump),
      springJump: num(ph.springJump, DEFAULT_PHYSICS.springJump),
      gravity: num(ph.gravity, DEFAULT_PHYSICS.gravity),
      run: num(ph.run, DEFAULT_PHYSICS.run),
      coyoteMs: num(ph.coyoteMs, DEFAULT_PHYSICS.coyoteMs),
      bufferMs: num(ph.bufferMs, DEFAULT_PHYSICS.bufferMs),
    },
  };
}

/** File name for an exported project, e.g. "hollow-depths.vwm.json". */
export function projectFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'project'}.vwm.json`;
}
