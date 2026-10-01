import { abilityById, BASE_CAPS, EXPANSIONS, meets, TRICKS, type ExpansionKind, type Have } from './abilities';
import { doorReq, prop } from './entities';
import { isKey, type Issue } from './graph';
import { jumpReach } from './physics';
import type { ProjectContent } from './project';
import { isFloor, isSolid, Tile } from './tiles';
import { buildWorld, floorSpot, type WorldRoom } from './world';

/**
 * Tile-level reachability solver. It simulates a player moving through the baked world with
 * a given set of capabilities: walking, falling with drift, jumping as high as the physics
 * allow (less in water), rolling through 1-tile gaps, bomb bouncing, double jumps, Sky Step,
 * and the tricks the author allows. Gates are tiles and hatches that need capabilities.
 * It collects everything reachable, grants it, and repeats until nothing new turns up.
 */

export type TargetKind = 'key' | 'expansion' | 'boss' | 'trigger' | 'exit';

export interface Target {
  id: string;
  kind: TargetKind;
  label: string;
  room: string;
  /** World tile rect the player must touch. */
  x: number;
  y: number;
  w: number;
  h: number;
  node?: string;
  /** Requirement to complete it once touched (bosses, triggers, exits). */
  req?: string;
}

export interface SolveResult {
  beatable: boolean;
  /** Wave number at which each target is first completed (0 = reachable from the start). */
  stepOf: Record<string, number>;
  /** Target ids completed in each wave. */
  waves: string[][];
  targets: Target[];
  /** Rooms the player can enter by the end. */
  rooms: Set<string>;
  /** Wave at which each hatch link first opens. */
  doorStep: Record<string, number>;
  issues: Issue[];
  /** World size in tiles, and the tiles the player's body can reach by the end (row-major). */
  W: number;
  H: number;
  covered: Uint8Array;
}

export interface SolveOptions {
  /** Tricks allowed on top of the project's own list. */
  extraTricks?: string[];
  /** Skip the softlock scan (used for trick comparisons). */
  quick?: boolean;
}

const OUT = 255;
const HM = 15;

interface Grid {
  W: number;
  H: number;
  tile: Uint8Array;
  room: Int16Array;
  /** Index into `doors` for hatch tiles, else -1. */
  door: Int16Array;
  doors: { link: string; req: string }[];
  rooms: WorldRoom[];
}

function bake(world: WorldRoom[]): Grid {
  let W = 1;
  let H = 1;
  world.forEach((r) => {
    W = Math.max(W, r.tx + r.tw);
    H = Math.max(H, r.ty + r.th);
  });
  const tile = new Uint8Array(W * H).fill(OUT);
  const room = new Int16Array(W * H).fill(-1);
  const door = new Int16Array(W * H).fill(-1);
  const doors: Grid['doors'] = [];
  world.forEach((r, ri) => {
    for (let y = 0; y < r.th; y++)
      for (let x = 0; x < r.tw; x++) {
        const i = (r.ty + y) * W + r.tx + x;
        tile[i] = r.g[y * r.tw + x];
        room[i] = ri;
      }
    r.doors.forEach((d) => {
      const di = doors.length;
      doors.push({ link: d.link, req: doorReq(d.spec) });
      for (let k = 0; k < 3; k++) door[(r.ty + d.y + k) * W + r.tx + d.x] = di;
    });
  });
  return { W, H, tile, room, door, doors, rooms: world };
}

