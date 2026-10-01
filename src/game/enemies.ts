import { meets } from '../model/abilities';
import { prop, type BossKind, type EnemyArchetype } from '../model/entities';
import type { Entity } from '../model/types';
import { blocked, move, onGround, type Box } from './body';
import type { Level } from './level';
import type { Shot } from './shots';

/** What enemies need from the game. */
export interface ActorWorld {
  level: Level;
  /** Player centre and box. */
  px: number;
  py: number;
  player: Box;
  shoot(s: Partial<Shot> & Pick<Shot, 'x' | 'y' | 'vx' | 'vy'>): void;
  spawn(e: Enemy): void;
  sfx(name: string): void;
}

const GRAVITY = 60;

/** Default "hurt by" for each archetype when the author leaves it empty. */
const ARMOR: Partial<Record<EnemyArchetype, string>> = { shelled: 'missile | charge | bomb | blade | speed' };

export abstract class Actor implements Box {
  x = 0;
  y = 0;
  w = 1;
  h = 1;
  vx = 0;
  vy = 0;
  hp: number;
  readonly maxHp: number;
  damage: number;
  weak: string;
  /** Hurt flash. */
  flash = 0;
  frozen = 0;
  dead = false;
  face: 1 | -1 = -1;
  /** Animation clock. */
  t = 0;
  abstract readonly kind: string;

  constructor(hp: number, damage: number, weak: string) {
    this.hp = hp;
    this.maxHp = hp;
    this.damage = damage;
    this.weak = weak;
  }

  get cx() {
    return this.x + this.w / 2;
  }
  get cy() {
    return this.y + this.h / 2;
  }

  /** Whether an attack with these caps hurts it. */
  hurtBy(caps: Set<string>): boolean {
    return !this.weak || meets(this.weak, { caps, counts: {} });
  }

  /** Applies damage; returns 'tink' when it doesn't hurt, 'kill' or 'hit'. */
  hit(damage: number, caps: Set<string>): 'tink' | 'hit' | 'kill' {
    if (this.dead) return 'tink';
    if (!this.hurtBy(caps)) return 'tink';
    this.hp -= damage;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.dead = true;
      return 'kill';
    }
    return 'hit';
  }

  abstract update(dt: number, w: ActorWorld): void;
}

export class Enemy extends Actor {
  readonly kind: EnemyArchetype;
  speed: number;
  home: { x: number; y: number };
  timer = 0;
  state: 'idle' | 'dive' | 'rise' = 'idle';
  ground = false;
  /** Id that keeps it dead across visits, when it doesn't respawn. */
  key: string | null;
  children = 0;
  parent?: Enemy;

  constructor(kind: EnemyArchetype, x: number, y: number, opts: { hp?: number; speed?: number; damage?: number; weak?: string; key?: string | null } = {}) {
    super(opts.hp ?? 20, opts.damage ?? 10, opts.weak || ARMOR[kind] || '');
    this.kind = kind;
    this.speed = opts.speed ?? 3;
    this.key = opts.key ?? null;
    const size: Partial<Record<EnemyArchetype, [number, number]>> = {
      walker: [1, 1.4],
      hopper: [1, 0.9],
      spawner: [1.6, 1.6],
      shelled: [1.2, 1],
      sentry: [1, 1.4],
      swooper: [0.9, 1],
      flyer: [0.9, 0.8],
    };
    [this.w, this.h] = size[kind] ?? [1, 0.8];
    this.x = x + (1 - this.w) / 2;
    this.y = y + 1 - this.h;
    this.home = { x: this.x, y: this.y };
    this.timer = Math.random() * 1.5;
  }

  static fromEntity(e: Entity, roomX: number, roomY: number, key: string | null): Enemy {
    return new Enemy(prop(e, 'archetype', 'crawler') as EnemyArchetype, roomX + e.x, roomY + e.y, {
      hp: prop(e, 'hp', 20),
      speed: prop(e, 'speed', 3),
      damage: prop(e, 'damage', 10),
      weak: prop(e, 'weak', ''),
      key,
    });
  }

  private ledgeAhead(level: Level): boolean {
    const fx = this.face > 0 ? this.x + this.w + 0.05 : this.x - 0.05;
    return !blocked(level, { x: fx, y: this.y + this.h + 0.05, w: 0.05, h: 0.2 }, this.y + this.h);
  }

  private wallAhead(level: Level): boolean {
    return blocked(level, { x: this.x + this.face * 0.1, y: this.y, w: this.w, h: this.h - 0.05 });
  }

