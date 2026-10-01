import { useEffect, useMemo, useRef, type MouseEvent, type WheelEvent } from 'react';
import { DOOR_KINDS, doorInfo, linkKey } from '../../model/entities';
import { adj } from '../../model/graph';
import { Tile, TILES_PER_CELL } from '../../model/tiles';
import type { DoorKind, Room } from '../../model/types';
import type { WorldRoom } from '../../model/world';
import { useEditor } from '../context';
import type { Tool } from '../state';
import { C, MONO, SANS, secondaryButton, seg, segGroup } from '../ui';
import { NodeChip } from './NodeChip';

export const ZOOMS = [12, 16, 20, 24, 32, 40, 48];

const TOOLS: [Tool, string, string][] = [
  ['select', 'Select', 'V'],
  ['draw', 'Draw room', 'B'],
  ['erase', 'Erase', 'E'],
];

const HINTS: Record<Tool, string> = {
  select: 'Double-click a room to paint it. Click a doorway marker to cycle its hatch. Ctrl+scroll zooms',
  draw: 'Drag on the grid to add a room',
  erase: 'Click a room to delete it',
};

/** Side doorways between touching rooms, where hatches go. */
export function sideLinks(rooms: Room[]) {
  const out: { a: Room; b: Room; key: string; x: number; y: number }[] = [];
  rooms.forEach((a, i) =>
    rooms.slice(i + 1).forEach((b) => {
      const j = adj(a, b);
      if (j?.v) out.push({ a, b, key: linkKey(a.id, b.id), x: j.at, y: j.hi });
    }),
  );
  return out;
}

