import { prop } from './entities';
import { isKey } from './graph';
import type { ProjectContent } from './project';
import type { SolveResult } from './solver';

export type LoadoutMode = 'route' | 'all' | 'none';

export interface Loadout {
  /** Key node ids collected. */
  keys: string[];
  /** Expansion ids (`exp:<room>:<entity>`). */
  expansions: string[];
  flags: string[];
}

/**
 * What a run starting in `roomId` carries.
 * - route: everything the solver collects before the room can first be entered,
 *   which is what a player arriving there normally would have.
 * - all: every item and expansion in the project, and no flags.
 * - none: nothing.
 */
export function loadoutFor(c: ProjectContent, res: SolveResult | null | undefined, roomId: string, mode: LoadoutMode): Loadout {
  const out: Loadout = { keys: [], expansions: [], flags: [] };
  if (mode === 'none') return out;
  if (mode === 'all' || !res) {
    if (mode === 'route') return out;
    out.keys = c.nodes.filter(isKey).map((n) => n.id);
    c.rooms.forEach((r) => (r.entities ?? []).forEach((e) => e.type === 'pickup' && out.expansions.push(`exp:${r.id}:${e.id}`)));
    return out;
  }
  const by = res.roomStep[roomId] ?? Infinity;
  res.targets.forEach((t) => {
    const step = res.stepOf[t.id];
    if (step === undefined || step >= by) return;
    if (t.kind === 'key' && t.node) out.keys.push(t.node);
    else if (t.kind === 'expansion') out.expansions.push(t.id);
    else if (t.kind === 'boss' || t.kind === 'trigger') {
      const e = c.rooms.find((r) => r.id === t.room)?.entities?.find((x) => t.id.endsWith(`:${x.id}`));
      const f = e ? prop(e, 'flag', '') : '';
      if (f && !out.flags.includes(f)) out.flags.push(f);
    }
  });
  return out;
}
