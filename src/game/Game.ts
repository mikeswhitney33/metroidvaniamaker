import { colorOf, isKey, rng, type NodeIndex } from '../model/graph';
import type { GraphNode, StylePreset } from '../model/types';
import { buildWorld, floorSpot, type WorldRoom } from './world';

interface Item {
  id: string;
  label: string;
  color: string;
  room: string;
  x: number;
  y: number;
}

interface Player {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  ground: boolean;
  /** Air jumps left (double jump). */
  air: number;
  /** Remaining dash time. */
  dash: number;
  /** Dash cooldown. */
  dcd: number;
  face: 1 | -1;
}

export interface GameEvents {
  onEnterRoom(room: WorldRoom): void;
  onPickup(item: { id: string; label: string }, have: string[]): void;
  onWin(boss: GraphNode): void;
}

export type GameInput = 'jump' | 'dash';

/** The playtest: a single-screen-per-room platformer built from the authored map. */
export class Game {
  readonly world: WorldRoom[];
  room: WorldRoom;
  readonly have = new Set<string>();
  readonly t0 = performance.now();
  private readonly items: Item[];
  private readonly gates: GraphNode[];
  private readonly boss: GraphNode | undefined;
  private readonly byId: NodeIndex;
  private readonly p: Player;
  private won = false;

  constructor(
    rooms: Parameters<typeof buildWorld>[0],
    nodes: GraphNode[],
    byId: NodeIndex,
    private readonly pal: StylePreset,
    private readonly jumpPower: number,
    private readonly events: GameEvents,
  ) {
    this.world = buildWorld(rooms);
    this.byId = byId;
    const st = nodes.find((n) => n.kind === 'start');
    const sr = this.world.find((r) => r.id === st?.room) ?? this.world[0];
    if (!sr) throw new Error('Cannot playtest a map with no rooms');
    this.room = sr;
    this.items = nodes
      .filter((n) => isKey(n) && n.room)
      .map((n) => {
        const r = this.world.find((x) => x.id === n.room);
        if (!r) return null;
        const p = floorSpot(r);
        return { id: n.id, label: n.label, color: n.color ?? '#dfe2e7', room: r.id, x: p.x, y: p.y - 1.1 };
      })
      .filter((x): x is Item => x !== null);
    this.gates = nodes.filter((n) => n.kind === 'gate');
    this.boss = nodes.find((n) => n.kind === 'boss');
    const sp = floorSpot(sr);
    this.p = { x: sp.x - 0.375, y: sp.y - 1.5, w: 0.75, h: 1.5, vx: 0, vy: 0, ground: false, air: 1, dash: 0, dcd: 0, face: 1 };
  }

