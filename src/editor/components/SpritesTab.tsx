import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ENEMY_STATES, PLAYER_STATES } from '../../game/rig';
import { BOSS_KINDS, ENEMY_ARCHETYPES } from '../../model/entities';
import type { SpriteSheet } from '../../model/types';
import { useEditor } from '../context';
import { C, MONO, SANS, secondaryButton, sectionLabel, textInput } from '../ui';
import { ImageSlot } from './ImageSlot';

const CHARACTERS = ['player', ...ENEMY_ARCHETYPES, ...BOSS_KINDS];
const statesFor = (id: string): readonly string[] => (id === 'player' ? PLAYER_STATES : ENEMY_STATES);

export class AsepriteError extends Error {}

/**
 * Reads an Aseprite sprite sheet export (JSON, hash or array) into frame size and clips.
 * Each frame tag becomes a clip named after the tag; frames are numbered across the sheet grid.
 */
export function parseAseprite(text: string, states: readonly string[]): Pick<SpriteSheet, 'frameW' | 'frameH' | 'clips'> {
  let j: { frames?: unknown; meta?: { size?: { w: number }; frameTags?: { name: string; from: number; to: number; direction?: string }[] } };
  try {
    j = JSON.parse(text);
  } catch {
    throw new AsepriteError("This isn't a JSON file. In Aseprite, use File > Export Sprite Sheet with JSON data.");
  }
  type F = { frame: { x: number; y: number; w: number; h: number }; duration?: number };
  const frames: F[] = Array.isArray(j.frames) ? (j.frames as F[]) : Object.values((j.frames ?? {}) as Record<string, F>);
  if (!frames.length || !frames[0].frame) throw new AsepriteError('No frames found in the Aseprite data.');
  const fw = frames[0].frame.w;
  const fh = frames[0].frame.h;
  const cols = Math.max(1, Math.floor((j.meta?.size?.w ?? fw) / fw));
  const index = (f: F) => Math.round(f.frame.y / fh) * cols + Math.round(f.frame.x / fw);
  const clips: SpriteSheet['clips'] = {};
  const tags = j.meta?.frameTags ?? [];
  tags.forEach((t) => {
    const name = states.find((s) => s.toLowerCase() === t.name.toLowerCase()) ?? t.name;
    const list = frames.slice(t.from, t.to + 1);
    let idx = list.map(index);
    if (t.direction === 'reverse') idx = idx.reverse();
    if (t.direction === 'pingpong') idx = [...idx, ...idx.slice(1, -1).reverse()];
    clips[name] = { frames: idx, fps: Math.round(1000 / (list[0]?.duration ?? 100)), loop: !/hurt|jump|die/i.test(name) };
  });
  if (!tags.length) clips[states[0]] = { frames: frames.map(index), fps: Math.round(1000 / (frames[0].duration ?? 100)), loop: true };
  return { frameW: fw, frameH: fh, clips };
}

