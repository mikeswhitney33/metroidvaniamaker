import type { GraphNode, Room } from './types';

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Adjacency {
  /** True when the shared edge is vertical (rooms sit side by side). */
  v: boolean;
  /** Overlapping span along the shared edge, in cells. */
  lo: number;
  hi: number;
  /** Coordinate of the shared edge. */
  at: number;
}

/** Rooms that share an edge get a doorway; returns the shared span or null. */
export function adj(a: Room, b: Room): Adjacency | null {
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const lo = Math.max(a.y, b.y);
    const hi = Math.min(a.y + a.h, b.y + b.h);
    if (hi > lo) return { v: true, lo, hi, at: a.x + a.w === b.x ? a.x + a.w : a.x };
  }
  if (a.y + a.h === b.y || b.y + b.h === a.y) {
    const lo = Math.max(a.x, b.x);
    const hi = Math.min(a.x + a.w, b.x + b.w);
    if (hi > lo) return { v: false, lo, hi, at: a.y + a.h === b.y ? a.y + a.h : a.y };
  }
  return null;
}

export const isKey = (n: GraphNode | undefined | null): n is GraphNode => !!n && n.kind === 'key';

export type NodeIndex = Record<string, GraphNode>;

export function indexNodes(nodes: GraphNode[]): NodeIndex {
  const byId: NodeIndex = {};
  nodes.forEach((n) => (byId[n.id] = n));
  return byId;
}

/** Display colour of a node; gates take the colour of the key that opens them. */
export function colorOf(n: GraphNode | undefined | null, byId: NodeIndex): string {
  if (!n) return '#9aa1ad';
  if (n.kind === 'key') return n.color ?? '#9aa1ad';
  if (n.kind === 'start') return '#dfe2e7';
  if (n.kind === 'boss') return '#ff8a5c';
  const k = n.req.map((r) => byId[r]).find(isKey);
  return k?.color ?? '#9aa1ad';
}

/** Longest requirement chain to each node; cycles are cut rather than looping forever. */
export function depths(nodes: GraphNode[]): Record<string, number> {
  const byId = indexNodes(nodes);
  const d: Record<string, number> = {};
  const vis = new Set<string>();
  const f = (id: string): number => {
    if (d[id] !== undefined) return d[id];
    if (vis.has(id)) return 0;
    vis.add(id);
    let m = -1;
    (byId[id] ? byId[id].req : []).forEach((r) => {
      if (byId[r]) m = Math.max(m, f(r));
    });
    return (d[id] = m + 1);
  };
  nodes.forEach((n) => f(n.id));
  return d;
}

export interface Issue {
  sev: 'error' | 'warn';
  msg: string;
  room?: string;
  node?: string;
  /** Tile inside `room` the issue is about, when there is one. */
  tile?: { x: number; y: number };
}

export interface Analysis {
  /** Rooms the player can eventually reach. */
  reached: Set<string>;
  /** Keys the player can eventually collect. */
  have: Set<string>;
  /** Key ids in pickup order (the critical path). */
  order: string[];
  issues: Issue[];
  errors: number;
  /** Room adjacency list. */
  nb: Record<string, string[]>;
}

/**
 * Simulates a player: flood-fill every room not sealed by a gate whose key
 * is still missing, collect every key found, repeat until nothing new turns up.
 */
