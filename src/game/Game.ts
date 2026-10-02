import { abilityById, EXPANSIONS, meets, type AmmoKind, type ExpansionKind } from '../model/abilities';
import { prop } from '../model/entities';
import { indexNodes, isKey } from '../model/graph';
import type { ProjectContent } from '../model/project';
import { presetById } from '../model/sampleProject';
import type { Entity, StylePreset } from '../model/types';
import { floorSpot, type WorldRoom } from '../model/world';
import { overlaps, type Box } from './body';
import { Boss, Enemy, type Actor, type ActorWorld } from './enemies';
import type { Controls } from './input';
import { Level } from './level';
import { Player, type PlayerWorld } from './player';
import { drawGame } from './render';
import { Animator } from './rig';
import { loadRun, newRun, runHave, storeRun, weapons, type RunData, type Weapon } from './run';
import { blastTiles, circleHits, stepShot, type Blast, type Bomb, type Shot } from './shots';
import type { Sound } from './audio';

export { drawTiles } from './render';

/** The game runs at a fixed step so physics behave the same on every machine. */
export const STEP = 1 / 60;

export interface GameEvents {
  onEnterRoom?(room: WorldRoom): void;
  /** Collected something; `desc` is set for abilities. */
  onPickup?(label: string, desc?: string): void;
  onMessage?(msg: string): void;
  onHurt?(room: WorldRoom, energy: number): void;
  onDeath?(): void;
  onWin?(msg: string): void;
  onSave?(): void;
}

export interface GameOptions {
  /** Continue a saved run instead of starting fresh. */
  run?: RunData;
  /** localStorage key for save stations; null disables saving. */
  saveKey?: string | null;
  /** Damage taken is multiplied by this (assist mode). */
  damageScale?: number;
  /** Tone down screen flashes and shake. */
  reducedFlash?: boolean;
  /** Where to come back after dying when there's no save: a "play from here" start. */
  retry?: RunData;
  /** Images by slot id, for sprite sheets. */
  images?: Record<string, HTMLImageElement>;
  sound?: Sound | null;
}

export interface Item extends Box {
  id: string;
  label: string;
  color: string;
  room: string;
  /** Key node id, or expansion kind. */
  node?: string;
  expansion?: ExpansionKind;
}

export interface Thing extends Box {
  e: Entity;
  room: WorldRoom;
  /** Player is inside it right now (so it fires once per visit). */
  inside: boolean;
  done: boolean;
}

export interface Drop extends Box {
  kind: 'energy' | AmmoKind;
  amount: number;
  t: number;
}

export interface Banner {
  title: string;
  body: string;
  color: string;
  /** Seconds shown; it can be dismissed after a moment. */
  t: number;
  /** Pauses the game while shown. */
  hold: boolean;
}

const DROP_LIFE = 9;
export const ENEMY_COLORS: Record<string, string> = {
  crawler: '#d9824a',
  walker: '#b45ad9',
  hopper: '#6fd94a',
  swooper: '#d94a6f',
  flyer: '#e8c94a',
  turret: '#8a9bb0',
  spawner: '#c26b9e',
  shelled: '#4ab0a4',
  sentry: '#e86b5a',
};

export class Game {
  readonly level: Level;
  readonly content: ProjectContent;
  room: WorldRoom;
  player: Player;
  run: RunData;
  shots: Shot[] = [];
  bombs: Bomb[] = [];
  blasts: Blast[] = [];
  drops: Drop[] = [];
  enemies: Enemy[] = [];
  bosses: Boss[] = [];
  items: Item[] = [];
  things: Thing[] = [];
  banner: Banner | null = null;
  paused = false;
  /** Seconds left to escape, while an escape sequence runs. */
  escape: { t: number; to: string } | null = null;
  weapon: Weapon = 'beam';
  won = false;
  /** Counting down to a reload after dying. */
  dying = 0;
  /** Seconds of screen shake left. */
  shake = 0;
  time = 0;
  readonly animators: Record<string, Animator> = {};
  readonly palette: StylePreset;
  private have: ReturnType<typeof runHave>;
  private readonly opts: GameOptions;
  private readonly events: GameEvents;
  private readonly start: { room: string; x: number; y: number };

