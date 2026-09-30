import { useEditor } from '../context';
import { C, MONO, SANS, plural, primaryButton, secondaryButton } from '../ui';

/** Modal shown by "Generate build": either the validation block, or build progress. */
export function GenerateDialog() {
  const { state, palette, set } = useEditor();
  const gen = state.gen;
  if (!gen) return null;

  const steps = [
    `Trace corridors into ${plural(state.rooms.length, 'region')}`,
    'Solve lock & key graph',
    'Place keys and gates',
    'Build tile geometry',
    `Paint with ${palette.name}`,
    'Bake playable build',
  ];
  const pct = gen.blocked ? 0 : gen.pct;
  const cur = Math.min(steps.length - 1, Math.floor(pct / (100 / steps.length)));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8,9,11,.72)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 10,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={gen.blocked ? "Can't generate yet" : 'Generating build'}
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
        {gen.blocked ? (
          <>
            <div style={{ font: `600 15px ${SANS}`, color: C.badSoft }}>Can't generate yet</div>
            <div style={{ font: `400 13px/1.5 ${SANS}`, color: C.textSoft }}>
              Validation found {plural(gen.errors, 'blocking issue')}. A generated build would softlock the player.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => set({ gen: null })} style={{ ...secondaryButton, height: 30, padding: '0 12px' }}>
                Close
              </button>
              <button onClick={() => set({ gen: null, mode: 'author', tab: 'validate' })} style={primaryButton}>
                Review issues
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ font: `600 15px ${SANS}`, color: C.text }}>Generating build</div>
              <div style={{ font: `400 11px ${MONO}`, color: C.muted }}>seed {state.seed}</div>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: 4, borderRadius: 2, background: C.line, overflow: 'hidden' }}
            >
              <div style={{ height: '100%', width: `${pct}%`, background: C.accent, transition: 'width .07s linear' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {steps.map((label, i) => {
                const done = i < cur || pct >= 100;
                const active = !done && i === cur;
                return (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      gap: 8,
                      font: `400 12.5px ${SANS}`,
                      color: done ? C.ok : active ? C.text : C.dim,
                    }}
                  >
                    <span style={{ width: 14, font: `500 11px ${MONO}` }}>{done ? '✓' : active ? '›' : '·'}</span>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
