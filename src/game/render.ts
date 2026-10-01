import { doorInfo } from '../model/entities';
import { rng } from '../model/graph';
import { presetById } from '../model/sampleProject';
import { Tile, tileInfo, TILES_PER_CELL } from '../model/tiles';
import type { StylePreset } from '../model/types';
import type { WorldRoom } from '../model/world';
import type { Game } from './Game';
import { drawBossRig, drawEnemyRig, drawPlayerRig, playerState } from './rig';

/** Tiles of the room visible top to bottom; the camera scrolls rooms taller or wider than the view. */
export const VIEW_TILES_H = 18;

/** Draws a tile grid: solid blocks with lit top edges, platforms, spikes, liquids and breakable blocks. */
export function drawTiles(
  ctx: CanvasRenderingContext2D,
  g: Uint8Array | ((x: number, y: number) => number),
  tw: number,
  P: Pick<StylePreset, 'wall' | 'edge'>,
  s: number,
  ox: number,
  oy: number,
  x0 = 0,
  y0 = 0,
  x1 = tw,
  y1 = typeof g === 'function' ? 0 : g.length / tw,
  opts: { liquids?: boolean } = {},
): void {
  const at = typeof g === 'function' ? g : (x: number, y: number) => (x < 0 || y < 0 || x >= tw || y * tw + x >= g.length ? Tile.Solid : g[y * tw + x]);
  const eb = Math.max(1, Math.round(s / 5));
  const solidish = (t: number) => t === Tile.Solid || (t >= Tile.ShotBlock && t <= Tile.Crumble);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const t = at(x, y);
      const X = ox + x * s;
      const Y = oy + y * s;
      if (t === Tile.Solid) {
        ctx.fillStyle = P.wall;
        ctx.fillRect(X, Y, s, s);
        if (!solidish(at(x, y - 1))) {
          ctx.fillStyle = P.edge;
          ctx.fillRect(X, Y, s, eb);
        }
      } else if (t === Tile.Platform) {
        ctx.fillStyle = P.wall;
        ctx.fillRect(X, Y, s, Math.max(2, Math.round(s * 0.35)));
        ctx.fillStyle = P.edge;
        ctx.fillRect(X, Y, s, eb);
      } else if (t === Tile.Spikes) {
        ctx.fillStyle = '#e8e2f0';
        ctx.beginPath();
        for (let i = 0; i < 2; i++) {
          ctx.moveTo(X + (i * s) / 2, Y + s);
          ctx.lineTo(X + (i * s) / 2 + s / 4, Y + s * 0.3);
          ctx.lineTo(X + ((i + 1) * s) / 2, Y + s);
        }
        ctx.fill();
      } else if ((t === Tile.Water || t === Tile.Lava) && opts.liquids !== false) {
        ctx.fillStyle = t === Tile.Water ? 'rgba(63,134,214,.45)' : 'rgba(255,110,40,.75)';
        ctx.fillRect(X, Y, s, s);
        if (at(x, y - 1) !== t) {
          ctx.fillStyle = t === Tile.Water ? 'rgba(150,200,255,.7)' : '#ffd060';
          ctx.fillRect(X, Y, s, eb);
        }
      } else if (t >= Tile.ShotBlock && t <= Tile.Crumble) {
        const info = tileInfo(t);
        ctx.fillStyle = P.wall;
        ctx.fillRect(X, Y, s, s);
        ctx.fillStyle = info?.color ?? P.edge;
        const m = Math.max(1, Math.round(s * 0.12));
        if (t === Tile.Crumble) {
          ctx.fillRect(X + m, Y + m, s - 2 * m, eb);
          ctx.fillRect(X + m, Y + s / 2, (s - 2 * m) / 2, eb);
        } else {
          ctx.globalAlpha = 0.85;
          ctx.fillRect(X + m, Y + m, s - 2 * m, s - 2 * m);
          ctx.globalAlpha = 1;
          ctx.fillStyle = P.wall;
          const c = s / 2;
          // A symbol per block so colour isn't the only cue.
          if (t === Tile.BombBlock || t === Tile.NovaBlock) {
            ctx.beginPath();
            ctx.arc(X + c, Y + c, s * 0.18, 0, Math.PI * 2);
            ctx.fill();
          } else if (t === Tile.MissileBlock || t === Tile.SuperBlock) {
            ctx.fillRect(X + s * 0.25, Y + c - s * 0.08, s * 0.5, s * 0.16);
            if (t === Tile.SuperBlock) ctx.fillRect(X + c - s * 0.08, Y + s * 0.25, s * 0.16, s * 0.5);
          } else if (t === Tile.SpeedBlock) {
            ctx.beginPath();
            ctx.moveTo(X + s * 0.25, Y + s * 0.25);
            ctx.lineTo(X + s * 0.6, Y + c);
            ctx.lineTo(X + s * 0.25, Y + s * 0.75);
            ctx.fill();
          } else if (t === Tile.BladeBlock) {
            ctx.fillRect(X + s * 0.2, Y + s * 0.45, s * 0.6, s * 0.1);
            ctx.fillRect(X + s * 0.45, Y + s * 0.2, s * 0.1, s * 0.6);
          } else ctx.fillRect(X + s * 0.3, Y + s * 0.3, s * 0.4, s * 0.4);
        }
      }
    }
}