  constructor(content: ProjectContent, events: GameEvents = {}, opts: GameOptions = {}) {
    this.content = content;
    this.events = events;
    this.opts = opts;
    this.palette = presetById(content.style);
    const byNode = indexNodes(content.nodes);
    this.level = new Level(content.rooms, content.doors, content.nodes, byNode, () => new Set(this.run?.keys ?? []));
    const st = content.nodes.find((n) => n.kind === 'start');
    const sr = this.level.byId.get(st?.room ?? '') ?? this.level.rooms[0];
    if (!sr) throw new Error('Cannot playtest a map with no rooms');
    const sp = st?.pos ? { x: sr.tx + st.pos.x + 0.5, y: sr.ty + st.pos.y + 1 } : floorSpot(sr);
    this.start = { room: sr.id, x: sp.x - 0.375, y: sp.y - 1.5 };
    this.run = opts.run ? structuredClone(opts.run) : newRun(sr.id, this.start.x, this.start.y);
    this.have = runHave(content, this.run);
    this.room = this.level.byId.get(this.run.room) ?? sr;
    this.player = new Player(this.run.x, this.run.y);
    this.syncLevel();
    this.buildItems();
    Object.entries(content.sprites).forEach(([id, sheet]) => {
      const img = opts.images?.[sheet.image];
      if (img) this.animators[id] = new Animator(sheet, img);
    });
    this.enterRoom(this.room, true);
  }

  // --- State -------------------------------------------------------------------

  private syncLevel() {
    this.level.flags = new Set(this.run.flags);
    this.level.opened.clear();
    this.run.opened.forEach((l) => this.level.opened.add(l));
  }

  private refresh() {
    this.have = runHave(this.content, this.run);
    const ws = weapons(this.have);
    if (!ws.includes(this.weapon)) this.weapon = 'beam';
    (Object.keys(this.run.ammo) as AmmoKind[]).forEach((k) => (this.run.ammo[k] = Math.min(this.run.ammo[k], this.have.max[k])));
    this.run.energy = Math.min(this.run.energy, this.have.maxEnergy);
  }

  has(cap: string) {
    return this.have.caps.has(cap);
  }
  get maxEnergy() {
    return this.have.maxEnergy;
  }
  maxAmmo(k: AmmoKind) {
    return this.have.max[k];
  }
  weaponList() {
    return weapons(this.have);
  }

  setFlag(f: string) {
    if (!f || this.run.flags.includes(f)) return;
    this.run.flags.push(f);
    this.level.flags.add(f);
    this.refresh();
  }

