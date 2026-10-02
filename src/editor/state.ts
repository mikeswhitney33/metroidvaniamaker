import { sampleContent, type ProjectContent } from '../model/project';
import { Tile, type TileKind } from '../model/tiles';
import type { TileSize } from '../model/types';
import { emptyHistory, type History } from './history';
import { loadPrefs, type Prefs } from './prefs';

export type { TileSize };

export type Mode = 'author' | 'play';
export type Tool = 'select' | 'draw' | 'erase';
export type Tab = 'graph' | 'rules' | 'style' | 'sprites' | 'validate';
/** What the room painter places: tiles, or entities and item positions. */
export type PaintLayer = 'tiles' | 'entities';
export type Source = 'image' | 'tiled' | 'draw';

export interface Draft {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Shown when Playtest is pressed on a map with blocking issues. */
export type GenState = { blocked: true; errors: number };

export interface LogEntry {
  t: string;
  msg: string;
}

/** Autosave state shown in the top bar; 'loading' until the last autosave has been read back. */
export type SaveStatus = 'loading' | 'saved' | 'saving' | 'error';

export interface EditorState extends ProjectContent {
  mode: Mode;
  tool: Tool;
  tab: Tab;
  source: Source;
  selRoom: string | null;
  selNode: string | null;
  showItems: boolean;
  showRoute: boolean;
  draft: Draft | null;
  /** Room open in the tile painter, or null for the map. */
  editRoom: string | null;
  paintTile: TileKind;
  paintLayer: PaintLayer;
  /** Entity type the painter places, or a node id to position (`node:<id>`). */
  placing: string;
  selEntity: string | null;
  /** Map zoom: pixels per cell. */
  zoom: number;
  /** Show where the solver says the player can reach. */
  showReach: boolean;
  gen: GenState | null;
  /** Bumped on every content edit. */
  rev: number;
  playRoom: string;
  visited: string[];
  have: string[];
  log: LogEntry[];
  toast: string | null;
  history: History;
  saveStatus: SaveStatus;
  prefs: Prefs;
  /** A saved run exists for this project, so Playtest can continue it. */
  hasRun: boolean;
}

export const initialState: EditorState = {
  ...sampleContent(),
  mode: 'author',
  tool: 'select',
  tab: 'graph',
  source: 'image',
  selRoom: null,
  selNode: 'grapple',
  showItems: true,
  showRoute: true,
  draft: null,
  editRoom: null,
  paintTile: Tile.Solid,
  paintLayer: 'tiles',
  placing: 'enemy',
  selEntity: null,
  zoom: 24,
  showReach: false,
  gen: null,
  rev: 0,
  playRoom: 'A',
  visited: ['A'],
  have: [],
  log: [],
  toast: null,
  history: emptyHistory,
  saveStatus: 'loading',
  prefs: loadPrefs(),
  hasRun: false,
};
