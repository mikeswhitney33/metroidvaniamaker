import { parseReq, ReqError } from '../../model/abilities';
import { ENTITY_SPECS } from '../../model/entities';
import type { Entity } from '../../model/types';
import { useEditor } from '../context';
import { FlagField, ReqField } from './Pickers';
import { C, dangerButton, MONO, SANS, sectionLabel, textInput } from '../ui';

const field = { display: 'flex', flexDirection: 'column', gap: 4, font: `400 11.5px ${SANS}`, color: C.muted } as const;

/** Why a requirement expression doesn't parse, or null when it's fine. */
export function reqError(src: string): string | null {
  try {
    parseReq(src);
    return null;
  } catch (e) {
    return e instanceof ReqError ? e.message : 'Not a valid requirement.';
  }
}

/** Settings for the selected entity, generated from its type's schema. */
export function EntityInspector({
  entity: e,
  onChange,
  onDelete,
  onClose,
}: {
  entity: Entity;
  onChange(e: Entity, merge?: string): void;
  onDelete(): void;
  onClose(): void;
}) {
  const { state } = useEditor();
  const spec = ENTITY_SPECS[e.type];
  const setProp = (key: string, v: string | number | boolean) => onChange({ ...e, props: { ...e.props, [key]: v } }, `prop:${e.id}:${key}`);
  return (
    <div
      role="dialog"
      aria-label={`${spec.label} settings`}
      style={{
        padding: '14px 16px',
        borderBottom: `1px solid ${C.line}`,
        background: C.panelDeep,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: spec.color }} />
        <div style={{ flex: 1, font: `600 13px ${SANS}`, color: C.text }}>{spec.label}</div>
        <span style={{ font: `400 10.5px ${MONO}`, color: C.dim }}>
          {e.x},{e.y}
        </span>
        <button aria-label="Close" onClick={onClose} style={{ border: 0, background: 'none', color: C.muted, cursor: 'pointer', font: `400 14px ${SANS}` }}>
          ×
        </button>
      </div>
      {spec.props.length === 0 && <div style={{ font: `400 12px/1.45 ${SANS}`, color: C.muted }}>No settings. Stand on it in the playtest.</div>}
      {spec.props.map((p) => {
        const v = e.props[p.key] ?? p.default;
        const isReq = p.key === 'weak' || p.key === 'when';
        const err = isReq && typeof v === 'string' ? reqError(v) : null;
        if (p.key === 'flag' && e.type === 'trigger' && e.props.action !== 'flag') return null;
        return (
          <label key={p.key} style={field}>
            <span>{p.label}</span>
            {p.kind === 'select' ? (
              <select value={String(v)} onChange={(x) => setProp(p.key, x.target.value)} style={textInput}>
                {p.options!.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : p.kind === 'bool' ? (
              <input type="checkbox" checked={!!v} onChange={(x) => setProp(p.key, x.target.checked)} style={{ accentColor: C.accent, width: 16, height: 16 }} />
            ) : p.kind === 'number' ? (
              <input type="number" value={Number(v)} onChange={(x) => setProp(p.key, Number(x.target.value) || 0)} style={textInput} />
            ) : p.key === 'escapeTo' ? (
              <select value={String(v)} onChange={(x) => setProp(p.key, x.target.value)} style={textInput}>
                <option value="">None</option>
                {state.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : p.key === 'flag' ? (
              <FlagField label={p.label} value={String(v)} onChange={(x) => setProp(p.key, x)} setsFlag={e.type === 'boss' || (e.type === 'trigger' && e.props.action === 'flag')} />
            ) : isReq ? (
              <ReqField label={p.label} value={String(v)} onChange={(x) => setProp(p.key, x)} />
            ) : p.key === 'message' ? (
              <textarea value={String(v)} rows={3} onChange={(x) => setProp(p.key, x.target.value)} style={{ ...textInput, height: 'auto', padding: 8, resize: 'vertical', font: `400 12.5px/1.45 ${SANS}` }} />
            ) : (
              <input value={String(v)} onChange={(x) => setProp(p.key, x.target.value)} style={textInput} />
            )}
            {!err && p.hint && <span style={{ color: C.dim }}>{p.hint}</span>}
          </label>
        );
      })}
      <div style={{ ...sectionLabel, marginTop: 2 }}>Id {e.id}</div>
      <button onClick={onDelete} style={dangerButton}>
        Delete
      </button>
    </div>
  );
}