interface Cache {
  key: string;
  canvas: HTMLCanvasElement;
}
const caches = new WeakMap<Game, Map<string, Cache>>();

/** The room's tiles drawn once to an offscreen canvas; redrawn only when blocks break or regrow. */
function roomLayer(game: Game, r: WorldRoom, P: StylePreset, s: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let m = caches.get(game);
  if (!m) caches.set(game, (m = new Map()));
  const key = `${s}|${P.id}|${game.level.stamp(r)}|${game.level.locked(r.id)}`;
  const hit = m.get(r.id);
  if (hit?.key === key) return hit.canvas;
  const canvas = hit?.canvas ?? document.createElement('canvas');
  canvas.width = r.tw * s;
  canvas.height = r.th * s;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawTiles(ctx, (x, y) => game.level.tile(r.tx + x, r.ty + y), r.tw, P, s, 0, 0, 0, 0, r.tw, r.th, { liquids: false });
  m.set(r.id, { key, canvas });
  return canvas;
}

export function areaPalette(game: Game, r: WorldRoom): StylePreset {
  const a = game.content.areas.find((x) => x.id === r.area) ?? game.content.areas[0];
  return a?.style ? presetById(a.style) : game.palette;
}

export function drawGame(game: Game, c: HTMLCanvasElement, reduced: boolean) {
  const r = game.room;
  const P = areaPalette(game, r);
  const p = game.player;
  const dpr = window.devicePixelRatio || 1;
  const cw = c.clientWidth;
  const ch = c.clientHeight;
  if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
  }
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0c0f';
  ctx.fillRect(0, 0, cw, ch);
  const now = game.time;

  // Camera.
  const s = Math.max(4, Math.floor(ch / VIEW_TILES_H));
  /** Sprite sheet pixels per tile: the project's art tile size. */
  const tilePx = parseInt(game.content.tile, 10) || 16;
  const follow = (view: number, size: number, at: number) =>
    size * s <= view ? Math.floor((view - size * s) / 2) : Math.round(Math.min(0, Math.max(view - size * s, view / 2 - at * s)));
  let ox = follow(cw, r.tw, p.cx - r.tx);
  let oy = follow(ch, r.th, p.cy - r.ty);
  if (game.shake > 0 && !reduced) {
    ox += Math.round((Math.random() - 0.5) * s * 0.5);
    oy += Math.round((Math.random() - 0.5) * s * 0.5);
  }
  const X = (wx: number) => ox + (wx - r.tx) * s;
  const Y = (wy: number) => oy + (wy - r.ty) * s;

  // Background with parallax pillars.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, r.tw * s, r.th * s);
  ctx.clip();
  ctx.fillStyle = P.bg;
  ctx.fillRect(ox, oy, r.tw * s, r.th * s);
  const R = rng(r.id.split('').reduce((a, ch2) => a * 31 + ch2.charCodeAt(0), 7) + r.tw);
  const px = (p.x - r.tx) * s * 0.25;
  ctx.fillStyle = P.bg2;
  for (let i = 0; i < r.tw / 2.5; i++) {
    const w = s * (1 + R() * 2.5);
    const h = r.th * s * (0.25 + R() * 0.7);
    ctx.fillRect(ox + i * 2.5 * s * 1.3 + R() * s * 2 - px, oy + r.th * s - h, w, h);
  }
  ctx.restore();

  // Tiles.
  const layer = roomLayer(game, r, P, s);
  if (layer) ctx.drawImage(layer, ox, oy);
  else drawTiles(ctx, (x, y) => game.level.tile(r.tx + x, r.ty + y), r.tw, P, s, ox, oy, 0, 0, r.tw, r.th, { liquids: false });

  // Hatches.
  r.doors.forEach((d) => {
    if (game.level.doorOpen(r, d)) return;
    const info = doorInfo(d.spec.kind);
    const dx = X(r.tx + d.x);
    const dy = Y(r.ty + d.y);
    ctx.fillStyle = info.color;
    ctx.fillRect(dx + s * 0.15, dy, s * 0.7, s * 3);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(dx + s * 0.4, dy + s * 0.2, s * 0.2, s * 2.6);
    if (game.level.lockdown.has(r.id)) {
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(dx + s * 0.15, dy, s * 0.7, s * 3);
    }
  });

  // Doorways into rooms sealed by lock & key gates pulse in the key's colour.
  for (let y = 0; y < r.th; y++)
    for (let x = 0; x < r.tw; x++) {
      const edge = x === 0 || y === 0 || x === r.tw - 1 || y === r.th - 1;
      if (!edge || r.g[y * r.tw + x] !== Tile.Empty) continue;
      const wx = r.tx + x + (x === 0 ? -1 : x === r.tw - 1 ? 1 : 0);
      const wy = r.ty + y + (y === 0 ? -1 : y === r.th - 1 ? 1 : 0);
      const nr = game.level.roomAt(wx, wy);
      if (nr && nr !== r && game.level.locked(nr.id)) {
        ctx.fillStyle = '#ffd166';
        ctx.globalAlpha = reduced ? 0.6 : 0.55 + 0.25 * Math.sin(now * 4);
        ctx.fillRect(X(r.tx + x), Y(r.ty + y), s, s);
        ctx.globalAlpha = 1;
      }
    }

  // Stations, statues, exits.
  game.things.forEach((t) => {
    if (t.room !== r) return;
    const e = t.e;
    const ex = X(t.room.tx + e.x);
    const ey = Y(t.room.ty + e.y);
    switch (e.type) {
      case 'save':
      case 'recharge':
      case 'map': {
        const col = e.type === 'save' ? '#4fd1a5' : e.type === 'recharge' ? '#ff6fae' : '#7aa2ff';
        ctx.fillStyle = '#2a2f37';
        ctx.fillRect(ex, ey, s * 2, s);
        ctx.fillStyle = col;
        ctx.fillRect(ex + s * 0.2, ey, s * 1.6, s * 0.25);
        ctx.globalAlpha = 0.18 + (t.inside ? 0.2 : 0) + (reduced ? 0 : 0.08 * Math.sin(now * 3));
        ctx.fillRect(ex + s * 0.2, ey - s * 2.2, s * 1.6, s * 2.2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#0b0c0f';
        ctx.font = `700 ${Math.round(s * 0.55)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(e.type === 'save' ? 'S' : e.type === 'recharge' ? '+' : 'M', ex + s, ey + s * 0.85);
        break;
      }
      case 'statue':
        ctx.fillStyle = '#7a6f50';
        ctx.fillRect(ex + s * 0.3, ey + s * 0.8, s * 1.4, s * 2.2);
        ctx.fillStyle = '#d9c27a';
        ctx.beginPath();
        ctx.arc(ex + s, ey + s * 0.7, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a3220';
        ctx.fillRect(ex + s * 0.75, ey + s * 0.55, s * 0.5, s * 0.15);
        break;
      case 'exit':
        ctx.fillStyle = 'rgba(79,209,165,.25)';
        ctx.fillRect(ex, ey, s * 3, s * 2);
        ctx.strokeStyle = '#4fd1a5';
        ctx.lineWidth = Math.max(1, s * 0.1);
        ctx.strokeRect(ex, ey, s * 3, s * 2);
        break;
    }
  });

  // Pickups.
  game.items.forEach((it) => {
    if (it.room !== r.id || game.collected(it)) return;
    const cx = X(it.x + it.w / 2);
    const cy = Y(it.y + it.h / 2 + (reduced ? 0 : Math.sin(now * 2.5) * 0.12));
    const d = s * 0.45;
    ctx.save();
    ctx.shadowColor = it.color;
    ctx.shadowBlur = s;
    ctx.fillStyle = it.color;
    if (it.node) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, d * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - d * 0.15, cy - d * 0.5, d * 0.3, d);
      ctx.fillRect(cx - d * 0.5, cy - d * 0.15, d, d * 0.3);
    }
    ctx.restore();
  });
  game.drops.forEach((d) => {
    if (d.t < 2 && Math.floor(d.t * 10) % 2 === 0) return;
    ctx.fillStyle = d.kind === 'energy' ? '#ff6fae' : d.kind === 'missiles' ? '#e0584f' : d.kind === 'supers' ? '#4fbf6a' : '#e8c94a';
    ctx.beginPath();
    ctx.arc(X(d.x + d.w / 2), Y(d.y + d.h / 2), s * (d.amount >= 20 ? 0.4 : 0.25), 0, Math.PI * 2);
    ctx.fill();
  });

  // Enemies and bosses.
  game.enemies.forEach((e) => {
    const a = game.animators[e.kind];
    const state = e.frozen > 0 ? 'frozen' : e.flash > 0 ? 'hurt' : 'move';
    if (!a?.draw(ctx, state, e.t, X(e.cx), Y(e.y + e.h), s / tilePx, e.face)) drawEnemyRig(ctx, e, X(e.x), Y(e.y), s, game.enemyColor(e.kind));
  });
  game.bosses.forEach((b) => {
    const a = game.animators[b.kind];
    if (b.kind === 'worm' && b.phase === 0) return;
    if (!a?.draw(ctx, b.flash > 0 ? 'hurt' : 'move', b.t, X(b.cx), Y(b.y + b.h), s / tilePx, b.face)) drawBossRig(ctx, b, X(r.tx), Y(r.ty), s, '#ff8a5c');
  });

  // Player.
  if (game.dying <= 0 || Math.floor(game.dying * 12) % 2 === 0) {
    const a = game.animators.player;
    const st = playerState(p);
    const col = { suit: P.player, accent: '#ff8a3c', visor: '#5fe0c0' };
    if (!a?.draw(ctx, st, p.t, X(p.cx), Y(p.y + p.h), s / tilePx, p.face)) drawPlayerRig(ctx, p, X(p.x), Y(p.y), s, col, now);
  }

  // Bombs, shots and blasts.
  game.bombs.forEach((b) => {
    ctx.fillStyle = b.nova ? '#e8c94a' : Math.floor(b.fuse * 12) % 2 ? '#fff' : '#ff8a3c';
    ctx.beginPath();
    ctx.arc(X(b.x), Y(b.y), s * (b.nova ? 0.35 : 0.25), 0, Math.PI * 2);
    ctx.fill();
  });
  game.shots.forEach((sh) => {
    const sx = X(sh.x);
    const sy = Y(sh.y);
    if (sh.kind === 'enemy') {
      ctx.fillStyle = '#ffb060';
      ctx.beginPath();
      ctx.arc(sx + (sh.w * s) / 2, sy + (sh.h * s) / 2, (sh.w * s) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const col = sh.kind === 'missiles' ? '#e0584f' : sh.kind === 'supers' ? '#4fbf6a' : sh.caps.has('frost') ? '#8fdcff' : sh.caps.has('phase') ? '#c58cff' : sh.caps.has('lance') ? '#7fffa0' : '#fff6c0';
    ctx.fillStyle = col;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = s * 0.6;
    ctx.fillRect(sx, sy, sh.w * s, sh.h * s);
    ctx.restore();
  });
  game.blasts.forEach((b) => {
    ctx.save();
    ctx.globalAlpha = Math.min(0.8, b.t * 3) * (reduced ? 0.4 : 1);
    ctx.fillStyle = b.nova ? '#fff3b0' : '#ffb060';
    ctx.beginPath();
    ctx.arc(X(b.x), Y(b.y), b.r * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Liquids on top, so the player is seen through the water.
  ctx.save();
  for (let y = 0; y < r.th; y++)
    for (let x = 0; x < r.tw; x++) {
      const t = game.level.tile(r.tx + x, r.ty + y);
      if (t !== Tile.Water && t !== Tile.Lava) continue;
      const surface = game.level.tile(r.tx + x, r.ty + y - 1) !== t;
      const wave = surface && !reduced ? Math.sin(now * 3 + x * 0.7) * s * 0.08 : 0;
      ctx.fillStyle = t === Tile.Water ? 'rgba(63,134,214,.38)' : 'rgba(255,110,40,.7)';
      ctx.fillRect(ox + x * s, oy + y * s + wave, s, s - wave);
      if (surface) {
        ctx.fillStyle = t === Tile.Water ? 'rgba(170,215,255,.6)' : '#ffd060';
        ctx.fillRect(ox + x * s, oy + y * s + wave, s, Math.max(1, s / 6));
      }
    }
  ctx.restore();

  drawHud(game, ctx, cw, ch, reduced);
  if (game.paused) drawPauseMap(game, ctx, cw, ch);
  if (game.banner) drawBanner(game, ctx, cw, ch);
  if (game.dying > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, (1.6 - game.dying) * 0.8)})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}

const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function drawHud(game: Game, ctx: CanvasRenderingContext2D, cw: number, ch: number, reduced: boolean) {
  const e = Math.ceil(game.run.energy);
  const tanks = Math.floor((game.maxEnergy - 99) / 100);
  const full = Math.floor(Math.max(0, e - 1) / 100);
  ctx.fillStyle = 'rgba(8,9,12,.72)';
  ctx.fillRect(10, 10, 230, 44);
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa1ad';
  ctx.fillText('EN', 18, 38);
  ctx.fillStyle = e < 30 && (reduced || Math.floor(game.time * 4) % 2) ? '#ff6b6b' : '#f0e6d2';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(String(e % 100 === 0 && e > 0 ? 99 : e % 100).padStart(2, '0'), 40, 42);
  for (let i = 0; i < tanks; i++) {
    ctx.fillStyle = i < full ? '#ff6fae' : '#3a2f38';
    ctx.fillRect(40 + (i % 7) * 10, i < 7 ? 16 : 24, 8, 6);
  }
  let x = 100;
  (['missiles', 'supers', 'novas'] as const).forEach((k) => {
    const max = game.maxAmmo(k);
    if (!max) return;
    const sel = game.weapon === k;
    ctx.fillStyle = sel ? '#ffd166' : '#2a2f37';
    ctx.fillRect(x, 16, 40, 32);
    ctx.fillStyle = k === 'missiles' ? '#e0584f' : k === 'supers' ? '#4fbf6a' : '#e8c94a';
    ctx.fillRect(x + 4, 20, 32, 6);
    ctx.fillStyle = sel ? '#0b0c0f' : '#f0e6d2';
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(game.run.ammo[k]).padStart(k === 'missiles' ? 3 : 2, '0'), x + 20, 43);
    ctx.textAlign = 'left';
    x += 44;
  });

  // Minimap around the current cell.
  const r = game.room;
  const T = TILES_PER_CELL;
  const pcx = Math.floor(game.player.cx / T);
  const pcy = Math.floor(game.player.cy / T);
  const cs = 10;
  const mx = cw - 10 - cs * 5;
  const my = 10;
  ctx.fillStyle = 'rgba(8,9,12,.72)';
  ctx.fillRect(mx - 4, my - 4, cs * 5 + 8, cs * 3 + 8);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const cx = pcx + dx;
      const cy = pcy + dy;
      const room = game.content.rooms.find((q) => cx >= q.x && cx < q.x + q.w && cy >= q.y && cy < q.y + q.h);
      if (!room) continue;
      const known = game.run.visited.includes(room.id);
      const mapped = game.run.mapped.includes(room.area ?? game.content.areas[0]?.id ?? 'main');
      if (!known && !mapped) continue;
      ctx.fillStyle = dx === 0 && dy === 0 ? (reduced || Math.floor(game.time * 3) % 2 ? '#ffd166' : '#a08040') : known ? areaColor(game, room.area) : '#2b3a5a';
      ctx.fillRect(mx + (dx + 2) * cs, my + (dy + 1) * cs, cs - 1, cs - 1);
    }
  if (r.name) {
    ctx.fillStyle = '#9aa1ad';
    ctx.font = `500 11px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(r.name, cw - 10, my + cs * 3 + 18);
  }

  // Escape timer.
  if (game.escape) {
    const t = Math.max(0, game.escape.t);
    ctx.textAlign = 'center';
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = t < 10 && !reduced && Math.floor(game.time * 4) % 2 ? '#ff6b6b' : '#ffd166';
    ctx.fillText(`ESCAPE ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`, cw / 2, 40);
  }

  // Boss health.
  const b = game.bosses.find((q) => q.awake && q.dying <= 0);
  if (b) {
    const w = Math.min(420, cw - 60);
    const bx = (cw - w) / 2;
    const by = ch - 30;
    ctx.fillStyle = 'rgba(8,9,12,.72)';
    ctx.fillRect(bx - 4, by - 18, w + 8, 30);
    ctx.fillStyle = '#3a2f38';
    ctx.fillRect(bx, by, w, 8);
    ctx.fillStyle = '#ff8a5c';
    ctx.fillRect(bx, by, (w * Math.max(0, b.hp)) / b.maxHp, 8);
    ctx.fillStyle = '#f0e6d2';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(b.name, bx, by - 5);
  }
  ctx.textAlign = 'left';
}

const areaColor = (game: Game, id?: string) => (game.content.areas.find((a) => a.id === id) ?? game.content.areas[0])?.color ?? '#a597c4';

function drawPauseMap(game: Game, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  ctx.fillStyle = 'rgba(6,7,10,.92)';
  ctx.fillRect(0, 0, cw, ch);
  const g = game.content.grid;
  const cs = Math.max(6, Math.floor(Math.min((cw - 80) / g.w, (ch - 120) / g.h)));
  const ox = Math.floor((cw - g.w * cs) / 2);
  const oy = Math.floor((ch - g.h * cs) / 2) + 10;
  const area0 = game.content.areas[0]?.id ?? 'main';
  game.content.rooms.forEach((room) => {
    const known = game.run.visited.includes(room.id);
    const mapped = game.run.mapped.includes(room.area ?? area0);
    if (!known && !mapped) return;
    const col = areaColor(game, room.area);
    ctx.fillStyle = known ? col : 'rgba(80,110,170,.35)';
    ctx.globalAlpha = known ? 0.55 : 1;
    ctx.fillRect(ox + room.x * cs + 1, oy + room.y * cs + 1, room.w * cs - 2, room.h * cs - 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = known ? col : 'rgba(120,150,210,.6)';
    ctx.strokeRect(ox + room.x * cs + 1.5, oy + room.y * cs + 1.5, room.w * cs - 3, room.h * cs - 3);
    (room.entities ?? []).forEach((e) => {
      if (e.type === 'save' || e.type === 'recharge' || e.type === 'map') {
        ctx.fillStyle = e.type === 'save' ? '#4fd1a5' : e.type === 'recharge' ? '#ff6fae' : '#7aa2ff';
        ctx.font = `700 ${Math.round(cs * 0.6)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(e.type === 'save' ? 'S' : e.type === 'recharge' ? 'R' : 'M', ox + (room.x + (e.x + 1) / TILES_PER_CELL) * cs, oy + (room.y + (e.y + 0.5) / TILES_PER_CELL) * cs + cs * 0.2);
      }
    });
  });
  game.items.forEach((it) => {
    if (game.collected(it)) return;
    const room = game.content.rooms.find((q) => q.id === it.room);
    if (!room) return;
    const known = game.run.visited.includes(room.id) || game.run.mapped.includes(room.area ?? area0);
    if (!known) return;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ox + (it.x / TILES_PER_CELL) * cs, oy + (it.y / TILES_PER_CELL) * cs, Math.max(2, cs * 0.15), 0, Math.PI * 2);
    ctx.fill();
  });
  const p = game.player;
  ctx.fillStyle = Math.floor(game.time * 4) % 2 ? '#ffd166' : '#fff';
  ctx.fillRect(ox + (p.cx / TILES_PER_CELL) * cs - 3, oy + (p.cy / TILES_PER_CELL) * cs - 3, 6, 6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0e6d2';
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText((game.content.areas.find((a) => a.id === game.room.area) ?? game.content.areas[0])?.name ?? 'Map', cw / 2, 36);
  ctx.font = `500 12px ${FONT}`;
  ctx.fillStyle = '#9aa1ad';
  const items = game.items.filter((i) => game.collected(i)).length;
  ctx.fillText(`Items ${items}/${game.items.length} · Time ${game.clock()} · Paused`, cw / 2, ch - 24);
  ctx.textAlign = 'left';
}

function drawBanner(game: Game, ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  const b = game.banner!;
  const w = Math.min(520, cw - 40);
  const lines = wrap(ctx, b.body, w - 40);
  const h = 58 + lines.length * 18 + (b.hold ? 18 : 0);
  const x = (cw - w) / 2;
  const y = ch * 0.3 - h / 2;
  ctx.fillStyle = 'rgba(8,9,12,.9)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b.color;
  ctx.fillRect(x, y, w, 3);
  ctx.textAlign = 'center';
  ctx.font = `700 18px ${FONT}`;
  ctx.fillText(b.title, cw / 2, y + 32);
  ctx.font = `500 13px ${FONT}`;
  ctx.fillStyle = '#dfe2e7';
  lines.forEach((l, i) => ctx.fillText(l, cw / 2, y + 56 + i * 18));
  if (b.hold && b.t > 0.5 && !game.won) {
    ctx.fillStyle = '#6b7280';
    ctx.font = `500 11px ${FONT}`;
    ctx.fillText('Press Jump to continue', cw / 2, y + h - 10);
  }
  ctx.textAlign = 'left';
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  if (!text) return [];
  ctx.font = `500 13px ${FONT}`;
  const out: string[] = [];
  let line = '';
  text.split(/\s+/).forEach((w) => {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      out.push(line);
      line = w;
    } else line = t;
  });
  if (line) out.push(line);
  return out;
}
