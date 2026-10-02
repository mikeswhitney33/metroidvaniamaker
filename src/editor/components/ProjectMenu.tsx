import { useEffect, useRef, useState } from 'react';
import { SAMPLES } from '../../model/samples';
import { useEditor } from '../context';
import { C, MONO, SANS, secondaryButton } from '../ui';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/** Top-bar Project menu: new, sample, open and save to a file. */
export function ProjectMenu() {
  const { newProject, loadSample, openFile, saveFile, exportGame } = useEditor();
  const [open, setOpen] = useState(false);
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
            minWidth: 250,
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
