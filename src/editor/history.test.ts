import { describe, expect, it } from 'vitest';
import { blankContent, sampleContent } from '../model/project';
import { emptyHistory, HISTORY_LIMIT, MERGE_MS, record, redo, undo } from './history';

const named = (name: string) => ({ ...sampleContent(), name });

describe('history', () => {
  it('undoes and redoes an edit', () => {
    const a = named('a');
    const b = named('b');
    const h = record(emptyHistory, a, undefined, 0);
    const u = undo(h, b)!;
    expect(u.content).toBe(a);
    const r = redo(u.history, a)!;
    expect(r.content).toBe(b);
    expect(r.history.past).toEqual([a]);
  });

  it('returns null with nothing to undo or redo', () => {
    expect(undo(emptyHistory, blankContent())).toBeNull();
    expect(redo(emptyHistory, blankContent())).toBeNull();
  });

  it('merges quick edits with the same key into one step', () => {
    let h = record(emptyHistory, named(''), 'name', 0);
    h = record(h, named('H'), 'name', MERGE_MS - 1);
    h = record(h, named('Ho'), 'name', 2 * MERGE_MS - 2);
    expect(h.past.map((c) => c.name)).toEqual(['']);
    h = record(h, named('Hol'), 'name', 4 * MERGE_MS);
    expect(h.past.map((c) => c.name)).toEqual(['', 'Hol']);
  });

  it('does not merge different keys', () => {
    let h = record(emptyHistory, named('a'), 'name', 0);
    h = record(h, named('b'), 'prompt', 1);
    expect(h.past).toHaveLength(2);
  });

  it('a new edit clears redo', () => {
    const h = undo(record(emptyHistory, named('a'), undefined, 0), named('b'))!.history;
    expect(record(h, named('a'), undefined, 1).future).toEqual([]);
  });

  it('caps the stack', () => {
    let h = emptyHistory;
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = record(h, named(String(i)), undefined, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].name).toBe('5');
  });
});
