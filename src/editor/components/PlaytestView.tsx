import { useEditor } from '../context';
import { C, MONO, SANS, secondaryButton } from '../ui';

/** Centre of the playtest view: header and game canvas. */
export function PlaytestView() {
  const { state, roomById, palette, canvasRef, restart, leavePlay } = useEditor();
  return (
    <>
      <div
        style={{
          height: 40,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          borderBottom: `1px solid ${C.line}`,
          background: C.bar,
        }}
      >
        <div style={{ font: `600 13px ${SANS}`, color: C.text }}>{roomById[state.playRoom]?.name ?? ''}</div>
        <div style={{ font: `400 11px ${MONO}`, color: C.muted }}>
          {palette.name} · Esc returns to the editor
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={restart} style={secondaryButton}>
          Restart
        </button>
        <button onClick={leavePlay} style={secondaryButton}>
          Back to editor
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: C.canvas }}>
        <canvas
          ref={canvasRef}
          aria-label="Playtest"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </>
  );
}
