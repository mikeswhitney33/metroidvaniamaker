import { linkKey, newEntity } from '../entities';
import { DEFAULT_PHYSICS, type ProjectContent } from '../project';
import { encodeTiles, Tile, tileSize } from '../tiles';
import type { Area, DoorKind, EntityType, GraphNode, Room } from '../types';
import { roughIn } from '../world';

/** One room being built: its tiles and entities, with helpers in room tile coordinates. */
export class RoomBuilder {
  readonly tw: number;
  readonly th: number;
  readonly g: Uint8Array;
  private n = 0;

  constructor(
    readonly room: Room,
    base: Uint8Array,
  ) {
    ({ tw: this.tw, th: this.th } = tileSize(room));
    this.g = base;
  }

  /** Bottom row (the floor) and the row a standing player's feet are on. */
  get floor() {
    return this.th - 1;
  }
  get stand() {
    return this.th - 2;
  }

  set(x: number, y: number, t: number) {
    if (x >= 0 && y >= 0 && x < this.tw && y < this.th) this.g[y * this.tw + x] = t;
    return this;
  }

  fill(x0: number, y0: number, x1: number, y1: number, t: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, t);
    return this;
  }

  /** A full-height wall of `t` across the room's interior at columns x0..x1. */
  wall(x0: number, x1: number, t: number, y0 = 1, y1 = this.th - 2) {
    return this.fill(x0, y0, x1, y1, t);
  }

  /** A crawlspace: solid above a one-tile gap along the floor, from x0 to x1 (needs Roll Form). */
  crawl(x0: number, x1: number, gapRow = this.th - 2) {
    this.fill(x0, 1, x1, gapRow - 1, Tile.Solid);
    return this.fill(x0, gapRow, x1, gapRow, Tile.Empty);
  }

  /** A horizontal shelf of `t` (platforms, blocks) at row y. */
  shelf(x0: number, x1: number, y: number, t: number = Tile.Platform) {
    return this.fill(x0, y, x1, y, t);
  }

  /** Clears every rough-in ledge so the room is an open box. */
  clear() {
    return this.fill(1, 1, this.tw - 2, this.th - 2, Tile.Empty);
  }

  ent(type: EntityType, x: number, y: number, props: Record<string, string | number | boolean> = {}) {
    const e = newEntity(type, `${this.room.id}e${++this.n}`, x, y);
    Object.assign(e.props, props);
    (this.room.entities ??= []).push(e);
    return this;
  }

  /** A station pad standing on the floor below (x, y): y is the feet row. */
  station(type: 'save' | 'recharge' | 'map', x: number, y = this.stand) {
    return this.ent(type, x, y + 1);
  }

  enemy(archetype: string, x: number, y = this.stand, props: Record<string, string | number | boolean> = {}) {
    return this.ent('enemy', x, y, { archetype, ...props });
  }

  expansion(kind: 'energy' | 'missiles' | 'supers' | 'novas', x: number, y = this.stand) {
    return this.ent('pickup', x, y, { kind });
  }
}

/** Assembles a project room by room, with areas, hatches and items. */
export class Builder {
  readonly rooms: RoomBuilder[] = [];
  readonly nodes: GraphNode[] = [];
  readonly doors: ProjectContent['doors'] = {};
  readonly areas: Area[] = [];
  private area = '';

  setArea(a: Area) {
    this.areas.push(a);
    this.area = a.id;
    return this;
  }

  room(id: string, name: string, x: number, y: number, w: number, h: number, base: 'rough' | 'empty' = 'rough'): RoomBuilder {
    const room: Room = { id, name, x, y, w, h, area: this.area };
    const g = roughIn(room);
    const rb = new RoomBuilder(room, g);
    if (base === 'empty') rb.clear();
    this.rooms.push(rb);
    return rb;
  }

  get(id: string): RoomBuilder {
    const r = this.rooms.find((x) => x.room.id === id);
    if (!r) throw new Error(`No room ${id}`);
    return r;
  }

  door(a: string, b: string, kind: DoorKind, flag?: string) {
    this.doors[linkKey(a, b)] = flag ? { kind, flag } : { kind };
    return this;
  }

  start(room: string, x: number, y: number) {
    this.nodes.push({ id: 'start', kind: 'start', label: 'Start', room, req: [], pos: { x, y } });
    return this;
  }

  /** A key item: picking it up grants `ability`. `y` is the row the item sits in. */
  item(id: string, label: string, ability: string, room: string, x: number, y: number, extra: Partial<GraphNode> = {}) {
    this.nodes.push({ id, kind: 'key', label, room, req: [], ability, pos: { x, y }, ...extra });
    return this;
  }

  goal(label: string, room: string) {
    this.nodes.push({ id: 'goal', kind: 'boss', label, room, req: [] });
    return this;
  }

  build(meta: Pick<ProjectContent, 'name' | 'style' | 'prompt' | 'seed'> & Partial<ProjectContent>): ProjectContent {
    const rooms = this.rooms.map((r) => ({ ...r.room, tiles: encodeTiles(r.g) }));
    const w = Math.max(...rooms.map((r) => r.x + r.w)) + 1;
    const h = Math.max(...rooms.map((r) => r.y + r.h)) + 1;
    let seq = rooms.length + 100;
    return {
      tile: '16px',
      threshold: 55,
      images: {},
      abilities: [],
      tricks: [],
      sprites: {},
      physics: DEFAULT_PHYSICS,
      ...meta,
      rooms,
      nodes: this.nodes,
      doors: this.doors,
      areas: this.areas,
      grid: { w, h },
      seq: seq++,
    };
  }
}

export { Tile };
