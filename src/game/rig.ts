import type { SpriteSheet } from '../model/types';
import type { Boss, Enemy } from './enemies';
import type { Player } from './player';

/** Animation states a character can be in; sprite sheet clips are named after these. */
export const PLAYER_STATES = ['idle', 'run', 'jump', 'fall', 'spin', 'roll', 'crouch', 'aimUp', 'hurt', 'speed'] as const;
export type PlayerState = (typeof PLAYER_STATES)[number];
export const ENEMY_STATES = ['move', 'attack', 'hurt', 'frozen'] as const;

export function playerState(p: Player): PlayerState {
  if (p.knock > 0) return 'hurt';
  if (p.form === 'roll') return 'roll';
  if (p.form === 'crouch') return 'crouch';
  if (!p.ground) return p.spin ? 'spin' : p.vy < 0 ? 'jump' : 'fall';
  if (p.speeding) return 'speed';
  if (Math.abs(p.vx) > 0.5) return 'run';
  return p.aim === 'up' ? 'aimUp' : 'idle';
}

export interface RigColors {
  suit: string;
  accent: string;
  visor: string;
}

/**
 * Plays sprite sheet clips. Frames are cut left to right, top to bottom; a missing clip
 * falls back to the procedural rig.
 */
export class Animator {
  constructor(
    readonly sheet: SpriteSheet,
    readonly img: HTMLImageElement,
  ) {}

  /** Frame index for a clip at time t, or null when the clip doesn't exist. */
  frame(state: string, t: number): number | null {
    const c = this.sheet.clips[state];
    if (!c || !c.frames.length) return null;
    const i = Math.floor(t * c.fps);
    return c.frames[c.loop ? i % c.frames.length : Math.min(i, c.frames.length - 1)];
  }

  /** Draws the clip's frame with its feet at (x, y), flipped when facing left. */
  draw(ctx: CanvasRenderingContext2D, state: string, t: number, x: number, y: number, scale: number, face: number): boolean {
    const f = this.frame(state, t);
    if (f === null || !this.img.complete || !this.img.naturalWidth) return false;
    const { frameW: fw, frameH: fh } = this.sheet;
    const cols = Math.max(1, Math.floor(this.img.naturalWidth / fw));
    const sx = (f % cols) * fw;
    const sy = Math.floor(f / cols) * fh;
    const w = fw * scale;
    const h = fh * scale;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y);
    if (face < 0) ctx.scale(-1, 1);
    ctx.drawImage(this.img, sx, sy, fw, fh, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }
}

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

/**
 * The built-in player rig: a suited figure drawn from parts, posed from the player's state.
 * (x, y) is the screen position of the player box's top-left; s is pixels per tile.
 */
