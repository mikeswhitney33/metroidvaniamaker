import type { AbilityDef } from './types';

/**
 * The ability rulebook: what each powerup lets the player do, as capabilities.
 * Gates (door hatches, blocks, liquids, boss requirements) name capabilities, so the
 * solver, the editor and the runtime all read the same rules.
 */
export interface Ability extends AbilityDef {
  /** Ammo this pickup adds, when it is an ammo weapon. */
  ammo?: { kind: AmmoKind; amount: number };
  /** Button hint shown on pickup. */
  button?: string;
  builtIn?: boolean;
}

export type AmmoKind = 'missiles' | 'supers' | 'novas';

/** Capabilities every player has from the start. */
export const BASE_CAPS = ['shot'];

const RULEBOOK: Ability[] = [
  { id: 'roll', name: 'Roll Form', color: '#f0b44c', caps: ['roll'], desc: 'Curl into a ball to fit through one-tile gaps.', button: 'Down twice' },
  { id: 'bombs', name: 'Bombs', color: '#e8954c', caps: ['bomb'], desc: 'Drop bombs while rolled to break bomb blocks and bounce upward.', button: 'Shoot while rolled' },
  { id: 'missiles', name: 'Missiles', color: '#e0584f', caps: ['missile'], ammo: { kind: 'missiles', amount: 5 }, desc: 'Open red hatches and crack missile blocks.', button: 'Select, then Shoot' },
  { id: 'supers', name: 'Super Missiles', color: '#4fbf6a', caps: ['super'], ammo: { kind: 'supers', amount: 2 }, desc: 'Heavy missiles that open green hatches.', button: 'Select, then Shoot' },
  { id: 'novas', name: 'Nova Bombs', color: '#e8c94a', caps: ['nova'], ammo: { kind: 'novas', amount: 2 }, desc: 'A room-wide blast that opens yellow hatches.', button: 'Select, then Shoot while rolled' },
  { id: 'charge', name: 'Charge Shot', color: '#f2e3a0', caps: ['charge'], desc: 'Hold Shoot to charge a stronger blast.', button: 'Hold Shoot' },
  { id: 'long', name: 'Long Shot', color: '#d8d0ff', caps: ['long'], desc: 'Your beam reaches across the whole screen.' },
  { id: 'frost', name: 'Frost Beam', color: '#8fdcff', caps: ['frost'], desc: 'Freeze enemies into platforms.' },
  { id: 'phase', name: 'Phase Beam', color: '#c58cff', caps: ['phase'], desc: 'Shots pass through walls.' },
  { id: 'lance', name: 'Lance Beam', color: '#7fffa0', caps: ['lance'], desc: 'Shots pierce through enemies.' },
  { id: 'spring', name: 'Spring Boots', color: '#7aa2ff', caps: ['spring'], desc: 'Jump much higher.' },
  { id: 'velocity', name: 'Velocity Drive', color: '#62d0e6', caps: ['speed'], desc: 'Run long enough to blaze through speed blocks.', button: 'Run' },
  { id: 'thermal', name: 'Thermal Suit', color: '#ff9a5c', caps: ['thermal'], desc: 'Shrug off heat and lava.' },
  { id: 'tide', name: 'Tide Suit', color: '#4fa3ff', caps: ['tide', 'thermal'], desc: 'Move freely in water; also resists heat.' },
  { id: 'skystep', name: 'Sky Step', color: '#b0f0ff', caps: ['skystep'], desc: 'Jump again in midair, as often as you like.', button: 'Jump in midair' },
  { id: 'blade', name: 'Blade Spin', color: '#c27ee8', caps: ['blade'], desc: 'Your spin jump cuts through enemies and blade blocks.' },
  { id: 'dash', name: 'Dash Boots', color: '#5ec4e8', caps: ['dash'], desc: 'Burst forward.', button: 'Dash' },
  { id: 'djump', name: 'Double Jump', color: '#f0b44c', caps: ['djump'], desc: 'Jump once more in midair.', button: 'Jump in midair' },
];

