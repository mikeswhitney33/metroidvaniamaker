import { createContext, useContext, type RefObject } from 'react';
import type { WorldRoom } from '../model/world';
import type { Analysis, Issue, NodeIndex } from '../model/graph';
import type { GraphNode, Room, StylePreset } from '../model/types';
import type { Solved } from './solver/wire';
import type { EditorState } from './state';

type Patch = Partial<EditorState> | ((s: EditorState) => Partial<EditorState>);

/** Validation: the lock & key graph and the tile-level solver together. */
export interface Check {
  issues: Issue[];
  errors: number;
  beatable: boolean;
  /** The solver is still working on the latest edit. */
  busy: boolean;
  /** Rooms the player can enter. */
  reached: Set<string>;
  /** Wave (1-based) at which each key node is first collected. */
  stepOf: Record<string, number>;
  solved: Solved | null;
}

export interface EditorApi {
  state: EditorState;
  analysis: Analysis;
  check: Check;
  byId: NodeIndex;
  roomById: Record<string, Room>;
  /** Rooms baked to tiles, doorways carved, in `state.rooms` order. */
  world: WorldRoom[];
  /** Route step number of each key. */
  stepOf: Record<string, number>;
  palette: StylePreset;
  hatchUnreachable: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  colorOf(n: GraphNode | undefined): string;
  /** UI-only state change. */
  set(patch: Patch): void;
  /**
   * Content change: adds an undo step.
   * Edits sharing a `merge` key in quick succession (typing) undo as one step.
   */
  edit(patch: Patch, merge?: string): void;
  flash(msg: string): void;
  place(nodeId: string, roomId: string): void;
  unplace(nodeId: string): void;
  deleteRoom(roomId: string): void;
  autoPlace(): void;
  /** Start a fresh playtest; `force` plays even with blocking issues. */
  playtest(force?: boolean): void;
  /** Continue from the last save station. */
  continueRun(): void;
  leavePlay(): void;
  restart(): void;
  openIssue(issue: Issue): void;
  undo(): void;
  redo(): void;
  /** Downloads the project as a .vwm.json file. */
  saveFile(): void;
  openFile(file: File): void;
  /** Downloads a single HTML file that plays the game. */
  exportGame(): void;
  newProject(): void;
  loadSample(id: string): void;
  /** Replaces the map's rooms (from a trace or an import) as one undoable step. */
  replaceRooms(rooms: Room[], msg: string): void;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error('useEditor must be used inside <Editor>');
  return api;
}
