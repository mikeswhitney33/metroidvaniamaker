import { ENTITY_SPECS, prop } from '../../model/entities';
import { isKey } from '../../model/graph';
import type { Entity } from '../../model/types';
import { useEditor } from '../context';
import { C, MONO, SANS, sectionLabel, secondaryButton, textInput } from '../ui';

const sidebar = {
  width: 264,
  flex: 'none',
  borderRight: `1px solid ${C.line}`,
  background: C.panel,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'auto',
} as const;

const entityName = (e: Entity) =>
  e.type === 'enemy' ? String(e.props.archetype ?? 'enemy') : e.type === 'boss' ? prop(e, 'name', 'Boss') : e.type === 'pickup' ? `${prop(e, 'kind', 'missiles')} expansion` : ENTITY_SPECS[e.type].label;

/** Left panel while a room is open in the painter: the room's settings, what's in it, and its issues. */
export function PainterSidebar() {
  const { state, roomById, check, colorOf, set, edit, playFrom } = useEditor();
  const room = roomById[state.editRoom ?? '']!;
  const entities = room.entities ?? [];
  const items = state.nodes.filter((n) => n.room === room.id && (n.kind === 'start' || isKey(n)));
  const issues = check.issues.filter((i) => i.room === room.id);
  const row = (on: boolean) =>
    ({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 28,
      padding: '0 8px',
      borderRadius: 4,
      border: 0,
      width: '100%',
      cursor: 'pointer',
      background: on ? C.fieldHover : 'transparent',
      font: `400 12.5px ${SANS}`,
      color: C.text,
      textAlign: 'left',
    }) as const;
  return (
    <aside style={sidebar}>
      <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={sectionLabel}>Room</div>
          <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>
            {room.w}×{room.h} cells · {room.x},{room.y}
          </div>
        </div>
        <input
          aria-label="Room name"
          value={room.name}
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
        <div style={{ font: `400 11.5px/1.45 ${SANS}`, color: C.dim }}>Resize or move the room on the map by dragging it or its edges; painted tiles stay put.</div>
        <button className="vw-btn-secondary" style={secondaryButton} onClick={() => playFrom(room.id)}>
          Play from here
        </button>
      </div>

      {issues.length > 0 && (
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionLabel}>Issues here</div>
          {issues.map((i) => (
            <div key={i.msg} style={{ display: 'flex', gap: 8, font: `400 12px/1.45 ${SANS}`, color: C.textSoft }}>
              <span style={{ width: 6, height: 6, marginTop: 6, borderRadius: '50%', flex: 'none', background: i.sev === 'error' ? C.bad : C.accent }} />
              {i.msg}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 14px 6px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={sectionLabel}>In this room</div>
        <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>{entities.length + items.length}</div>
      </div>
      <div style={{ padding: '0 8px 12px' }}>
        {items.map((n) => (
          <button key={n.id} style={row(state.placing === `node:${n.id}`)} onClick={() => set({ paintLayer: 'entities', placing: `node:${n.id}`, selEntity: null })}>
            <span style={{ width: 9, height: 9, borderRadius: n.kind === 'key' ? '50%' : 2, background: colorOf(n), flex: 'none' }} />
            <span style={{ flex: 1 }}>{n.label}</span>
            <span style={{ font: `400 10.5px ${MONO}`, color: C.dim }}>{n.kind === 'start' ? 'start' : 'item'}</span>
          </button>
        ))}
        {entities.map((e) => (
          <button key={e.id} style={row(state.selEntity === e.id)} onClick={() => set({ paintLayer: 'entities', selEntity: e.id })}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: ENTITY_SPECS[e.type].color, flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entityName(e)}</span>
            <span style={{ font: `400 10.5px ${MONO}`, color: C.dim }}>
              {e.x},{e.y}
            </span>
          </button>
        ))}
        {!entities.length && !items.length && <div style={{ padding: '0 8px', font: `400 12px ${SANS}`, color: C.dim }}>Nothing placed yet. Press N to place entities.</div>}
      </div>
    </aside>
  );
}
