import { THEMES } from '../../game/audio';
import { DOOR_KINDS } from '../../model/entities';
import { PRESETS } from '../../model/sampleProject';
import type { Area, DoorKind } from '../../model/types';
import { useEditor } from '../context';
import { FlagField } from './Pickers';
import { sideLinks } from './MapBoard';
import { C, dangerButton, MONO, SANS, sectionLabel, secondaryButton, swatch, textInput, toggle } from '../ui';

const sidebar = {
  width: 264,
  flex: 'none',
  borderRight: `1px solid ${C.line}`,
  background: C.panel,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
} as const;

const smallInput = { ...textInput, height: 26, width: 54, font: `500 12px ${MONO}`, padding: '0 6px' };

/** Left panel on the map: map settings, areas, overlays, room list and room inspector. */
export function AuthorSidebar() {
  const { state, set, edit, check } = useEditor();
  return (
    <aside style={sidebar}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLabel}>Map</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `400 12px ${SANS}`, color: C.muted }}>
            Grid
            <input
              aria-label="Grid width"
              type="number"
              min={4}
              max={200}
              value={state.grid.w}
              onChange={(e) => {
                const w = Math.max(4, Math.min(200, Math.round(+e.target.value) || 4));
                edit((s) => ({ grid: { ...s.grid, w: Math.max(w, ...s.rooms.map((r) => r.x + r.w)) } }), 'grid');
              }}
              style={smallInput}
            />
            ×
            <input
              aria-label="Grid height"
              type="number"
              min={4}
              max={200}
              value={state.grid.h}
              onChange={(e) => {
                const h = Math.max(4, Math.min(200, Math.round(+e.target.value) || 4));
                edit((s) => ({ grid: { ...s.grid, h: Math.max(h, ...s.rooms.map((r) => r.y + r.h)) } }), 'grid');
              }}
              style={smallInput}
            />
            cells
          </div>
          <AreaList />
        </div>

        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLabel}>Overlays</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={toggle(state.showItems)} onClick={() => set((s) => ({ showItems: !s.showItems }))}>
              Items
            </button>
            <button style={toggle(state.showRoute)} onClick={() => set((s) => ({ showRoute: !s.showRoute }))}>
              Route
            </button>
            <button style={toggle(state.showReach)} onClick={() => set((s) => ({ showReach: !s.showReach }))} title="Tint every tile the player can reach">
              Reach
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 14px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={sectionLabel}>Rooms</div>
          <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>{state.rooms.length}</div>
        </div>
        <div style={{ padding: '0 8px 8px' }}>
          {state.rooms.map((r) => (
            <div
              key={r.id}
              onClick={() => set({ selRoom: r.id })}
              onDoubleClick={() => set({ selRoom: r.id, editRoom: r.id })}
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
                title={check.reached.has(r.id) ? 'Reachable' : "Can't be entered"}
                style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: check.reached.has(r.id) ? C.ok : C.bad }}
              />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span style={{ font: `400 10.5px ${MONO}`, color: C.dim }}>
                {r.w}×{r.h}
              </span>
            </div>
          ))}
        </div>
      </div>

      <RoomInspector />
    </aside>
  );
}

const THEME_IDS = Object.keys(THEMES).filter((t) => t !== 'boss' && t !== 'escape');

