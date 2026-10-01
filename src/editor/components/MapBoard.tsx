import { useEffect, useRef, type MouseEvent } from 'react';
import type { WorldRoom } from '../../game/world';
import { Tile, TILES_PER_CELL } from '../../model/tiles';
import { GRID_H, GRID_W } from '../../model/sampleProject';
import type { Room } from '../../model/types';
import { useEditor } from '../context';
import type { Tool } from '../state';
import { C, MONO, SANS, secondaryButton, seg, segGroup } from '../ui';
import { NodeChip } from './NodeChip';

/** Editor grid cell size in px. */
export const CELL = 24;

const TOOLS: [Tool, string, string][] = [
  ['select', 'Select', 'V'],
  ['draw', 'Draw room', 'B'],
  ['erase', 'Erase', 'E'],
];

const HINTS: Record<Tool, string> = {
  select: 'Double-click a room to paint its tiles. Drag keys and gates between rooms to move them',
  draw: 'Drag on the grid to add a room',
  erase: 'Click a room to delete it',
};

function cellAt(e: MouseEvent<HTMLDivElement>) {
  const b = e.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(GRID_W - 1, Math.floor((e.clientX - b.left) / CELL))),
    y: Math.max(0, Math.min(GRID_H - 1, Math.floor((e.clientY - b.top) / CELL))),
  };
}

/** Centre of the author view: tool strip and the room grid. */
export function MapBoard() {
  const { state, set, edit, flash, autoPlace } = useEditor();
  const drawing = state.tool === 'draw';
  const draft = state.draft;

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
    edit((s) => ({ rooms: [...s.rooms, room], draft: null, seq: s.seq + 1, selRoom: room.id }));
    flash(`Added ${room.name} (${room.w}×${room.h})`);
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
        <button
          className="vw-btn-secondary"
          onClick={autoPlace}
          style={{ ...secondaryButton, flex: 'none', whiteSpace: 'nowrap' }}
        >
          Auto-place keys
        </button>
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
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', padding: 28 }}>
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
            width: GRID_W * CELL,
            height: GRID_H * CELL,
            backgroundColor: '#15181d',
            backgroundImage: `linear-gradient(${C.field} 1px,transparent 1px),linear-gradient(90deg,${C.field} 1px,transparent 1px)`,
            backgroundSize: `${CELL}px ${CELL}px`,
            border: `1px solid ${C.line}`,
            cursor: drawing ? 'crosshair' : 'default',
            userSelect: 'none',
          }}
        >
          {state.rooms.map((r) => (
            <RoomTile key={r.id} room={r} />
          ))}
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

function RoomTile({ room: r }: { room: Room }) {
  const { state, analysis, world, hatchUnreachable, set, place, deleteRoom } = useEditor();
  const wr = world.find((w) => w.id === r.id);
  const corridor = r.w === 1 || r.h === 1;
  const selected = state.selRoom === r.id;
  const unreachable = hatchUnreachable && !analysis.reached.has(r.id);
  const nodes = state.showItems ? state.nodes.filter((n) => n.room === r.id) : [];

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
          boxShadow: selected ? '0 0 0 2px rgba(240,180,76,.3)' : 'none',
        }}
      />
      {wr && <RoomThumb room={wr} />}
      {r.w >= 3 && r.h >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: 5,
            left: 7,
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
      </div>
    </div>
  );
}

/** Faint picture of the room's actual tiles, so painted rooms read on the map. */
function RoomThumb({ room }: { room: WorldRoom }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = CELL / TILES_PER_CELL;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, room.tw * px, room.th * px);
    for (let y = 0; y < room.th; y++)
      for (let x = 0; x < room.tw; x++) {
        const t = room.g[y * room.tw + x];
        if (t === Tile.Empty) continue;
        ctx.fillStyle = t === Tile.Spikes ? 'rgba(255,107,107,.45)' : t === Tile.Platform ? 'rgba(223,226,231,.22)' : 'rgba(223,226,231,.1)';
        ctx.fillRect(x * px, y * px, px, t === Tile.Platform ? 1 : px);
      }
  }, [room, px]);
  return (
    <canvas
      ref={ref}
      width={room.tw * px}
      height={room.th * px}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 4 }}
    />
  );
}
