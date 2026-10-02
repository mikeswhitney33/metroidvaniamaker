import { useEditor } from '../context';
import { C, plural, primaryButton, SANS, secondaryButton } from '../ui';

/** Shown when Playtest is pressed while validation has blocking issues. */
export function GenerateDialog() {
  const { state, check, set, playtest } = useEditor();
  const gen = state.gen;
  if (!gen) return null;
  const errors = check.issues.filter((i) => i.sev === 'error').slice(0, 4);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,9,11,.72)', display: 'grid', placeItems: 'center', zIndex: 10 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Blocking issues"
        style={{
          width: 460,
          maxWidth: 'calc(100vw - 32px)',
          background: C.panelDeep,
          border: `1px solid ${C.lineStrong}`,
          borderRadius: 8,
          boxShadow: '0 24px 64px rgba(0,0,0,.5)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ font: `600 15px ${SANS}`, color: C.badSoft }}>This map can't be finished yet</div>
        <div style={{ font: `400 13px/1.5 ${SANS}`, color: C.textSoft }}>
          Validation found {plural(gen.errors, 'blocking issue')}. You can still play to try things out.
        </div>
        {errors.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, font: `400 12.5px/1.5 ${SANS}`, color: C.text }}>
            {errors.map((e) => (
              <li key={e.msg}>{e.msg}</li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => playtest(true)} style={{ ...secondaryButton, height: 30, padding: '0 12px' }}>
            Play anyway
          </button>
          <button onClick={() => set({ gen: null, mode: 'author', tab: 'validate' })} style={primaryButton}>
            Review issues
          </button>
        </div>
      </div>
    </div>
  );
}