/** Everything in the project the player can collect, defeat, trigger or finish at. */
export function collectTargets(c: ProjectContent, world: WorldRoom[]): Target[] {
  const byRoom = new Map(world.map((r) => [r.id, r]));
  const out: Target[] = [];
  c.nodes.forEach((n) => {
    if (!isKey(n) || !n.room) return;
    const r = byRoom.get(n.room);
    if (!r) return;
    const p = n.pos ? { x: r.tx + n.pos.x, y: r.ty + n.pos.y } : (() => {
      const f = floorSpot(r);
      return { x: Math.floor(f.x), y: f.y - 1 };
    })();
    out.push({ id: `key:${n.id}`, kind: 'key', label: n.label, room: r.id, x: p.x, y: p.y, w: 1, h: 1, node: n.id });
  });
  world.forEach((r) =>
    (r.entities ?? []).forEach((e) => {
      const at = { room: r.id, x: r.tx + e.x, y: r.ty + e.y };
      if (e.type === 'pickup') {
        const kind = prop(e, 'kind', 'missiles') as ExpansionKind;
        out.push({ id: `exp:${r.id}:${e.id}`, kind: 'expansion', label: EXPANSIONS[kind]?.name ?? 'Expansion', ...at, w: 1, h: 1 });
      } else if (e.type === 'boss') {
        out.push({ id: `boss:${r.id}:${e.id}`, kind: 'boss', label: prop(e, 'name', 'Boss'), ...at, x: r.tx + 1, y: r.ty + 1, w: r.tw - 2, h: r.th - 2, req: prop(e, 'weak', '') });
      } else if (e.type === 'trigger' && prop(e, 'action', 'message') === 'flag') {
        out.push({ id: `trig:${r.id}:${e.id}`, kind: 'trigger', label: `Trigger ${prop(e, 'flag', '')}`, ...at, w: prop(e, 'w', 2), h: prop(e, 'h', 3), req: prop(e, 'when', '') });
      } else if (e.type === 'exit') {
        out.push({ id: `exit:${r.id}:${e.id}`, kind: 'exit', label: 'Exit', ...at, w: 3, h: 2, req: prop(e, 'when', '') });
      }
    }),
  );
  return out;
}

/** Capabilities and counts from what has been collected so far. */
function haveFrom(c: ProjectContent, done: Set<string>, targets: Target[]): Have {
  const caps = new Set<string>(BASE_CAPS);
  const counts: Record<string, number> = { missiles: 0, supers: 0, novas: 0, energy: 0 };
  const flags = new Set<string>();
  const byId = new Map(targets.map((t) => [t.id, t]));
  done.forEach((id) => {
    const t = byId.get(id);
    if (!t) return;
    if (t.kind === 'boss' || t.kind === 'trigger') {
      const r = c.rooms.find((x) => x.id === t.room);
      const e = r?.entities?.find((x) => id.endsWith(`:${x.id}`));
      const f = e ? prop(e, 'flag', '') : '';
      if (f) flags.add(f);
    }
    if (t.kind === 'expansion') {
      const r = c.rooms.find((x) => x.id === t.room);
      const e = r?.entities?.find((x) => id.endsWith(`:${x.id}`));
      const k = (e ? prop(e, 'kind', 'missiles') : 'missiles') as ExpansionKind;
      counts[k] = (counts[k] ?? 0) + (k === 'energy' ? 1 : EXPANSIONS[k].amount);
    }
  });
  flags.forEach((f) => caps.add(`flag:${f}`));
  done.forEach((id) => {
    const t = byId.get(id);
    if (t?.kind !== 'key' || !t.node) return;
    const n = c.nodes.find((x) => x.id === t.node);
    if (!n) return;
    caps.add(`key:${n.id}`);
    if (n.dormantUntil && !flags.has(n.dormantUntil)) return;
    const a = abilityById(n.ability, c.abilities);
    if (a) {
      a.caps.forEach((cap) => caps.add(cap));
      if (a.ammo) counts[a.ammo.kind] = (counts[a.ammo.kind] ?? 0) + a.ammo.amount;
    } else caps.add(n.ability ?? n.id);
  });
  return { caps, counts };
}

interface Reach {
  /** Tiles covered by the player's body in some reachable state. */
  covered: Uint8Array;
  /** Room-to-room moves seen, as "from>to" by room index. */
  edges: Set<string>;
}