  update(dt: number, w: ActorWorld) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.frozen > 0) {
      this.frozen -= dt;
      return;
    }
    this.timer -= dt;
    const L = w.level;
    const dx = w.px - this.cx;
    const dy = w.py - this.cy;
    const near = (r: number) => dx * dx + dy * dy < r * r;
    const fall = () => {
      this.vy = Math.min(this.vy + GRAVITY * dt, 24);
    };
    const patrol = (v: number, turnAtLedge: boolean) => {
      if (this.wallAhead(L) || (turnAtLedge && this.ground && this.ledgeAhead(L))) this.face = (-this.face) as 1 | -1;
      this.vx = this.face * v;
    };
    switch (this.kind) {
      case 'crawler':
        patrol(this.speed * 0.6, true);
        fall();
        break;
      case 'walker':
        if (near(9) && Math.abs(dy) < 3 && this.ground) this.face = dx > 0 ? 1 : -1;
        patrol(this.speed * (near(9) ? 1.4 : 0.8), false);
        fall();
        break;
      case 'shelled':
        patrol(this.speed * 0.5, true);
        fall();
        break;
      case 'sentry':
        patrol(this.speed * 0.6, true);
        fall();
        if (this.timer <= 0 && Math.abs(dy) < 1.5 && Math.abs(dx) < 11 && Math.sign(dx) === this.face) {
          this.timer = 1.6;
          w.shoot({ x: this.cx + this.face * 0.6, y: this.y + 0.4, vx: this.face * 12, vy: 0 });
          w.sfx('enemyShot');
        }
        break;
      case 'hopper':
        fall();
        if (this.ground) {
          this.vx *= 0.8;
          if (this.timer <= 0 && near(12)) {
            this.timer = 1.1 + Math.random() * 0.6;
            this.face = dx > 0 ? 1 : -1;
            this.vy = -17;
            this.vx = this.face * this.speed * 1.6;
          }
        }
        break;
      case 'swooper':
        if (this.state === 'idle') {
          this.vx = this.vy = 0;
          if (Math.abs(dx) < 4 && dy > 0 && dy < 14) {
            this.state = 'dive';
            this.timer = 1.4;
            w.sfx('swoop');
          }
        } else if (this.state === 'dive') {
          this.vx = Math.sign(dx) * Math.min(Math.abs(dx) * 3, this.speed * 2);
          this.vy = this.speed * 4;
          if (this.timer <= 0 || this.ground) this.state = 'rise';
        } else {
          const hx = this.home.x - this.x;
          const hy = this.home.y - this.y;
          const d = Math.hypot(hx, hy);
          if (d < 0.2) {
            Object.assign(this, { x: this.home.x, y: this.home.y, state: 'idle' });
          } else {
            this.vx = (hx / d) * this.speed * 2;
            this.vy = (hy / d) * this.speed * 2;
          }
        }
        break;
      case 'flyer': {
        const chase = near(13) || !!this.parent;
        const d = Math.hypot(dx, dy) || 1;
        const v = chase ? this.speed * 1.2 : 0;
        this.vx = (dx / d) * v;
        this.vy = (dy / d) * v + Math.sin(this.t * 4) * 2;
        this.face = dx > 0 ? 1 : -1;
        break;
      }
      case 'turret':
        this.vx = this.vy = 0;
        if (this.timer <= 0 && near(15)) {
          this.timer = 2;
          const d = Math.hypot(dx, dy) || 1;
          w.shoot({ x: this.cx - 0.15, y: this.cy - 0.15, vx: (dx / d) * 9, vy: (dy / d) * 9 });
          w.sfx('enemyShot');
        }
        break;
      case 'spawner':
        this.vx = this.vy = 0;
        if (this.timer <= 0 && this.children < 3 && near(16)) {
          this.timer = 3;
          const c = new Enemy('flyer', this.x, this.y, { hp: 10, speed: this.speed, damage: Math.round(this.damage / 2), key: null });
          c.parent = this;
          this.children++;
          w.spawn(c);
        }
        break;
    }
    const m = move(L, this, dt);
    if (m.wallL || m.wallR) this.face = (-this.face) as 1 | -1;
    this.ground = onGround(L, this);
  }
}

/** A boss: one big actor running its pattern, with a death sequence before it's done. */
export class Boss extends Actor {
  readonly kind: BossKind;
  readonly name: string;
  readonly flag: string;
  readonly escape: number;
  readonly escapeTo: string;
  readonly key: string;
  /** Seconds of death explosions left once beaten. */
  dying = 0;
  timer = 2;
  phase = 0;
  /** Worm: body segments trailing the head. */
  segs: { x: number; y: number }[] = [];
  /** Arena bounds in world tiles. */
  arena: Box;
  /** Mech/brain laser: telegraph then fire, at this y. */
  laser: { y: number; t: number; firing: boolean } | null = null;
  awake = false;

