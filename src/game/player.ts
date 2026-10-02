import { bombBounce, BODY, WATER } from '../model/physics';
import type { Physics } from '../model/project';
import { Tile } from '../model/tiles';
import { blocked, move, onGround, tilesIn, type Body, type Box } from './body';
import type { Controls } from './input';
import type { Level } from './level';
import type { Weapon } from './run';

export type Form = 'stand' | 'crouch' | 'roll';
export type Aim = 'fwd' | 'up' | 'diagUp' | 'diagDown';

/** What the player needs from the game around it. */
export interface PlayerWorld {
  level: Level;
  physics: Physics;
  has(cap: string): boolean;
  weapon: Weapon;
  ammo(kind: Weapon): number;
  /** Fire the selected weapon from a point in a direction; returns false when it can't. */
  fire(x: number, y: number, dx: number, dy: number, charged: boolean): boolean;
  /** Drop a bomb (or a nova bomb, when selected) at the player's feet. */
  bomb(x: number, y: number): void;
  cycleWeapon(): void;
  sfx(name: string): void;
  /** Solid boxes that aren't tiles, like frozen enemies. */
  extra: Box[];
  hurt(amount: number, fromX: number): void;
}

const CROUCH_H = 1.0;
const SPEED_RUN = 18;
/** Seconds of full-speed running before Velocity Drive kicks in. */
const SPEED_WINDUP = 1.1;
const DASH_TIME = 0.16;
const DASH_SPEED = 26;
const CHARGE_TIME = 0.8;
const MAX_FALL = 32;
const LAVA_DPS = 24;
const SPIKE_DAMAGE = 15;

export class Player implements Body {
  x: number;
  y: number;
  w = BODY.w;
  h: number = BODY.h;
  vx = 0;
  vy = 0;
  face: 1 | -1 = 1;
  form: Form = 'stand';
  aim: Aim = 'fwd';
  ground = false;
  /** Somersaulting: a running jump. */
  spin = false;
  /** Seconds since last standing on ground (for coyote time). */
  air = 0;
  /** Seconds since jump was pressed and not yet used (input buffer). */
  buffer = Infinity;
  airJumps = 0;
  dash = 0;
  dashCd = 0;
  /** Seconds of full-speed running; past the windup the player is speeding. */
  run = 0;
  speeding = false;
  charge = 0;
  shootCd = 0;
  bombCd = 0;
  /** Invulnerable after a hit. */
  iframes = 0;
  /** Knockback time: controls are ignored. */
  knock = 0;
  inWater = false;
  inLava = false;
  /** Seconds in the current animation state, for the rig. */
  t = 0;
  /** Distance run, for the leg cycle. */
  stride = 0;
  wallTouch: -1 | 0 | 1 = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get cx() {
    return this.x + this.w / 2;
  }
  get cy() {
    return this.y + this.h / 2;
  }

  /** Changes height keeping the feet in place; false when there's no headroom. */
  private reshape(form: Form, w: World): boolean {
    const h = form === 'stand' ? BODY.h : form === 'crouch' ? CROUCH_H : BODY.rolled;
    const nb = { x: this.x, y: this.y + this.h - h, w: this.w, h };
    if (h > this.h && blocked(w.level, nb, undefined, w.extra)) return false;
    this.y = nb.y;
    this.h = h;
    if (this.form !== form) this.t = 0;
    this.form = form;
    return true;
  }