function explore(g: Grid, c: ProjectContent, have: Have, tricks: Set<string>, start: number): Reach {
  const { W, H, tile, door, doors } = g;
  const caps = have.caps;
  const has = (k: string) => caps.has(k);
  const locked = new Set<number>();
  g.rooms.forEach((r, ri) => {
    const isLocked = c.nodes.some(
      (n) => n.kind === 'gate' && n.room === r.id && n.req.some((k) => c.nodes.find((x) => x.id === k && isKey(x)) && !has(`key:${k}`)),
    );
    if (isLocked) locked.add(ri);
  });
  const doorOpen = doors.map((d) => meets(d.req, have));
  const roll = has('roll');
  const pass = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const t = tile[i];
    if (t === OUT || (g.room[i] >= 0 && locked.has(g.room[i]))) continue;
    if (door[i] >= 0 && !doorOpen[door[i]]) continue;
    let ok = false;
    switch (t) {
      case Tile.Empty:
      case Tile.Platform:
      case Tile.Water:
      case Tile.Crumble:
      case Tile.ShotBlock:
        ok = true;
        break;
      case Tile.Lava:
        ok = has('thermal');
        break;
      case Tile.BombBlock:
        ok = roll && (has('bomb') || has('nova'));
        break;
      case Tile.MissileBlock:
        ok = has('missile') || has('super');
        break;
      case Tile.SuperBlock:
        ok = has('super');
        break;
      case Tile.NovaBlock:
        ok = roll && has('nova');
        break;
      case Tile.SpeedBlock:
        ok = has('speed');
        break;
      case Tile.BladeBlock:
        ok = has('blade');
        break;
    }
    pass[i] = ok ? 1 : 0;
  }
  const P = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && pass[y * W + x] === 1;
  const floorAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const t = tile[y * W + x];
    return t === OUT || isFloor(t) || (door[y * W + x] >= 0 && !doorOpen[door[y * W + x]]);
  };
  const wallAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const t = tile[y * W + x];
    return t === OUT || isSolid(t);
  };
  const reach = jumpReach(c.physics);
  const tide = has('tide');
  const spring = has('spring');
  const jumpFrom = (x: number, y: number) => {
    const wet = tile[y * W + x] === Tile.Water && !tide;
    return Math.min(HM, wet ? (spring ? reach.springWater : reach.water) : spring ? reach.spring : reach.normal);
  };
  const bodyOk = (x: number, y: number, form: number) => P(x, y) && (form === 1 || P(x, y - 1));

  const visited = new Uint8Array(W * H * 2 * (HM + 1) * 2);
  const covered = new Uint8Array(W * H);
  const edges = new Set<string>();
  const queue: number[] = [];
  const enc = (x: number, y: number, form: number, up: number, dj: number) => ((((y * W + x) * 2 + form) * (HM + 1) + up) << 1) | dj;
  let fromRoom = -1;
  const push = (x: number, y: number, form: number, up: number, dj: number) => {
    if (!bodyOk(x, y, form)) return;
    const s = enc(x, y, form, Math.max(0, Math.min(HM, up)), dj);
    if (visited[s]) return;
    visited[s] = 1;
    queue.push(s);
    const r = g.room[y * W + x];
    if (fromRoom >= 0 && r >= 0 && r !== fromRoom) edges.add(`${fromRoom}>${r}`);
  };

  const sx = start % W;
  const sy = Math.floor(start / W);
  push(sx, sy, 0, 0, 0);
  const ibj = tricks.has('ibj') && roll && has('bomb');
  const wj = tricks.has('walljump');
  for (let qi = 0; qi < queue.length; qi++) {
    let s = queue[qi];
    const dj = s & 1;
    s >>= 1;
    const up = s % (HM + 1);
    s = (s - up) / (HM + 1);
    const form = s % 2;
    const ti = (s - form) / 2;
    const x = ti % W;
    const y = (ti - x) / W;
    fromRoom = g.room[ti];
    covered[ti] = 1;
    if (form === 0 && y > 0) covered[ti - W] = 1;

    const ground = floorAt(x, y + 1);
    if (ground) {
      if (up > 0 || dj) push(x, y, form, 0, 0);
      if (up === 0) {
        push(x - 1, y, form, 0, 0);
        push(x + 1, y, form, 0, 0);
        if (form === 0) {
          push(x, y, 0, jumpFrom(x, y), 0);
          if (roll) push(x, y, 1, 0, 0);
        } else {
          push(x, y, 0, 0, 0);
          if (roll && has('bomb')) push(x, y, 1, reach.bomb, 0);
        }
      }
    }
    if (up > 0) {
      // Rising: straight up, diagonally (air control), or sideways; letting go starts the fall.
      push(x, y - 1, form, up - 1, dj);
      for (const dx of [-1, 1]) {
        if (bodyOk(x, y - 1, form) || bodyOk(x + dx, y, form)) push(x + dx, y - 1, form, up - 1, dj);
        push(x + dx, y, form, up - 1, dj);
      }
      push(x, y, form, 0, dj);
    } else if (!ground) {
      for (const dx of [0, -1, 1]) {
        if (dx && !bodyOk(x + dx, y, form)) continue;
        const nx = x + dx;
        // Falling onto a platform lands on top of it.
        if (tile[(y + 1) * W + nx] === Tile.Platform) push(nx, y, form, 0, dj);
        else push(nx, y + 1, form, 0, dj);
      }
      if (form === 0) {
        if (has('skystep')) push(x, y, 0, jumpFrom(x, y), dj);
        else if (has('djump') && !dj) push(x, y, 0, jumpFrom(x, y), 1);
        if (wj && (wallAt(x - 1, y) || wallAt(x + 1, y))) push(x, y, 0, jumpFrom(x, y), dj);
      } else if (ibj) push(x, y, 1, reach.bomb, dj);
    }
  }
  return { covered, edges };
}