/** Animation editor: sprite sheets per character, cut into clips per animation state. */
export function SpritesTab() {
  const { state, edit, flash } = useEditor();
  const [char, setChar] = useState('player');
  const [clipName, setClipName] = useState<string>('idle');
  const json = useRef<HTMLInputElement>(null);
  const states = statesFor(char);
  const slot = `sprite:${char}`;
  const sheet: SpriteSheet | undefined = state.sprites[char];
  const img = state.images[slot];

  const setSheet = (patch: Partial<SpriteSheet>, merge?: string) =>
    edit((s) => {
      const blank: SpriteSheet = { image: slot, frameW: 16, frameH: 16, clips: {} };
      return { sprites: { ...s.sprites, [char]: { ...(s.sprites[char] ?? blank), ...patch } } };
    }, merge);
  const clip = sheet?.clips[clipName];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: `400 12px/1.5 ${SANS}`, color: C.muted }}>
        Characters use the built-in animated rig until you give them a sheet. Clips are named after animation states; any state without a clip
        keeps the rig.
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: `400 12px ${SANS}`, color: C.muted }}>
        Character
        <select
          value={char}
          onChange={(e) => {
            setChar(e.target.value);
            setClipName(statesFor(e.target.value)[0]);
          }}
          style={{ ...textInput, height: 30 }}
        >
          {CHARACTERS.map((c) => (
            <option key={c} value={c}>
              {c === 'player' ? 'Player' : `${c} ${BOSS_KINDS.includes(c as never) ? '(boss)' : '(enemy)'}`}
              {state.sprites[c] ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </label>
      <div style={{ height: 110 }}>
        <ImageSlot id={slot} placeholder="Sprite sheet" />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', font: `400 12px ${SANS}`, color: C.muted }}>
        Frame
        <input
          aria-label="Frame width"
          type="number"
          min={1}
          value={sheet?.frameW ?? 16}
          onChange={(e) => setSheet({ frameW: Math.max(1, +e.target.value | 0) }, `fw:${char}`)}
          style={{ ...textInput, width: 60, height: 26 }}
        />
        ×
        <input
          aria-label="Frame height"
          type="number"
          min={1}
          value={sheet?.frameH ?? 16}
          onChange={(e) => setSheet({ frameH: Math.max(1, +e.target.value | 0) }, `fh:${char}`)}
          style={{ ...textInput, width: 60, height: 26 }}
        />
        px
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="vw-btn-secondary" style={{ ...secondaryButton, flex: 1 }} onClick={() => json.current?.click()}>
          Import Aseprite JSON…
        </button>
        {sheet && (
          <button
            className="vw-btn-secondary"
            style={secondaryButton}
            onClick={() =>
              edit((s) => {
                const sprites = { ...s.sprites };
                delete sprites[char];
                return { sprites };
              })
            }
          >
            Use rig
          </button>
        )}
      </div>
      <input
        ref={json}
        type="file"
        accept=".json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const r = parseAseprite(await f.text(), states);
            setSheet(r);
            flash(`Imported ${Object.keys(r.clips).length} clips from ${f.name}. Add the PNG above if you haven't`);
          } catch (err) {
            flash(err instanceof AsepriteError ? err.message : `Couldn't read ${f.name}`);
          }
        }}
      />

      <div style={sectionLabel}>Clips</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {states.map((st) => (
          <button
            key={st}
            aria-pressed={clipName === st}
            onClick={() => setClipName(st)}
            style={{
              height: 24,
              padding: '0 8px',
              borderRadius: 12,
              border: `1px solid ${clipName === st ? C.accent : C.lineStrong}`,
              background: 'transparent',
              color: sheet?.clips[st] ? C.text : C.dim,
              font: `500 11.5px ${SANS}`,
              cursor: 'pointer',
            }}
          >
            {st}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, font: `400 12px ${SANS}`, color: C.muted }}>
        Frames for “{clipName}” (sheet indices, left to right, top to bottom)
        <input
          value={clip?.frames.join(', ') ?? ''}
          placeholder="e.g. 0, 1, 2, 3"
          onChange={(e) => {
            const frames = e.target.value
              .split(/[,\s]+/)
              .map((x) => parseInt(x, 10))
              .filter((n) => Number.isInteger(n) && n >= 0);
            setSheet({ clips: { ...sheet?.clips, [clipName]: { fps: clip?.fps ?? 10, loop: clip?.loop ?? true, frames } } }, `clip:${char}:${clipName}`);
          }}
          style={{ ...textInput, height: 28, fontFamily: MONO, fontSize: 12 }}
        />
      </label>
      {clip && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', font: `400 12px ${SANS}`, color: C.muted }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            fps
            <input
              type="number"
              min={1}
              max={60}
              value={clip.fps}
              onChange={(e) => setSheet({ clips: { ...sheet!.clips, [clipName]: { ...clip, fps: Math.max(1, +e.target.value) } } }, `fps:${char}:${clipName}`)}
              style={{ ...textInput, width: 56, height: 26 }}
            />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={clip.loop}
              onChange={(e) => setSheet({ clips: { ...sheet!.clips, [clipName]: { ...clip, loop: e.target.checked } } })}
              style={{ accentColor: C.accent }}
            />
            Loop
          </label>
        </div>
      )}
      {img && (
        <FrameGrid
          src={img}
          sheet={sheet ?? { image: slot, frameW: 16, frameH: 16, clips: {} }}
          frames={clip?.frames ?? []}
          onChange={(frames) =>
            setSheet({ clips: { ...sheet?.clips, [clipName]: { fps: clip?.fps ?? 10, loop: clip?.loop ?? true, frames } } }, `clip:${char}:${clipName}`)
          }
        />
      )}
      {sheet && img && clip && <Preview src={img} sheet={sheet} clip={clipName} />}
    </div>
  );
}