export function analyze(rooms: Room[], nodes: GraphNode[]): Analysis {
  const nb: Record<string, string[]> = {};
  rooms.forEach((a) => (nb[a.id] = rooms.filter((b) => b !== a && adj(a, b)).map((b) => b.id)));
  const byId = indexNodes(nodes);
  const rid: Record<string, Room> = {};
  rooms.forEach((r) => (rid[r.id] = r));
  const start = nodes.find((n) => n.kind === 'start' && n.room && rid[n.room]);
  const issues: Issue[] = [];
  const have = new Set<string>();
  const order: string[] = [];
  const reached = new Set<string>();
  const roomIter: Record<string, number> = {};
  const keyIter: Record<string, number> = {};
  const locked = (id: string) =>
    nodes.some((g) => g.kind === 'gate' && g.room === id && g.req.some((k) => isKey(byId[k]) && !have.has(k)));

  if (!start || !start.room) {
    issues.push({ sev: 'error', msg: 'No start room. Drag the Start node onto a room.' });
  } else {
    let it = 0;
    while (it < 60) {
      const seen = new Set([start.room]);
      const q = [start.room];
      while (q.length) {
        const c = q.shift()!;
        nb[c].forEach((n) => {
          if (!seen.has(n) && !locked(n)) {
            seen.add(n);
            q.push(n);
          }
        });
      }
      seen.forEach((id) => {
        if (!reached.has(id)) {
          reached.add(id);
          roomIter[id] = it;
        }
      });
      const fresh = nodes.filter((n) => isKey(n) && n.room && seen.has(n.room) && !have.has(n.id));
      if (!fresh.length) break;
      fresh.forEach((n) => {
        have.add(n.id);
        keyIter[n.id] = it;
        order.push(n.id);
      });
      it++;
    }
  }

  nodes.forEach((n) => {
    if (n.kind === 'start') return;
    if (!n.room || !rid[n.room]) {
      issues.push({ sev: 'warn', msg: `${n.label} isn't placed on the map.`, node: n.id });
      return;
    }
    const room = n.room;
    const rn = rid[room].name;
    if (isKey(n) && start && !have.has(n.id)) {
      const self = nodes.some((g) => g.kind === 'gate' && g.room === room && g.req.includes(n.id));
      issues.push({
        sev: 'error',
        msg: self
          ? `${n.label} is sealed behind the gate it opens (${rn}).`
          : `${n.label} in ${rn} can't be reached. Softlock.`,
        room,
        node: n.id,
      });
    }
    if (n.kind === 'boss' && start && !reached.has(room)) {
      issues.push({ sev: 'error', msg: `${n.label} can't be reached, so the game can't be finished.`, room, node: n.id });
    }
    if (isKey(n) && have.has(n.id)) {
      n.req.forEach((g) => {
        const gn = byId[g];
        if (gn && gn.kind === 'gate' && gn.room && roomIter[gn.room] !== undefined && keyIter[n.id] < roomIter[gn.room]) {
          issues.push({ sev: 'warn', msg: `Sequence break: ${n.label} is reachable before ${gn.label}.`, room, node: n.id });
        }
      });
    }
  });
  rooms.forEach((r) => {
    if (!nb[r.id].length) issues.push({ sev: 'warn', msg: `${r.name} doesn't touch any other room.`, room: r.id });
  });

  return { reached, have, order, issues, errors: issues.filter((i) => i.sev === 'error').length, nb };
}

/**
 * Re-places every key along the gate order: each key goes into a not-yet-used,
 * non-corridor room that becomes reachable only after the previous key.
 */
export function autoPlaceKeys(rooms: Room[], nodes: GraphNode[], seed: number): GraphNode[] {
  const R = rng(seed);
  const d = depths(nodes);
  const keys = nodes.filter(isKey).sort((a, b) => d[a.id] - d[b.id]);
  let placed: GraphNode[] = nodes.map((n) => (isKey(n) ? { ...n, room: null } : n));
  const used = new Set(placed.flatMap((n) => (n.room ? [n.room] : [])));
  let prev = new Set<string>();
  const big = (id: string) => {
    const r = rooms.find((x) => x.id === id);
    return !!r && r.w > 1 && r.h > 1;
  };
  keys.forEach((k) => {
    const reach = [...analyze(rooms, placed).reached];
    let c = reach.filter((id) => !prev.has(id) && big(id) && !used.has(id));
    if (!c.length) c = reach.filter((id) => big(id) && !used.has(id));
    if (!c.length) c = reach.filter(big);
    if (!c.length) c = reach;
    if (!c.length) return;
    const pick = c[Math.floor(R() * c.length)];
    prev = new Set(reach);
    used.add(pick);
    placed = placed.map((n) => (n.id === k.id ? { ...n, room: pick } : n));
  });
  return placed;
}

/** Next seed in the editor's linear congruential sequence. */
export const nextSeed = (seed: number) => (seed * 9301 + 49297) % 233280;
