import { useEditor } from '../context';
import { statusSummary } from '../status';
import { C, dot, MONO, SANS, seg, segGroup } from '../ui';

export function TopBar() {
  const { state, analysis, set, generate } = useEditor();
  const status = statusSummary(analysis);
  const modes = [
    ['author', 'Author'],
    ['play', 'Playtest'],
  ] as const;

  return (
    <header
      style={{
        height: 46,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '0 14px',
        borderBottom: `1px solid ${C.line}`,
        background: C.bar,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: C.accent,
            display: 'grid',
            placeItems: 'center',
            font: `700 12px ${MONO}`,
            color: C.bar,
          }}
        >
          V
        </div>
        <div style={{ font: `600 14px ${SANS}`, color: C.text }}>Vaultwright</div>
        <div style={{ color: C.faint }}>/</div>
        <div style={{ font: `500 13px ${SANS}`, color: C.muted }}>Hollow Depths</div>
      </div>
      <div style={segGroup}>
        {modes.map(([id, label]) => (
          <button
            key={id}
            style={seg(state.mode === id)}
            onClick={() => (id === 'play' ? generate() : set({ mode: 'author' }))}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => set({ mode: 'author', tab: 'validate' })}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 28,
          padding: '0 10px',
          borderRadius: 5,
          border: `1px solid ${C.line}`,
          background: '#1a1d22',
          color: C.text,
          font: `500 12px ${SANS}`,
          cursor: 'pointer',
        }}
      >
        <span style={dot(status.color)} />
        {status.text}
      </button>
      <button
        className="vw-btn-primary"
        onClick={generate}
        style={{
          height: 30,
          padding: '0 14px',
          borderRadius: 5,
          border: 0,
          background: C.accent,
          color: C.bar,
          font: `600 12.5px ${SANS}`,
          cursor: 'pointer',
        }}
      >
        Generate build
      </button>
    </header>
  );
}
