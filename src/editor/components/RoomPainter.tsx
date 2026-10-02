import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { drawTiles } from '../../game/render';
import { doorInfo, ENTITY_SPECS, newEntity } from '../../model/entities';
import { isKey } from '../../model/graph';
import { TEMPLATES } from '../../model/templates';
import { encodeTiles, Tile, TILE_INFO, type TileKind } from '../../model/tiles';
import type { Entity, EntityType } from '../../model/types';
import { baseTiles, DOOR_H, floorSpot } from '../../model/world';
import { useEditor } from '../context';
import { C, MONO, SANS, secondaryButton, seg, segGroup } from '../ui';
import { EntityInspector } from './EntityInspector';

/** Cells from (x0, y0) to (x1, y1) inclusive, so a fast drag leaves no gaps. */
function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n ? i / n : 0;
    out.push([Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)]);
  }
  return out;
}

let strokes = 0;

/** Footprint of an entity in tiles. */
export function entitySize(e: Entity): { w: number; h: number } {
  if (e.type === 'trigger') return { w: Number(e.props.w) || 2, h: Number(e.props.h) || 3 };
  const s = ENTITY_SPECS[e.type];
  return { w: s.w, h: s.h };
}

const ENTITY_TYPES = Object.keys(ENTITY_SPECS) as EntityType[];

