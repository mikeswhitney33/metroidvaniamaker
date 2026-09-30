import { isKey } from '../../model/graph';
import { useEditor } from '../context';
import { statusSummary } from '../status';
import { C, MONO } from '../ui';

export function StatusBar() {
  const { state, analysis, palette } = useEditor();
  const status = statusSummary(analysis);
  const keys = state.nodes.filter(isKey).length;
  const gates = state.nodes.filter((n) => n.kind === 'gate').length;
  return (
    <footer
      style={{
        height: 26,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 12px',
        borderTop: `1px solid ${C.line}`,
        background: C.bar,
        font: `400 11px ${MONO}`,
        color: C.muted,
      }}
    >
      <span style={{ color: status.color }}>{status.text}</span>
      <span>
        {state.rooms.length} rooms · {keys} keys · {gates} gates · seed {state.seed}
      </span>
      <div style={{ flex: 1 }} />
      <span>
        {palette.name} · {state.tile} tiles
      </span>
    </footer>
  );
}
