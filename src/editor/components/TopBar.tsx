import { useEditor } from '../context';
import type { SaveStatus } from '../state';
import { statusSummary } from '../status';
import { C, dot, MONO, SANS, seg, segGroup } from '../ui';
import { ProjectMenu } from './ProjectMenu';

const SAVE_TEXT: Record<SaveStatus, string> = {
  loading: 'Loading…',
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't autosave",
};

const iconButton = (enabled: boolean) => ({
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 5,
  border: `1px solid ${C.line}`,
  background: 'transparent',
  color: enabled ? C.text : C.faint,
  cursor: enabled ? 'pointer' : 'default',
  padding: 0,
});

export function TopBar() {
  const { state, check, set, edit, playtest, leavePlay, undo, redo } = useEditor();
  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;
  const status = statusSummary(check);
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
        <input
          className="vw-name"
          aria-label="Project name"
          value={state.name}
          onChange={(e) => edit({ name: e.target.value }, 'project-name')}
          style={{
            width: Math.max(80, Math.min(260, state.name.length * 7.6 + 18)),
            height: 26,
            padding: '0 6px',
            borderRadius: 4,
            border: '1px solid transparent',
            background: 'transparent',
            color: C.muted,
            font: `500 13px ${SANS}`,
            outline: 'none',
          }}
        />
      </div>
      <ProjectMenu />
      <div style={segGroup}>
        {modes.map(([id, label]) => (
          <button
            key={id}
            style={seg(state.mode === id)}
            onClick={() => (id === 'play' ? state.mode !== 'play' && playtest() : leavePlay())}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {(['hideLeft', 'hideRight'] as const).map((k) => {
          const shown = !state.prefs[k];
          const label = `${shown ? 'Hide' : 'Show'} ${k === 'hideLeft' ? 'left' : 'right'} panel`;
          return (
            <button
              key={k}
              aria-label={label}
              title={label}
              aria-pressed={shown}
              onClick={() => set((s) => ({ prefs: { ...s.prefs, [k]: !s.prefs[k] } }))}
              style={{ ...iconButton(true), color: shown ? C.text : C.faint }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                {k === 'hideLeft' ? <path d="M9 4v16" /> : <path d="M15 4v16" />}
                {shown && (k === 'hideLeft' ? <rect x="3" y="4" width="6" height="16" fill="currentColor" stroke="none" opacity=".35" /> : <rect x="15" y="4" width="6" height="16" fill="currentColor" stroke="none" opacity=".35" />)}
              </svg>
            </button>
          );
        })}
        <span style={{ width: 6 }} />
        <button aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo} style={iconButton(canUndo)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h11a5 5 0 010 10h-4" />
          </svg>
        </button>
        <button aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo} style={iconButton(canRedo)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 14l5-5-5-5" />
            <path d="M20 9H9a5 5 0 000 10h4" />
          </svg>
        </button>
        <span
          role="status"
          style={{ minWidth: 92, font: `400 11.5px ${MONO}`, color: state.saveStatus === 'error' ? C.badSoft : C.dim }}
        >
          {SAVE_TEXT[state.saveStatus]}
        </span>
      </div>
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
        onClick={() => playtest()}
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
        Playtest
      </button>
    </header>
  );
}