  step(dt: number, c: Controls, w: World) {
    const P = w.physics;
    const has = (k: string) => w.has(k);
    this.t += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.knock = Math.max(0, this.knock - dt);
    this.shootCd -= dt;
    this.bombCd -= dt;
    this.dashCd -= dt;

    const tiles = tilesIn(w.level, this);
    this.inWater = tiles.has(Tile.Water) && !has('tide');
    this.inLava = tiles.has(Tile.Lava);
    const wet = this.inWater ? WATER : { jump: 1, gravity: 1, run: 1 };
    const g = P.gravity * wet.gravity;
    const free = this.knock <= 0;
    const L = free && c.held('left');
    const R = free && c.held('right');
    const dir = Number(R) - Number(L);

    // Form changes.
    if (free && c.pressed('down')) {
      if (this.form === 'stand' && this.ground) this.reshape('crouch', w);
      else if (this.form === 'crouch' && has('roll')) this.reshape('roll', w);
      else if (this.form === 'stand' && !this.ground && has('roll')) this.reshape('roll', w);
    }
    if (free && c.pressed('up')) {
      if (this.form === 'roll') this.reshape(this.ground ? 'crouch' : 'stand', w) || (this.ground && w.sfx('bonk'));
      else if (this.form === 'crouch') this.reshape('stand', w);
    }
    if (this.form === 'crouch' && dir !== 0 && !c.held('down')) this.reshape('stand', w);

    // Aim.
    this.aim = c.held('aim') ? (c.held('down') ? 'diagDown' : 'diagUp') : c.held('up') && this.form === 'stand' ? 'up' : 'fwd';

    // Horizontal movement.
    if (dir) this.face = dir > 0 ? 1 : -1;
    const fullSpeed = this.ground && dir !== 0 && this.form === 'stand' && this.aim === 'fwd';
    if (has('speed') && fullSpeed && !this.inWater) this.run += dt;
    else if (this.ground && (!dir || this.form !== 'stand')) this.run = 0;
    if (this.speeding && (dir !== this.face || this.inWater || this.form === 'crouch')) {
      this.speeding = false;
      this.run = 0;
    }
    if (!this.speeding && this.run >= SPEED_WINDUP) {
      this.speeding = true;
      w.sfx('speed');
    }
    const top = (this.speeding ? SPEED_RUN : P.run) * wet.run * (this.form === 'crouch' ? 0 : 1);
    if (this.dash > 0) {
      this.dash -= dt;
      this.vx = this.face * DASH_SPEED;
      this.vy = 0;
    } else if (free) {
      const accel = this.ground ? 90 : 60;
      const target = dir * top;
      this.vx += Math.sign(target - this.vx) * Math.min(Math.abs(target - this.vx), accel * dt * (this.speeding ? 1 : 2));
    }

    // Jumping.
    if (c.pressed('jump')) this.buffer = 0;
    else this.buffer += dt;
    const coyote = this.air * 1000 <= P.coyoteMs;
    const buffered = this.buffer * 1000 <= P.bufferMs;
    const jumpV = (has('spring') ? P.springJump : P.jump) * wet.jump;
    if (free && buffered) {
      if ((this.ground || coyote) && this.vy >= 0 && (this.form !== 'roll' || has('spring'))) {
        if (this.form === 'crouch') this.reshape('stand', w);
        this.vy = -(this.form === 'roll' ? jumpV * 0.75 : jumpV);
        this.spin = this.form === 'stand' && Math.abs(this.vx) > 1;
        this.ground = false;
        this.air = Infinity;
        this.buffer = Infinity;
        w.sfx(this.spin ? 'spin' : 'jump');
      } else if (!this.ground && this.form === 'stand' && c.pressed('jump')) {
        const wall = this.wallTouch;
        if (this.spin && wall && dir === -wall) {
          this.vy = -jumpV * 0.9;
          this.vx = -wall * P.run;
          this.face = (-wall) as 1 | -1;
          this.buffer = Infinity;
          w.sfx('spin');
        } else if (has('skystep') || (has('djump') && this.airJumps > 0)) {
          if (!has('skystep')) this.airJumps--;
          this.vy = -jumpV * 0.9;
          this.spin = true;
          this.buffer = Infinity;
          w.sfx('spin');
        }
      }
    }
    if (!c.held('jump') && this.vy < -jumpV * 0.35 && !this.knock && this.form !== 'roll') this.vy = -jumpV * 0.35;

    if (this.dash <= 0) this.vy = Math.min(this.vy + g * dt, MAX_FALL * (this.inWater ? 0.5 : 1));
    if (free && c.pressed('dash') && has('dash') && this.dashCd <= 0 && this.form !== 'roll') {
      this.dash = DASH_TIME;
      this.dashCd = 0.55;
      w.sfx('dash');
    }

    // Break blocks the player's own moves go through.
    const reach = (pad: number) => ({ x: this.x - pad + Math.min(0, this.vx * dt), y: this.y - pad + Math.min(0, this.vy * dt), w: this.w + 2 * pad + Math.abs(this.vx * dt), h: this.h + 2 * pad + Math.abs(this.vy * dt) });
    if (this.speeding || this.dash > 0) breakIn(w.level, reach(0.2), Tile.SpeedBlock, this.speeding);
    if (this.spin && has('blade')) breakIn(w.level, reach(0.25), Tile.BladeBlock, true);

    // Move.
    const wasGround = this.ground;
    const m = move(w.level, this, dt, w.extra);
    if (m.wallL || m.wallR) {
      this.dash = 0;
      if (this.ground) {
        this.speeding = false;
        this.run = 0;
      }
    }
    this.ground = onGround(w.level, this, w.extra) && this.vy >= 0;
    if (this.ground) {
      if (!wasGround) {
        this.spin = false;
        if (this.form !== 'roll') this.t = 0;
        w.sfx('land');
      }
      this.air = 0;
      this.airJumps = 1;
      for (let x = Math.floor(this.x); x <= Math.floor(this.x + this.w - 0.001); x++) w.level.stepOn(x, Math.floor(this.y + this.h + 0.02));
    } else this.air += dt;
    this.wallTouch = blocked(w.level, { ...this, x: this.x - 0.08 }) ? -1 : blocked(w.level, { ...this, x: this.x + 0.08 }) ? 1 : 0;
    this.stride += Math.abs(this.vx) * dt;

    // Weapons.
    if (free && c.pressed('select')) w.cycleWeapon();
    if (free && this.form === 'roll') {
      if (c.pressed('shoot') && this.bombCd <= 0 && (has('bomb') || (w.weapon === 'novas' && w.ammo('novas') > 0))) {
        this.bombCd = 0.25;
        w.bomb(this.cx, this.y + this.h - 0.3);
      }
      this.charge = 0;
    } else if (free) {
      const canCharge = has('charge') && w.weapon === 'beam';
      if (c.pressed('shoot')) {
        this.shoot(w, false);
        this.charge = 0;
      } else if (c.held('shoot') && canCharge) {
        const before = this.charge;
        this.charge += dt;
        if (before < CHARGE_TIME && this.charge >= CHARGE_TIME) w.sfx('charged');
      } else {
        if (this.charge >= CHARGE_TIME) this.shoot(w, true);
        this.charge = 0;
      }
    }

    // Hazards.
    const now = tilesIn(w.level, this, 0.1);
    if (now.has(Tile.Spikes)) w.hurt(SPIKE_DAMAGE, this.cx - this.face);
    if (this.inLava && !has('thermal')) w.hurt(LAVA_DPS * dt, NaN);
  }

