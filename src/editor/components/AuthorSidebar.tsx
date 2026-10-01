import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../../game/audio';
import { DOOR_KINDS } from '../../model/entities';
import { PRESETS } from '../../model/sampleProject';
import { imageToMask, ImportError, mapFileToMask, maskToRooms } from '../../model/trace';
import type { Area, DoorKind } from '../../model/types';
import { useEditor } from '../context';
import { ImageSlot } from './ImageSlot';
import { sideLinks } from './MapBoard';
import type { Source } from '../state';
import { C, dangerButton, MONO, SANS, sectionLabel, secondaryButton, seg, segGroup, swatch, textInput, toggle } from '../ui';

const SOURCES: [Source, string][] = [
  ['image', 'Image'],
  ['tiled', 'Tiled / LDtk'],
  ['draw', 'Draw'],
];

const sidebar = {
  width: 264,
  flex: 'none',
  borderRight: `1px solid ${C.line}`,
  background: C.panel,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
} as const;

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

const smallInput = { ...textInput, height: 26, width: 54, font: `500 12px ${MONO}`, padding: '0 6px' };

/** Left panel while authoring: map source, map settings, overlays, room list and room inspector. */
export function AuthorSidebar() {
  const { state, set, edit, flash, check, replaceRooms } = useEditor();
  const fileInput = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const src = state.images['map-source'];
  useEffect(() => {
    if (!src) return setImg(null);
    pixels(src).then((p) => setImg({ w: p.w, h: p.h }), () => setImg(null));
  }, [src]);

  const retrace = async () => {
    if (!src) return flash('Add a map image first');
    try {
      const p = await pixels(src);
      const mask = imageToMask(p.data, p.w, p.h, state.grid.w, state.grid.h, state.threshold);
      const { rooms, seq } = maskToRooms(mask, state.seq);
      if (!rooms.length) return flash('Nothing traced. Try a higher threshold');
      replaceRooms(rooms, `Traced ${rooms.length} rooms at threshold ${state.threshold}. Undo to go back`);
      edit({ seq });
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
    } catch (e) {
      flash(e instanceof ImportError ? e.message : `Couldn't read ${f.name}`);
    }
  };

  return (
    <aside style={sidebar}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 14, borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={sectionLabel}>Raw map</div>
          <div style={segGroup}>
            {SOURCES.map(([id, label]) => (
              <button
                key={id}
                style={seg(state.source === id)}
                onClick={() => set((s) => ({ source: id, tool: id === 'draw' ? 'draw' : s.tool }))}
              >
                {label}
              </button>
            ))}
          </div>
          {state.source === 'image' && (
            <>
              <div style={{ height: 84 }}>
                <ImageSlot id="map-source" placeholder="Map sketch" />
              </div>
              <div style={{ font: `400 11px ${MONO}`, color: C.muted }}>
                {img ? `${img.w}×${img.h} → ${state.grid.w}×${state.grid.h} cells` : 'Drop a sketch: dark strokes on light, or light on dark'}
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: `400 11.5px ${SANS}`, color: C.muted }}>
                Trace threshold · {state.threshold}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.threshold}
                  onChange={(e) => edit({ threshold: +e.target.value }, 'threshold')}
                  style={{ accentColor: C.accent, width: '100%' }}
                />
              </label>
              <button className="vw-btn-secondary" style={{ ...secondaryButton, padding: 0 }} onClick={retrace} disabled={!src}>
                Re-trace regions
              </button>
            </>
          )}
          {state.source === 'tiled' && (
            <>
              <button className="vw-btn-secondary" style={{ ...secondaryButton, padding: 0 }} onClick={() => fileInput.current?.click()}>
                Import Tiled or LDtk map…
              </button>
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
              <div style={{ font: `400 11.5px/1.45 ${SANS}`, color: C.muted }}>
                Tiled maps saved as JSON (.tmj) use their first tile layer; LDtk projects use the first IntGrid layer. Each
                non-empty tile becomes a room cell.
              </div>
            </>
          )}
          {state.source === 'draw' && (
            <div style={{ font: `400 12px/1.5 ${SANS}`, color: C.muted }}>
              Press <span style={{ fontFamily: MONO, color: C.text }}>B</span> and drag on the grid to add a room. Rooms
              that share an edge get a doorway.
            </div>
          )}
        </div>

        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLabel}>Map</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `400 12px ${SANS}`, color: C.muted }}>
            Grid
            <input
              aria-label="Grid width"
              type="number"
              min={4}
              max={200}
              value={state.grid.w}
              onChange={(e) => {
                const w = Math.max(4, Math.min(200, Math.round(+e.target.value) || 4));
                edit((s) => ({ grid: { ...s.grid, w: Math.max(w, ...s.rooms.map((r) => r.x + r.w)) } }), 'grid');
              }}
              style={smallInput}
            />
            ×
            <input
              aria-label="Grid height"
              type="number"
              min={4}
              max={200}
              value={state.grid.h}
              onChange={(e) => {
                const h = Math.max(4, Math.min(200, Math.round(+e.target.value) || 4));
                edit((s) => ({ grid: { ...s.grid, h: Math.max(h, ...s.rooms.map((r) => r.y + r.h)) } }), 'grid');
              }}
              style={smallInput}
            />
            cells
          </div>
          <AreaList />
        </div>

        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={sectionLabel}>Overlays</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={toggle(state.showItems)} onClick={() => set((s) => ({ showItems: !s.showItems }))}>
              Items
            </button>
            <button style={toggle(state.showRoute)} onClick={() => set((s) => ({ showRoute: !s.showRoute }))}>
              Route
            </button>
            <button style={toggle(state.showReach)} onClick={() => set((s) => ({ showReach: !s.showReach }))} title="Tint every tile the player can reach">
              Reach
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 14px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={sectionLabel}>Rooms</div>
          <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>{state.rooms.length}</div>
        </div>
        <div style={{ padding: '0 8px 8px' }}>
          {state.rooms.map((r) => (
            <div
              key={r.id}
              onClick={() => set({ selRoom: r.id })}
              onDoubleClick={() => set({ selRoom: r.id, editRoom: r.id })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 28,
                padding: '0 8px',
                borderRadius: 4,
                cursor: 'pointer',
                background: state.selRoom === r.id ? C.fieldHover : 'transparent',
                font: `400 12.5px ${SANS}`,
                color: C.text,
              }}
            >
              <span
                title={check.reached.has(r.id) ? 'Reachable' : "Can't be entered"}
                style={{ width: 6, height: 6, borderRadius: '50%', flex: 'none', background: check.reached.has(r.id) ? C.ok : C.bad }}
              />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span style={{ font: `400 10.5px ${MONO}`, color: C.dim }}>
                {r.w}×{r.h}
              </span>
            </div>
          ))}
        </div>
      </div>

      <RoomInspector />
    </aside>
  );
}