function touched(t: Target, covered: Uint8Array, W: number): boolean {
  for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) if (covered[y * W + x]) return true;
  return false;
}

/** Start tile in world tiles: the start node's position or its room's floor spot. */
function startTile(c: ProjectContent, world: WorldRoom[], W: number): number | null {
  const st = c.nodes.find((n) => n.kind === 'start');
  const r = world.find((x) => x.id === st?.room);
  if (!st || !r) return null;
  if (st.pos) return (r.ty + st.pos.y) * W + r.tx + st.pos.x;
  const f = floorSpot(r);
  return (f.y - 1) * W + Math.floor(f.x);
}

export function solve(c: ProjectContent, opts: SolveOptions = {}): SolveResult {
  const world = buildWorld(c.rooms, c.doors);
  const g = bake(world);
  const targets = collectTargets(c, world);
  const tricks = new Set([...c.tricks, ...(opts.extraTricks ?? [])]);
  const issues: Issue[] = [];
  const stepOf: Record<string, number> = {};
  const waves: string[][] = [];
  const doorStep: Record<string, number> = {};
  const start = startTile(c, world, g.W);
  const roomIds = world.map((r) => r.id);
  const reached = new Set<string>();
  const empty: SolveResult = { beatable: false, stepOf, waves, targets, rooms: reached, doorStep, issues, W: g.W, H: g.H, covered: new Uint8Array(g.W * g.H) };
  if (start === null) {
    issues.push({ sev: 'error', msg: 'No start room. Drag the Start node onto a room.' });
    return empty;
  }

  const done = new Set<string>();
  const perWave: { reach: Reach; have: Have }[] = [];
  for (let wave = 0; wave < 200; wave++) {
    const have = haveFrom(c, done, targets);
    const reach = explore(g, c, have, tricks, start);
    perWave.push({ reach, have });
    g.doors.forEach((d) => {
      if (doorStep[d.link] === undefined && meets(d.req, have)) doorStep[d.link] = wave;
    });
    const fresh = targets.filter((t) => !done.has(t.id) && touched(t, reach.covered, g.W) && meets(t.req, have));
    if (!fresh.length) break;
    waves.push(fresh.map((t) => t.id));
    fresh.forEach((t) => {
      done.add(t.id);
      stepOf[t.id] = wave;
    });
  }
  const last = perWave[perWave.length - 1];
  for (let i = 0; i < g.W * g.H; i++) if (last.reach.covered[i] && g.room[i] >= 0) reached.add(roomIds[g.room[i]]);

  // Goal: an exit if the project has one, else the goal node's room (and its boss, if any).
  const exits = targets.filter((t) => t.kind === 'exit');
  const goal = c.nodes.find((n) => n.kind === 'boss');
  let beatable: boolean;
  if (exits.length) beatable = exits.some((t) => done.has(t.id));
  else if (goal?.room) {
    const bosses = targets.filter((t) => t.kind === 'boss' && t.room === goal.room);
    beatable = reached.has(goal.room) && bosses.every((b) => done.has(b.id));
  } else beatable = false;

  const roomName = (id: string) => c.rooms.find((r) => r.id === id)?.name ?? id;
  if (!beatable) {
    issues.push(
      exits.length
        ? { sev: 'error', msg: 'No exit can be reached, so the game can’t be finished.', room: exits[0].room }
        : { sev: 'error', msg: `${goal?.label ?? 'The goal'} can't be reached or defeated, so the game can't be finished.`, room: goal?.room ?? undefined, node: goal?.id },
    );
  }
  targets.forEach((t) => {
    if (done.has(t.id)) return;
    if (t.kind === 'key') issues.push({ sev: 'error', msg: `${t.label} in ${roomName(t.room)} can't be reached with the moves available.`, room: t.room, node: t.node });
    else if (t.kind === 'expansion') issues.push({ sev: 'warn', msg: `${t.label} in ${roomName(t.room)} can't be reached.`, room: t.room });
    else if (t.kind === 'boss') issues.push({ sev: 'warn', msg: `${t.label} in ${roomName(t.room)} can't be reached or hurt.`, room: t.room });
    else if (t.kind === 'trigger') issues.push({ sev: 'warn', msg: `${t.label} in ${roomName(t.room)} never fires.`, room: t.room });
  });
  c.rooms.forEach((r) => {
    if (!reached.has(r.id)) issues.push({ sev: 'warn', msg: `${r.name} can't be entered by the end.`, room: r.id });
  });

  // Softlocks: at each stage, a room you can reach but can't leave toward that stage's progress.
  if (!opts.quick) {
    const startRoom = g.room[start];
    const warned = new Set<number>();
    perWave.forEach(({ reach }, wave) => {
      const goalRooms = new Set<number>();
      (waves[wave] ?? []).forEach((id) => {
        const t = targets.find((x) => x.id === id);
        if (t) goalRooms.add(roomIds.indexOf(t.room));
      });
      if (!goalRooms.size) goalRooms.add(startRoom);
      const back = new Map<number, number[]>();
      reach.edges.forEach((e) => {
        const [a, b] = e.split('>').map(Number);
        (back.get(b) ?? back.set(b, []).get(b)!).push(a);
      });
      const canProgress = new Set(goalRooms);
      const q = [...goalRooms];
      while (q.length) {
        const r = q.pop()!;
        (back.get(r) ?? []).forEach((a) => {
          if (!canProgress.has(a)) {
            canProgress.add(a);
            q.push(a);
          }
        });
      }
      const inReach = new Set<number>();
      for (let i = 0; i < g.W * g.H; i++) if (reach.covered[i] && g.room[i] >= 0) inReach.add(g.room[i]);
      inReach.forEach((r) => {
        if (canProgress.has(r) || warned.has(r)) return;
        warned.add(r);
        issues.push({ sev: 'warn', msg: `Softlock risk: after dropping into ${roomName(roomIds[r])} the player can't get back.`, room: roomIds[r] });
      });
    });
  }

  return { beatable, stepOf, waves, targets, rooms: reached, doorStep, issues, W: g.W, H: g.H, covered: last.reach.covered };
}

export interface TrickReport {
  trick: string;
  name: string;
  earlier: { label: string; from: number; to: number }[];
  /** Beatable only with this trick. */
  needed: boolean;
}

/** For each trick the project doesn't allow, which items it would let a player reach sooner. */
export function trickReports(c: ProjectContent, base: SolveResult): TrickReport[] {
  return TRICKS.filter((t) => !c.tricks.includes(t.id)).map((t) => {
    const r = solve(c, { extraTricks: [t.id], quick: true });
    const earlier = base.targets
      .filter((x) => x.kind === 'key' && r.stepOf[x.id] !== undefined && (base.stepOf[x.id] === undefined || r.stepOf[x.id] < base.stepOf[x.id]))
      .map((x) => ({ label: x.label, from: base.stepOf[x.id] ?? -1, to: r.stepOf[x.id] }));
    return { trick: t.id, name: t.name, earlier, needed: !base.beatable && r.beatable };
  });
}
