import { useEditor } from '../context';
import type { Tab } from '../state';
import { C, MONO, SANS } from '../ui';
import { ArtStyleTab } from './ArtStyleTab';
import { LockKeyTab } from './LockKeyTab';
import { ValidateTab } from './ValidateTab';

const TABS: [Tab, string][] = [
  ['graph', 'Lock & key'],
  ['style', 'Art style'],
  ['validate', 'Validate'],
];

/** Right panel while authoring. */
export function InspectorPanel() {
  const { state, check, set } = useEditor();
  const count = check.issues.length;
  return (
    <aside
      style={{
        width: 344,
        flex: 'none',
        borderLeft: `1px solid ${C.line}`,
        background: C.panel,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        role="tablist"
        style={{
          height: 40,
          flex: 'none',
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: `1px solid ${C.line}`,
          padding: '0 8px',
        }}
      >
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={state.tab === id}
            onClick={() => set({ tab: id })}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 10px',
              border: 0,
              background: 'transparent',
              borderBottom: `2px solid ${state.tab === id ? C.accent : 'transparent'}`,
              color: state.tab === id ? C.text : C.muted,
              font: `500 12.5px ${SANS}`,
              cursor: 'pointer',
            }}
          >
            {label}
            {id === 'validate' && count > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 8,
                  background: check.errors ? C.bad : C.accent,
                  color: C.bar,
                  font: `700 10px/16px ${MONO}`,
                  display: 'inline-block',
                }}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px 20px' }}>
        {state.tab === 'graph' && <LockKeyTab />}
        {state.tab === 'style' && <ArtStyleTab />}
        {state.tab === 'validate' && <ValidateTab />}
      </div>
    </aside>
  );
}
