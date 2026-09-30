import { useEditor } from '../context';
import type { Source } from '../state';
import { C, dangerButton, MONO, SANS, sectionLabel, secondaryButton, seg, segGroup, swatch, textInput, toggle } from '../ui';

const SOURCES: [Source, string][] = [
  ['image', 'Image'],
  ['tiled', 'Tiled / LDtk'],
  ['draw', 'Draw'],
];

const sidebar = {
  width: 264,
  flex: 'none',
  borderRight: `1px solid ${C.line}`,
  background: C.panel,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
} as const;

/** Left panel while authoring: map source, overlays, room list and room inspector. */
export function AuthorSidebar() {
  const { state, set, flash, analysis } = useEditor();
  return (
    <aside style={sidebar}>
      <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={sectionLabel}>Raw map</div>
        <div style={segGroup}>
          {SOURCES.map(([id, label]) => (
            <button
              key={id}
              style={seg(state.source === id)}
              onClick={() => set((s) => ({ source: id, tool: id === 'draw' ? 'draw' : s.tool }))}
            >
              {label}
            </button>
          ))}
        </div>
        {state.source === 'image' && (
          <>
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: 8,
                border: `1px solid ${C.line}`,
                borderRadius: 6,
                background: C.field,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 3,
                  background: C.bg,
                  border: `1px solid ${C.lineStrong}`,
                  backgroundImage: `linear-gradient(${C.text},${C.text}),linear-gradient(${C.text},${C.text}),linear-gradient(${C.text},${C.text})`,
                  backgroundSize: '22px 2px,2px 12px,16px 2px',
                  backgroundPosition: '6px 16px,27px 5px,27px 5px',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    font: `500 12px ${SANS}`,
                    color: C.text,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  corridors_sketch.png
                </div>
                <div style={{ font: `400 11px ${MONO}`, color: C.muted }}>1024×576 → 32×18 cells</div>
              </div>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: `400 11.5px ${SANS}`, color: C.muted }}>
              Trace threshold
              <input
                type="range"
                min={0}
                max={100}
                value={state.threshold}
                onChange={(e) => set({ threshold: +e.target.value })}
                style={{ accentColor: C.accent, width: '100%' }}
              />
            </label>
            <button
              className="vw-btn-secondary"
              style={{ ...secondaryButton, padding: 0 }}
              onClick={() => flash(`Traced ${state.rooms.length} regions at threshold ${state.threshold}`)}
            >
              Re-trace regions
            </button>
          </>
        )}
        {state.source === 'tiled' && (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: 8,
                border: `1px solid ${C.line}`,
                borderRadius: 6,
                background: C.field,
              }}
            >
              <div style={{ font: `500 12px ${SANS}`, color: C.text }}>hollow_depths.ldtk</div>
              <div style={{ font: `400 11px ${MONO}`, color: C.muted }}>Layer: Corridors · 16px grid</div>
            </div>
            <div style={{ font: `400 11.5px/1.45 ${SANS}`, color: C.muted }}>
              Tiled (.tmx/.tmj) and LDtk layers import as-is. Non-empty tiles become corridor cells.
            </div>
          </>
        )}
        {state.source === 'draw' && (
          <div style={{ font: `400 12px/1.5 ${SANS}`, color: C.muted }}>
            Press <span style={{ fontFamily: MONO, color: C.text }}>B</span> and drag on the grid to add a room. Rooms
            that share an edge get a doorway.
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={sectionLabel}>Overlays</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={toggle(state.showItems)} onClick={() => set((s) => ({ showItems: !s.showItems }))}>
            Items
          </button>
          <button style={toggle(state.showRoute)} onClick={() => set((s) => ({ showRoute: !s.showRoute }))}>
            Route order
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 14px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={sectionLabel}>Rooms</div>
        <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>{state.rooms.length}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 8px 8px' }}>
        {state.rooms.map((r) => (
          <div
            key={r.id}
            onClick={() => set({ selRoom: r.id })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 28,
              padding: '0 8px',
              borderRadius: 4,
              cursor: 'pointer',
              background: state.selRoom === r.id ? C.fieldHover : 'transparent',
              font: `400 12.5px ${SANS}`,
              color: C.text,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flex: 'none',
                background: analysis.reached.has(r.id) ? C.ok : C.bad,
              }}
            />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.name}
            </span>
            <span style={{ font: `400 10.5px ${MONO}`, color: C.dim }}>
              {r.w}×{r.h}
            </span>
          </div>
        ))}
      </div>

      <RoomInspector />
    </aside>
  );
}

function RoomInspector() {
  const { state, roomById, colorOf, edit, place, unplace, deleteRoom } = useEditor();
  const room = state.selRoom ? roomById[state.selRoom] : undefined;
  if (!room) return null;
  const corridor = room.w === 1 || room.h === 1;
  const items = state.nodes.filter((n) => n.room === room.id);
  return (
    <div
      style={{
        borderTop: `1px solid ${C.line}`,
        padding: '12px 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: C.panelDeep,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={sectionLabel}>Inspector</div>
        <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>
          {room.w}×{room.h} · {corridor ? 'corridor' : 'room'}
        </div>
      </div>
      <input
        value={room.name}
        onChange={(e) => {
          const name = e.target.value;
          edit((s) => ({ rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, name } : r)) }));
        }}
        style={textInput}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((n) => (
          <div
            key={n.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 26,
              padding: '0 6px',
              borderRadius: 4,
              background: '#22262d',
              font: `400 12px ${SANS}`,
              color: C.text,
            }}
          >
            <span style={swatch(n, colorOf(n))} />
            <span style={{ flex: 1 }}>{n.label}</span>
            <button
              className="vw-remove"
              aria-label={`Remove ${n.label} from ${room.name}`}
              onClick={() => unplace(n.id)}
              style={{ border: 0, background: 'none', color: C.muted, cursor: 'pointer', font: `400 12px ${MONO}` }}
            >
              ×
            </button>
          </div>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && place(e.target.value, room.id)}
          style={{
            height: 28,
            borderRadius: 5,
            border: `1px solid ${C.lineStrong}`,
            background: C.bg,
            color: C.muted,
            font: `400 12px ${SANS}`,
            padding: '0 6px',
          }}
        >
          <option value="">Override: assign key / gate…</option>
          {state.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
              {n.room && roomById[n.room] ? ` (in ${roomById[n.room].name})` : ''}
            </option>
          ))}
        </select>
      </div>
      <button style={dangerButton} onClick={() => deleteRoom(room.id)}>
        Delete room
      </button>
    </div>
  );
}
