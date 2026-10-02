import { useMemo } from 'react';
import { flagTable, type FlagUse } from '../../model/flags';
import { useEditor } from '../context';
import { C, MONO, SANS, sectionLabel, plural, toggle } from '../ui';

const KIND_ICON: Record<string, string> = { key: '◆', expansion: '+', boss: 'B', trigger: '!', exit: 'X' };

/** Validation: whether the game can be finished, what blocks it, and the route the solver found. */
export function ValidateTab() {
  const { state, check, roomById, openIssue, set } = useEditor();
  const r = check.solved?.result;
  const bad = check.errors > 0 || (r && !r.beatable);
  const tricks = check.solved?.tricks ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        role="status"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '12px 14px',
          borderRadius: 6,
          border: `1px solid ${bad ? 'rgba(255,107,107,.4)' : 'rgba(79,209,165,.35)'}`,
          background: bad ? 'rgba(255,107,107,.07)' : 'rgba(79,209,165,.06)',
          color: bad ? C.badSoft : C.ok,
        }}
      >
        <div style={{ font: `600 15px ${SANS}`, display: 'flex', justifyContent: 'space-between' }}>
          {bad ? 'Not beatable' : 'Beatable'}
          {check.busy && <span style={{ font: `400 11px ${MONO}`, color: C.muted }}>checking…</span>}
        </div>
        <div style={{ font: `400 12px/1.45 ${SANS}`, color: C.textSoft }}>
          {bad
            ? `${plural(check.errors, 'blocking issue')}. The solver walks the actual tiles with the moves each item gives.`
            : `Every required item can be reached in ${plural(r?.waves.length ?? 0, 'stage')}. ${check.reached.size} of ${state.rooms.length} rooms can be entered.`}
        </div>
      </div>
      <button style={{ ...toggle(state.showReach), flex: 'none' }} onClick={() => set((s) => ({ showReach: !s.showReach, editRoom: null }))}>
        {state.showReach ? 'Hide' : 'Show'} reachable tiles on the map
      </button>

      {check.issues.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionLabel}>Issues</div>
          {check.issues.map((issue, i) => (
            <button
              key={i}
              onClick={() => openIssue(issue)}
              style={{
                display: 'flex',
                gap: 9,
                alignItems: 'flex-start',
                padding: '9px 10px',
                borderRadius: 5,
                background: C.field,
                border: `1px solid ${C.line}`,
                cursor: 'pointer',
                font: `400 12.5px/1.45 ${SANS}`,
                color: C.text,
                textAlign: 'left',
              }}
            >
              <span style={{ width: 8, height: 8, flex: 'none', marginTop: 5, borderRadius: '50%', background: issue.sev === 'error' ? C.bad : C.accent }} />
              <span style={{ flex: 1, textWrap: 'pretty' }}>{issue.msg}</span>
            </button>
          ))}
        </div>
      )}

      {r && r.waves.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLabel}>Route by stage</div>
          {r.waves.map((ids, i) => (
            <div key={i} style={{ display: 'flex', gap: 10 }}>
              <span style={{ width: 18, font: `500 11px/22px ${MONO}`, color: C.accent }}>{i + 1}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {ids.map((id) => {
                  const t = r.targets.find((x) => x.id === id);
                  if (!t) return null;
                  return (
                    <div key={id} style={{ display: 'flex', gap: 8, font: `400 12.5px/22px ${SANS}`, color: t.kind === 'expansion' ? C.muted : C.text }}>
                      <span style={{ width: 12, font: `700 10px/22px ${MONO}`, color: C.dim }}>{KIND_ICON[t.kind]}</span>
                      <span style={{ flex: 1 }}>{t.label}</span>
                      <span style={{ font: `400 11.5px/22px ${SANS}`, color: C.dim }}>{roomById[t.room]?.name ?? ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tricks.some((t) => t.earlier.length || t.needed) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionLabel}>Sequence breaks</div>
          {tricks
            .filter((t) => t.earlier.length || t.needed)
            .map((t) => (
              <div key={t.trick} style={{ padding: '8px 10px', borderRadius: 5, border: `1px solid ${C.line}`, font: `400 12px/1.5 ${SANS}`, color: C.textSoft }}>
                <div style={{ color: C.text, font: `500 12.5px ${SANS}` }}>{t.name}</div>
                {t.needed && <div style={{ color: C.accent }}>Your map is only beatable with this trick.</div>}
                {t.earlier.map((e) => (
                  <div key={e.label}>
                    {e.label}: stage {e.from < 0 ? 'never' : e.from + 1} → {e.to + 1}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
      <FlagList />
    </div>
  );
}

/** Every world flag: what sets it and what checks it. */
function FlagList() {
  const { state, set } = useEditor();
  const { rooms, doors, nodes } = state;
  const flags = useMemo(() => flagTable({ rooms, doors, nodes }), [rooms, doors, nodes]);
  if (!flags.length) return null;
  const roomName = (id?: string) => (id ? (rooms.find((r) => r.id === id)?.name ?? id) : '');
  const use = (u: FlagUse, i: number) => (
    <button
      key={i}
      onClick={() => u.room && set({ selRoom: u.room, selRooms: [u.room] })}
      style={{ border: 0, background: 'none', padding: 0, color: C.textSoft, font: `400 11.5px/1.5 ${SANS}`, cursor: u.room ? 'pointer' : 'default', textAlign: 'left' }}
    >
      {u.what}
      {u.room && <span style={{ color: C.dim }}> · {roomName(u.room)}</span>}
    </button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={sectionLabel}>Flags</div>
      {flags.map((f) => (
        <div key={f.name} style={{ padding: '8px 10px', borderRadius: 5, border: `1px solid ${!f.setBy.length && f.readBy.length ? C.accent : C.line}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ font: `500 12px ${MONO}`, color: C.text }}>{f.name}</div>
          <div style={{ font: `400 11px ${SANS}`, color: C.dim }}>Set by</div>
          {f.setBy.length ? f.setBy.map(use) : <span style={{ font: `400 11.5px ${SANS}`, color: C.accent }}>Nothing sets it</span>}
          <div style={{ font: `400 11px ${SANS}`, color: C.dim, marginTop: 2 }}>Checked by</div>
          {f.readBy.length ? f.readBy.map(use) : <span style={{ font: `400 11.5px ${SANS}`, color: C.dim }}>Nothing checks it</span>}
        </div>
      ))}
    </div>
  );
}