  constructor(e: Entity, roomX: number, roomY: number, arena: Box, key: string) {
    super(prop(e, 'hp', 300), 20, prop(e, 'weak', ''));
    this.kind = prop(e, 'kind', 'worm') as BossKind;
    this.name = prop(e, 'name', 'Guardian');
    this.flag = prop(e, 'flag', '');
    this.escape = prop(e, 'escape', 0);
    this.escapeTo = prop(e, 'escapeTo', '');
    this.key = key;
    this.arena = arena;
    const size: Record<BossKind, [number, number]> = { worm: [1.6, 1.6], giant: [4, 6], flyer: [3, 2.4], brain: [4, 4], mech: [4, 5] };
    [this.w, this.h] = size[this.kind];
    this.x = roomX + e.x;
    this.y = roomY + e.y;
    if (this.kind === 'giant' || this.kind === 'mech') this.y = Math.min(this.y, arena.y + arena.h - this.h);
    for (let i = 0; i < 8; i++) this.segs.push({ x: this.cx, y: this.cy });
  }

  /** Big hit flash, but bosses keep fighting until they're out of health. */
  hit(damage: number, caps: Set<string>) {
    if (this.dying > 0 || !this.awake) return 'tink' as const;
    const r = super.hit(damage, caps);
    if (r === 'kill') {
      this.dead = false;
      this.dying = 2;
    }
    return r;
  }

