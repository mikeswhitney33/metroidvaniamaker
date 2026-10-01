import { createContext, useContext, type RefObject } from 'react';
import type { Analysis, Issue, NodeIndex } from '../model/graph';
import type { GraphNode, Room, StylePreset } from '../model/types';
import type { EditorState } from './state';

type Patch = Partial<EditorState> | ((s: EditorState) => Partial<EditorState>);

export interface EditorApi {
  state: EditorState;
  analysis: Analysis;
  byId: NodeIndex;
  roomById: Record<string, Room>;
  /** Route step number of each key on the critical path. */
  stepOf: Record<string, number>;
  palette: StylePreset;
  hatchUnreachable: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  colorOf(n: GraphNode | undefined): string;
  /** UI-only state change. */
  set(patch: Patch): void;
  /**
   * Content change: marks the current build stale and adds an undo step.
   * Edits sharing a `merge` key in quick succession (typing) undo as one step.
   */
  edit(patch: Patch, merge?: string): void;
  flash(msg: string): void;
  place(nodeId: string, roomId: string): void;
  unplace(nodeId: string): void;
  deleteRoom(roomId: string): void;
  autoPlace(): void;
  generate(): void;
  restart(): void;
  openIssue(issue: Issue): void;
  undo(): void;
  redo(): void;
  /** Downloads the project as a .vwm.json file. */
  saveFile(): void;
  openFile(file: File): void;
  newProject(): void;
  loadSample(): void;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error('useEditor must be used inside <Editor>');
  return api;
}
