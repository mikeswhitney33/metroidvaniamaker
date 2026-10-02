import { ENEMY_COLORS } from '../game/Game';
import { Boss, Enemy } from '../game/enemies';
import { Player } from '../game/player';
import { drawBossRig, drawEnemyRig, drawPlayerRig } from '../game/rig';
import { ENEMY_ARCHETYPES, ENTITY_SPECS, prop, type EnemyArchetype } from '../model/entities';
import type { Entity, StylePreset } from '../model/types';

/** Footprint of an entity in tiles. */
export function entitySize(e: Entity): { w: number; h: number } {
  if (e.type === 'trigger') return { w: Number(e.props.w) || 2, h: Number(e.props.h) || 3 };
  const s = ENTITY_SPECS[e.type];
  return { w: s.w, h: s.h };
}

const ICON: Partial<Record<Entity['type'], string>> = { save: 'SAVE', recharge: '+EN', map: 'MAP', exit: 'EXIT' };

/**
 * Draws an entity in the painter the way the game shows it: enemies and bosses use the same
 * rigs as the runtime, stations and pickups get their in-game shapes, triggers show their area.
 * `s` is pixels per tile; the room's top-left is at (0, 0).
 */
export function drawEntityArt(ctx: CanvasRenderingContext2D, e: Entity, s: number, font: string, roomNames: Record<string, string>) {
  const spec = ENTITY_SPECS[e.type];
  const { w, h } = entitySize(e);
  const x = e.x * s;
  const y = e.y * s;
  ctx.save();
  switch (e.type) {
    case 'enemy': {
      const kind = String(e.props.archetype ?? 'crawler') as EnemyArchetype;
      const en = new Enemy(ENEMY_ARCHETYPES.includes(kind) ? kind : 'crawler', 0, 0, {});
      en.ground = true;
      drawEnemyRig(ctx, en, (e.x + 0.5 - en.w / 2) * s, (e.y + 1 - en.h) * s, s, ENEMY_COLORS[en.kind] ?? spec.color);
      break;
    }
    case 'boss': {
      const b = new Boss(e, 0, 0, { x: 0, y: 0, w: 1, h: 1 }, e.id);
      b.phase = 1;
      drawBossRig(ctx, b, 0, 0, s, '#ff8a5c');
      const to = prop(e, 'escapeTo', '');
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.max(10, Math.round(s * 0.6))}px ${font}`;
      ctx.fillText(prop(e, 'name', 'Boss'), x, y - 4);
      if (to && prop(e, 'escape', 0) > 0) {
        ctx.fillStyle = '#ffdf6b';
        ctx.fillText(`escape ${prop(e, 'escape', 0)}s → ${roomNames[to] ?? to}`, x, y + b.h * s + Math.max(12, s * 0.8));
      }
      break;
    }
    case 'pickup': {
      const cx = x + s / 2;
      const cy = y + s / 2;
      ctx.fillStyle = spec.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.45);
      ctx.lineTo(cx + s * 0.45, cy);
      ctx.lineTo(cx, cy + s * 0.45);
      ctx.lineTo(cx - s * 0.45, cy);
      ctx.fill();
      break;
    }
    case 'statue': {
      ctx.fillStyle = spec.color + 'aa';
      ctx.fillRect(x + s * 0.3, y + s * 0.6, w * s - s * 0.6, h * s - s * 0.6);
      ctx.beginPath();
      ctx.arc(x + (w * s) / 2, y + s * 0.6, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'trigger': {
      ctx.setLineDash([4, 3]);
      ctx.fillStyle = spec.color + '22';
      ctx.fillRect(x, y, w * s, h * s);
      ctx.strokeStyle = spec.color;
      ctx.strokeRect(x + 0.5, y + 0.5, w * s - 1, h * s - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.font = `500 ${Math.max(9, Math.round(s * 0.5))}px ${font}`;
      const act = prop(e, 'action', 'message');
      ctx.fillText(act === 'flag' ? `flag ${prop(e, 'flag', '')}` : act, x + 3, y + Math.max(11, s * 0.7));
      break;
    }
    default: {
      // Stations and the exit: a lit plate on the floor.
      ctx.fillStyle = spec.color + '55';
      ctx.fillRect(x, y, w * s, h * s);
      ctx.fillStyle = spec.color;
      ctx.fillRect(x, y + h * s - Math.max(2, s * 0.25), w * s, Math.max(2, s * 0.25));
      if (s >= 10) {
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.max(8, Math.round(s * 0.45))}px ${font}`;
        ctx.fillText(ICON[e.type] ?? '', x + 2, y + Math.min(h * s - 4, s * 0.7));
      }
    }
  }
  ctx.restore();
}

/** The player's figure standing with its feet on the bottom of tile (x, y). */
export function drawStartArt(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, P: StylePreset) {
  const p = new Player(0, 0);
  p.ground = true;
  drawPlayerRig(ctx, p, (x + 0.5 - p.w / 2) * s, (y + 1 - p.h) * s, s, { suit: P.player, accent: '#ff8a3c', visor: '#5fe0c0' }, 0);
}
