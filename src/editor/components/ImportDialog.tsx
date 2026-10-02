import { useEffect, useRef, useState } from 'react';
import { imageToMask, ImportError, mapFileToMask, maskToRooms } from '../../model/trace';
import { useEditor } from '../context';
import type { Source } from '../state';
import { C, MONO, primaryButton, SANS, secondaryButton, seg, segGroup } from '../ui';
import { ImageSlot } from './ImageSlot';

const SOURCES: [Exclude<Source, 'draw'>, string][] = [
  ['image', 'Trace an image'],
  ['tiled', 'Tiled / LDtk'],
];

/** Reads an image data URL into pixels. */
function pixels(src: string): Promise<{ data: Uint8ClampedArray; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(img.naturalWidth, 2048);
      const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('no canvas'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ data: ctx.getImageData(0, 0, w, h).data, w, h });
    };
    img.onerror = () => reject(new Error("Couldn't read the image."));
    img.src = src;
  });
}

/** Project → Import: turn a sketch, or a Tiled or LDtk map, into rooms. Replaces the current rooms (undoable). */
export function ImportDialog() {
  const { state, set, edit, flash, replaceRooms } = useEditor();
  const fileInput = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const source = state.source === 'tiled' ? 'tiled' : 'image';
  const src = state.images['map-source'];
  const close = () => set({ importing: false });
  useEffect(() => {
    if (!src) return setImg(null);
    pixels(src).then((p) => setImg({ w: p.w, h: p.h }), () => setImg(null));
  }, [src]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const retrace = async () => {
    if (!src) return flash('Add a map image first');
    try {
      const p = await pixels(src);
      const mask = imageToMask(p.data, p.w, p.h, state.grid.w, state.grid.h, state.threshold);
      const { rooms, seq } = maskToRooms(mask, state.seq);
      if (!rooms.length) return flash('Nothing traced. Try a higher threshold');
      replaceRooms(rooms, `Traced ${rooms.length} rooms at threshold ${state.threshold}. Undo to go back`);
      edit({ seq });
      close();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't trace the image");
    }
  };

  const importMap = async (f: File) => {
    try {
      const mask = mapFileToMask(await f.text());
      const { rooms, seq } = maskToRooms(mask, state.seq);
      replaceRooms(rooms, `Imported ${rooms.length} rooms from ${f.name}. Undo to go back`);
      edit((s) => ({ seq, grid: { w: Math.max(s.grid.w, mask[0]?.length ?? 0), h: Math.max(s.grid.h, mask.length) } }));
      close();
    } catch (e) {
      flash(e instanceof ImportError ? e.message : `Couldn't read ${f.name}`);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,9,11,.72)', display: 'grid', placeItems: 'center', zIndex: 10 }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import a map"
        style={{
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          background: C.panelDeep,
          border: `1px solid ${C.lineStrong}`,
          borderRadius: 8,
          boxShadow: '0 24px 64px rgba(0,0,0,.5)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ font: `600 15px ${SANS}`, color: C.text }}>Import a map</div>
        <div style={{ font: `400 12.5px/1.5 ${SANS}`, color: C.muted }}>Each filled region becomes a room. This replaces the rooms on the map; undo brings them back.</div>
        <div style={segGroup}>
          {SOURCES.map(([id, label]) => (
            <button key={id} style={seg(source === id)} onClick={() => set({ source: id })}>
              {label}
            </button>
          ))}
        </div>
        {source === 'image' ? (
          <>
            <div style={{ height: 120 }}>
              <ImageSlot id="map-source" placeholder="Map sketch" />
            </div>
            <div style={{ font: `400 11px ${MONO}`, color: C.muted }}>
              {img ? `${img.w}×${img.h} → ${state.grid.w}×${state.grid.h} cells` : 'Drop a sketch: dark strokes on light, or light on dark'}
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: `400 11.5px ${SANS}`, color: C.muted }}>
              Trace threshold · {state.threshold}
              <input type="range" min={0} max={100} value={state.threshold} onChange={(e) => edit({ threshold: +e.target.value }, 'threshold')} style={{ accentColor: C.accent, width: '100%' }} />
            </label>
          </>
        ) : (
          <div style={{ font: `400 12px/1.5 ${SANS}`, color: C.muted }}>
            Tiled maps saved as JSON (.tmj) use their first tile layer; LDtk projects use the first IntGrid layer. Each non-empty tile becomes a room cell.
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".tmj,.json,.ldtk"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importMap(f);
            e.target.value = '';
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={close} style={{ ...secondaryButton, height: 30 }}>
            Cancel
          </button>
          {source === 'image' ? (
            <button onClick={retrace} disabled={!src} style={{ ...primaryButton, opacity: src ? 1 : 0.5 }}>
              Trace rooms
            </button>
          ) : (
            <button onClick={() => fileInput.current?.click()} style={primaryButton}>
              Choose file…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