/** Tile painter for one room: replaces the map while a room is open. Paints tiles, or places entities. */
export function RoomPainter() {
  const { state, roomById, world, palette, colorOf, set, edit, flash } = useEditor();
  const room = roomById[state.editRoom ?? '']!;
  const wr = world.find((r) => r.id === room.id)!;
  const base = useMemo(() => baseTiles(room), [room]);
  const { tw, th } = wr;
  const layer = state.paintLayer;
  const entities = room.entities ?? [];
  const nodesHere = state.nodes.filter((n) => n.room === room.id && (n.kind === 'start' || isKey(n)));

  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<[number, number] | null>(null);
  const stroke = useRef<{ id: number; kind: TileKind; last: [number, number] } | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; merge: string } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = Math.max(3, Math.min(28, Math.floor(Math.min((area.w - 48) / tw, (area.h - 48) / th))));

  const nodePos = (n: (typeof nodesHere)[number]) => {
    if (n.pos) return n.pos;
    const f = floorSpot(wr);
    return { x: Math.floor(f.x - wr.tx), y: f.y - wr.ty - 1 };
  };

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = tw * s * dpr;
    c.height = th * s * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, tw * s, th * s);
    drawTiles(ctx, wr.g, tw, palette, s, 0, 0);

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

    // Entities, dimmed while painting tiles.
    ctx.globalAlpha = layer === 'tiles' ? 0.55 : 1;
    entities.forEach((e) => {
      const { w, h } = entitySize(e);
      const spec = ENTITY_SPECS[e.type];
      const sel = state.selEntity === e.id;
      ctx.fillStyle = spec.color + (e.type === 'trigger' ? '33' : '66');
      ctx.fillRect(e.x * s, e.y * s, w * s, h * s);
      ctx.strokeStyle = sel ? C.accent : spec.color;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(e.x * s + 0.5, e.y * s + 0.5, w * s - 1, h * s - 1);
      if (s >= 10) {
        ctx.fillStyle = '#fff';
        ctx.font = `600 ${Math.max(9, Math.round(s * 0.55))}px ${MONO}`;
        const tag = e.type === 'enemy' ? String(e.props.archetype ?? 'enemy') : e.type === 'boss' ? String(e.props.name ?? 'boss') : e.type === 'pickup' ? String(e.props.kind) : spec.label.split(' ')[0];
        ctx.fillText(tag.slice(0, Math.max(3, w * 3)), e.x * s + 2, e.y * s + Math.min(h * s - 3, s * 0.8));
      }
    });
    // Start and key items.
    nodesHere.forEach((n) => {
      const p = nodePos(n);
      const x = (p.x + 0.5) * s;
      const y = (p.y + 0.5) * s;
      const d = Math.max(4, s * 0.45);
      ctx.fillStyle = colorOf(n);
      ctx.beginPath();
      if (n.kind === 'key') {
        ctx.moveTo(x, y - d);
        ctx.lineTo(x + d, y);
        ctx.lineTo(x, y + d);
        ctx.lineTo(x - d, y);
      } else ctx.rect(x - d, y - d * 2, d * 2, d * 3);
      ctx.fill();
      if (state.placing === `node:${n.id}`) {
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - d - 3, y - d * 2 - 3, d * 2 + 6, d * 3 + 6);
      }
    });
    ctx.globalAlpha = 1;

    if (hover) {
      let w = 1;
      let h = 1;
      if (layer === 'entities' && !state.placing.startsWith('node:')) ({ w, h } = entitySize(newEntity(state.placing as EntityType, '', 0, 0)));
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(hover[0] * s + 1, hover[1] * s + 1, w * s - 2, h * s - 2);
    }
  }, [wr, base, tw, th, s, palette, hover, entities, nodesHere, colorOf, layer, state.selEntity, state.placing]);

  const cellAt = (e: PointerEvent<HTMLCanvasElement>): [number, number] | null => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - b.left) / s);
    const y = Math.floor((e.clientY - b.top) / s);
    return x >= 0 && y >= 0 && x < tw && y < th ? [x, y] : null;
  };

  const paint = (cells: [number, number][], kind: TileKind, id: number) =>
    edit((st) => {
      const r = st.rooms.find((x) => x.id === room.id);
      if (!r) return {};
      const g = baseTiles(r);
      let changed = false;
      cells.forEach(([x, y]) => {
        if (g[y * tw + x] !== kind) {
          g[y * tw + x] = kind;
          changed = true;
        }
      });
      if (!changed) return {};
      return { rooms: st.rooms.map((x) => (x.id === r.id ? { ...x, tiles: encodeTiles(g) } : x)) };
    }, `paint:${id}`);

  const setEntities = (fn: (list: Entity[]) => Entity[], merge?: string) =>
    edit((st) => ({ rooms: st.rooms.map((r) => (r.id === room.id ? { ...r, entities: fn(r.entities ?? []) } : r)) }), merge);

  const entityAt = (x: number, y: number) =>
    [...entities].reverse().find((e) => {
      const { w, h } = entitySize(e);
      return x >= e.x && x < e.x + w && y >= e.y && y < e.y + h;
    });

  const onEntityDown = (c: [number, number], button: number) => {
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

  const painted = room.tiles !== undefined;
  const selected = entities.find((e) => e.id === state.selEntity);

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
        <button className="vw-btn-secondary" onClick={() => set({ editRoom: null, selEntity: null })} style={{ ...secondaryButton, flex: 'none' }}>
          Back to map <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 4 }}>Esc</span>
        </button>
      </div>
      <div style={{ flex: 'none', display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 12px 0', justifyContent: 'center' }} role="radiogroup" aria-label={layer === 'tiles' ? 'Tile' : 'Entity'}>
        {layer === 'tiles'
          ? TILE_INFO.map((k) => (
              <Chip key={k.kind} on={state.paintTile === k.kind} color={k.color} label={k.label} hint={k.key} onClick={() => set({ paintTile: k.kind })} />
            ))
          : [
              ...ENTITY_TYPES.map((t) => (
                <Chip key={t} on={state.placing === t} color={ENTITY_SPECS[t].color} label={ENTITY_SPECS[t].label} onClick={() => set({ placing: t })} />
              )),
              ...nodesHere.map((n) => (
                <Chip
                  key={n.id}
                  on={state.placing === `node:${n.id}`}
                  color={colorOf(n)}
                  label={`Move ${n.label}`}
                  onClick={() => set({ placing: `node:${n.id}` })}
                />
              )),
            ]}
      </div>
      <div style={{ flex: 'none', padding: '6px 12px 0', textAlign: 'center', font: `400 11.5px ${SANS}`, color: C.muted }}>
        {layer === 'tiles'
          ? 'Drag to paint, right-drag to clear. Striped doorways are carved where rooms touch.'
          : state.placing.startsWith('node:')
            ? 'Click a tile to put the item there.'
            : 'Click to place, drag to move, right-click or Delete to remove.'}
      </div>
      <div ref={box} style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative' }}>
        <canvas
          ref={canvas}
          aria-label={`${room.name} tiles`}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            const c = cellAt(e);
            if (!c) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            if (layer === 'entities') {
              onEntityDown(c, e.button);
              return;
            }
            const kind = e.button === 2 ? Tile.Empty : state.paintTile;
            stroke.current = { id: ++strokes, kind, last: c };
            paint([c], kind, stroke.current.id);
          }}
          onPointerMove={(e) => {
            const c = cellAt(e);
            setHover(c);
            const d = drag.current;
            if (d && c) {
              const nx = Math.max(0, c[0] - d.dx);
              const ny = Math.max(0, c[1] - d.dy);
              setEntities((l) => l.map((x) => (x.id === d.id && (x.x !== nx || x.y !== ny) ? { ...x, x: nx, y: ny } : x)), d.merge);
              return;
            }
            const st = stroke.current;
            if (!c || !st || (c[0] === st.last[0] && c[1] === st.last[1])) return;
            paint(line(st.last[0], st.last[1], c[0], c[1]), st.kind, st.id);
            st.last = c;
          }}
          onPointerUp={() => {
            stroke.current = null;
            drag.current = null;
          }}
          onPointerCancel={() => {
            stroke.current = null;
            drag.current = null;
          }}
          onPointerLeave={() => setHover(null)}
          style={{
            width: tw * s,
            height: th * s,
            border: `1px solid ${C.line}`,
            cursor: 'crosshair',
            touchAction: 'none',
          }}
        />
        {layer === 'entities' && selected && (
          <EntityInspector
            entity={selected}
            onChange={(e, merge) => setEntities((l) => l.map((x) => (x.id === e.id ? e : x)), merge)}
            onDelete={() => {
              setEntities((l) => l.filter((x) => x.id !== selected.id));
              set({ selEntity: null });
            }}
            onClose={() => set({ selEntity: null })}
          />
        )}
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
