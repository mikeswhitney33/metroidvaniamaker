import { isKey } from '../../model/graph';
import { useEditor } from '../context';
import { C, MONO, SANS, sectionLabel, swatch, plural } from '../ui';

export function ValidateTab() {
  const { state, analysis: a, byId, roomById, colorOf, openIssue } = useEditor();
  const keys = state.nodes.filter(isKey).length;
  const bad = a.errors > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
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
        <div style={{ font: `600 15px ${SANS}` }}>{bad ? 'Not beatable' : 'Beatable'}</div>
        <div style={{ font: `400 12px/1.45 ${SANS}`, color: C.textSoft }}>
          {bad
            ? `${plural(a.errors, 'blocking issue')}. Fix them before generating.`
            : `All ${keys} keys reachable in order. ${a.reached.size} of ${state.rooms.length} rooms reached.`}
        </div>
      </div>

      {a.issues.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionLabel}>Issues</div>
          {a.issues.map((issue, i) => (
            <div
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
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  flex: 'none',
                  marginTop: 5,
                  borderRadius: '50%',
                  background: issue.sev === 'error' ? C.bad : C.accent,
                }}
              />
              <span style={{ flex: 1, textWrap: 'pretty' }}>{issue.msg}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={sectionLabel}>Critical path</div>
        {a.order.map((id, i) => {
          const n = byId[id];
          const room = n.room ? roomById[n.room] : undefined;
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 30,
                padding: '0 4px',
                borderBottom: '1px solid #22262d',
                font: `400 12.5px ${SANS}`,
                color: C.text,
              }}
            >
              <span style={{ width: 18, font: `500 11px ${MONO}`, color: C.accent }}>{i + 1}</span>
              <span style={swatch(n, colorOf(n))} />
              <span style={{ flex: 1 }}>{n.label}</span>
              <span style={{ font: `400 11.5px ${SANS}`, color: C.muted }}>{room?.name ?? ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