const THEME_IDS = Object.keys(THEMES).filter((t) => t !== 'boss' && t !== 'escape');

/** Areas: regions with their own map colour, palette and music. */
function AreaList() {
  const { state, edit } = useEditor();
  const setArea = (id: string, patch: Partial<Area>, merge?: string) =>
    edit((s) => ({ areas: s.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), merge);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {state.areas.map((a) => (
        <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 22px', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            aria-label={`${a.name} colour`}
            value={a.color}
            onChange={(e) => setArea(a.id, { color: e.target.value }, `area-color:${a.id}`)}
            style={{ width: 22, height: 22, padding: 0, border: 0, background: 'none' }}
          />
          <input value={a.name} aria-label="Area name" onChange={(e) => setArea(a.id, { name: e.target.value }, `area-name:${a.id}`)} style={{ ...textInput, height: 26 }} />
          <button
            aria-label={`Delete ${a.name}`}
            disabled={state.areas.length < 2}
            onClick={() =>
              edit((s) => ({
                areas: s.areas.filter((x) => x.id !== a.id),
                rooms: s.rooms.map((r) => (r.area === a.id ? { ...r, area: undefined } : r)),
              }))
            }
            style={{ border: 0, background: 'none', color: state.areas.length < 2 ? C.faint : C.muted, cursor: 'pointer' }}
          >
            ×
          </button>
          <span />
          <div style={{ display: 'flex', gap: 4 }}>
            <select aria-label="Palette" value={a.style ?? ''} onChange={(e) => setArea(a.id, { style: e.target.value || undefined })} style={{ ...textInput, height: 24, flex: 1, minWidth: 0, font: `400 11px ${SANS}` }}>
              <option value="">Project style</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select aria-label="Music" value={a.music ?? ''} onChange={(e) => setArea(a.id, { music: e.target.value || undefined })} style={{ ...textInput, height: 24, flex: 1, minWidth: 0, font: `400 11px ${SANS}` }}>
              <option value="">Surface</option>
              {THEME_IDS.map((t) => (
                <option key={t} value={t}>
                  {THEMES[t].name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <button
        className="vw-btn-secondary"
        style={{ ...secondaryButton, height: 26 }}
        onClick={() =>
          edit((s) => ({
            areas: [...s.areas, { id: `a${s.seq}`, name: `Area ${s.areas.length + 1}`, color: AREA_COLORS[s.areas.length % AREA_COLORS.length] }],
            seq: s.seq + 1,
          }))
        }
      >
        + Area
      </button>
    </div>
  );
}

const AREA_COLORS = ['#a597c4', '#5ec4e8', '#e0584f', '#4fbf6a', '#e8c94a', '#c27ee8', '#ff9a5c'];

function RoomInspector() {
  const { state, roomById, colorOf, set, edit, place, unplace, deleteRoom } = useEditor();
  const room = state.selRoom ? roomById[state.selRoom] : undefined;
  if (!room) return null;
  const links = sideLinks(state.rooms).filter((l) => l.a.id === room.id || l.b.id === room.id);
  const corridor = room.w === 1 || room.h === 1;
  const items = state.nodes.filter((n) => n.room === room.id);
  return (
    <div
      style={{
        borderTop: `1px solid ${C.line}`,
        padding: '12px 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: C.panelDeep,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={sectionLabel}>Inspector</div>
        <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>
          {room.w}×{room.h} · {corridor ? 'corridor' : 'room'}
        </div>
      </div>
      <input
        value={room.name}
        aria-label="Room name"
        onChange={(e) => {
          const name = e.target.value;
          edit((s) => ({ rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, name } : r)) }), `name:${room.id}`);
        }}
        style={textInput}
      />
      <select
        aria-label="Area"
        value={room.area ?? state.areas[0]?.id ?? ''}
        onChange={(e) => {
          const area = e.target.value;
          edit((s) => ({ rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, area } : r)) }));
        }}
        style={{ ...textInput, height: 28 }}
      >
        {state.areas.map((a) => (
          <option key={a.id} value={a.id}>
            Area: {a.name}
          </option>
        ))}
      </select>
      {links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {links.map((l) => {
            const other = l.a.id === room.id ? l.b : l.a;
            const spec = state.doors[l.key];
            return (
              <div key={l.key} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0, font: `400 11.5px ${SANS}`, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ↔ {other.name}
                </span>
                <select
                  aria-label={`Hatch to ${other.name}`}
                  value={spec?.kind ?? 'open'}
                  onChange={(e) => {
                    const kind = e.target.value as DoorKind;
                    edit((s) => {
                      const doors = { ...s.doors };
                      if (kind === 'open') delete doors[l.key];
                      else doors[l.key] = { kind, ...(kind === 'grey' ? { flag: s.doors[l.key]?.flag ?? 'boss1' } : {}) };
                      return { doors };
                    });
                  }}
                  style={{ ...textInput, height: 24, width: 116, font: `400 11px ${SANS}`, padding: '0 4px' }}
                >
                  {DOOR_KINDS.map((d) => (
                    <option key={d.kind} value={d.kind}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {spec?.kind === 'grey' && (
                  <input
                    aria-label="Opens on flag"
                    value={spec.flag ?? ''}
                    onChange={(e) => {
                      const flag = e.target.value;
                      edit((s) => ({ doors: { ...s.doors, [l.key]: { kind: 'grey', flag } } }), `flag:${l.key}`);
                    }}
                    style={{ ...textInput, height: 24, width: 60, font: `400 11px ${MONO}`, padding: '0 4px' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((n) => (
          <div
            key={n.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 26,
              padding: '0 6px',
              borderRadius: 4,
              background: '#22262d',
              font: `400 12px ${SANS}`,
              color: C.text,
            }}
          >
            <span style={swatch(n, colorOf(n))} />
            <span style={{ flex: 1 }}>{n.label}</span>
            <button
              className="vw-remove"
              aria-label={`Remove ${n.label} from ${room.name}`}
              onClick={() => unplace(n.id)}
              style={{ border: 0, background: 'none', color: C.muted, cursor: 'pointer', font: `400 12px ${MONO}` }}
            >
              ×
            </button>
          </div>
        ))}
        <select
          value=""
          onChange={(e) => e.target.value && place(e.target.value, room.id)}
          style={{
            height: 28,
            borderRadius: 5,
            border: `1px solid ${C.lineStrong}`,
            background: C.bg,
            color: C.muted,
            font: `400 12px ${SANS}`,
            padding: '0 6px',
          }}
        >
          <option value="">Override: assign key / gate…</option>
          {state.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
              {n.room && roomById[n.room] ? ` (in ${roomById[n.room].name})` : ''}
            </option>
          ))}
        </select>
      </div>
      <button className="vw-btn-secondary" style={secondaryButton} onClick={() => set({ editRoom: room.id })}>
        {room.tiles ? 'Edit tiles' : 'Paint tiles'}
      </button>
      <button style={dangerButton} onClick={() => deleteRoom(room.id)}>
        Delete room
      </button>
    </div>
  );
}