function Preview({ src, sheet, clip }: { src: string; sheet: SpriteSheet; clip: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.src = src;
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      const c = ref.current;
      const ctx = c?.getContext('2d');
      const cl = sheet.clips[clip];
      if (c && ctx && cl?.frames.length && img.complete && img.naturalWidth) {
        const i = Math.floor(((performance.now() - t0) / 1000) * cl.fps);
        const f = cl.frames[cl.loop ? i % cl.frames.length : Math.min(i, cl.frames.length - 1)];
        const cols = Math.max(1, Math.floor(img.naturalWidth / sheet.frameW));
        const scale = Math.max(1, Math.floor(Math.min(c.width / sheet.frameW, c.height / sheet.frameH)));
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(
          img,
          (f % cols) * sheet.frameW,
          Math.floor(f / cols) * sheet.frameH,
          sheet.frameW,
          sheet.frameH,
          (c.width - sheet.frameW * scale) / 2,
          (c.height - sheet.frameH * scale) / 2,
          sheet.frameW * scale,
          sheet.frameH * scale,
        );
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [src, sheet, clip]);
  return <canvas ref={ref} width={300} height={140} aria-label="Clip preview" style={{ width: '100%', height: 140, background: C.canvas, borderRadius: 6, border: `1px solid ${C.line}` }} />;
}

/** The sheet cut into its frame grid: click frames to add them to the clip in order, right-click to take one out. */
function FrameGrid({ src, sheet, frames, onChange }: { src: string; sheet: SpriteSheet; frames: number[]; onChange(f: number[]): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);
  const cols = dims ? Math.max(1, Math.floor(dims.w / sheet.frameW)) : 1;
  const rows = dims ? Math.max(1, Math.floor(dims.h / sheet.frameH)) : 1;
  const scale = dims ? Math.max(1, Math.min(4, Math.floor(300 / dims.w))) : 1;
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !dims) return;
    const img = new Image();
    img.src = src;
    const draw = () => {
      c.width = dims.w * scale;
      c.height = dims.h * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const fw = sheet.frameW * scale;
      const fh = sheet.frameH * scale;
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      for (let x = 0; x <= cols; x++) ctx.strokeRect(x * fw + 0.5, 0, 0, rows * fh);
      for (let y = 0; y <= rows; y++) ctx.strokeRect(0, y * fh + 0.5, cols * fw, 0);
      frames.forEach((f, i) => {
        const x = (f % cols) * fw;
        const y = Math.floor(f / cols) * fh;
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, fw - 2, fh - 2);
        ctx.fillStyle = C.accent;
        ctx.fillRect(x + 1, y + 1, 14, 12);
        ctx.fillStyle = C.bar;
        ctx.font = `700 9px ${MONO}`;
        ctx.fillText(String(i + 1), x + 3, y + 10);
      });
    };
    if (img.complete) draw();
    else img.onload = draw;
  }, [src, dims, sheet.frameW, sheet.frameH, frames, cols, rows, scale]);
  const frameAt = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - b.left) / b.width) * (dims?.w ?? 1) / sheet.frameW);
    const y = Math.floor(((e.clientY - b.top) / b.height) * (dims?.h ?? 1) / sheet.frameH);
    return x < cols && y < rows ? y * cols + x : -1;
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', font: `400 11.5px ${SANS}`, color: C.dim }}>
        Click frames in order; right-click removes one
        <button onClick={() => onChange([])} disabled={!frames.length} style={{ ...secondaryButton, height: 22, font: `500 11px ${SANS}` }}>
          Clear
        </button>
      </div>
      <div style={{ overflow: 'auto', maxHeight: 260, background: C.canvas, borderRadius: 6, border: `1px solid ${C.line}` }}>
        <canvas
          ref={ref}
          aria-label="Sprite sheet frames"
          onClick={(e) => {
            const f = frameAt(e);
            if (f >= 0) onChange([...frames, f]);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const f = frameAt(e);
            const i = frames.lastIndexOf(f);
            if (i >= 0) onChange(frames.filter((_, k) => k !== i));
          }}
          style={{ display: 'block', cursor: 'pointer', imageRendering: 'pixelated' }}
        />
      </div>
    </div>
  );
}
