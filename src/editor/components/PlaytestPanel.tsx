import { useEditor } from '../context';
import { C, MONO, SANS, sectionLabel } from '../ui';


/** Right panel while playtesting: minimap and run log. */
export function PlaytestPanel() {
  const { state } = useEditor();
  const cell = Math.max(3, Math.floor(Math.min(288 / state.grid.w, 200 / state.grid.h)));
  return (
    <aside
      style={{
        width: 344,
        flex: 'none',
        borderLeft: `1px solid ${C.line}`,
        background: C.panel,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: '14px 16px',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={sectionLabel}>Map</div>
        <div
          style={{
            position: 'relative',
            width: state.grid.w * cell,
            height: state.grid.h * cell,
            background: C.bg,
            border: `1px solid ${C.line}`,
            borderRadius: 4,
          }}
        >
          {state.rooms.map((r) => {
            const current = state.playRoom === r.id;
            const visited = state.visited.includes(r.id);
            return (
              <div
                key={r.id}
                style={{
                  position: 'absolute',
                  left: r.x * cell,
                  top: r.y * cell,
                  width: r.w * cell - 1,
                  height: r.h * cell - 1,
                  borderRadius: 1,
                  background: current ? C.accent : visited ? (state.areas.find((a) => a.id === r.area) ?? state.areas[0])?.color ?? C.faint : '#22262d',
                  opacity: current || !visited ? 1 : 0.6,
                  border: visited || current ? 'none' : `1px solid ${C.line}`,
                }}
              />
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={sectionLabel}>Run log</div>
        {state.log.map((l, i) => (
          <div key={`${l.t}-${i}-${l.msg}`} style={{ display: 'flex', gap: 10, font: `400 12px/1.5 ${SANS}`, color: C.text }}>
            <span style={{ font: `400 11px/1.6 ${MONO}`, color: C.dim }}>{l.t}</span>
            <span>{l.msg}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