  /** Seconds since spawn, formatted mm:ss for the run log. */
  clock(): string {
    const s = Math.floor((performance.now() - this.t0) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  private locked(id: string): boolean {
    return this.gates.some((g) => g.room === id && g.req.some((k) => isKey(this.byId[k]) && !this.have.has(k)));
  }

  private roomAt(tx: number, ty: number): WorldRoom | undefined {
    return this.world.find((r) => tx >= r.tx && tx < r.tx + r.tw && ty >= r.ty && ty < r.ty + r.th);
  }

  /** Tiles outside any room, and every tile of a locked room, are solid. */
  private solid(tx: number, ty: number): boolean {
    const r = this.roomAt(tx, ty);
    if (!r || this.locked(r.id)) return true;
    return r.g[(ty - r.ty) * r.tw + (tx - r.tx)] === 1;
  }

  private hit(p: Player): boolean {
    for (let x = Math.floor(p.x); x <= Math.floor(p.x + p.w); x++)
      for (let y = Math.floor(p.y); y <= Math.floor(p.y + p.h); y++) if (this.solid(x, y)) return true;
    return false;
  }

  step(dt: number, held: Set<string>, pressed: Set<GameInput>): void {
    const p = this.p;
    const L = held.has('ArrowLeft') || held.has('KeyA');
    const Rt = held.has('ArrowRight') || held.has('KeyD');
    const jv = this.jumpPower;
    if (pressed.has('dash') && this.have.has('dash') && p.dcd <= 0) {
      p.dash = 0.16;
      p.dcd = 0.55;
    }
    if (pressed.has('jump')) {
      if (p.ground) p.vy = -jv;
      else if (this.have.has('djump') && p.air > 0) {
        p.vy = -jv * 0.88;
        p.air--;
      }
    }
    // Sub-step so fast movement can't tunnel through one-tile walls.
    const n = Math.ceil(dt / 0.008);
    for (let i = 0; i < n; i++) {
      const h = dt / n;
      if (p.dash > 0) {
        p.dash -= h;
        p.vx = p.face * 26;
        p.vy = 0;
      } else {
        p.vx = (Number(Rt) - Number(L)) * 10;
        if (Rt !== L) p.face = Rt ? 1 : -1;
        p.vy = Math.min(p.vy + 70 * h, 32);
      }
      p.dcd -= h;
      p.x += p.vx * h;
      if (this.hit(p)) {
        p.x = p.vx > 0 ? Math.floor(p.x + p.w) - p.w - 0.001 : Math.floor(p.x) + 1;
        p.vx = 0;
        p.dash = 0;
      }
      p.ground = false;
      p.y += p.vy * h;
      if (this.hit(p)) {
        if (p.vy > 0) {
          p.y = Math.floor(p.y + p.h) - p.h - 0.001;
          p.ground = true;
          p.air = 1;
        } else p.y = Math.floor(p.y) + 1;
        p.vy = 0;
      }
    }

    const cr = this.roomAt(Math.floor(p.x + p.w / 2), Math.floor(p.y + p.h / 2));
    if (cr && cr !== this.room) {
      this.room = cr;
      this.events.onEnterRoom(cr);
      if (this.boss && cr.id === this.boss.room && !this.won) {
        this.won = true;
        this.events.onWin(this.boss);
      }
    }
    this.items.forEach((it) => {
      if (this.have.has(it.id) || it.room !== this.room.id) return;
      if (Math.abs(p.x + p.w / 2 - it.x) < 1 && Math.abs(p.y + p.h / 2 - it.y) < 1.4) {
        this.have.add(it.id);
        this.events.onPickup(it, [...this.have]);
      }
    });
  }

  draw(c: HTMLCanvasElement): void {
    const P = this.pal;
    const r = this.room;
    const dpr = window.devicePixelRatio || 1;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (c.width !== cw * dpr || c.height !== ch * dpr) {
      c.width = cw * dpr;
      c.height = ch * dpr;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0c0f';
    ctx.fillRect(0, 0, cw, ch);

    // Fit the current room to the canvas.
    const s = Math.max(3, Math.min(22, Math.floor(Math.min((cw - 40) / r.tw, (ch - 40) / r.th))));
    const ox = Math.floor((cw - r.tw * s) / 2);
    const oy = Math.floor((ch - r.th * s) / 2);

    // Background with parallax pillars.
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, r.tw * s, r.th * s);
    ctx.clip();
    ctx.fillStyle = P.bg;
    ctx.fillRect(ox, oy, r.tw * s, r.th * s);
    const R = rng(r.id.charCodeAt(0) * 131 + r.tw);
    const px = (this.p.x - r.tx) * s * 0.25;
    ctx.fillStyle = P.bg2;
    for (let i = 0; i < r.tw / 2.5; i++) {
      const w = s * (1 + R() * 2.5);
      const h = r.th * s * (0.25 + R() * 0.7);
      ctx.fillRect(ox + i * 2.5 * s * 1.3 + R() * s * 2 - px, oy + r.th * s - h, w, h);
    }
    ctx.restore();

    // Solid tiles, with a highlight on top edges.
    const eb = Math.max(1, Math.round(s / 5));
    for (let y = 0; y < r.th; y++)
      for (let x = 0; x < r.tw; x++) {
        if (!r.g[y * r.tw + x]) continue;
        ctx.fillStyle = P.wall;
        ctx.fillRect(ox + x * s, oy + y * s, s, s);
        if (y > 0 && !r.g[(y - 1) * r.tw + x]) {
          ctx.fillStyle = P.edge;
          ctx.fillRect(ox + x * s, oy + y * s, s, eb);
        }
      }

    // Doorways into locked rooms pulse in the colour of the key that opens them.
    for (let y = 0; y < r.th; y++)
      for (let x = 0; x < r.tw; x++) {
        if (r.g[y * r.tw + x]) continue;
        const edge = x === 0 || y === 0 || x === r.tw - 1 || y === r.th - 1;
        if (!edge) continue;
        const wx = r.tx + x + (x === 0 ? -1 : x === r.tw - 1 ? 1 : 0);
        const wy = r.ty + y + (y === 0 ? -1 : y === r.th - 1 ? 1 : 0);
        const nr = this.roomAt(wx, wy);
        if (nr && this.locked(nr.id)) {
          const g = this.gates.find((q) => q.room === nr.id);
          ctx.fillStyle = colorOf(g, this.byId);
          ctx.globalAlpha = 0.55 + 0.25 * Math.sin(performance.now() / 260);
          ctx.fillRect(ox + x * s, oy + y * s, s, s);
          ctx.globalAlpha = 1;
        }
      }

    // Floating key pickups.
    const tt = performance.now() / 400;
    this.items.forEach((it) => {
      if (this.have.has(it.id) || it.room !== r.id) return;
      const cx = ox + (it.x - r.tx) * s;
      const cy = oy + (it.y - r.ty + Math.sin(tt) * 0.15) * s;
      const d = s * 0.55;
      ctx.save();
      ctx.shadowColor = it.color;
      ctx.shadowBlur = s * 1.2;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // Boss silhouette.
    if (this.boss && this.boss.room === r.id) {
      const sp = floorSpot(r);
      const bw = s * 5;
      const bh = s * 6;
      const bx = ox + (sp.x - r.tx) * s - bw / 2 + s * 6;
      const by = oy + (sp.y - r.ty) * s - bh;
      ctx.fillStyle = '#0a0a0d';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#ff8a5c';
      ctx.fillRect(bx + s * 1, by + s * 1.5, s * 0.8, s * 0.5);
      ctx.fillRect(bx + bw - s * 1.8, by + s * 1.5, s * 0.8, s * 0.5);
    }

    // Player, with a visor and a dash afterimage.
    const p = this.p;
    const X = ox + (p.x - r.tx) * s;
    const Y = oy + (p.y - r.ty) * s;
    ctx.fillStyle = P.player;
    ctx.fillRect(X, Y, p.w * s, p.h * s);
    ctx.fillStyle = P.bg;
    ctx.fillRect(X + (p.face > 0 ? p.w * s * 0.45 : p.w * s * 0.1), Y + p.h * s * 0.2, p.w * s * 0.45, p.h * s * 0.14);
    if (p.dash > 0) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = P.player;
      ctx.fillRect(X - p.face * s * 1.2, Y, p.w * s, p.h * s);
      ctx.globalAlpha = 1;
    }
  }
}
