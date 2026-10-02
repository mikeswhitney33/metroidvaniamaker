import { tilesetTemplate } from '../../game/tileset';
import { presetById, PRESETS } from '../../model/sampleProject';
import { useEditor } from '../context';
import type { TileSize } from '../state';
import { C, SANS, secondaryButton, sectionLabel, seg, segGroup } from '../ui';
import { ImageSlot } from './ImageSlot';

const TILE_SIZES: TileSize[] = ['8px', '16px', '32px'];
const section = { display: 'flex', flexDirection: 'column', gap: 8 } as const;
const hint = { font: `400 11.5px/1.45 ${SANS}`, color: C.dim } as const;

export function ArtStyleTab() {
  const { state, edit } = useEditor();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={section}>
        <div style={sectionLabel}>Palette</div>
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
        <div style={sectionLabel}>Art tile size</div>
        <div style={segGroup}>
          {TILE_SIZES.map((v) => (
            <button key={v} style={seg(state.tile === v)} onClick={() => edit({ tile: v })}>
              {v}
            </button>
          ))}
        </div>
        <div style={hint}>Pixels per tile in your tilesets and sprite sheets. The game scales them to the screen without blurring.</div>
      </div>
      <div style={section}>
        <div style={sectionLabel}>Area art</div>
        <div style={hint}>
          A tileset replaces the flat palette look in that area's rooms; a backdrop is drawn behind them with parallax. Start from the template: it's
          laid out 4 tiles wide, with wall pieces first and then platforms, hazards and blocks. Any tile you leave transparent keeps the built-in look.
        </div>
        {state.areas.map((a) => (
          <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 6, border: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: a.color }} />
              <span style={{ flex: 1, font: `500 12.5px ${SANS}`, color: C.text }}>{a.name}</span>
              <button
                className="vw-btn-secondary"
                title="Download a starter tileset in this area's palette"
                onClick={() => {
                  const P = presetById(a.style ?? state.style);
                  const url = tilesetTemplate(P, parseInt(state.tile, 10) || 16);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `${a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-tileset.png`;
                  link.click();
                }}
                style={{ ...secondaryButton, height: 24, font: `500 11px ${SANS}` }}
              >
                Template
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={{ height: 76 }}>
                <ImageSlot
                  id={`tileset-${a.id}`}
                  placeholder="Tileset"
                  link={(present, s) => ({ areas: s.areas.map((x) => (x.id === a.id ? { ...x, tileset: present ? `tileset-${a.id}` : undefined } : x)) })}
                />
              </div>
              <div style={{ height: 76 }}>
                <ImageSlot
                  id={`backdrop-${a.id}`}
                  placeholder="Backdrop"
                  link={(present, s) => ({ areas: s.areas.map((x) => (x.id === a.id ? { ...x, backdrop: present ? `backdrop-${a.id}` : undefined } : x)) })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