/** Centre of the author view: tool strip and the room grid. */
export function MapBoard() {
  const { state, set, edit, flash, autoPlace } = useEditor();
  const CELL = state.zoom;
  const { w: GW, h: GH } = state.grid;
  const drawing = state.tool === 'draw';
  const draft = state.draft;
  const links = useMemo(() => sideLinks(state.rooms), [state.rooms]);

  const cellAt = (e: MouseEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(GW - 1, Math.floor((e.clientX - b.left) / CELL))),
      y: Math.max(0, Math.min(GH - 1, Math.floor((e.clientY - b.top) / CELL))),
    };
  };

  const zoomBy = (d: number) => {
    const i = ZOOMS.indexOf(CELL);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 3 : i) + d))];
    set({ zoom: next });
  };

  const finishDraft = () => {
    if (!draft) return;
    const seq = state.seq;
    const room: Room = {
      id: `R${seq}`,
      name: `Room ${seq}`,
      x: Math.min(draft.x0, draft.x1),
      y: Math.min(draft.y0, draft.y1),
      w: Math.abs(draft.x1 - draft.x0) + 1,
      h: Math.abs(draft.y1 - draft.y0) + 1,
    };
    const overlaps = state.rooms.some(
      (r) => room.x < r.x + r.w && r.x < room.x + room.w && room.y < r.y + r.h && r.y < room.y + room.h,
    );
    if (overlaps) {
      set({ draft: null });
      flash('Overlaps an existing room');
      return;
    }
    const sel = state.rooms.find((r) => r.id === state.selRoom);
    if (sel?.area) room.area = sel.area;
    edit((s) => ({ rooms: [...s.rooms, room], draft: null, seq: s.seq + 1, selRoom: room.id }));
    flash(`Added ${room.name} (${room.w}×${room.h})`);
  };

  const cycleDoor = (key: string, back: boolean) => {
    const order = DOOR_KINDS.map((d) => d.kind);
    const cur = state.doors[key]?.kind ?? 'open';
    const next = order[(order.indexOf(cur) + (back ? order.length - 1 : 1)) % order.length] as DoorKind;
    edit((s) => {
      const doors = { ...s.doors };
      if (next === 'open') delete doors[key];
      else doors[key] = { kind: next, ...(next === 'grey' ? { flag: s.doors[key]?.flag ?? 'boss1' } : {}) };
      return { doors };
    });
    flash(doorInfo(next).label);
  };

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
        <div style={{ ...segGroup, flex: 'none' }}>
          {TOOLS.map(([id, label, key]) => (
            <button key={id} style={seg(state.tool === id)} onClick={() => set({ tool: id })}>
              {label}
              <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 6 }}>{key}</span>
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: C.line }} />
        <button className="vw-btn-secondary" onClick={autoPlace} style={{ ...secondaryButton, flex: 'none', whiteSpace: 'nowrap' }}>
          Auto-place keys
        </button>
        <div style={{ ...segGroup, flex: 'none' }} aria-label="Zoom">
          <button style={seg(false)} aria-label="Zoom out" onClick={() => zoomBy(-1)}>
            −
          </button>
          <span style={{ alignSelf: 'center', minWidth: 38, textAlign: 'center', font: `400 11px ${MONO}`, color: C.muted }}>
            {Math.round((CELL / 24) * 100)}%
          </span>
          <button style={seg(false)} aria-label="Zoom in" onClick={() => zoomBy(1)}>
            +
          </button>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            font: `400 11.5px ${SANS}`,
            color: C.muted,
          }}
        >
          {HINTS[state.tool]}
        </div>
      </div>
      <div
        style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', padding: 28 }}
        onWheel={(e: WheelEvent) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1 : -1);
        }}
      >
        <div
          onMouseDown={(e) => {
            if (!drawing) return;
            const c = cellAt(e);
            set({ draft: { x0: c.x, y0: c.y, x1: c.x, y1: c.y } });
          }}
          onMouseMove={(e) => {
            if (!draft) return;
            const c = cellAt(e);
            if (c.x !== draft.x1 || c.y !== draft.y1) set({ draft: { ...draft, x1: c.x, y1: c.y } });
          }}
          onMouseUp={finishDraft}
          onClick={() => {
            if (state.tool === 'select' && state.selRoom) set({ selRoom: null });
          }}
          style={{
            position: 'relative',
            flex: 'none',
            margin: 'auto',
            width: GW * CELL,
            height: GH * CELL,
            backgroundColor: '#15181d',
            backgroundImage: `linear-gradient(${C.field} 1px,transparent 1px),linear-gradient(90deg,${C.field} 1px,transparent 1px)`,
            backgroundSize: `${CELL}px ${CELL}px`,
            border: `1px solid ${C.line}`,
            cursor: drawing ? 'crosshair' : 'default',
            userSelect: 'none',
          }}
        >
          {state.rooms.map((r) => (
            <RoomTile key={r.id} room={r} cell={CELL} />
          ))}
          {state.tool === 'select' &&
            links.map((l) => {
              const spec = state.doors[l.key];
              const info = doorInfo(spec?.kind ?? 'open');
              return (
                <button
                  key={l.key}
                  title={`${l.a.name} ↔ ${l.b.name}: ${info.label}${spec?.flag ? ` (flag ${spec.flag})` : ''}. Click to change`}
                  aria-label={`Doorway ${l.a.name} to ${l.b.name}: ${info.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleDoor(l.key, e.shiftKey);
                  }}
                  style={{
                    position: 'absolute',
                    left: l.x * CELL - 4,
                    top: l.y * CELL - CELL * 0.5 - 5,
                    width: 8,
                    height: 10,
                    padding: 0,
                    borderRadius: 2,
                    border: `1px solid ${spec ? info.color : C.faint}`,
                    background: spec ? info.color : C.bg,
                    cursor: 'pointer',
                  }}
                />
              );
            })}
          {draft && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(draft.x0, draft.x1) * CELL,
                top: Math.min(draft.y0, draft.y1) * CELL,
                width: (Math.abs(draft.x1 - draft.x0) + 1) * CELL,
                height: (Math.abs(draft.y1 - draft.y0) + 1) * CELL,
                border: `1.5px dashed ${C.accent}`,
                background: 'rgba(240,180,76,.1)',
                borderRadius: 3,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

function RoomTile({ room: r, cell: CELL }: { room: Room; cell: number }) {
  const { state, check, world, hatchUnreachable, set, place, deleteRoom } = useEditor();
  const wr = world.find((w) => w.id === r.id);
  const corridor = r.w === 1 || r.h === 1;
  const selected = state.selRoom === r.id;
  const unreachable = hatchUnreachable && !check.busy && !check.reached.has(r.id);
  const nodes = state.showItems ? state.nodes.filter((n) => n.room === r.id) : [];
  const area = state.areas.find((a) => a.id === r.area) ?? state.areas[0];
  const ents = state.showItems ? (r.entities ?? []) : [];

  return (
    <div
      title={r.name}
      onClick={(e) => {
        e.stopPropagation();
        if (state.tool === 'erase') deleteRoom(r.id);
        else set({ selRoom: r.id });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (state.tool === 'select') set({ selRoom: r.id, editRoom: r.id });
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) place(id, r.id);
      }}
      style={{
        position: 'absolute',
        left: r.x * CELL,
        top: r.y * CELL,
        width: r.w * CELL,
        height: r.h * CELL,
        pointerEvents: state.tool === 'draw' ? 'none' : 'auto',
        cursor: state.tool === 'erase' ? 'not-allowed' : 'pointer',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: corridor ? 2 : 4,
          background: unreachable
            ? 'repeating-linear-gradient(135deg,rgba(255,107,107,.16) 0 5px,rgba(255,107,107,.04) 5px 10px),#22262d'
            : corridor
              ? '#272c34'
              : '#2e343d',
          border: `1px solid ${selected ? C.accent : unreachable ? 'rgba(255,107,107,.5)' : '#464d59'}`,
          boxShadow: selected ? '0 0 0 2px rgba(240,180,76,.3)' : `inset 3px 0 0 ${area?.color ?? 'transparent'}`,
        }}
      />
      {wr && <RoomThumb room={wr} cell={CELL} />}
      {r.w >= 3 && r.h >= 2 && CELL >= 16 && (
        <div
          style={{
            position: 'absolute',
            top: 5,
            left: 8,
            right: 6,
            font: `500 11px ${SANS}`,
            color: C.textSoft,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
          }}
        >
          {r.name}
        </div>
      )}
      <div style={{ position: 'absolute', left: 3, right: 3, bottom: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {nodes.map((n) => (
          <NodeChip key={n.id} node={n} />
        ))}
        {ents
          .filter((e) => e.type === 'save' || e.type === 'boss' || e.type === 'recharge' || e.type === 'map' || e.type === 'exit')
          .map((e) => (
            <span
              key={e.id}
              title={e.type}
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                display: 'grid',
                placeItems: 'center',
                background: e.type === 'boss' ? '#ff8a5c' : e.type === 'save' ? '#4fd1a5' : e.type === 'recharge' ? '#ff6fae' : e.type === 'exit' ? '#4fd1a5' : '#7aa2ff',
                color: C.bg,
                font: `700 8.5px ${MONO}`,
                pointerEvents: 'none',
              }}
            >
              {e.type === 'boss' ? 'B' : e.type === 'save' ? 'S' : e.type === 'recharge' ? 'R' : e.type === 'exit' ? 'X' : 'M'}
            </span>
          ))}
      </div>
    </div>
  );
}

/** Faint picture of the room's tiles; with the reach overlay, tiles the player can reach are tinted. */
function RoomThumb({ room, cell }: { room: WorldRoom; cell: number }) {
  const { state, check } = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  const px = Math.max(1, Math.round(cell / TILES_PER_CELL));
  const res = state.showReach ? check.solved?.result : undefined;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, room.tw * px, room.th * px);
    for (let y = 0; y < room.th; y++)
      for (let x = 0; x < room.tw; x++) {
        const t = room.g[y * room.tw + x];
        if (res) {
          const wx = room.tx + x;
          const wy = room.ty + y;
          if (wx < res.W && wy < res.H && res.covered[wy * res.W + wx]) {
            ctx.fillStyle = 'rgba(79,209,165,.35)';
            ctx.fillRect(x * px, y * px, px, px);
          }
        }
        if (t === Tile.Empty) continue;
        ctx.fillStyle =
          t === Tile.Spikes || t === Tile.Lava
            ? 'rgba(255,107,107,.45)'
            : t === Tile.Water
              ? 'rgba(63,134,214,.4)'
              : t === Tile.Platform
                ? 'rgba(223,226,231,.22)'
                : t >= Tile.ShotBlock
                  ? 'rgba(240,180,76,.3)'
                  : 'rgba(223,226,231,.1)';
        ctx.fillRect(x * px, y * px, px, t === Tile.Platform ? 1 : px);
      }
  }, [room, px, res]);
  return (
    <canvas
      ref={ref}
      width={room.tw * px}
      height={room.th * px}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 4 }}
    />
  );
}