/** Areas: regions with their own map colour, palette and music. */
function AreaList() {
  const { state, edit } = useEditor();
  const setArea = (id: string, patch: Partial<Area>, merge?: string) =>
    edit((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), merge);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {state.areas.map((a) => (
        <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 22px', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            aria-label={`${a.name} colour`}
            value={a.color}
            onChange={(e) => setArea(a.id, { color: e.target.value }, `area-color:${a.id}`)}
            style={{ width: 22, height: 22, padding: 0, border: 0, background: 'none' }}
          />
          <input value={a.name} aria-label="Area name" onChange={(e) => setArea(a.id, { name: e.target.value }, `area-name:${a.id}`)} style={{ ...textInput, height: 26 }} />
          <button
            aria-label={`Delete ${a.name}`}
            disabled={state.areas.length < 2}
            onClick={() =>
              edit((s) => ({
                areas: s.areas.filter((x) => x.id !== a.id),
                rooms: s.rooms.map((r) => (r.area === a.id ? { ...r, area: undefined } : r)),
              }))
            }
            style={{ border: 0, background: 'none', color: state.areas.length < 2 ? C.faint : C.muted, cursor: 'pointer' }}
          >
            ×
          </button>
          <span />
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 6px', alignItems: 'center', font: `400 11px ${SANS}`, color: C.dim }}>
            Palette
            <select aria-label="Palette" value={a.style ?? ''} onChange={(e) => setArea(a.id, { style: e.target.value || undefined })} style={{ ...textInput, height: 24, minWidth: 0, font: `400 11px ${SANS}` }}>
              <option value="">Project style</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            Music
            <select aria-label="Music" value={a.music ?? ''} onChange={(e) => setArea(a.id, { music: e.target.value || undefined })} style={{ ...textInput, height: 24, minWidth: 0, font: `400 11px ${SANS}` }}>
              <option value="">Surface</option>
              {THEME_IDS.map((t) => (
                <option key={t} value={t}>
                  {THEMES[t].name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <button
        className="vw-btn-secondary"
        style={{ ...secondaryButton, height: 26 }}
        onClick={() =>
          edit((s) => ({
            areas: [...s.areas, { id: `a${s.seq}`, name: `Area ${s.areas.length + 1}`, color: AREA_COLORS[s.areas.length % AREA_COLORS.length] }],
            seq: s.seq + 1,
          }))
        }
      >
        + Area
      </button>
    </div>
  );
}

const AREA_COLORS = ['#a597c4', '#5ec4e8', '#e0584f', '#4fbf6a', '#e8c94a', '#c27ee8', '#ff9a5c'];

function RoomInspector() {
  const { state, roomById, colorOf, set, edit, place, unplace, deleteRoom, playFrom } = useEditor();
  const room = state.selRoom ? roomById[state.selRoom] : undefined;
  if (!room) return null;
  const links = sideLinks(state.rooms).filter((l) => l.a.id === room.id || l.b.id === room.id);
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
        aria-label="Room name"
        onChange={(e) => {
          const name = e.target.value;
          edit((s) => ({ rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, name } : r)) }), `name:${room.id}`);
        }}
        style={textInput}
      />
      <select
        aria-label="Area"
        value={room.area ?? state.areas[0]?.id ?? ''}
        onChange={(e) => {
          const area = e.target.value;
          edit((s) => ({ rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, area } : r)) }));
        }}
        style={{ ...textInput, height: 28 }}
      >
        {state.areas.map((a) => (
          <option key={a.id} value={a.id}>
            Area: {a.name}
          </option>
        ))}
      </select>
      {links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {links.map((l) => {
            const other = l.a.id === room.id ? l.b : l.a;
            const spec = state.doors[l.key];
            return (
              <div key={l.key} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0, font: `400 11.5px ${SANS}`, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ↔ {other.name}
                </span>
                <select
                  aria-label={`Hatch to ${other.name}`}
                  value={spec?.kind ?? 'open'}
                  onChange={(e) => {
                    const kind = e.target.value as DoorKind;
                    edit((s) => {
                      const doors = { ...s.doors };
                      if (kind === 'open') delete doors[l.key];
                      else doors[l.key] = { kind, ...(kind === 'grey' ? { flag: s.doors[l.key]?.flag ?? 'boss1' } : {}) };
                      return { doors };
                    });
                  }}
                  style={{ ...textInput, height: 24, width: 116, font: `400 11px ${SANS}`, padding: '0 4px' }}
                >
                  {DOOR_KINDS.map((d) => (
                    <option key={d.kind} value={d.kind}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {spec?.kind === 'grey' && (
                  <FlagField
                    label="Opens on flag"
                    value={spec.flag ?? ''}
                    onChange={(flag) => edit((s) => ({ doors: { ...s.doors, [l.key]: { kind: 'grey', flag } } }), `flag:${l.key}`)}
                    style={{ height: 24, width: 70, font: `400 11px ${MONO}`, padding: '0 4px' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
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
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="vw-btn-secondary" style={{ ...secondaryButton, flex: 1 }} onClick={() => set({ editRoom: room.id })}>
          {room.tiles ? 'Edit tiles' : 'Paint tiles'}
        </button>
        <button className="vw-btn-secondary" style={{ ...secondaryButton, flex: 1 }} title="Playtest starting in this room (P)" onClick={() => playFrom(room.id)}>
          Play from here
        </button>
      </div>
      <button style={dangerButton} onClick={() => deleteRoom(room.id)}>
        Delete room
      </button>
    </div>
  );
}
