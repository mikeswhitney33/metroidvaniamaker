import { SAMPLE_NODES, SAMPLE_ROOMS } from '../model/sampleProject';
import type { GraphNode, Room } from '../model/types';

export type Mode = 'author' | 'play';
export type Tool = 'select' | 'draw' | 'erase';
export type Tab = 'graph' | 'style' | 'validate';
export type Source = 'image' | 'tiled' | 'draw';
export type TileSize = '8px' | '16px' | '32px';

export interface Draft {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Generate dialog: either blocked by validation errors, or running with a progress percentage. */
export type GenState = { blocked: true; errors: number } | { blocked: false; pct: number };

export interface LogEntry {
  t: string;
  msg: string;
}

export interface EditorState {
  mode: Mode;
  tool: Tool;
  tab: Tab;
  source: Source;
  rooms: Room[];
  nodes: GraphNode[];
  selRoom: string | null;
  selNode: string | null;
  style: string;
  tile: TileSize;
  prompt: string;
  threshold: number;
  showItems: boolean;
  showRoute: boolean;
  draft: Draft | null;
  seed: number;
  gen: GenState | null;
  /** Bumped on every content edit, so an unchanged map can skip regeneration. */
  rev: number;
  builtRev: number;
  playRoom: string;
  visited: string[];
  have: string[];
  log: LogEntry[];
  toast: string | null;
  /** Counter for naming newly drawn rooms. */
  seq: number;
}

export const initialState: EditorState = {
  mode: 'author',
  tool: 'select',
  tab: 'graph',
  source: 'image',
  rooms: SAMPLE_ROOMS,
  nodes: SAMPLE_NODES,
  selRoom: null,
  selNode: 'grapple',
  style: 'ashen',
  tile: '16px',
  prompt: 'Crumbling cathedral carved into a dead volcano. Drifting ash, candlelit alcoves, rusted ironwork.',
  threshold: 55,
  showItems: true,
  showRoute: true,
  draft: null,
  seed: 4821,
  gen: null,
  rev: 0,
  builtRev: -1,
  playRoom: 'A',
  visited: ['A'],
  have: [],
  log: [],
  toast: null,
  seq: 16,
};
