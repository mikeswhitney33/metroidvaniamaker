import { BUILT_IN_ABILITIES, TRICKS } from '../../model/abilities';
import { jumpReach } from '../../model/physics';
import { DEFAULT_PHYSICS, type Physics } from '../../model/project';
import type { AbilityDef } from '../../model/types';
import { useEditor } from '../context';
import { C, MONO, SANS, secondaryButton, sectionLabel, textInput, toggle } from '../ui';

const section = { display: 'flex', flexDirection: 'column', gap: 8 } as const;

const PHYSICS: { key: keyof Physics; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'jump', label: 'Jump speed', min: 15, max: 50, step: 1, unit: 't/s' },
  { key: 'springJump', label: 'Spring Boots jump', min: 15, max: 60, step: 1, unit: 't/s' },
  { key: 'gravity', label: 'Gravity', min: 30, max: 140, step: 1, unit: 't/s²' },
  { key: 'run', label: 'Run speed', min: 4, max: 20, step: 0.5, unit: 't/s' },
  { key: 'coyoteMs', label: 'Coyote time', min: 0, max: 250, step: 10, unit: 'ms' },
  { key: 'bufferMs', label: 'Jump buffer', min: 0, max: 250, step: 10, unit: 'ms' },
];

/** The game's rules: abilities and what they unlock, allowed tricks, and movement tuning. */
export function RulesTab() {
  const { state, edit } = useEditor();
  const reach = jumpReach(state.physics);
  const setAbility = (id: string, patch: Partial<AbilityDef>, merge?: string) =>
    edit((s) => ({ abilities: s.abilities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), merge);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={section}>
        <div style={sectionLabel}>Movement</div>
        {PHYSICS.map((p) => (
          <label key={p.key} style={{ display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr) 66px', alignItems: 'center', gap: 8, font: `400 12px ${SANS}`, color: C.muted }}>
            {p.label}
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={state.physics[p.key]}
              onChange={(e) => edit((s) => ({ physics: { ...s.physics, [p.key]: +e.target.value } }), `physics:${p.key}`)}
              style={{ accentColor: C.accent, width: '100%', minWidth: 0, margin: 0 }}
            />
            <span style={{ font: `400 11px ${MONO}`, color: C.textSoft, textAlign: 'right', minWidth: 64, whiteSpace: 'nowrap' }}>
              {state.physics[p.key]} {p.unit}
            </span>
          </label>
        ))}
        <div style={{ font: `400 11.5px/1.5 ${SANS}`, color: C.dim }}>
          Clears ledges {reach.normal} tiles high, {reach.spring} with Spring Boots, {reach.water} in water. The solver and the game use the same numbers.
        </div>
        <button
          className="vw-btn-secondary"
          style={{ ...secondaryButton, alignSelf: 'flex-start' }}
          onClick={() => edit({ physics: DEFAULT_PHYSICS })}
        >
          Reset movement
        </button>
      </div>

      <div style={section}>
        <div style={sectionLabel}>Sequence breaks</div>
        {TRICKS.map((t) => {
          const on = state.tricks.includes(t.id);
          return (
            <button
              key={t.id}
              aria-pressed={on}
              onClick={() => edit((s) => ({ tricks: on ? s.tricks.filter((x) => x !== t.id) : [...s.tricks, t.id] }))}
              style={{ ...toggle(on), height: 'auto', padding: '8px 10px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <span>
                {on ? '✓ ' : ''}
                {t.name}
              </span>
              <span style={{ font: `400 11.5px/1.4 ${SANS}`, color: C.dim }}>{t.desc} The solver counts on it when on.</span>
            </button>
          );
        })}
      </div>

      <div style={section}>
        <div style={sectionLabel}>Custom abilities</div>
        <div style={{ font: `400 11.5px/1.45 ${SANS}`, color: C.dim }}>
          Capabilities are words that doors, blocks, triggers and bosses ask for. A custom ability can grant built-in ones or new ones your
          own triggers check.
        </div>
        {state.abilities.map((a) => (
          <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 6, border: `1px solid ${C.line}`, background: C.field }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" aria-label="Colour" value={a.color} onChange={(e) => setAbility(a.id, { color: e.target.value }, `ab-color:${a.id}`)} style={{ width: 22, height: 22, padding: 0, border: 0, background: 'none' }} />
              <input aria-label="Name" value={a.name} onChange={(e) => setAbility(a.id, { name: e.target.value }, `ab-name:${a.id}`)} style={{ ...textInput, height: 26, flex: 1 }} />
              <button
                aria-label={`Delete ${a.name}`}
                onClick={() => edit((s) => ({ abilities: s.abilities.filter((x) => x.id !== a.id) }))}
                style={{ border: 0, background: 'none', color: C.muted, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <input
              aria-label="Capabilities"
              placeholder="capabilities, comma separated"
              value={a.caps.join(', ')}
              onChange={(e) => setAbility(a.id, { caps: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }, `ab-caps:${a.id}`)}
              style={{ ...textInput, height: 26, fontFamily: MONO, fontSize: 12 }}
            />
            <input aria-label="Description" placeholder="Shown on pickup" value={a.desc ?? ''} onChange={(e) => setAbility(a.id, { desc: e.target.value }, `ab-desc:${a.id}`)} style={{ ...textInput, height: 26, fontSize: 12 }} />
          </div>
        ))}
        <button
          className="vw-btn-secondary"
          style={{ ...secondaryButton, alignSelf: 'flex-start' }}
          onClick={() => edit((s) => ({ abilities: [...s.abilities, { id: `ab${s.seq}`, name: 'New Ability', color: '#9be15d', caps: [`ab${s.seq}`] }], seq: s.seq + 1 }))}
        >
          + Ability
        </button>
      </div>

      <div style={section}>
        <div style={sectionLabel}>Built-in rulebook</div>
        {BUILT_IN_ABILITIES.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', font: `400 12px/1.45 ${SANS}`, color: C.textSoft }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flex: 'none' }} />
            <span style={{ flex: 1 }}>{a.name}</span>
            <span style={{ font: `400 11px ${MONO}`, color: C.dim }}>{a.caps.join(' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
