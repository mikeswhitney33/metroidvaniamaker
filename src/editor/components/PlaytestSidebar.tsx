import { isKey } from '../../model/graph';
import { useEditor } from '../context';
import { C, MONO, SANS, sectionLabel, swatch } from '../ui';

const CONTROLS = [
  { action: 'Move', key: '← →' },
  { action: 'Jump', key: 'Space' },
  { action: 'Dash (with boots)', key: 'Shift' },
  { action: 'Restart', key: 'R' },
];

/** Left panel while playtesting: controls and inventory. */
export function PlaytestSidebar() {
  const { state, colorOf } = useEditor();
  return (
    <aside
      style={{
        width: 264,
        flex: 'none',
        borderRight: `1px solid ${C.line}`,
        background: C.panel,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: 14,
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={sectionLabel}>Controls</div>
        {CONTROLS.map((c) => (
          <div
            key={c.action}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              font: `400 12px ${SANS}`,
              color: C.textSoft,
            }}
          >
            <span>{c.action}</span>
            <span
              style={{
                font: `500 11px ${MONO}`,
                color: C.text,
                padding: '2px 6px',
                border: `1px solid ${C.lineStrong}`,
                borderRadius: 4,
                background: C.field,
              }}
            >
              {c.key}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={sectionLabel}>Inventory</div>
        {state.nodes.filter(isKey).map((n) => {
          const found = state.have.includes(n.id);
          return (
            <div
              key={n.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 26,
                font: `400 12.5px ${SANS}`,
                color: found ? C.text : C.dim,
                opacity: found ? 1 : 0.75,
              }}
            >
              <span style={swatch(n, colorOf(n))} />
              <span style={{ flex: 1 }}>{n.label}</span>
              <span style={{ font: `400 10.5px ${MONO}`, color: C.muted }}>{found ? 'found' : '—'}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
