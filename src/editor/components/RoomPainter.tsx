import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { drawTiles } from '../../game/Game';
import { baseTiles, floorSpot } from '../../game/world';
import { encodeTiles, Tile, TILE_KINDS, type TileKind } from '../../model/tiles';
import { useEditor } from '../context';
import { C, MONO, SANS, secondaryButton, seg, segGroup } from '../ui';

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

/** Tile painter for one room: replaces the map while a room is open. */
export function RoomPainter() {
  const { state, roomById, world, palette, colorOf, set, edit, flash } = useEditor();
  const room = roomById[state.editRoom ?? '']!;
  const wr = world.find((r) => r.id === room.id)!;
  const base = useMemo(() => baseTiles(room), [room]);
  const { tw, th } = wr;

  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<[number, number] | null>(null);
  const stroke = useRef<{ id: number; kind: TileKind; last: [number, number] } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = Math.max(3, Math.min(28, Math.floor(Math.min((area.w - 48) / tw, (area.h - 48) / th))));

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

    // Where the room's start, pickups and boss appear in the playtest.
    const here = state.nodes.filter((n) => n.room === room.id && n.kind !== 'gate');
    if (here.length) {
      const sp = floorSpot(wr);
      const cx = (sp.x - wr.tx) * s;
      const cy = (sp.y - wr.ty) * s;
      here.forEach((n, i) => {
        const x = cx + (i - (here.length - 1) / 2) * s * 1.6;
        const y = cy - s * 1.2;
        const d = Math.max(4, s * 0.55);
        ctx.fillStyle = colorOf(n);
        ctx.beginPath();
        if (n.kind === 'key') {
          ctx.moveTo(x, y - d);
          ctx.lineTo(x + d, y);
          ctx.lineTo(x, y + d);
          ctx.lineTo(x - d, y);
        } else ctx.rect(x - d, y - d, d * 2, d * 2);
        ctx.fill();
      });
    }

    if (hover) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(hover[0] * s + 1, hover[1] * s + 1, s - 2, s - 2);
    }
  }, [wr, base, tw, th, s, palette, hover, state.nodes, room.id, colorOf]);

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

  const painted = room.tiles !== undefined;

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
        <div style={{ ...segGroup, flex: 'none' }} role="radiogroup" aria-label="Tile">
          {TILE_KINDS.map((k) => (
            <button
              key={k.kind}
              role="radio"
              aria-checked={state.paintTile === k.kind}
              style={seg(state.paintTile === k.kind)}
              onClick={() => set({ paintTile: k.kind })}
            >
              {k.label}
              <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 6 }}>{k.key}</span>
            </button>
          ))}
        </div>
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
          Reset to generated
        </button>
        <div style={{ flex: 1 }} />
        <button className="vw-btn-secondary" onClick={() => set({ editRoom: null })} style={{ ...secondaryButton, flex: 'none' }}>
          Back to map <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 4 }}>Esc</span>
        </button>
      </div>
      <div
        style={{
          flex: 'none',
          padding: '8px 12px 0',
          textAlign: 'center',
          font: `400 11.5px ${SANS}`,
          color: C.muted,
        }}
      >
        Drag to paint, right-drag to clear. Striped doorways are carved where rooms touch.
      </div>
      <div ref={box} style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <canvas
          ref={canvas}
          aria-label={`${room.name} tiles`}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            const c = cellAt(e);
            if (!c) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const kind = e.button === 2 ? Tile.Empty : state.paintTile;
            stroke.current = { id: ++strokes, kind, last: c };
            paint([c], kind, stroke.current.id);
          }}
          onPointerMove={(e) => {
            const c = cellAt(e);
            setHover(c);
            const st = stroke.current;
            if (!c || !st || (c[0] === st.last[0] && c[1] === st.last[1])) return;
            paint(line(st.last[0], st.last[1], c[0], c[1]), st.kind, st.id);
            st.last = c;
          }}
          onPointerUp={() => (stroke.current = null)}
          onPointerCancel={() => (stroke.current = null)}
          onPointerLeave={() => setHover(null)}
          style={{
            width: tw * s,
            height: th * s,
            border: `1px solid ${C.line}`,
            cursor: 'crosshair',
            touchAction: 'none',
          }}
        />
      </div>
    </>
  );
}
