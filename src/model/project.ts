import { SAMPLE_NODES, SAMPLE_ROOMS } from './sampleProject';
import { decodeTiles } from './tiles';
import type { GraphNode, NodeKind, Room, TileSize } from './types';

/** Marks a JSON file as a Vaultwright project. */
export const PROJECT_FORMAT = 'vaultwright-project';
/** Bump when the saved shape changes, and add a migration from the previous version. */
export const PROJECT_VERSION = 2;

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
  /** Counter for naming newly drawn rooms. */
  seq: number;
  /** Reference images by slot id, as data URLs. */
  images: Record<string, string>;
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
};

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

const KINDS: NodeKind[] = ['start', 'key', 'gate', 'boss'];
const TILES: TileSize[] = ['8px', '16px', '32px'];

function room(v: unknown, i: number): Room {
  if (!isObj(v) || typeof v.id !== 'string') throw new ProjectError(`Room ${i + 1} has no id.`);
  const n = (k: string) => {
    const x = v[k];
    if (typeof x !== 'number' || !Number.isInteger(x)) throw new ProjectError(`Room ${v.id} has no valid ${k}.`);
    return x;
  };
  const r: Room = { id: v.id, name: str(v.name, v.id), x: n('x'), y: n('y'), w: n('w'), h: n('h') };
  if (v.tiles !== undefined) {
    if (typeof v.tiles !== 'string' || !decodeTiles(v.tiles, r)) {
      throw new ProjectError(`Room ${v.id} has a tile layer that doesn't match its size.`);
    }
    r.tiles = v.tiles;
  }
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
  return n;
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
  return {
    name: str(p.name, 'Untitled project'),
    rooms: p.rooms.map(room),
    nodes: p.nodes.map(node),
    style: str(p.style, d.style),
    tile: TILES.includes(p.tile as TileSize) ? (p.tile as TileSize) : d.tile,
    prompt: str(p.prompt, ''),
    threshold: num(p.threshold, d.threshold),
    seed: num(p.seed, d.seed),
    seq: num(p.seq, p.rooms.length + 1),
    images,
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
