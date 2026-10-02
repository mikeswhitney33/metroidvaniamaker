import { doorReq } from '../model/entities';
import { isKey, type NodeIndex } from '../model/graph';
import { isSolid, Tile } from '../model/tiles';
import type { DoorSpec, GraphNode, Room } from '../model/types';
import { buildWorld, DOOR_H, type WorldDoor, type WorldRoom } from '../model/world';

/** Seconds a crumble block stays gone. */
const CRUMBLE_REGROW = 3;
/** Seconds a crumble block holds after it's first stood on. */
export const CRUMBLE_DELAY = 0.35;

/**
 * The world at run time: baked rooms plus everything that changes while playing:
 * broken blocks, crumbling floors, opened hatches, boss-room lockdowns.
 */
export class Level {
  readonly rooms: WorldRoom[];
  readonly byId: Map<string, WorldRoom>;
  /** World tile index → time it grows back (Infinity: when the player leaves the room). */
  private broken = new Map<number, number>();
  /** Crumble tiles stood on: index → time they give way. */
  private crumbling = new Map<number, number>();
  readonly opened = new Set<string>();
  /** Rooms whose hatches are held shut (a boss fight in progress). */
  readonly lockdown = new Set<string>();
  flags = new Set<string>();
  private grid: Int16Array;
  readonly W: number;
  readonly H: number;
  time = 0;

  constructor(
    rooms: Room[],
    doors: Record<string, DoorSpec>,
    private readonly nodes: GraphNode[],
    private readonly byNode: NodeIndex,
    private readonly keys: () => Set<string>,
  ) {
    this.rooms = buildWorld(rooms, doors);
    this.byId = new Map(this.rooms.map((r) => [r.id, r]));
    let W = 1;
    let H = 1;
    this.rooms.forEach((r) => {
      W = Math.max(W, r.tx + r.tw);
      H = Math.max(H, r.ty + r.th);
    });
    this.W = W;
    this.H = H;
    this.grid = new Int16Array(W * H).fill(-1);
    this.rooms.forEach((r, i) => {
      for (let y = 0; y < r.th; y++) for (let x = 0; x < r.tw; x++) this.grid[(r.ty + y) * W + r.tx + x] = i;
    });
  }

  roomAt(tx: number, ty: number): WorldRoom | undefined {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return undefined;
    const i = this.grid[ty * this.W + tx];
    return i >= 0 ? this.rooms[i] : undefined;
  }

  /** Legacy lock & key gates: a gate node seals its whole room until its keys are found. */
  locked(roomId: string): boolean {
    const have = this.keys();
    return this.nodes.some(
      (g) => g.kind === 'gate' && g.room === roomId && g.req.some((k) => isKey(this.byNode[k]) && !have.has(k)),
    );
  }

  /** The tile's current kind; outside rooms and sealed rooms read as solid. */
  tile(tx: number, ty: number): number {
    const r = this.roomAt(tx, ty);
    if (!r || this.locked(r.id)) return Tile.Solid;
    const i = ty * this.W + tx;
    if (this.broken.has(i)) return Tile.Empty;
    return r.g[(ty - r.ty) * r.tw + (tx - r.tx)];
  }

  doorAt(tx: number, ty: number): { room: WorldRoom; door: WorldDoor } | null {
    const r = this.roomAt(tx, ty);
    if (!r) return null;
    const lx = tx - r.tx;
    const ly = ty - r.ty;
    const door = r.doors.find((d) => d.x === lx && ly >= d.y && ly < d.y + DOOR_H);
    return door ? { room: r, door } : null;
  }

  doorOpen(room: WorldRoom, d: WorldDoor): boolean {
    if (this.lockdown.has(room.id) || this.lockdown.has(d.to)) return false;
    if (d.spec.kind === 'grey') return !!d.spec.flag && this.flags.has(d.spec.flag);
    return this.opened.has(d.link);
  }

  /** What the door needs, as a requirement expression. */
  doorNeeds(d: WorldDoor): string {
    return doorReq(d.spec);
  }

  /** Blocks movement: solid tiles, unbroken blocks and shut hatches. */
  solid(tx: number, ty: number): boolean {
    if (isSolid(this.tile(tx, ty))) return true;
    const d = this.doorAt(tx, ty);
    return !!d && !this.doorOpen(d.room, d.door);
  }

  breakTile(tx: number, ty: number, until = Infinity) {
    this.broken.set(ty * this.W + tx, until);
  }

  /** Start a crumble block giving way. */
  stepOn(tx: number, ty: number) {
    const i = ty * this.W + tx;
    if (this.tile(tx, ty) === Tile.Crumble && !this.crumbling.has(i)) this.crumbling.set(i, this.time + CRUMBLE_DELAY);
  }

  update(dt: number) {
    this.time += dt;
    this.crumbling.forEach((at, i) => {
      if (this.time >= at) {
        this.crumbling.delete(i);
        this.broken.set(i, this.time + CRUMBLE_REGROW);
      }
    });
    this.broken.forEach((until, i) => {
      if (until !== Infinity && this.time >= until) this.broken.delete(i);
    });
  }

  /** Leaving a room regrows its broken blocks, as in the classics. */
  regrow(room: WorldRoom) {
    this.broken.forEach((_, i) => {
      const x = i % this.W;
      const y = (i - x) / this.W;
      if (x >= room.tx && x < room.tx + room.tw && y >= room.ty && y < room.ty + room.th) this.broken.delete(i);
    });
  }

  /** Version of the room's tiles, for render caches. */
  stamp(room: WorldRoom): string {
    let s = '';
    this.broken.forEach((_, i) => {
      const x = i % this.W;
      const y = (i - x) / this.W;
      if (x >= room.tx && x < room.tx + room.tw && y >= room.ty && y < room.ty + room.th) s += `${i},`;
    });
    return s;
  }
}
