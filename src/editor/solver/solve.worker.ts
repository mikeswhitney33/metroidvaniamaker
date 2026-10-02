import type { ProjectContent } from '../../model/project';
import { solve, trickReports } from '../../model/solver';
import { toWire } from './wire';

/** Runs the reachability solver off the main thread. */
self.onmessage = (e: MessageEvent<{ id: number; content: ProjectContent }>) => {
  const { id, content } = e.data;
  const r = solve(content);
  self.postMessage({ id, ...toWire(r, trickReports(content, r)) });
};
