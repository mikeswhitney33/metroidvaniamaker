import { CONTENT_KEYS, type ProjectContent } from '../model/project';

/** Undo stack of whole-content snapshots; snapshots share unchanged arrays, so they're cheap. */
export interface History {
  past: ProjectContent[];
  future: ProjectContent[];
  /** Edits with the same merge key in quick succession (typing a name) undo as one step. */
  mergeKey: string | null;
  mergeAt: number;
}

export const HISTORY_LIMIT = 100;
export const MERGE_MS = 1000;

export const emptyHistory: History = { past: [], future: [], mergeKey: null, mergeAt: 0 };

export const sameContent = (a: ProjectContent, b: ProjectContent) => CONTENT_KEYS.every((k) => a[k] === b[k]);

/** Records `before` as an undo step for an edit that just happened. */
export function record(h: History, before: ProjectContent, mergeKey: string | undefined, now: number): History {
  if (mergeKey && mergeKey === h.mergeKey && now - h.mergeAt < MERGE_MS) return { ...h, future: [], mergeAt: now };
  return { past: [...h.past, before].slice(-HISTORY_LIMIT), future: [], mergeKey: mergeKey ?? null, mergeAt: now };
}

export function undo(h: History, current: ProjectContent): { history: History; content: ProjectContent } | null {
  const content = h.past.at(-1);
  if (!content) return null;
  return { content, history: { past: h.past.slice(0, -1), future: [current, ...h.future], mergeKey: null, mergeAt: 0 } };
}

export function redo(h: History, current: ProjectContent): { history: History; content: ProjectContent } | null {
  const content = h.future[0];
  if (!content) return null;
  return { content, history: { past: [...h.past, current], future: h.future.slice(1), mergeKey: null, mergeAt: 0 } };
}