  update(dt: number, w: ActorWorld) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.dying > 0) {
      this.dying -= dt;
      if (Math.random() < dt * 14) w.sfx('explode');
      if (this.dying <= 0) this.dead = true;
      return;
    }
    if (!this.awake) {
      if (Math.abs(w.px - this.cx) < this.arena.w) this.awake = true;
      return;
    }
    this.timer -= dt;
    const A = this.arena;
    const dx = w.px - this.cx;
    const dy = w.py - this.cy;
    const rage = this.hp < this.maxHp / 2 ? 1.5 : 1;
    const aimAt = (sx: number, sy: number, v: number, extra: Partial<Shot> = {}) => {
      const d = Math.hypot(w.px - sx, w.py - sy) || 1;
      w.shoot({ x: sx, y: sy, vx: ((w.px - sx) / d) * v, vy: ((w.py - sy) / d) * v, ...extra });
    };
    switch (this.kind) {
      case 'worm': {
        // Dives out of the floor in arcs across the arena; the head is the target.
        if (this.phase === 0) {
          this.x = -100;
          if (this.timer <= 0) {
            this.phase = 1;
            const fromLeft = w.px > A.x + A.w / 2;
            this.x = fromLeft ? A.x + 1 : A.x + A.w - 1 - this.w;
            this.y = A.y + A.h;
            this.vx = (fromLeft ? 1 : -1) * (A.w - 4) / 1.6;
            this.vy = -Math.sqrt(2 * 30 * Math.min(A.h - 3, 10));
            this.face = fromLeft ? 1 : -1;
            this.segs.forEach((s) => Object.assign(s, { x: this.cx, y: this.cy }));
            w.sfx('rumble');
          }
        } else {
          this.vy += 30 * dt;
          this.x += this.vx * dt;
          this.y += this.vy * dt;
          if (this.timer <= -0.6) {
            this.timer = 0;
            for (const a of [-0.6, 0, 0.6]) w.shoot({ x: this.cx, y: this.cy, vx: Math.sin(a) * 8, vy: -10, gravity: 20 });
          }
          if (this.y > A.y + A.h + 2 && this.vy > 0) {
            this.phase = 0;
            this.timer = 1.4 / rage;
          }
        }
        let px = this.cx;
        let py = this.cy;
        this.segs.forEach((s) => {
          const ddx = s.x - px;
          const ddy = s.y - py;
          const d = Math.hypot(ddx, ddy);
          if (d > 0.9) {
            s.x = px + (ddx / d) * 0.9;
            s.y = py + (ddy / d) * 0.9;
          }
          px = s.x;
          py = s.y;
        });
        break;
      }
      case 'giant': {
        // Lumbers toward the player, lobbing spit and firing claws.
        this.face = dx > 0 ? 1 : -1;
        const want = Math.abs(dx) > 7 ? Math.sign(dx) * 1.2 : 0;
        this.x = Math.max(A.x + 1, Math.min(A.x + A.w - 1 - this.w, this.x + want * dt));
        if (this.timer <= 0) {
          this.phase = (this.phase + 1) % 3;
          this.timer = 2.2 / rage;
          if (this.phase === 2) {
            for (let i = 0; i < 3; i++) w.shoot({ x: this.cx + this.face * 1.5, y: this.y + 3 + i * 0.9, vx: this.face * (7 + i * 2), vy: 0, w: 0.6, h: 0.3 });
          } else {
            for (let i = 0; i < 3 + this.phase; i++) w.shoot({ x: this.cx + this.face, y: this.y + 1, vx: this.face * (4 + i * 2.4), vy: -14, gravity: 26 });
          }
          w.sfx('roar');
        }
        break;
      }
      case 'flyer': {
        // Circles the arena, swoops at the player, breathes fire.
        const cx = A.x + A.w / 2;
        const top = A.y + 3;
        if (this.phase === 0) {
          const tx = cx + Math.sin(this.t * 0.9) * (A.w / 2 - 3) - this.w / 2;
          const ty = top + Math.sin(this.t * 1.8) * 1.5;
          this.x += (tx - this.x) * Math.min(1, dt * 2);
          this.y += (ty - this.y) * Math.min(1, dt * 2);
          if (this.timer <= 0) {
            this.phase = Math.random() < 0.5 ? 1 : 2;
            this.timer = this.phase === 1 ? 1.2 : 0.9;
            if (this.phase === 2) for (let i = -2; i <= 2; i++) aimAt(this.cx, this.cy, 11, { vx: dx > 0 ? 11 : -11, vy: i * 2.5 });
          }
        } else if (this.phase === 1) {
          const d = Math.hypot(dx, dy) || 1;
          this.x += (dx / d) * 16 * dt;
          this.y += (dy / d) * 16 * dt;
          if (this.timer <= 0) this.phase = 0;
        } else if (this.timer <= 0) this.phase = 0;
        if (this.phase !== 1 && this.timer <= 0) this.timer = 2.4 / rage;
        this.face = dx > 0 ? 1 : -1;
        this.x = Math.max(A.x + 1, Math.min(A.x + A.w - 1 - this.w, this.x));
        this.y = Math.max(A.y + 1, Math.min(A.y + A.h - 1 - this.h, this.y));
        break;
      }
      case 'brain': {
        // Fixed in place; turrets around it fire rings, and a beam sweeps the room in phase two.
        if (this.timer <= 0) {
          this.timer = 1.4 / rage;
          const a = this.t * 1.7;
          for (let i = 0; i < 4; i++) {
            const ang = a + (i * Math.PI) / 2;
            w.shoot({ x: this.cx + Math.cos(ang) * 3, y: this.cy + Math.sin(ang) * 3, vx: Math.cos(ang) * 6, vy: Math.sin(ang) * 6, w: 0.5, h: 0.5 });
          }
          if (rage > 1 && !this.laser) this.laser = { y: w.py, t: 1, firing: false };
        }
        this.stepLaser(dt, w);
        break;
      }
      case 'mech': {
        // Stands at the arena edge: missile volleys, then a laser at the player's height.
        this.face = dx > 0 ? 1 : -1;
        if (this.timer <= 0) {
          this.phase = (this.phase + 1) % 2;
          this.timer = 2.6 / rage;
          if (this.phase === 0) for (let i = 0; i < 4; i++) w.shoot({ x: this.cx, y: this.y + 0.5, vx: this.face * (3 + i * 2.2), vy: -12 - i, gravity: 24, damage: 15 });
          else this.laser = { y: w.py, t: 0.9, firing: false };
          w.sfx('mech');
        }
        this.stepLaser(dt, w);
        break;
      }
    }
  }

  private stepLaser(dt: number, w: ActorWorld) {
    const l = this.laser;
    if (!l) return;
    l.t -= dt;
    if (!l.firing && l.t <= 0) {
      l.firing = true;
      l.t = 0.45;
      w.sfx('laser');
    } else if (l.firing && l.t <= 0) this.laser = null;
  }

  /** Laser hitbox while it's firing. */
  laserBox(): Box | null {
    const l = this.laser;
    if (!l?.firing) return null;
    return { x: this.arena.x, y: l.y - 0.3, w: this.arena.w, h: 0.6 };
  }

  /** The part that takes hits and hurts on contact. */
  hitbox(): Box {
    return this.kind === 'worm' && this.phase === 0 ? { x: -999, y: -999, w: 0, h: 0 } : this;
  }
}
