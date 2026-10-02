import { useEffect, useState } from 'react';
import { ACTIONS, DEFAULT_BINDINGS, keyLabel, type Action } from '../../game/input';
import { abilityById } from '../../model/abilities';
import { isKey } from '../../model/graph';
import { useEditor } from '../context';
import type { Prefs } from '../prefs';
import { C, MONO, SANS, secondaryButton, sectionLabel, swatch, toggle } from '../ui';

const keyCap = {
  font: `500 11px ${MONO}`,
  color: C.text,
  padding: '2px 6px',
  border: `1px solid ${C.lineStrong}`,
  borderRadius: 4,
  background: C.field,
  cursor: 'pointer',
} as const;

/** Left panel while playtesting: controls (click to rebind), settings and inventory. */
export function PlaytestSidebar() {
  const { state, set, colorOf, restart, continueRun } = useEditor();
  const [binding, setBinding] = useState<Action | null>(null);
  const prefs = state.prefs;
  const setPrefs = (p: Partial<Prefs>) => set((s) => ({ prefs: { ...s.prefs, ...p } }));

  // While rebinding, the next key press becomes the action's main key.
  useEffect(() => {
    if (!binding) return;
    const grab = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') {
        set((s) => {
          const b = { ...s.prefs.bindings };
          (Object.keys(b) as Action[]).forEach((a) => (b[a] = b[a].filter((c) => c !== e.code)));
          b[binding] = [e.code, ...b[binding].filter((c) => c !== e.code)].slice(0, 2);
          return { prefs: { ...s.prefs, bindings: b } };
        });
      }
      setBinding(null);
    };
    window.addEventListener('keydown', grab, true);
    return () => window.removeEventListener('keydown', grab, true);
  }, [binding, set]);

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
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="vw-btn-secondary" style={{ ...secondaryButton, flex: 1 }} onClick={restart} title="R">
          Restart
        </button>
        <button className="vw-btn-secondary" style={{ ...secondaryButton, flex: 1, opacity: state.hasRun ? 1 : 0.5 }} disabled={!state.hasRun} onClick={continueRun}>
          Continue save
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={sectionLabel}>Controls</div>
          <button
            onClick={() => setPrefs({ bindings: DEFAULT_BINDINGS })}
            style={{ border: 0, background: 'none', color: C.dim, font: `400 11px ${SANS}`, cursor: 'pointer' }}
          >
            Reset
          </button>
        </div>
        {ACTIONS.map((a) => (
          <div key={a.action} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, font: `400 12px ${SANS}`, color: C.textSoft }}>
            <span>{a.label}</span>
            <button
              onClick={() => setBinding(a.action)}
              aria-label={`Rebind ${a.label}`}
              style={{ ...keyCap, borderColor: binding === a.action ? C.accent : C.lineStrong }}
            >
              {binding === a.action ? 'Press a key…' : [...new Set(prefs.bindings[a.action].map(keyLabel))].join(' / ')}
            </button>
          </div>
        ))}
        <div style={{ font: `400 11px/1.45 ${SANS}`, color: C.dim }}>Gamepads work too. R restarts, Esc returns to the editor.</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={sectionLabel}>Settings</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button style={toggle(prefs.assist)} onClick={() => setPrefs({ assist: !prefs.assist })} title="Take half damage. Applies on restart">
            Assist
          </button>
          <button style={toggle(prefs.reducedFlash)} onClick={() => setPrefs({ reducedFlash: !prefs.reducedFlash })} title="No screen shake or strobing. Applies on restart">
            Calm effects
          </button>
          <button style={toggle(!prefs.muted)} onClick={() => setPrefs({ muted: !prefs.muted })}>
            Sound
          </button>
          <button style={toggle(prefs.music)} onClick={() => setPrefs({ music: !prefs.music })}>
            Music
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={sectionLabel}>Items</div>
        {state.nodes.filter(isKey).map((n) => {
          const found = state.have.includes(n.id);
          const a = abilityById(n.ability, state.abilities);
          return (
            <div
              key={n.id}
              title={a?.desc}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 24,
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
