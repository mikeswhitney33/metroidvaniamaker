import type { DoorKind, DoorSpec, Entity, EntityType } from './types';

export interface PropSpec {
  key: string;
  label: string;
  kind: 'select' | 'text' | 'number' | 'bool';
  options?: string[];
  default: string | number | boolean;
  hint?: string;
}

export interface EntitySpec {
  label: string;
  color: string;
  /** Footprint in tiles, for drawing and touch checks. */
  w: number;
  h: number;
  props: PropSpec[];
}

export const ENEMY_ARCHETYPES = ['crawler', 'walker', 'hopper', 'swooper', 'flyer', 'turret', 'spawner', 'shelled', 'sentry'] as const;
export type EnemyArchetype = (typeof ENEMY_ARCHETYPES)[number];

export const BOSS_KINDS = ['worm', 'giant', 'flyer', 'brain', 'mech'] as const;
export type BossKind = (typeof BOSS_KINDS)[number];

/** Schema for each entity type; the inspector is generated from it. */
export const ENTITY_SPECS: Record<EntityType, EntitySpec> = {
  save: { label: 'Save station', color: '#4fd1a5', w: 2, h: 1, props: [] },
  recharge: { label: 'Recharge station', color: '#ff6fae', w: 2, h: 1, props: [] },
  map: { label: 'Map station', color: '#7aa2ff', w: 2, h: 1, props: [] },
  statue: {
    label: 'Hint statue',
    color: '#d9c27a',
    w: 2,
    h: 3,
    props: [{ key: 'message', label: 'Message', kind: 'text', default: 'The way onward is marked on your map.' }],
  },
  pickup: {
    label: 'Expansion',
    color: '#ff6fae',
    w: 1,
    h: 1,
    props: [{ key: 'kind', label: 'Kind', kind: 'select', options: ['energy', 'missiles', 'supers', 'novas'], default: 'missiles' }],
  },
  enemy: {
    label: 'Enemy',
    color: '#e86b5a',
    w: 1,
    h: 1,
    props: [
      { key: 'archetype', label: 'Behaviour', kind: 'select', options: [...ENEMY_ARCHETYPES], default: 'crawler' },
      { key: 'hp', label: 'Health', kind: 'number', default: 20 },
      { key: 'speed', label: 'Speed', kind: 'number', default: 3 },
      { key: 'damage', label: 'Contact damage', kind: 'number', default: 10 },
      { key: 'weak', label: 'Hurt by', kind: 'text', default: '', hint: 'Requirement, e.g. missile. Empty: any shot' },
      { key: 'respawn', label: 'Respawns', kind: 'bool', default: true },
    ],
  },
  boss: {
    label: 'Boss',
    color: '#ff8a5c',
    w: 4,
    h: 4,
    props: [
      { key: 'kind', label: 'Kind', kind: 'select', options: [...BOSS_KINDS], default: 'worm' },
      { key: 'name', label: 'Name', kind: 'text', default: 'Guardian' },
      { key: 'hp', label: 'Health', kind: 'number', default: 300 },
      { key: 'flag', label: 'Sets flag', kind: 'text', default: 'boss1', hint: 'World flag set on defeat; grey doors and triggers read it' },
      { key: 'weak', label: 'Hurt by', kind: 'text', default: '', hint: 'Requirement, e.g. missile. Empty: any shot' },
      { key: 'escape', label: 'Escape timer (s)', kind: 'number', default: 0, hint: '0: no escape sequence' },
      { key: 'escapeTo', label: 'Escape to room', kind: 'text', default: '' },
    ],
  },
  trigger: {
    label: 'Trigger',
    color: '#b48cff',
    w: 2,
    h: 3,
    props: [
      { key: 'action', label: 'Action', kind: 'select', options: ['flag', 'strip', 'restore', 'message'], default: 'message' },
      { key: 'flag', label: 'Flag', kind: 'text', default: '' },
      { key: 'message', label: 'Message', kind: 'text', default: '' },
      { key: 'when', label: 'Only when', kind: 'text', default: '', hint: 'Requirement; flags are caps named flag:<name>' },
      { key: 'w', label: 'Width (tiles)', kind: 'number', default: 2 },
      { key: 'h', label: 'Height (tiles)', kind: 'number', default: 3 },
    ],
  },
  exit: {
    label: 'Exit (finish)',
    color: '#4fd1a5',
    w: 3,
    h: 2,
    props: [{ key: 'when', label: 'Only when', kind: 'text', default: '', hint: 'Requirement to finish here' }],
  },
};

export function newEntity(type: EntityType, id: string, x: number, y: number): Entity {
  const props: Entity['props'] = {};
  ENTITY_SPECS[type].props.forEach((p) => (props[p.key] = p.default));
  return { id, type, x, y, props };
}

export function prop(e: Entity, key: string, fallback: string): string;
export function prop(e: Entity, key: string, fallback: number): number;
export function prop(e: Entity, key: string, fallback: boolean): boolean;
export function prop(e: Entity, key: string, fallback: string | number | boolean) {
  const v = e.props[key];
  return typeof v === typeof fallback ? v : fallback;
}

/** Doors are stored per pair of touching rooms, under the pair's sorted ids. */
export const linkKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const DOOR_KINDS: { kind: DoorKind; label: string; color: string; req: string }[] = [
  { kind: 'open', label: 'Open doorway', color: 'transparent', req: '' },
  { kind: 'blue', label: 'Blue hatch (any shot)', color: '#4f8cff', req: 'shot' },
  { kind: 'red', label: 'Red hatch (missile)', color: '#e0584f', req: 'missile' },
  { kind: 'green', label: 'Green hatch (super)', color: '#4fbf6a', req: 'super' },
  { kind: 'yellow', label: 'Yellow hatch (nova)', color: '#e8c94a', req: 'nova' },
  { kind: 'grey', label: 'Grey hatch (flag)', color: '#8a8f99', req: '' },
];

export const doorInfo = (k: DoorKind) => DOOR_KINDS.find((d) => d.kind === k) ?? DOOR_KINDS[0];

/** What it takes to open a door, as a requirement expression. */
export function doorReq(d: DoorSpec): string {
  if (d.kind === 'grey') return d.flag ? `flag:${d.flag}` : '';
  return doorInfo(d.kind).req;
}
