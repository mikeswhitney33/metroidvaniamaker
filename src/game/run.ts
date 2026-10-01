import { abilityById, BASE_CAPS, EXPANSIONS, type AmmoKind, type ExpansionKind, type Have } from '../model/abilities';
import type { ProjectContent } from '../model/project';

/** Energy a fresh run starts with, and each tank's worth. */
export const BASE_ENERGY = 99;
export const TANK = 100;

export type Weapon = 'beam' | AmmoKind;

/**
 * Everything about a run that a save file keeps: what has been collected, what has
 * happened, and where the player is. Plain data so it serialises as-is.
 */
export interface RunData {
  room: string;
  x: number;
  y: number;
  energy: number;
  ammo: Record<AmmoKind, number>;
  /** Key nodes collected. */
  keys: string[];
  /** Expansion ids collected (`exp:<room>:<entity>`). */
  expansions: string[];
  flags: string[];
  /** Hatch links opened. */
  opened: string[];
  /** Rooms entered at least once. */
  visited: string[];
  /** Areas whose map station has been used. */
  mapped: string[];
  /** Enemies that stay dead (`<room>:<entity>`). */
  dead: string[];
  /** Abilities taken away by a strip trigger, until a restore trigger. */
  stripped: boolean;
  /** Play time in seconds. */
  time: number;
}

export function newRun(room: string, x: number, y: number): RunData {
  return {
    room,
    x,
    y,
    energy: BASE_ENERGY,
    ammo: { missiles: 0, supers: 0, novas: 0 },
    keys: [],
    expansions: [],
    flags: [],
    opened: [],
    visited: [room],
    mapped: [],
    dead: [],
    stripped: false,
    time: 0,
  };
}

const expansionKind = (c: ProjectContent, id: string): ExpansionKind | null => {
  const [, roomId, entId] = id.split(':');
  const e = c.rooms.find((r) => r.id === roomId)?.entities?.find((x) => x.id === entId);
  const k = e?.props.kind;
  return typeof k === 'string' && k in EXPANSIONS ? (k as ExpansionKind) : null;
};

/**
 * Capabilities and capacities from a run, by the same rules the solver uses:
 * keys grant their ability's caps (dormant ones only once their flag is set),
 * keys without an ability grant a cap named after them, flags become `flag:<name>`.
 */
export function runHave(c: ProjectContent, r: RunData): Have & { max: Record<AmmoKind, number>; maxEnergy: number } {
  const caps = new Set<string>(BASE_CAPS);
  const max: Record<AmmoKind, number> = { missiles: 0, supers: 0, novas: 0 };
  let tanks = 0;
  r.flags.forEach((f) => caps.add(`flag:${f}`));
  r.keys.forEach((id) => {
    const n = c.nodes.find((x) => x.id === id);
    if (!n) return;
    caps.add(`key:${id}`);
    if (n.dormantUntil && !r.flags.includes(n.dormantUntil)) return;
    const a = abilityById(n.ability, c.abilities);
    if (!a) {
      caps.add(n.ability ?? n.id);
      return;
    }
    if (a.ammo) max[a.ammo.kind] += a.ammo.amount;
    if (!r.stripped) a.caps.forEach((cap) => caps.add(cap));
  });
  r.expansions.forEach((id) => {
    const k = expansionKind(c, id);
    if (k === 'energy') tanks++;
    else if (k) max[k] += EXPANSIONS[k].amount;
  });
  const counts: Record<string, number> = { ...r.ammo, energy: tanks };
  return { caps, counts, max, maxEnergy: BASE_ENERGY + tanks * TANK };
}

/** Weapons the player can switch between, in cycle order. */
export function weapons(have: ReturnType<typeof runHave>): Weapon[] {
  const out: Weapon[] = ['beam'];
  (['missiles', 'supers', 'novas'] as const).forEach((k) => have.max[k] > 0 && out.push(k));
  return out;
}

/** A save slot key per project, so different projects don't share saves. */
export function saveKey(c: Pick<ProjectContent, 'name' | 'seed'>): string {
  return `vaultwright.run.${c.name}.${c.seed}`;
}

export function loadRun(key: string): RunData | null {
  try {
    const s = localStorage.getItem(key);
    if (!s) return null;
    const r = JSON.parse(s) as RunData;
    return typeof r.room === 'string' && Array.isArray(r.keys) ? r : null;
  } catch {
    return null;
  }
}

export function storeRun(key: string, r: RunData): void {
  try {
    localStorage.setItem(key, JSON.stringify(r));
  } catch {
    // Storage full or blocked: the run just isn't saved.
  }
}

export function clearRun(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