export const BUILT_IN_ABILITIES: Ability[] = RULEBOOK.map((a) => ({ ...a, builtIn: true }));

/** Optional collectibles: they add capacity, they are never keys. */
export const EXPANSIONS = {
  energy: { name: 'Energy Tank', color: '#ff6fae', amount: 100 },
  missiles: { name: 'Missile Tank', color: '#e0584f', amount: 5 },
  supers: { name: 'Super Missile Tank', color: '#4fbf6a', amount: 2 },
  novas: { name: 'Nova Bomb Tank', color: '#e8c94a', amount: 2 },
} as const;
export type ExpansionKind = keyof typeof EXPANSIONS;

/** Sequence breaks the solver may count on, when the author allows them. */
export const TRICKS = [
  { id: 'ibj', name: 'Infinite bomb jumps', desc: 'Chain bombs while rolled to climb any height (needs Bombs).' },
  { id: 'walljump', name: 'Wall jumps', desc: 'Kick off walls while spin jumping to climb shafts.' },
] as const;
export type TrickId = (typeof TRICKS)[number]['id'];

export function allAbilities(custom: AbilityDef[] = []): Ability[] {
  return [...BUILT_IN_ABILITIES, ...custom.filter((c) => !BUILT_IN_ABILITIES.some((b) => b.id === c.id))];
}

export function abilityById(id: string | undefined, custom: AbilityDef[] = []): Ability | undefined {
  return id ? allAbilities(custom).find((a) => a.id === id) : undefined;
}

// Requirement expressions: `missile`, `bomb | nova`, `roll & (bomb | nova)`, `missiles>=10`.

export type Req =
  | { op: 'true' }
  | { op: 'cap'; cap: string }
  | { op: 'count'; name: string; min: number }
  | { op: 'and' | 'or'; a: Req; b: Req };

export class ReqError extends Error {}

export function parseReq(src: string): Req {
  const toks = src.match(/\s*(>=|[&|()]|[A-Za-z0-9_:.-]+|\S)/g)?.map((t) => t.trim()) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const take = () => toks[i++];
  const factor = (): Req => {
    const t = take();
    if (t === undefined) throw new ReqError('Requirement ends too early.');
    if (t === '(') {
      const e = expr();
      if (take() !== ')') throw new ReqError('Missing ")".');
      return e;
    }
    if (!/^[A-Za-z0-9_:.-]+$/.test(t)) throw new ReqError(`Unexpected "${t}".`);
    if (peek() === '>=') {
      take();
      const n = Number(take());
      if (!Number.isFinite(n)) throw new ReqError(`"${t} >=" needs a number.`);
      return { op: 'count', name: t, min: n };
    }
    return { op: 'cap', cap: t };
  };
  const term = (): Req => {
    let a = factor();
    while (peek() === '&') {
      take();
      a = { op: 'and', a, b: factor() };
    }
    return a;
  };
  const expr = (): Req => {
    let a = term();
    while (peek() === '|') {
      take();
      a = { op: 'or', a, b: term() };
    }
    return a;
  };
  if (!toks.length) return { op: 'true' };
  const e = expr();
  if (i < toks.length) throw new ReqError(`Unexpected "${toks[i]}".`);
  return e;
}

export interface Have {
  caps: Set<string>;
  counts: Partial<Record<string, number>>;
}

export function evalReq(r: Req, h: Have): boolean {
  switch (r.op) {
    case 'true':
      return true;
    case 'cap':
      return h.caps.has(r.cap);
    case 'count':
      return (h.counts[r.name] ?? 0) >= r.min;
    case 'and':
      return evalReq(r.a, h) && evalReq(r.b, h);
    case 'or':
      return evalReq(r.a, h) || evalReq(r.b, h);
  }
}

/** Parses and evaluates; a malformed requirement is never met. */
export function meets(src: string | undefined, h: Have): boolean {
  try {
    return evalReq(parseReq(src ?? ''), h);
  } catch {
    return false;
  }
}
