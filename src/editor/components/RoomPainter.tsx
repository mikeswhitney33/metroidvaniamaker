import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { drawTiles } from '../../game/render';
import { drawTileset, tilesetOf } from '../../game/tileset';
import { presetById } from '../../model/sampleProject';
import { useImage } from '../useImage';
import { doorInfo, ENTITY_SPECS, newEntity } from '../../model/entities';
import { isKey } from '../../model/graph';
import { TEMPLATES } from '../../model/templates';
import { encodeTiles, Tile, TILE_INFO, type TileKind } from '../../model/tiles';
import type { Entity, EntityType } from '../../model/types';
import { baseTiles, DOOR_H, floorSpot } from '../../model/world';
import { useEditor } from '../context';
import { drawEntityArt, drawStartArt, entitySize } from '../entityArt';
import type { PaintTool } from '../state';
import { C, MONO, SANS, secondaryButton, seg, segGroup } from '../ui';

export { entitySize };

type Cell = [number, number];

/** Cells from (x0, y0) to (x1, y1) inclusive, so a fast drag leaves no gaps. */
function line(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const out: Cell[] = [];
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    out.push([Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)]);
  }
  return out;
}

function rectCells(a: Cell, b: Cell, hollow: boolean): Cell[] {
  const x0 = Math.min(a[0], b[0]);
  const x1 = Math.max(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const y1 = Math.max(a[1], b[1]);
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!hollow || x === x0 || x === x1 || y === y0 || y === y1) out.push([x, y]);
  return out;
}

/** The same-kind region around (x, y), four-connected. */
function floodCells(g: Uint8Array, tw: number, th: number, x: number, y: number): Cell[] {
  const k = g[y * tw + x];
  const seen = new Uint8Array(tw * th);
  const out: Cell[] = [];
  const q: Cell[] = [[x, y]];
  seen[y * tw + x] = 1;
  while (q.length) {
    const [cx, cy] = q.pop()!;
    out.push([cx, cy]);
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ] as Cell[]) {
      if (nx < 0 || ny < 0 || nx >= tw || ny >= th || seen[ny * tw + nx] || g[ny * tw + nx] !== k) continue;
      seen[ny * tw + nx] = 1;
      q.push([nx, ny]);
    }
  }
  return out;
}

/** Copied tiles; kept for the session so they paste into any room. */
interface TileClip {
  w: number;
  h: number;
  g: Uint8Array;
}
let tileClip: TileClip | null = null;

function flip(c: TileClip, vertical: boolean): TileClip {
  const g = new Uint8Array(c.g.length);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) g[y * c.w + x] = c.g[(vertical ? c.h - 1 - y : y) * c.w + (vertical ? x : c.w - 1 - x)];
  return { ...c, g };
}

let strokes = 0;

const TOOLS: [PaintTool, string, string][] = [
  ['brush', 'Brush', 'B'],
  ['rect', 'Rect', 'R'],
  ['frame', 'Frame', 'O'],
  ['line', 'Line', 'L'],
  ['fill', 'Fill', 'G'],
  ['pick', 'Pick', 'I'],
  ['select', 'Select', 'M'],
];
const TOOL_KEYS: Record<string, PaintTool> = Object.fromEntries(TOOLS.map(([t, , k]) => [`Key${k}`, t]));

/** Tiles without a number key get Shift+6…9. */
const SHIFT_TILES: Record<string, TileKind> = { Digit6: Tile.NovaBlock, Digit7: Tile.SpeedBlock, Digit8: Tile.BladeBlock, Digit9: Tile.Crumble };
const shiftKeyOf = (k: TileKind) => Object.entries(SHIFT_TILES).find(([, v]) => v === k)?.[0].replace('Digit', '⇧');

const HINTS: Record<PaintTool, string> = {
  brush: 'Drag to paint, right-drag to clear. [ and ] change the brush size',
  rect: 'Drag a filled rectangle. Right-drag clears one',
  frame: 'Drag a hollow rectangle: walls round an area',
  line: 'Drag a straight line',
  fill: 'Click to fill the connected area of the same tile',
  pick: 'Click a tile to paint with it. Alt-click does this with any tool',
  select: 'Drag to select. Ctrl+C copy, Ctrl+X cut, Ctrl+V paste, H / Shift+H flip, Delete clears',
};