  /** Where the arm cannon points and where its shots start. */
  muzzle(): { x: number; y: number; dx: number; dy: number } {
    const f = this.face;
    const hy = this.form === 'crouch' ? this.y + 0.35 : this.y + 0.45;
    switch (this.aim) {
      case 'up':
        return { x: this.cx + f * 0.15, y: this.y - 0.1, dx: 0, dy: -1 };
      case 'diagUp':
        return { x: this.cx + f * 0.45, y: this.y + 0.1, dx: f * Math.SQRT1_2, dy: -Math.SQRT1_2 };
      case 'diagDown':
        return { x: this.cx + f * 0.45, y: this.y + this.h * 0.7, dx: f * Math.SQRT1_2, dy: Math.SQRT1_2 };
      default:
        return { x: this.cx + f * 0.6, y: hy, dx: f, dy: 0 };
    }
  }

  private shoot(w: World, charged: boolean) {
    if (this.shootCd > 0 && !charged) return;
    const m = this.muzzle();
    if (w.fire(m.x, m.y, m.dx, m.dy, charged)) this.shootCd = w.weapon === 'beam' ? 0.14 : 0.3;
  }

  /** Bounced by one of its own bombs. */
  bombJump(gravity: number) {
    if (this.form === 'roll') this.vy = -bombBounce(gravity) * (this.inWater ? 0.8 : 1);
  }

  /** Took a hit: knocked away from `fromX` (NaN: straight up). */
  knockback(fromX: number) {
    const d = Number.isNaN(fromX) ? 0 : this.cx < fromX ? -1 : 1;
    this.vx = d * 9;
    this.vy = -12;
    this.knock = 0.22;
    this.spin = false;
    this.speeding = false;
    this.run = 0;
    this.dash = 0;
  }
}

type World = PlayerWorld;

function breakIn(level: Level, b: Box, kind: number, ok: boolean) {
  if (!ok) return;
  for (let x = Math.floor(b.x); x <= Math.floor(b.x + b.w); x++)
    for (let y = Math.floor(b.y); y <= Math.floor(b.y + b.h); y++) if (level.tile(x, y) === kind) level.breakTile(x, y);
}