  /** Play time formatted mm:ss. */
  clock(): string {
    const s = Math.floor(this.run.time);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  private buildItems() {
    const c = this.content;
    this.items = [];
    c.nodes.forEach((n) => {
      if (!isKey(n) || !n.room) return;
      const r = this.level.byId.get(n.room);
      if (!r) return;
      const p = n.pos ? { x: r.tx + n.pos.x, y: r.ty + n.pos.y } : (() => {
        const f = floorSpot(r);
        return { x: Math.floor(f.x), y: f.y - 1 };
      })();
      const a = abilityById(n.ability, c.abilities);
      this.items.push({ id: `key:${n.id}`, label: n.label, color: n.color ?? a?.color ?? '#dfe2e7', room: r.id, node: n.id, x: p.x + 0.15, y: p.y + 0.15, w: 0.7, h: 0.7 });
    });
    this.level.rooms.forEach((r) =>
      (r.entities ?? []).forEach((e) => {
        if (e.type !== 'pickup') return;
        const k = prop(e, 'kind', 'missiles') as ExpansionKind;
        if (!EXPANSIONS[k]) return;
        this.items.push({ id: `exp:${r.id}:${e.id}`, label: EXPANSIONS[k].name, color: EXPANSIONS[k].color, room: r.id, expansion: k, x: r.tx + e.x + 0.15, y: r.ty + e.y + 0.15, w: 0.7, h: 0.7 });
      }),
    );
  }

  collected(it: Item): boolean {
    return it.node ? this.run.keys.includes(it.node) : this.run.expansions.includes(it.id);
  }

  // --- Rooms -------------------------------------------------------------------

  private enterRoom(r: WorldRoom, first = false) {
    const prev = this.room;
    if (!first && prev !== r) this.level.regrow(prev);
    this.room = r;
    this.shots = [];
    this.bombs = [];
    this.blasts = [];
    this.drops = [];
    this.enemies = [];
    this.bosses = [];
    this.things = [];
    this.level.lockdown.clear();
    if (!this.run.visited.includes(r.id)) this.run.visited.push(r.id);
    (r.entities ?? []).forEach((e) => {
      const key = `${r.id}:${e.id}`;
      if (e.type === 'enemy') {
        if (this.run.dead.includes(key)) return;
        this.enemies.push(Enemy.fromEntity(e, r.tx, r.ty, prop(e, 'respawn', true) ? null : key));
      } else if (e.type === 'boss') {
        if (this.run.dead.includes(key)) return;
        this.bosses.push(new Boss(e, r.tx, r.ty, { x: r.tx, y: r.ty, w: r.tw, h: r.th }, key));
      } else if (e.type !== 'pickup') {
        const w = e.type === 'trigger' ? prop(e, 'w', 2) : e.type === 'exit' ? 3 : e.type === 'statue' ? 2 : 2;
        const h = e.type === 'trigger' ? prop(e, 'h', 3) : e.type === 'exit' ? 2 : e.type === 'statue' ? 3 : 1;
        // Stations are pads: touching means standing on or just above them.
        const pad = e.type === 'save' || e.type === 'recharge' || e.type === 'map';
        this.things.push({ e, room: r, x: r.tx + e.x, y: r.ty + e.y - (pad ? 1.6 : 0), w, h: pad ? h + 1.6 : h, inside: first, done: false });
      }
    });
    const area = this.content.areas.find((a) => a.id === r.area) ?? this.content.areas[0];
    if (!this.escape) this.opts.sound?.setTheme(this.bosses.length ? 'boss' : (area?.music ?? 'surface'));
    if (!first) this.events.onEnterRoom?.(r);
    if (this.escape && r.id === this.escape.to) {
      this.escape = null;
      this.message('Escaped!', 'You made it out.', '#4fd1a5');
      if (!this.content.rooms.some((x) => x.entities?.some((e) => e.type === 'exit'))) this.win('Escaped. Run complete');
    }
    this.checkGoal();
  }

  /** Legacy goal: reaching the goal room (and beating its bosses) wins when there are no exits. */
  private checkGoal() {
    if (this.won) return;
    if (this.content.rooms.some((x) => x.entities?.some((e) => e.type === 'exit'))) return;
    const goal = this.content.nodes.find((n) => n.kind === 'boss');
    if (!goal || goal.room !== this.room.id) return;
    const bossesHere = (this.room.entities ?? []).filter((e) => e.type === 'boss');
    if (bossesHere.every((e) => this.run.dead.includes(`${this.room.id}:${e.id}`)) && !this.escape) this.win(`Reached ${goal.label}. Run complete`);
  }

  private win(msg: string) {
    if (this.won) return;
    this.won = true;
    this.message('Mission complete', `${msg} · ${this.clock()}`, '#4fd1a5', true);
    this.events.onWin?.(msg);
  }

  message(title: string, body: string, color = '#dfe2e7', hold = false) {
    this.banner = { title, body, color, t: 0, hold };
    if (!hold) this.events.onMessage?.(`${title}${body ? `: ${body}` : ''}`);
  }

  // --- The player's world --------------------------------------------------------

  private playerWorld(): PlayerWorld {
    const self = this;
    return {
      level: this.level,
      physics: this.content.physics,
      has: (k) => this.has(k),
      get weapon() {
        return self.weapon;
      },
      ammo: (k) => (k === 'beam' ? Infinity : this.run.ammo[k]),
      fire: (x, y, dx, dy, charged) => this.fire(x, y, dx, dy, charged),
      bomb: (x, y) => this.dropBomb(x, y),
      cycleWeapon: () => {
        const ws = this.weaponList();
        this.weapon = ws[(ws.indexOf(this.weapon) + 1) % ws.length];
        this.sfx('select');
      },
      sfx: (n) => this.sfx(n),
      extra: this.enemies.filter((e) => e.frozen > 0),
      hurt: (amount, fromX) => this.hurt(amount, fromX),
    };
  }

  sfx(name: string) {
    this.opts.sound?.play(name);
  }

  private fire(x: number, y: number, dx: number, dy: number, charged: boolean): boolean {
    let w = this.weapon;
    if (w !== 'beam' && (w === 'novas' || this.run.ammo[w] <= 0)) w = 'beam';
    if (w === 'beam') {
      const caps = new Set(['shot']);
      (['frost', 'phase', 'lance'] as const).forEach((k) => this.has(k) && caps.add(k));
      if (charged) caps.add('charge');
      const size = charged ? 0.6 : 0.3;
      const v = 26;
      this.shots.push({
        kind: 'beam', x: x - size / 2, y: y - size / 2, w: size, h: size, vx: dx * v, vy: dy * v, caps,
        damage: charged ? 30 : 10, life: this.has('long') ? 1.2 : 0.28, pierce: this.has('lance'), phase: this.has('phase'), charged, hit: new Set(),
      });
      this.sfx(charged ? 'chargeShot' : 'beam');
      return true;
    }
    this.run.ammo[w]--;
    const sup = w === 'supers';
    const caps = new Set(sup ? ['shot', 'missile', 'super'] : ['shot', 'missile']);
    this.shots.push({ kind: w, x: x - 0.25, y: y - 0.2, w: 0.5, h: 0.4, vx: dx * 20, vy: dy * 20, caps, damage: sup ? 100 : 30, life: 1.6, pierce: false, phase: false, charged: false });
    this.sfx('missile');
    return true;
  }

  private dropBomb(x: number, y: number) {
    const nova = this.weapon === 'novas' && this.run.ammo.novas > 0;
    if (nova) this.run.ammo.novas--;
    else if (this.bombs.filter((b) => !b.nova).length >= 3) return;
    this.bombs.push({ x, y, fuse: nova ? 1.0 : 0.55, nova });
    this.sfx('bomb');
  }

  private hurt(amount: number, fromX: number) {
    const p = this.player;
    if (this.dying > 0 || this.won) return;
    const dmg = amount * (this.opts.damageScale ?? 1);
    if (Number.isNaN(fromX)) {
      // Continuous damage (lava, heat): no knockback or invulnerability.
      this.run.energy -= dmg;
    } else {
      if (p.iframes > 0) return;
      this.run.energy -= dmg;
      p.iframes = 1;
      p.knockback(fromX);
      this.sfx('hurt');
      if (!this.opts.reducedFlash) this.shake = 0.15;
      this.events.onHurt?.(this.room, Math.max(0, Math.ceil(this.run.energy)));
    }
    if (this.run.energy <= 0) {
      this.run.energy = 0;
      this.dying = 1.6;
      this.sfx('explode');
      this.events.onDeath?.();
    }
  }

  // --- Saving --------------------------------------------------------------------

  snapshot(): RunData {
    const p = this.player;
    return structuredClone({ ...this.run, room: this.room.id, x: p.x, y: p.y + p.h - 1.5 });
  }

  private save() {
    this.run.energy = this.maxEnergy;
    const key = this.opts.saveKey;
    if (key) storeRun(key, this.snapshot());
    this.sfx('save');
    this.message('Saved', key ? 'Your progress is stored in this browser.' : 'Energy restored.', '#4fd1a5');
    this.events.onSave?.();
  }

  /** Back to the last save after dying, or the start when there isn't one. */
  private reload() {
    const saved = this.opts.saveKey ? loadRun(this.opts.saveKey) : null;
    const retry = !saved && this.opts.retry ? structuredClone(this.opts.retry) : null;
    this.run = saved ?? retry ?? newRun(this.start.room, this.start.x, this.start.y);
    this.run.energy = runHave(this.content, this.run).maxEnergy;
    this.refresh();
    this.syncLevel();
    this.player = new Player(this.run.x, this.run.y);
    this.escape = null;
    this.dying = 0;
    const r = this.level.byId.get(this.run.room) ?? this.room;
    this.enterRoom(r, true);
    this.message(saved ? 'Continue' : 'Try again', saved ? 'Back at your last save.' : retry ? 'Back where this test started.' : 'Back at the start.', '#dfe2e7');
  }

  // --- The step ------------------------------------------------------------------

  update(c: Controls, dt = STEP) {
    this.opts.sound?.tick();
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.hold) {
        if (this.won) return;
        if (this.banner.t > 0.5 && (c.pressed('jump') || c.pressed('shoot') || c.pressed('pause'))) this.banner = null;
        return;
      }
      if (this.banner.t > 2.5) this.banner = null;
    }
    if (this.won) return;
    if (c.pressed('pause')) this.paused = !this.paused;
    if (this.paused) return;
    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) this.reload();
      return;
    }
    this.time += dt;
    this.run.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.level.update(dt);
    if (this.escape) {
      this.escape.t -= dt;
      if (this.escape.t <= 0) {
        this.escape = null;
        this.hurt(Infinity, NaN);
        return;
      }
    }

    const p = this.player;
    const pw = this.playerWorld();
    p.step(dt, c, pw);

    // Room change.
    const r = this.level.roomAt(Math.floor(p.cx), Math.floor(p.cy));
    if (r && r !== this.room) {
      this.enterRoom(r);
      return;
    }

    this.stepBombs(dt);
    this.stepShots(dt);
    this.stepActors(dt);
    this.stepPickups(dt);
    this.stepThings();
  }

  private actorWorld(): ActorWorld {
    const p = this.player;
    return {
      level: this.level,
      px: p.cx,
      py: p.cy,
      player: p,
      shoot: (s) => this.shots.push({ kind: 'enemy', w: 0.4, h: 0.4, caps: new Set(), damage: 10, life: 4, pierce: false, phase: false, charged: false, ...s }),
      spawn: (e) => this.enemies.push(e),
      sfx: (n) => this.sfx(n),
    };
  }

  private stepBombs(dt: number) {
    this.bombs = this.bombs.filter((b) => {
      b.fuse -= dt;
      if (b.fuse > 0) return true;
      const caps = new Set(b.nova ? ['shot', 'bomb', 'nova'] : ['shot', 'bomb']);
      this.blasts.push({ x: b.x, y: b.y, r: 0, max: b.nova ? 12 : 1.25, t: b.nova ? 0.7 : 0.2, caps, damage: b.nova ? 300 : 30, nova: b.nova, hit: new Set() });
      const p = this.player;
      if (Math.hypot(p.cx - b.x, p.y + p.h - 0.35 - b.y) < 1.3) p.bombJump(this.content.physics.gravity);
      this.sfx(b.nova ? 'nova' : 'explode');
      if (b.nova && !this.opts.reducedFlash) this.shake = 0.5;
      return false;
    });
    this.blasts = this.blasts.filter((b) => {
      b.r = Math.min(b.max, b.r + (b.max / Math.max(0.1, b.t)) * dt * (b.nova ? 1.2 : 3));
      b.t -= dt;
      blastTiles(b, this.level, (l) => this.opened(l));
      [...this.enemies, ...this.bosses].forEach((e) => {
        if (b.hit.has(e) || !circleHits(b, e)) return;
        b.hit.add(e);
        this.damage(e, b.damage, b.caps);
      });
      return b.t > 0;
    });
  }

  private opened(link: string) {
    if (!this.run.opened.includes(link)) this.run.opened.push(link);
    this.sfx('door');
  }

  private stepShots(dt: number) {
    const p = this.player;
    this.shots = this.shots.filter((s) => {
      if (!stepShot(s, this.level, dt, (l) => this.opened(l))) {
        if (s.kind === 'missiles' || s.kind === 'supers') this.sfx('explode');
        return false;
      }
      if (s.kind === 'enemy') {
        if (overlaps(s, p)) {
          this.hurt(s.damage, s.x);
          return false;
        }
        return true;
      }
      for (const e of [...this.enemies, ...this.bosses]) {
        const hb = e instanceof Boss ? e.hitbox() : e;
        if (e.dead || s.hit?.has(e) || !overlaps(s, hb)) continue;
        s.hit?.add(e);
        const res = this.damage(e, s.damage, s.caps);
        if (res === 'hit' && s.caps.has('frost') && e instanceof Enemy) e.frozen = 5;
        if (!s.pierce || res === 'tink') return false;
      }
      return true;
    });
  }

  /** Damages an actor; kills drop pickups and are remembered when they shouldn't come back. */
  private damage(e: Actor, amount: number, caps: Set<string>) {
    const res = e.hit(amount, caps);
    this.sfx(res === 'tink' ? 'tink' : res === 'kill' ? 'kill' : 'hit');
    if (res === 'kill' && e instanceof Enemy) {
      if (e.key) this.run.dead.push(e.key);
      if (e.parent) e.parent.children--;
      this.dropFrom(e);
    }
    return res;
  }

  private dropFrom(e: Box) {
    const roll = Math.random();
    if (roll > 0.55) return;
    const ammo = (['missiles', 'supers', 'novas'] as const).filter((k) => this.have.max[k] > 0 && this.run.ammo[k] < this.have.max[k]);
    const want = ammo.length && roll < 0.25 ? ammo[Math.floor(Math.random() * ammo.length)] : 'energy';
    this.drops.push({ kind: want, amount: want === 'energy' ? (roll < 0.1 ? 20 : 5) : want === 'missiles' ? 2 : 1, t: DROP_LIFE, x: e.x + 0.2, y: e.y + 0.2, w: 0.6, h: 0.6 });
  }

  private stepActors(dt: number) {
    const p = this.player;
    const aw = this.actorWorld();
    this.enemies.forEach((e) => e.update(dt, aw));
    this.bosses.forEach((b) => b.update(dt, aw));
    // Contact.
    const strong = p.speeding || (p.spin && this.has('blade'));
    this.enemies.forEach((e) => {
      if (e.dead || e.frozen > 0 || !overlaps(e, p)) return;
      if (strong) this.damage(e, 200, new Set(['shot', 'speed', 'blade']));
      else this.hurt(e.damage, e.cx);
    });
    this.bosses.forEach((b) => {
      if (b.dying > 0 || !b.awake) return;
      if (overlaps(b.hitbox(), p)) this.hurt(b.damage, b.cx);
      const lb = b.laserBox();
      if (lb && overlaps(lb, p)) this.hurt(25, b.cx);
    });
    // Lock the room once a boss wakes and the player is clear of the hatches.
    const awake = this.bosses.some((b) => b.awake && !b.dead);
    if (awake && !this.level.lockdown.has(this.room.id)) {
      const inDoor = this.room.doors.some((d) => overlaps(p, { x: this.room.tx + d.x - 0.5, y: this.room.ty + d.y, w: 2, h: 3 }));
      if (!inDoor) this.level.lockdown.add(this.room.id);
    }
    this.bosses.forEach((b) => {
      if (!b.dead) return;
      this.run.dead.push(b.key);
      this.setFlag(b.flag);
      this.level.lockdown.delete(this.room.id);
      this.drops.push({ kind: 'energy', amount: 100, t: Infinity, x: b.cx - 0.3, y: b.cy, w: 0.6, h: 0.6 });
      this.message(`${b.name} defeated`, b.escape > 0 ? `Escape! ${b.escape} seconds.` : '', '#ff8a5c');
      if (b.escape > 0) {
        this.escape = { t: b.escape, to: b.escapeTo };
        this.opts.sound?.setTheme('escape');
        this.sfx('alarm');
      } else {
        const area = this.content.areas.find((a) => a.id === this.room.area) ?? this.content.areas[0];
        this.opts.sound?.setTheme(area?.music ?? 'surface');
      }
    });
    this.bosses = this.bosses.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (!this.bosses.length) this.checkGoal();
  }

  private stepPickups(dt: number) {
    const p = this.player;
    this.items.forEach((it) => {
      if (it.room !== this.room.id || this.collected(it) || !overlaps(it, p)) return;
      if (it.node) {
        this.run.keys.push(it.node);
        const n = this.content.nodes.find((x) => x.id === it.node);
        const a = abilityById(n?.ability, this.content.abilities);
        this.refresh();
        if (a?.ammo) this.run.ammo[a.ammo.kind] = Math.min(this.have.max[a.ammo.kind], this.run.ammo[a.ammo.kind] + a.ammo.amount);
        const dormant = n?.dormantUntil && !this.run.flags.includes(n.dormantUntil);
        const body = dormant ? 'Unknown item. Its power is dormant for now.' : [a?.desc, a?.button ? `(${a.button})` : ''].filter(Boolean).join(' ');
        this.message(it.label, body, it.color, true);
        this.events.onPickup?.(it.label, body);
      } else if (it.expansion) {
        this.run.expansions.push(it.id);
        this.refresh();
        if (it.expansion === 'energy') this.run.energy = this.maxEnergy;
        else this.run.ammo[it.expansion] = Math.min(this.have.max[it.expansion], this.run.ammo[it.expansion] + EXPANSIONS[it.expansion].amount);
        this.message(it.label, it.expansion === 'energy' ? 'Energy capacity increased.' : 'Capacity increased.', it.color, true);
        this.events.onPickup?.(it.label);
      }
      this.sfx('pickup');
    });
    this.drops = this.drops.filter((d) => {
      d.t -= dt;
      if (overlaps(d, p)) {
        if (d.kind === 'energy') this.run.energy = Math.min(this.maxEnergy, this.run.energy + d.amount);
        else this.run.ammo[d.kind] = Math.min(this.have.max[d.kind], this.run.ammo[d.kind] + d.amount);
        this.sfx('small');
        return false;
      }
      return d.t > 0;
    });
  }

  private stepThings() {
    const p = this.player;
    this.things.forEach((t) => {
      const inside = overlaps(t, p);
      const entered = inside && !t.inside;
      t.inside = inside;
      if (!entered) return;
      const e = t.e;
      const when = prop(e, 'when', '');
      const ok = meets(when, this.have);
      switch (e.type) {
        case 'save':
          if (p.ground) this.save();
          else t.inside = false;
          break;
        case 'recharge':
          this.run.energy = this.maxEnergy;
          (Object.keys(this.run.ammo) as AmmoKind[]).forEach((k) => (this.run.ammo[k] = this.have.max[k]));
          this.sfx('save');
          this.message('Recharged', 'Energy and ammo restored.', '#ff6fae');
          break;
        case 'map': {
          const a = t.room.area ?? this.content.areas[0]?.id ?? 'main';
          if (!this.run.mapped.includes(a)) this.run.mapped.push(a);
          this.sfx('save');
          this.message('Map data downloaded', 'Open the map to see this area.', '#7aa2ff');
          break;
        }
        case 'statue':
          this.message('An old statue', prop(e, 'message', ''), '#d9c27a', true);
          break;
        case 'trigger': {
          if (!ok || t.done) return;
          t.done = true;
          const action = prop(e, 'action', 'message');
          const msg = prop(e, 'message', '');
          if (action === 'flag') this.setFlag(prop(e, 'flag', ''));
          if (action === 'strip') {
            this.run.stripped = true;
            this.refresh();
          }
          if (action === 'restore') {
            this.run.stripped = false;
            this.refresh();
          }
          if (msg) this.message(msg, '', '#b48cff', true);
          break;
        }
        case 'exit':
          if (ok) this.win('Reached the exit. Run complete');
          else this.message('Not yet', 'Something still needs doing.', '#9aa1ad');
          break;
      }
    });
  }

  // --- Drawing -------------------------------------------------------------------

  enemyColor(kind: string) {
    return ENEMY_COLORS[kind] ?? '#e86b5a';
  }

  draw(c: HTMLCanvasElement) {
    drawGame(this, c, !!this.opts.reducedFlash);
  }
}
