import { useEffect, useRef, useState } from 'react';
import type { ProjectContent } from '../../model/project';
import { solve, trickReports } from '../../model/solver';
import { fromWire, toWire, type Solved, type WireResult } from './wire';
import SolveWorker from './solve.worker?worker&inline';

/** Wait this long after the last edit before solving again. */
const DEBOUNCE_MS = 250;

/** What the solver needs from the project; images and the like stay behind. */
const solverInput = (c: ProjectContent): ProjectContent => ({ ...c, images: {}, sprites: {}, prompt: '' });

/**
 * Keeps a deep-solver result for the current content, solving in a worker after edits settle.
 * `busy` is true while the shown result is for an older revision.
 */
export function useSolver(content: ProjectContent, rev: number): { solved: Solved | null; busy: boolean } {
  const [solved, setSolved] = useState<Solved | null>(null);
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    try {
      worker.current = new SolveWorker();
    } catch {
      worker.current = null;
    }
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      latest.current = rev;
      const input = solverInput(content);
      const w = worker.current;
      if (!w) {
        const r = solve(input);
        setSolved(fromWire(toWire(r, trickReports(input, r)), rev));
        return;
      }
      w.onmessage = (e: MessageEvent<WireResult & { id: number }>) => {
        if (e.data.id === latest.current) setSolved(fromWire(e.data, e.data.id));
      };
      w.postMessage({ id: rev, content: input });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // Re-solve when the content revision changes; `content` is read fresh at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  return { solved, busy: !solved || solved.rev !== rev };
}
