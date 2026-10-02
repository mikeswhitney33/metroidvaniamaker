import { useEffect, useRef, useState } from 'react';
import { listProjects, type ProjectEntry } from '../persist';
import { SAMPLES } from '../../model/samples';
import { useEditor } from '../context';
import { C, MONO, SANS, secondaryButton } from '../ui';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/** Top-bar Project menu: new, sample, open and save to a file. */
export function ProjectMenu() {
  const { state, set, newProject, loadSample, openFile, saveFile, exportGame, openRecent, deleteRecent } = useEditor();
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<ProjectEntry[]>([]);

  useEffect(() => {
    if (open) void listProjects().then(setRecent);
  }, [open]);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const items: [string, string, () => void][] = [
    ['New project', '', newProject],
    ...SAMPLES.map((x): [string, string, () => void] => [`Open ${x.name}`, 'sample', () => loadSample(x.id)]),
    ['Open file…', '', () => input.current?.click()],
    ['Import map from image, Tiled or LDtk…', '', () => set({ importing: true })],
    ['Save to file', `${MOD}S`, saveFile],
    ['Export playable HTML', '', exportGame],
  ];

  return (
    <div ref={root} style={{ position: 'relative' }}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ ...secondaryButton, background: open ? C.fieldHover : C.field }}
      >
        Project ▾
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 32,
            left: 0,
            zIndex: 20,
            minWidth: 300,
            padding: 4,
            background: C.panelDeep,
            border: `1px solid ${C.lineStrong}`,
            borderRadius: 6,
            boxShadow: '0 12px 32px rgba(0,0,0,.45)',
          }}
        >
          {items.map(([label, keys, run]) => (
            <button
              key={label}
              role="menuitem"
              className="vw-menu-item"
              onClick={() => {
                setOpen(false);
                run();
              }}
              style={{
                width: '100%',
                height: 30,
                padding: '0 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: 0,
                borderRadius: 4,
                background: 'transparent',
                color: C.text,
                font: `500 12.5px ${SANS}`,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {label}
              <span style={{ font: `400 11px ${MONO}`, color: C.dim }}>{keys}</span>
            </button>
          ))}
          {recent.length > 0 && (
            <>
              <div style={{ height: 1, background: C.line, margin: '4px 6px' }} />
              <div style={{ padding: '6px 10px 2px', font: `500 10.5px ${MONO}`, letterSpacing: '.08em', textTransform: 'uppercase', color: C.dim }}>Recent in this browser</div>
              {recent.slice(0, 8).map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    role="menuitem"
                    className="vw-menu-item"
                    disabled={p.id === state.projectId}
                    onClick={() => {
                      setOpen(false);
                      void openRecent(p.id);
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 30,
                      padding: '0 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      border: 0,
                      borderRadius: 4,
                      background: 'transparent',
                      color: p.id === state.projectId ? C.muted : C.text,
                      font: `500 12.5px ${SANS}`,
                      cursor: p.id === state.projectId ? 'default' : 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                      {p.id === state.projectId ? ' (open)' : ''}
                    </span>
                    <span style={{ font: `400 11px ${MONO}`, color: C.dim }}>{new Date(p.savedAt).toLocaleDateString()}</span>
                  </button>
                  {p.id !== state.projectId && (
                    <button
                      aria-label={`Delete ${p.name} from this browser`}
                      title="Delete from this browser"
                      onClick={() => void deleteRecent(p.id).then(() => listProjects().then(setRecent))}
                      style={{ width: 26, height: 26, border: 0, background: 'none', color: C.dim, cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
