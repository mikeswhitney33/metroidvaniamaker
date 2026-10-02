import { prop } from './entities';
import type { Issue } from './graph';
import type { ProjectContent } from './project';

export interface FlagUse {
  /** What it is, e.g. "Boss Gorrath" or "Grey hatch". */
  what: string;
  room?: string;
}

export interface FlagInfo {
  name: string;
  setBy: FlagUse[];
  readBy: FlagUse[];
}

/** Flag names a requirement expression mentions (`flag:<name>`). */
export function reqFlags(src: string): string[] {
  return [...src.matchAll(/flag:([A-Za-z0-9_.-]+)/g)].map((m) => m[1]);
}

/** Every world flag in the project: what sets it and what checks it, sorted by name. */
export function flagTable(c: Pick<ProjectContent, 'rooms' | 'doors' | 'nodes'>): FlagInfo[] {
  const map = new Map<string, FlagInfo>();
  const get = (name: string) => map.get(name) ?? map.set(name, { name, setBy: [], readBy: [] }).get(name)!;
  const roomName = (id: string) => c.rooms.find((r) => r.id === id)?.name ?? id;
  c.rooms.forEach((r) =>
    (r.entities ?? []).forEach((e) => {
      if (e.type === 'boss') {
        const f = prop(e, 'flag', '');
        if (f) get(f).setBy.push({ what: `Boss ${prop(e, 'name', 'Boss')}`, room: r.id });
      }
      if (e.type === 'trigger' && prop(e, 'action', 'message') === 'flag') {
        const f = prop(e, 'flag', '');
        if (f) get(f).setBy.push({ what: 'Trigger', room: r.id });
      }
      ['when', 'weak'].forEach((k) =>
        reqFlags(prop(e, k, '')).forEach((f) => get(f).readBy.push({ what: `${e.type[0].toUpperCase()}${e.type.slice(1)} (${k === 'when' ? 'only when' : 'hurt by'})`, room: r.id })),
      );
    }),
  );
  Object.entries(c.doors).forEach(([k, d]) => {
    if (d.kind !== 'grey' || !d.flag) return;
    const [a, b] = k.split('|');
    get(d.flag).readBy.push({ what: `Grey hatch ${roomName(a)} ↔ ${roomName(b)}`, room: a });
  });
  c.nodes.forEach((n) => {
    if (n.dormantUntil) get(n.dormantUntil).readBy.push({ what: `${n.label} (dormant until)`, room: n.room ?? undefined });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Flags that something checks but nothing sets: the check can never pass. */
export function flagIssues(table: FlagInfo[]): Issue[] {
  return table
    .filter((f) => f.readBy.length && !f.setBy.length)
    .map((f) => ({
      sev: 'warn' as const,
      msg: `Flag "${f.name}" is checked by ${f.readBy[0].what}${f.readBy.length > 1 ? ` and ${f.readBy.length - 1} more` : ''}, but nothing sets it.`,
      room: f.readBy[0].room,
    }));
}