export function drawPlayerRig(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number, s: number, col: RigColors, time: number) {
  const st = playerState(p);
  const w = p.w * s;
  const h = p.h * s;
  const cx = x + w / 2;
  const f = p.face;
  ctx.save();
  if (p.iframes > 0 && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.45;

  if (st === 'roll' || st === 'spin') {
    const r = (st === 'roll' ? h : Math.min(w, h)) / 2;
    const cy = y + h - (st === 'roll' ? r : h / 2);
    const ang = (st === 'roll' ? p.stride / (r / s) : p.t * 22) * f;
    if (st === 'spin') {
      ctx.globalAlpha *= 0.3;
      ctx.fillStyle = col.accent;
      ctx.beginPath();
      ctx.arc(cx - p.vx * 0.012 * s, cy - p.vy * 0.012 * s, r * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.3;
    }
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = col.suit;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(col.suit, 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = col.visor;
    ctx.fillRect(-r * 0.25, -r * 0.95, r * 0.5, r * 0.5);
    ctx.fillStyle = col.accent;
    ctx.fillRect(-r, -r * 0.12, r * 2, r * 0.24);
    ctx.restore();
    return;
  }

  const crouch = st === 'crouch';
  const legH = crouch ? h * 0.3 : h * 0.42;
  const hip = y + h - legH;
  const torsoH = h * (crouch ? 0.42 : 0.33);
  const torsoY = hip - torsoH;
  const headR = s * 0.27;
  const bob = st === 'idle' ? Math.sin(p.t * 3) * s * 0.03 : 0;
  // Legs: a two-phase run cycle driven by distance, tucked in the air.
  const cycle = p.stride * 1.4;
  const legs = (side: number) => {
    let swing = 0;
    let lift = 0;
    if (st === 'run' || st === 'speed') {
      const ph = cycle + (side > 0 ? 0 : Math.PI);
      swing = Math.sin(ph) * w * 0.35;
      lift = Math.max(0, Math.cos(ph)) * legH * 0.3;
    } else if (st === 'jump' || st === 'fall' || st === 'hurt') {
      swing = side * w * 0.15;
      lift = legH * (side > 0 ? 0.35 : 0.15);
    } else if (crouch) swing = side * w * 0.2;
    else swing = side * w * 0.12;
    ctx.fillStyle = side > 0 ? col.suit : shade(col.suit, 0.75);
    ctx.fillRect(cx - w * 0.17 + swing * f, hip, w * 0.34, legH - lift);
    ctx.fillStyle = shade(col.suit, 0.5);
    ctx.fillRect(cx - w * 0.22 + swing * f, hip + legH - lift - s * 0.12, w * 0.44, s * 0.12);
  };
  legs(-1);
  // Torso and shoulder.
  ctx.fillStyle = col.suit;
  ctx.fillRect(cx - w * 0.36, torsoY + bob, w * 0.72, torsoH);
  ctx.fillStyle = col.accent;
  ctx.fillRect(cx - w * 0.36, torsoY + bob + torsoH * 0.55, w * 0.72, torsoH * 0.15);
  legs(1);
  ctx.fillStyle = shade(col.suit, 1.15);
  ctx.beginPath();
  ctx.arc(cx - f * w * 0.15, torsoY + bob + s * 0.12, s * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Helmet and visor.
  const hy = torsoY + bob - headR * 0.9;
  ctx.fillStyle = col.suit;
  ctx.beginPath();
  ctx.arc(cx, hy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col.visor;
  ctx.fillRect(cx + (f > 0 ? 0 : -headR * 0.9), hy - headR * 0.25, headR * 0.9, headR * 0.45);
  // Arm cannon, angled by aim.
  const ang = p.aim === 'up' ? -Math.PI / 2 : p.aim === 'diagUp' ? -Math.PI / 4 : p.aim === 'diagDown' ? Math.PI / 4 : 0;
  ctx.save();
  ctx.translate(cx + f * w * 0.1, torsoY + bob + s * 0.2);
  ctx.scale(f, 1);
  ctx.rotate(f > 0 ? ang : ang);
  ctx.fillStyle = shade(col.suit, 0.85);
  ctx.fillRect(0, -s * 0.13, s * 0.62, s * 0.26);
  ctx.fillStyle = p.charge > 0.8 ? '#fff6c0' : col.accent;
  ctx.fillRect(s * 0.5, -s * 0.09, s * 0.14, s * 0.18);
  if (p.charge > 0.15) {
    ctx.globalAlpha = Math.min(1, p.charge) * (0.6 + 0.4 * Math.sin(time * 40));
    ctx.fillStyle = '#fff6c0';
    ctx.beginPath();
    ctx.arc(s * 0.7, 0, s * 0.12 + Math.min(p.charge, 0.8) * s * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
  if (st === 'speed' || p.dash > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = st === 'speed' ? '#62d0e6' : col.suit;
    for (let i = 1; i <= 3; i++) ctx.fillRect(x - f * i * s * 0.5, y, w, h);
    ctx.restore();
  }
}

/** Built-in enemy looks, one per archetype, animated by the enemy's clock. */
export function drawEnemyRig(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number, s: number, color: string) {
  const w = e.w * s;
  const h = e.h * s;
  const t = e.t;
  ctx.save();
  const c = e.frozen > 0 ? '#9fe6ff' : e.flash > 0 ? '#ffffff' : color;
  const dark = e.frozen > 0 ? '#5bb8e0' : shade(color, 0.6);
  ctx.fillStyle = c;
  switch (e.kind) {
    case 'crawler':
    case 'shelled': {
      // Domed shell on scuttling legs.
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = dark;
        const lx = x + w * (0.2 + i * 0.3) + Math.sin(t * 14 + i) * s * 0.06;
        ctx.fillRect(lx, y + h * 0.65, s * 0.1, h * 0.35);
      }
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.65, w / 2, h * 0.6, 0, Math.PI, 0);
      ctx.fill();
      if (e.kind === 'shelled') {
        ctx.fillStyle = dark;
        for (let i = 0; i < 3; i++) ctx.fillRect(x + w * (0.2 + i * 0.25), y + h * 0.2, w * 0.1, h * 0.4);
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + (e.face > 0 ? w * 0.75 : w * 0.12), y + h * 0.4, s * 0.12, s * 0.12);
      break;
    }
    case 'walker':
    case 'sentry': {
      const step = Math.sin(t * 10) * s * 0.12;
      ctx.fillStyle = dark;
      ctx.fillRect(x + w * 0.2 + step, y + h * 0.6, w * 0.22, h * 0.4);
      ctx.fillRect(x + w * 0.58 - step, y + h * 0.6, w * 0.22, h * 0.4);
      ctx.fillStyle = c;
      ctx.fillRect(x + w * 0.1, y + h * 0.15, w * 0.8, h * 0.5);
      ctx.fillRect(x + w * 0.25, y, w * 0.5, h * 0.2);
      ctx.fillStyle = e.kind === 'sentry' ? '#ffdf6b' : '#fff';
      ctx.fillRect(x + (e.face > 0 ? w * 0.6 : w * 0.15), y + h * 0.25, w * 0.25, h * 0.1);
      if (e.kind === 'sentry') {
        ctx.fillStyle = dark;
        ctx.fillRect(x + (e.face > 0 ? w * 0.8 : -w * 0.3), y + h * 0.35, w * 0.5, h * 0.12);
      }
      break;
    }
    case 'hopper': {
      const squash = e.ground ? 1 + Math.max(0, 0.3 - e.timer) * 0.6 : 0.85;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h - (h * 0.5) / squash, w * 0.5 * squash, (h * 0.5) / squash, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(x, y + h * 0.85, w * 0.3, h * 0.15);
      ctx.fillRect(x + w * 0.7, y + h * 0.85, w * 0.3, h * 0.15);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + w * 0.3, y + h * 0.3, s * 0.12, s * 0.12);
      ctx.fillRect(x + w * 0.6, y + h * 0.3, s * 0.12, s * 0.12);
      break;
    }
    case 'swooper':
    case 'flyer': {
      const flap = Math.sin(t * (e.kind === 'flyer' ? 18 : 10)) * h * 0.4;
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + h / 2);
      ctx.lineTo(x - w * 0.4, y + h / 2 - flap);
      ctx.lineTo(x + w * 0.1, y + h * 0.7);
      ctx.moveTo(x + w / 2, y + h / 2);
      ctx.lineTo(x + w * 1.4, y + h / 2 - flap);
      ctx.lineTo(x + w * 0.9, y + h * 0.7);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.35, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffdf6b';
      ctx.fillRect(x + w * 0.35, y + h * 0.35, s * 0.1, s * 0.1);
      ctx.fillRect(x + w * 0.55, y + h * 0.35, s * 0.1, s * 0.1);
      break;
    }
    case 'turret':
    case 'spawner': {
      ctx.fillStyle = dark;
      ctx.fillRect(x, y + h * 0.5, w, h * 0.5);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.55, w * 0.42, Math.PI, 0);
      ctx.fill();
      const pulse = 0.5 + 0.5 * Math.sin(t * (e.kind === 'spawner' ? 3 : 6));
      ctx.fillStyle = `rgba(255,230,120,${0.4 + pulse * 0.6})`;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.45, w * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Built-in boss looks. */
export function drawBossRig(ctx: CanvasRenderingContext2D, b: Boss, ox: number, oy: number, s: number, color: string) {
  const X = (wx: number) => ox + wx * s;
  const Y = (wy: number) => oy + wy * s;
  const x = X(b.x);
  const y = Y(b.y);
  const w = b.w * s;
  const h = b.h * s;
  const c = b.flash > 0 ? '#ffffff' : color;
  const dark = shade(color, 0.55);
  ctx.save();
  if (b.dying > 0) ctx.globalAlpha = Math.max(0.2, b.dying / 2);
  switch (b.kind) {
    case 'worm':
      if (b.phase === 0) break;
      for (let i = b.segs.length - 1; i >= 0; i--) {
        const sg = b.segs[i];
        ctx.fillStyle = i % 2 ? dark : shade(color, 0.8);
        ctx.beginPath();
        ctx.arc(X(sg.x), Y(sg.y), s * (0.75 - i * 0.04), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0a0a';
      ctx.beginPath();
      ctx.arc(x + w / 2 + b.face * w * 0.2, y + h / 2, w * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'giant': {
      const sway = Math.sin(b.t * 2) * s * 0.1;
      ctx.fillStyle = dark;
      ctx.fillRect(x + w * 0.1, y + h * 0.7, w * 0.3, h * 0.3);
      ctx.fillRect(x + w * 0.6, y + h * 0.7, w * 0.3, h * 0.3);
      ctx.fillStyle = c;
      ctx.fillRect(x, y + h * 0.25 + sway, w, h * 0.5);
      ctx.fillRect(x + w * 0.2, y + sway, w * 0.6, h * 0.3);
      ctx.fillStyle = dark;
      for (let i = 0; i < 3; i++) ctx.fillRect(x + (b.face > 0 ? w : -s * 0.6), y + h * (0.45 + i * 0.12) + sway, s * 0.6, s * 0.2);
      ctx.fillStyle = '#ffdf6b';
      ctx.fillRect(x + w * (b.face > 0 ? 0.55 : 0.25), y + h * 0.1 + sway, w * 0.2, h * 0.05);
      const mouth = b.phase !== 2 && b.timer < 0.5 ? h * 0.08 : h * 0.02;
      ctx.fillStyle = '#300';
      ctx.fillRect(x + w * 0.3, y + h * 0.2 + sway, w * 0.4, mouth);
      break;
    }
    case 'flyer': {
      const flap = Math.sin(b.t * 9) * h * 0.5;
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + h * 0.4);
      ctx.lineTo(x - w * 0.5, y + h * 0.2 - flap);
      ctx.lineTo(x + w * 0.2, y + h * 0.8);
      ctx.moveTo(x + w / 2, y + h * 0.4);
      ctx.lineTo(x + w * 1.5, y + h * 0.2 - flap);
      ctx.lineTo(x + w * 0.8, y + h * 0.8);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.3, h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w / 2 + b.face * w * 0.2, y + h * 0.2);
      ctx.lineTo(x + w / 2 + b.face * w * 0.7, y + h * 0.3);
      ctx.lineTo(x + w / 2 + b.face * w * 0.2, y + h * 0.4);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = s * 0.2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + h * 0.9);
      ctx.quadraticCurveTo(x + w / 2 - b.face * w * 0.6, y + h * 1.2 + Math.sin(b.t * 4) * s, x + w / 2 - b.face * w, y + h);
      ctx.stroke();
      break;
    }
    case 'brain': {
      ctx.fillStyle = 'rgba(160,220,255,.18)';
      ctx.fillRect(x - s * 0.5, y - s * 0.5, w + s, h + s);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.45 + Math.sin(b.t * 3) * s * 0.1, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, s * 0.08);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + w * (0.3 + i * 0.13), y + h / 2, w * 0.12, 0.3, 2.8);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffdf6b';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.08, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = b.t * 1.7 + (i * Math.PI) / 2;
        ctx.fillStyle = dark;
        ctx.fillRect(x + w / 2 + Math.cos(a) * s * 3 - s * 0.3, y + h / 2 + Math.sin(a) * s * 3 - s * 0.3, s * 0.6, s * 0.6);
      }
      break;
    }
    case 'mech': {
      ctx.fillStyle = dark;
      ctx.fillRect(x + w * 0.1, y + h * 0.6, w * 0.25, h * 0.4);
      ctx.fillRect(x + w * 0.65, y + h * 0.6, w * 0.25, h * 0.4);
      ctx.fillStyle = c;
      ctx.fillRect(x, y + h * 0.2, w, h * 0.45);
      ctx.fillRect(x + w * 0.25, y, w * 0.5, h * 0.25);
      ctx.fillStyle = b.laser && !b.laser.firing ? '#ff4040' : '#ffdf6b';
      ctx.beginPath();
      ctx.arc(x + w / 2 + b.face * w * 0.15, y + h * 0.12, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(x + (b.face > 0 ? w * 0.8 : -w * 0.2), y + h * 0.3, w * 0.4, h * 0.1);
      break;
    }
  }
  ctx.restore();
  const l = b.laser;
  if (l) {
    ctx.save();
    ctx.globalAlpha = l.firing ? 0.9 : 0.25 + 0.25 * Math.sin(b.t * 40);
    ctx.fillStyle = l.firing ? '#ffe0e0' : '#ff4040';
    const lh = l.firing ? s * 0.6 : s * 0.1;
    ctx.fillRect(X(b.arena.x), Y(l.y) - lh / 2, b.arena.w * s, lh);
    ctx.restore();
  }
}
