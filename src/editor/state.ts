import { sampleContent, type ProjectContent } from '../model/project';
import type { TileSize } from '../model/types';
import { emptyHistory, type History } from './history';

export type { TileSize };

export type Mode = 'author' | 'play';
export type Tool = 'select' | 'draw' | 'erase';
export type Tab = 'graph' | 'style' | 'validate';
export type Source = 'image' | 'tiled' | 'draw';

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
  gen: GenState | null;
  /** Bumped on every content edit, so an unchanged map can skip regeneration. */
  rev: number;
  builtRev: number;
  playRoom: string;
  visited: string[];
  have: string[];
  log: LogEntry[];
  toast: string | null;
  history: History;
  saveStatus: SaveStatus;
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
  gen: null,
  rev: 0,
  builtRev: -1,
  playRoom: 'A',
  visited: ['A'],
  have: [],
  log: [],
  toast: null,
  history: emptyHistory,
  saveStatus: 'loading',
};
