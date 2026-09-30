import { useEditor } from '../context';
import { C, MONO, SANS, sectionLabel } from '../ui';

const MINIMAP_CELL = 9;

/** Right panel while playtesting: minimap and run log. */
export function PlaytestPanel() {
  const { state } = useEditor();
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
            width: 288,
            height: 162,
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
                  left: r.x * MINIMAP_CELL,
                  top: r.y * MINIMAP_CELL,
                  width: r.w * MINIMAP_CELL - 1,
                  height: r.h * MINIMAP_CELL - 1,
                  borderRadius: 1,
                  background: current ? C.accent : visited ? C.faint : '#22262d',
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
