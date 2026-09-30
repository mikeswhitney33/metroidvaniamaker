import { PRESETS } from '../../model/sampleProject';
import { useEditor } from '../context';
import type { TileSize } from '../state';
import { C, SANS, sectionLabel, seg, segGroup } from '../ui';
import { ImageSlot } from './ImageSlot';

const TILE_SIZES: TileSize[] = ['8px', '16px', '32px'];
const section = { display: 'flex', flexDirection: 'column', gap: 8 } as const;

export function ArtStyleTab() {
  const { state, edit } = useEditor();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={section}>
        <div style={sectionLabel}>Preset</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {PRESETS.map((p) => {
            const on = state.style === p.id;
            return (
              <button
                key={p.id}
                aria-pressed={on}
                onClick={() => edit({ style: p.id })}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: 8,
                  borderRadius: 6,
                  border: `1px solid ${on ? C.accent : C.line}`,
                  background: on ? '#23272e' : C.field,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', height: 34, borderRadius: 3, overflow: 'hidden' }}>
                  {[p.bg, p.bg2, p.wall, p.edge, p.player].map((c, i) => (
                    <div key={i} style={{ flex: 1, background: c }} />
                  ))}
                </div>
                <div style={{ font: `500 12px ${SANS}`, color: C.text, textAlign: 'left' }}>{p.name}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={section}>
        <div style={sectionLabel}>Reference art</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          <div style={{ height: 86 }}>
            <ImageSlot id="style-ref-1" placeholder="Tileset" />
          </div>
          <div style={{ height: 86 }}>
            <ImageSlot id="style-ref-2" placeholder="Character" />
          </div>
          <div style={{ height: 86 }}>
            <ImageSlot id="style-ref-3" placeholder="Mood" />
          </div>
        </div>
      </div>
      <div style={section}>
        <div style={sectionLabel}>Prompt</div>
        <textarea
          value={state.prompt}
          onChange={(e) => edit({ prompt: e.target.value })}
          rows={4}
          style={{
            resize: 'vertical',
            padding: '8px 10px',
            borderRadius: 5,
            border: `1px solid ${C.lineStrong}`,
            background: C.bg,
            color: C.text,
            font: `400 12.5px/1.5 ${SANS}`,
            outline: 'none',
          }}
        />
      </div>
      <div style={section}>
        <div style={sectionLabel}>Tile size</div>
        <div style={segGroup}>
          {TILE_SIZES.map((v) => (
            <button key={v} style={seg(state.tile === v)} onClick={() => edit({ tile: v })}>
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