/** Tile painter for one room: replaces the map while a room is open. Paints tiles, or places entities. */
export function RoomPainter() {
  const { state, roomById, world, palette, colorOf, check, set, edit, flash, playFrom } = useEditor();
  const room = roomById[state.editRoom ?? '']!;
  const wr = world.find((r) => r.id === room.id)!;
  const base = useMemo(() => baseTiles(room), [room]);
  const { tw, th } = wr;
  const layer = state.paintLayer;
  const tool = state.paintTool;
  const entities = room.entities ?? [];
  const nodesHere = useMemo(() => state.nodes.filter((n) => n.room === room.id && (n.kind === 'start' || isKey(n))), [state.nodes, room.id]);
  const roomNames = useMemo(() => Object.fromEntries(state.rooms.map((r) => [r.id, r.name])), [state.rooms]);
  const roomArea = state.areas.find((a) => a.id === room.area) ?? state.areas[0];
  const areaPalette = roomArea?.style ? presetById(roomArea.style) : palette;
  const tilesetImg = useImage(roomArea?.tileset ? state.images[roomArea.tileset] : undefined);
  const tileset = tilesetImg ? tilesetOf(tilesetImg, parseInt(state.tile, 10) || 16) : null;
  const pins = useMemo(() => check.issues.filter((i) => i.room === room.id && i.tile), [check.issues, room.id]);

  const view = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<Cell | null>(null);
  const [shape, setShape] = useState<{ from: Cell; to: Cell; clear: boolean } | null>(null);
  const [selRect, setSelRect] = useState<{ from: Cell; to: Cell } | null>(null);
  const [floating, setFloating] = useState<TileClip | null>(null);
  const stroke = useRef<{ id: number; kind: TileKind; last: Cell } | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; merge: string } | null>(null);
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const space = useRef(false);
  const zoomAnchor = useRef<{ cx: number; cy: number; gx: number; gy: number } | null>(null);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitS = Math.max(3, Math.min(28, Math.floor(Math.min((area.w - 48) / tw, (area.h - 48) / th))));
  const s = state.paintZoom ?? fitS;

  const zoomTo = (next: number, cx?: number, cy?: number) => {
    next = Math.max(3, Math.min(64, Math.round(next)));
    if (next === s || !canvas.current || !view.current) return;
    const v = view.current.getBoundingClientRect();
    const px = cx ?? v.left + v.width / 2;
    const py = cy ?? v.top + v.height / 2;
    const b = canvas.current.getBoundingClientRect();
    zoomAnchor.current = { cx: px, cy: py, gx: (px - b.left) / s, gy: (py - b.top) / s };
    set({ paintZoom: next });
  };
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    if (!a || !canvas.current || !view.current) return;
    zoomAnchor.current = null;
    const b = canvas.current.getBoundingClientRect();
    view.current.scrollLeft += b.left + a.gx * s - a.cx;
    view.current.scrollTop += b.top + a.gy * s - a.cy;
  }, [s]);
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(s * Math.pow(1.0018, -e.deltaY), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const nodePos = (n: (typeof nodesHere)[number]) => {
    if (n.pos) return n.pos;
    const f = floorSpot(wr);
    return { x: Math.floor(f.x - wr.tx), y: f.y - wr.ty - 1 };
  };

  // Base layer: tiles, doorways, grid, entities and items. Redrawn only when the room changes.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = tw * s * dpr;
    c.height = th * s * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = areaPalette.bg;
    ctx.fillRect(0, 0, tw * s, th * s);
    if (tileset) drawTileset(ctx, (x, y) => (x < 0 || y < 0 || x >= tw || y >= th ? Tile.Solid : wr.g[y * tw + x]), tw, th, tileset, areaPalette, s, 0, 0);
    else drawTiles(ctx, wr.g, tw, areaPalette, s, 0, 0);

    // Doorways are carved where rooms touch, whatever is painted there: stripe them.
    ctx.fillStyle = 'rgba(240,180,76,.35)';
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (wr.g[y * tw + x] === base[y * tw + x]) continue;
        for (let k = 0; k < s; k += 4) ctx.fillRect(x * s + k, y * s, 2, s);
      }
    wr.doors.forEach((d) => {
      ctx.fillStyle = doorInfo(d.spec.kind).color;
      ctx.fillRect(d.x * s + s * 0.15, d.y * s, s * 0.7, DOOR_H * s);
    });

    // Tile grid, with stronger lines on map-cell boundaries.
    if (s >= 8) {
      for (let x = 0; x <= tw; x++) {
        ctx.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)';
        ctx.fillRect(x * s, 0, 1, th * s);
      }
      for (let y = 0; y <= th; y++) {
        ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)';
        ctx.fillRect(0, y * s, tw * s, 1);
      }
    }

    // Entities as the game draws them, dimmed while painting tiles.
    ctx.globalAlpha = layer === 'tiles' ? 0.5 : 1;
    entities.forEach((e) => {
      drawEntityArt(ctx, e, s, MONO, roomNames);
      if (state.selEntity === e.id) {
        const { w, h } = entitySize(e);
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x * s - 1, e.y * s - 1, w * s + 2, h * s + 2);
      }
    });
    // Start and key items.
    nodesHere.forEach((n) => {
      const p = nodePos(n);
      if (n.kind === 'start') drawStartArt(ctx, p.x, p.y, s, areaPalette);
      else {
        const x = (p.x + 0.5) * s;
        const y = (p.y + 0.5) * s;
        const d = Math.max(4, s * 0.45);
        ctx.fillStyle = colorOf(n);
        ctx.beginPath();
        ctx.moveTo(x, y - d);
        ctx.lineTo(x + d, y);
        ctx.lineTo(x, y + d);
        ctx.lineTo(x - d, y);
        ctx.fill();
      }
      if (state.placing === `node:${n.id}`) {
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x * s - 3, (p.y - 1) * s - 3, s + 6, s * 2 + 6);
      }
    });
    ctx.globalAlpha = 1;

    // Validation pins on the tiles they're about.
    pins.forEach((i) => {
      const x = (i.tile!.x + 0.5) * s;
      const y = (i.tile!.y + 0.5) * s;
      ctx.fillStyle = i.sev === 'error' ? C.bad : C.accent;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(5, s * 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.bar;
      ctx.font = `700 ${Math.max(8, Math.round(s * 0.5))}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y + 0.5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    });
  }, [wr, base, tw, th, s, areaPalette, tileset, entities, nodesHere, colorOf, layer, state.selEntity, state.placing, roomNames, pins]);

  const brushCells = (c: Cell): Cell[] => {
    const n = state.brush;
    const o = Math.floor((n - 1) / 2);
    const out: Cell[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push([c[0] - o + x, c[1] - o + y]);
    return out;
  };

  // Overlay: the cursor, shape previews, the selection and floating pasted tiles. Cheap to redraw on every move.
  useEffect(() => {
    const c = overlay.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = tw * s * dpr;
    c.height = th * s * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, tw * s, th * s);
    const color = TILE_INFO.find((t) => t.kind === state.paintTile)?.color ?? C.accent;
    const fillCells = (cells: Cell[], col: string) => {
      ctx.fillStyle = col;
      cells.forEach(([x, y]) => x >= 0 && y >= 0 && x < tw && y < th && ctx.fillRect(x * s, y * s, s, s));
    };
    if (floating && hover) {
      ctx.globalAlpha = 0.75;
      for (let y = 0; y < floating.h; y++)
        for (let x = 0; x < floating.w; x++) {
          const k = floating.g[y * floating.w + x];
          ctx.fillStyle = k === Tile.Empty ? 'rgba(0,0,0,.5)' : (TILE_INFO.find((t) => t.kind === k)?.color ?? '#888');
          ctx.fillRect((hover[0] + x) * s, (hover[1] + y) * s, s, s);
        }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.accent;
      ctx.strokeRect(hover[0] * s + 0.5, hover[1] * s + 0.5, floating.w * s - 1, floating.h * s - 1);
      return;
    }
    if (shape) {
      const cells = tool === 'line' ? line(shape.from[0], shape.from[1], shape.to[0], shape.to[1]) : rectCells(shape.from, shape.to, tool === 'frame');
      ctx.globalAlpha = 0.6;
      fillCells(cells, shape.clear ? 'rgba(0,0,0,.8)' : color === '#000000' ? 'rgba(0,0,0,.8)' : color);
      ctx.globalAlpha = 1;
    }
    if (selRect) {
      const [a, b] = [selRect.from, selRect.to];
      const x = Math.min(a[0], b[0]);
      const y = Math.min(a[1], b[1]);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x * s + 0.5, y * s + 0.5, (Math.abs(a[0] - b[0]) + 1) * s - 1, (Math.abs(a[1] - b[1]) + 1) * s - 1);
      ctx.setLineDash([]);
    }
    if (hover && !shape) {
      let cells: Cell[] = [hover];
      if (layer === 'entities' && !state.placing.startsWith('node:') && ENTITY_SPECS[state.placing as EntityType]) {
        const { w, h } = entitySize(newEntity(state.placing as EntityType, '', 0, 0));
        cells = rectCells(hover, [hover[0] + w - 1, hover[1] + h - 1], false);
      } else if (layer === 'tiles' && tool === 'brush') cells = brushCells(hover);
      const xs = cells.map((p) => p[0]);
      const ys = cells.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 * s + 1, y0 * s + 1, (Math.max(...xs) - x0 + 1) * s - 2, (Math.max(...ys) - y0 + 1) * s - 2);
    }
  });

  const cellAt = (e: PointerEvent<HTMLCanvasElement>): Cell | null => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - b.left) / s);
    const y = Math.floor((e.clientY - b.top) / s);
    return x >= 0 && y >= 0 && x < tw && y < th ? [x, y] : null;
  };

  /** Writes tiles: a single kind over `cells`, or per-cell values. */
  const paint = (cells: Cell[], kind: TileKind | ((x: number, y: number) => TileKind | null), merge?: string) =>
    edit((st) => {
      const r = st.rooms.find((x) => x.id === room.id);
      if (!r) return {};
      const g = baseTiles(r);
      let changed = false;
      cells.forEach(([x, y]) => {
        if (x < 0 || y < 0 || x >= tw || y >= th) return;
        const k = typeof kind === 'function' ? kind(x, y) : kind;
        if (k === null || g[y * tw + x] === k) return;
        g[y * tw + x] = k;
        changed = true;
      });
      if (!changed) return {};
      return { rooms: st.rooms.map((x) => (x.id === r.id ? { ...x, tiles: encodeTiles(g) } : x)) };
    }, merge);

  const selection = () => {
    if (!selRect) return null;
    const [a, b] = [selRect.from, selRect.to];
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 };
  };
  const copySel = (cut: boolean) => {
    const r = selection();
    if (!r) return;
    const g = new Uint8Array(r.w * r.h);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) g[y * r.w + x] = base[(r.y + y) * tw + r.x + x];
    tileClip = { w: r.w, h: r.h, g };
    if (cut) paint(rectCells([r.x, r.y], [r.x + r.w - 1, r.y + r.h - 1], false), Tile.Empty);
    flash(`${cut ? 'Cut' : 'Copied'} ${r.w}×${r.h} tiles. Ctrl+V to paste`);
  };
  const stamp = (at: Cell, c: TileClip) => {
    const cells: Cell[] = [];
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) cells.push([at[0] + x, at[1] + y]);
    paint(cells, (x, y) => c.g[(y - at[1]) * c.w + (x - at[0])] as TileKind);
  };

  const setEntities = (fn: (list: Entity[]) => Entity[], merge?: string) =>
    edit((st) => ({ rooms: st.rooms.map((r) => (r.id === room.id ? { ...r, entities: fn(r.entities ?? []) } : r)) }), merge);

  const entityAt = (x: number, y: number) =>
    [...entities].reverse().find((e) => {
      const { w, h } = entitySize(e);
      return x >= e.x && x < e.x + w && y >= e.y && y < e.y + h;
    });

  const onEntityDown = (c: Cell, button: number) => {
    const hit = entityAt(c[0], c[1]);
    if (button === 2) {
      if (hit) {
        setEntities((l) => l.filter((x) => x.id !== hit.id));
        set({ selEntity: null });
      }
      return;
    }
    if (state.placing.startsWith('node:')) {
      const id = state.placing.slice(5);
      edit((st) => ({ nodes: st.nodes.map((n) => (n.id === id ? { ...n, pos: { x: c[0], y: c[1] } } : n)) }));
      return;
    }
    if (hit) {
      set({ selEntity: hit.id });
      drag.current = { id: hit.id, dx: c[0] - hit.x, dy: c[1] - hit.y, merge: `move:${++strokes}` };
      return;
    }
    const type = state.placing as EntityType;
    if (!ENTITY_SPECS[type]) return;
    const id = `${type[0]}${state.seq}`;
    const e = newEntity(type, id, c[0], c[1]);
    edit((st) => ({
      seq: st.seq + 1,
      selEntity: id,
      rooms: st.rooms.map((r) => (r.id === room.id ? { ...r, entities: [...(r.entities ?? []), e] } : r)),
    }));
  };

  // Painter shortcuts.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') {
        space.current = true;
        e.preventDefault();
        return;
      }
      if (mod) {
        if (e.code === 'KeyC' && selRect) copySel(false);
        else if (e.code === 'KeyX' && selRect) copySel(true);
        else if (e.code === 'KeyV' && tileClip) {
          set({ paintLayer: 'tiles' });
          setFloating(tileClip);
        } else return;
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape') {
        if (floating) setFloating(null);
        else if (selRect) setSelRect(null);
        else if (state.selEntity) set({ selEntity: null });
        else set({ editRoom: null, selEntity: null });
        return;
      }
      if (e.code === 'KeyP') return playFrom(room.id, hover ? { x: hover[0], y: hover[1] } : undefined);
      if (e.code === 'KeyT') return set({ paintLayer: 'tiles' });
      if (e.code === 'KeyN') return set({ paintLayer: 'entities' });
      if (e.code === 'KeyF') return set({ paintZoom: null });
      if (e.code === 'Equal') return zoomTo(s * 1.25);
      if (e.code === 'Minus') return zoomTo(s / 1.25);
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (layer === 'entities' && state.selEntity) {
          const id = state.selEntity;
          setEntities((l) => l.filter((x) => x.id !== id));
          set({ selEntity: null });
        } else if (selRect) {
          const r = selection()!;
          paint(rectCells([r.x, r.y], [r.x + r.w - 1, r.y + r.h - 1], false), Tile.Empty);
        }
        e.preventDefault();
        return;
      }
      if (layer !== 'tiles') return;
      if (e.code === 'KeyH') {
        if (floating) setFloating(flip(floating, e.shiftKey));
        else if (selRect) {
          const r = selection()!;
          const g = new Uint8Array(r.w * r.h);
          for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) g[y * r.w + x] = base[(r.y + y) * tw + r.x + x];
          stamp([r.x, r.y], flip({ w: r.w, h: r.h, g }, e.shiftKey));
        }
        return;
      }
      if (e.code === 'BracketLeft') return set((st) => ({ brush: Math.max(1, st.brush - 1) }));
      if (e.code === 'BracketRight') return set((st) => ({ brush: Math.min(5, st.brush + 1) }));
      if (e.shiftKey && SHIFT_TILES[e.code] !== undefined) return set({ paintTile: SHIFT_TILES[e.code] });
      const t = TILE_INFO.find((k) => k.key && e.code === `Digit${k.key}`);
      if (t && !e.shiftKey) return set({ paintTile: t.kind });
      const tl = TOOL_KEYS[e.code];
      if (tl) {
        set({ paintTool: tl });
        if (tl !== 'select') setSelRect(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const painted = room.tiles !== undefined;

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || space.current) {
      e.preventDefault();
      const v = view.current!;
      pan.current = { x: e.clientX, y: e.clientY, sl: v.scrollLeft, st: v.scrollTop };
      return;
    }
    const c = cellAt(e);
    if (!c) return;
    if (layer === 'entities') {
      onEntityDown(c, e.button);
      return;
    }
    if (floating) {
      if (e.button === 2) setFloating(null);
      else stamp(c, floating);
      return;
    }
    const clear = e.button === 2;
    if (e.altKey || tool === 'pick') {
      set({ paintTile: base[c[1] * tw + c[0]] as TileKind });
      return;
    }
    if (tool === 'fill') {
      paint(floodCells(base, tw, th, c[0], c[1]), clear ? Tile.Empty : state.paintTile);
      return;
    }
    if (tool === 'select') {
      setSelRect({ from: c, to: c });
      stroke.current = { id: ++strokes, kind: Tile.Empty, last: c };
      return;
    }
    if (tool !== 'brush') {
      setShape({ from: c, to: c, clear });
      return;
    }
    const kind = clear ? Tile.Empty : state.paintTile;
    stroke.current = { id: ++strokes, kind, last: c };
    paint(brushCells(c), kind, `paint:${stroke.current.id}`);
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = pan.current;
    if (p) {
      view.current!.scrollLeft = p.sl - (e.clientX - p.x);
      view.current!.scrollTop = p.st - (e.clientY - p.y);
      return;
    }
    const c = cellAt(e);
    if (!c || hover?.[0] !== c[0] || hover?.[1] !== c[1]) setHover(c);
    const d = drag.current;
    if (d && c) {
      const nx = Math.max(0, c[0] - d.dx);
      const ny = Math.max(0, c[1] - d.dy);
      setEntities((l) => l.map((x) => (x.id === d.id && (x.x !== nx || x.y !== ny) ? { ...x, x: nx, y: ny } : x)), d.merge);
      return;
    }
    if (!c) return;
    if (shape && (shape.to[0] !== c[0] || shape.to[1] !== c[1])) {
      setShape({ ...shape, to: c });
      return;
    }
    const st = stroke.current;
    if (!st || (c[0] === st.last[0] && c[1] === st.last[1])) return;
    if (tool === 'select') {
      setSelRect((r) => (r ? { ...r, to: c } : r));
      st.last = c;
      return;
    }
    paint(
      line(st.last[0], st.last[1], c[0], c[1]).flatMap((q) => brushCells(q)),
      st.kind,
      `paint:${st.id}`,
    );
    st.last = c;
  };

  const onUp = () => {
    if (shape) {
      const cells = tool === 'line' ? line(shape.from[0], shape.from[1], shape.to[0], shape.to[1]) : rectCells(shape.from, shape.to, tool === 'frame');
      paint(cells, shape.clear ? Tile.Empty : state.paintTile);
      setShape(null);
    }
    if (tool === 'select' && selRect && selRect.from[0] === selRect.to[0] && selRect.from[1] === selRect.to[1] && stroke.current) setSelRect(null);
    stroke.current = null;
    drag.current = null;
    pan.current = null;
  };

  const hint =
    layer === 'tiles'
      ? floating
        ? 'Click to paste, H / Shift+H flip, right-click or Esc to stop pasting'
        : HINTS[tool]
      : state.placing.startsWith('node:')
        ? 'Click a tile to put the item there.'
        : 'Click to place, drag to move, right-click or Delete to remove. Select one to edit it in the right panel';

  return (
    <>
      <div
        style={{
          minHeight: 40,
          flex: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px 10px',
          padding: '6px 12px',
          borderBottom: `1px solid ${C.line}`,
          background: C.bar,
        }}
      >
        <div style={{ font: `600 13px ${SANS}`, color: C.text }}>{room.name}</div>
        <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>
          {tw}×{th}
        </div>
        <div style={{ ...segGroup, flex: 'none' }} role="radiogroup" aria-label="Layer">
          {(
            [
              ['tiles', 'Tiles', 'T'],
              ['entities', 'Entities', 'N'],
            ] as const
          ).map(([id, label, key]) => (
            <button key={id} role="radio" aria-checked={layer === id} style={seg(layer === id)} onClick={() => set({ paintLayer: id })}>
              {label}
              <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 6 }}>{key}</span>
            </button>
          ))}
        </div>
        {layer === 'tiles' && (
          <div style={{ ...segGroup, flex: 'none' }} role="radiogroup" aria-label="Paint tool">
            {TOOLS.map(([id, label, key]) => (
              <button
                key={id}
                role="radio"
                aria-checked={tool === id}
                title={`${label} (${key})`}
                style={{ ...seg(tool === id), padding: '0 8px' }}
                onClick={() => {
                  set({ paintTool: id });
                  if (id !== 'select') setSelRect(null);
                }}
              >
                {label}
                <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 4 }}>{key}</span>
              </button>
            ))}
          </div>
        )}
        {layer === 'tiles' && tool === 'brush' && (
          <div style={{ ...segGroup, flex: 'none' }} aria-label="Brush size">
            {[1, 2, 3, 5].map((n) => (
              <button key={n} style={{ ...seg(state.brush === n), padding: '0 7px' }} onClick={() => set({ brush: n })} title={`${n}×${n} brush`}>
                {n}
              </button>
            ))}
          </div>
        )}
        <select
          aria-label="Apply a template"
          value=""
          onChange={(e) => {
            const t = TEMPLATES.find((x) => x.id === e.target.value);
            if (!t) return;
            edit((st) => ({ rooms: st.rooms.map((r) => (r.id === room.id ? { ...r, tiles: encodeTiles(t.build(r)) } : r)) }));
            flash(`Applied the ${t.name} template. Undo to go back`);
          }}
          style={{ ...secondaryButton, flex: 'none' }}
        >
          <option value="">Template…</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id} title={t.desc}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="vw-btn-secondary"
          disabled={!painted}
          onClick={() => {
            edit((st) => ({
              rooms: st.rooms.map((r) => {
                if (r.id !== room.id) return r;
                const { tiles: _drop, ...rest } = r;
                return rest;
              }),
            }));
            flash(`Reset ${room.name} to generated tiles`);
          }}
          style={{ ...secondaryButton, flex: 'none', opacity: painted ? 1 : 0.5, cursor: painted ? 'pointer' : 'default' }}
        >
          Reset tiles
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ ...segGroup, flex: 'none' }} aria-label="Zoom">
          <button style={seg(false)} aria-label="Zoom out" onClick={() => zoomTo(s / 1.25)}>
            −
          </button>
          <span style={{ alignSelf: 'center', minWidth: 38, textAlign: 'center', font: `400 11px ${MONO}`, color: C.muted }}>{s}px</span>
          <button style={seg(false)} aria-label="Zoom in" onClick={() => zoomTo(s * 1.25)}>
            +
          </button>
          <button style={seg(state.paintZoom === null)} title="Fit the room (F)" onClick={() => set({ paintZoom: null })}>
            Fit
          </button>
        </div>
        <button className="vw-btn-secondary" title="Playtest from the tile under the cursor, or the floor (P)" onClick={() => playFrom(room.id)} style={{ ...secondaryButton, flex: 'none' }}>
          Play here <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 4 }}>P</span>
        </button>
        <button className="vw-btn-secondary" onClick={() => set({ editRoom: null, selEntity: null })} style={{ ...secondaryButton, flex: 'none' }}>
          Back to map <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 4 }}>Esc</span>
        </button>
      </div>
      <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 12px 0', justifyContent: 'center' }} role="radiogroup" aria-label={layer === 'tiles' ? 'Tile' : 'Entity'}>
        {layer === 'tiles'
          ? TILE_INFO.map((k) => (
              <Chip key={k.kind} on={state.paintTile === k.kind} color={k.color} label={k.label} hint={k.key ?? shiftKeyOf(k.kind)} onClick={() => set({ paintTile: k.kind })} />
            ))
          : [
              ...(Object.keys(ENTITY_SPECS) as EntityType[]).map((t) => (
                <Chip key={t} on={state.placing === t} color={ENTITY_SPECS[t].color} label={ENTITY_SPECS[t].label} onClick={() => set({ placing: t })} />
              )),
              ...nodesHere.map((n) => (
                <Chip key={n.id} on={state.placing === `node:${n.id}`} color={colorOf(n)} label={`Move ${n.label}`} onClick={() => set({ placing: `node:${n.id}` })} />
              )),
            ]}
      </div>
      <div style={{ flex: 'none', padding: '6px 12px 0', textAlign: 'center', font: `400 11.5px ${SANS}`, color: C.muted }}>{hint}</div>
      <div ref={view} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', padding: 24 }}>
        <div style={{ position: 'relative', margin: 'auto', flex: 'none', width: tw * s, height: th * s }}>
          <canvas ref={canvas} aria-hidden style={{ position: 'absolute', inset: 0, width: tw * s, height: th * s, border: `1px solid ${C.line}` }} />
          <canvas
            ref={overlay}
            aria-label={`${room.name} tiles`}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setHover(null)}
            style={{ position: 'absolute', inset: 0, width: tw * s, height: th * s, cursor: space.current ? 'grab' : 'crosshair', touchAction: 'none' }}
          />
        </div>
      </div>
    </>
  );
}

function Chip({ on, color, label, hint, onClick }: { on: boolean; color: string; label: string; hint?: string; onClick(): void }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 26,
        padding: '0 8px',
        borderRadius: 5,
        border: `1px solid ${on ? C.accent : C.line}`,
        background: on ? C.fieldHover : C.field,
        color: on ? C.text : C.textSoft,
        font: `500 11.5px ${SANS}`,
        cursor: 'pointer',
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color === '#000000' ? 'transparent' : color, border: `1px solid ${C.lineStrong}` }} />
      {label}
      {hint && <span style={{ font: `400 10px ${MONO}`, opacity: 0.6 }}>{hint}</span>}
    </button>
  );
}
