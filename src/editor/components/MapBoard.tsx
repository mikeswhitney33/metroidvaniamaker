import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { DOOR_KINDS, doorInfo, linkKey } from '../../model/entities';
import { adj } from '../../model/graph';
import { copyRooms, fits, pasteRooms, reshapeNodes, reshapeRoom, type Rect } from '../../model/rooms';
import { Tile, TILES_PER_CELL } from '../../model/tiles';
import type { DoorKind, Room } from '../../model/types';
import type { WorldRoom } from '../../model/world';
import { readClip, writeClip } from '../clipboard';
import { useEditor } from '../context';
import { selectedRooms, type Tool } from '../state';
import { C, MONO, SANS, secondaryButton, seg, segGroup } from '../ui';
import { FlagField } from './Pickers';
import { NodeChip } from './NodeChip';

export const MIN_ZOOM = 6;
export const MAX_ZOOM = 64;
const PAD = 28;

const TOOLS: [Tool, string, string][] = [
  ['select', 'Select', 'V'],
  ['draw', 'Draw room', 'B'],
  ['erase', 'Erase', 'E'],
];

const HINTS: Record<Tool, string> = {
  select: 'Drag rooms to move (Alt copies), drag edges to resize, drag empty space to select. Right-click for more',
  draw: 'Drag on the grid to add a room',
  erase: 'Click a room to delete it',
};

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** What the pointer is doing on the map right now. */
type Gesture =
  | { kind: 'pan'; x: number; y: number; sl: number; st: number }
  | { kind: 'draft'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'move'; ids: string[]; x0: number; y0: number; copy: boolean }
  | { kind: 'resize'; id: string; handle: Handle; x0: number; y0: number; rect: Rect }
  | { kind: 'marquee'; x0: number; y0: number; add: boolean };

/** Live preview of a gesture before it is committed. */
type Preview = { kind: 'move'; dx: number; dy: number } | { kind: 'resize'; rect: Rect } | { kind: 'marquee'; rect: Rect } | null;

/** Side doorways between touching rooms, where hatches go. */
export function sideLinks(rooms: Room[]) {
  const out: { a: Room; b: Room; key: string; x: number; y: number }[] = [];
  rooms.forEach((a, i) =>
    rooms.slice(i + 1).forEach((b) => {
      const j = adj(a, b);
      if (j?.v) out.push({ a, b, key: linkKey(a.id, b.id), x: j.at, y: j.hi });
    }),
  );
  return out;
}

const rectOf = (x0: number, y0: number, x1: number, y1: number): Rect => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  w: Math.abs(x1 - x0) + 1,
  h: Math.abs(y1 - y0) + 1,
});

function resized(r: Rect, h: Handle, dx: number, dy: number): Rect {
  let { x, y, w, h: hh } = r;
  if (h.includes('e')) w = Math.max(1, r.w + dx);
  if (h.includes('s')) hh = Math.max(1, r.h + dy);
  if (h.includes('w')) {
    const nx = Math.min(r.x + r.w - 1, r.x + dx);
    w = r.x + r.w - nx;
    x = nx;
  }
  if (h.includes('n')) {
    const ny = Math.min(r.y + r.h - 1, r.y + dy);
    hh = r.y + r.h - ny;
    y = ny;
  }
  return { x, y, w, h: hh };
}

/** Centre of the author view: tool strip and the room grid. */
export function MapBoard() {
  const api = useEditor();
  const { state, check, set, edit, flash, autoPlace, deleteRooms, playFrom } = api;
  const CELL = state.zoom;
  const { w: GW, h: GH } = state.grid;
  const draft = state.draft;
  const links = useMemo(() => sideLinks(state.rooms), [state.rooms]);
  const sel = selectedRooms(state);
  const selSet = new Set(sel);

  const view = useRef<HTMLDivElement>(null);
  const gridEl = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  const hoverCell = useRef<{ x: number; y: number } | null>(null);
  const zoomAnchor = useRef<{ cx: number; cy: number; gx: number; gy: number } | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; room: string } | null>(null);
  const [hatch, setHatch] = useState<{ key: string; x: number; y: number } | null>(null);

  const issuesByRoom = useMemo(() => {
    const m: Record<string, { errors: number; warns: number }> = {};
    check.issues.forEach((i) => {
      if (!i.room) return;
      const e = (m[i.room] ??= { errors: 0, warns: 0 });
      if (i.sev === 'error') e.errors++;
      else e.warns++;
    });
    return m;
  }, [check.issues]);

  const cellAt = (clientX: number, clientY: number, clamp = true) => {
    const b = gridEl.current!.getBoundingClientRect();
    const x = Math.floor((clientX - b.left) / CELL);
    const y = Math.floor((clientY - b.top) / CELL);
    return clamp ? { x: Math.max(0, Math.min(GW - 1, x)), y: Math.max(0, Math.min(GH - 1, y)) } : { x, y };
  };

  const roomAt = (x: number, y: number) => state.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

  /** Zooms to `next` keeping the point under (cx, cy) in place; defaults to the view's centre. */
  const zoomTo = (next: number, cx?: number, cy?: number) => {
    next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(next)));
    if (next === CELL || !gridEl.current || !view.current) return;
    const v = view.current.getBoundingClientRect();
    const px = cx ?? v.left + v.width / 2;
    const py = cy ?? v.top + v.height / 2;
    const b = gridEl.current.getBoundingClientRect();
    zoomAnchor.current = { cx: px, cy: py, gx: (px - b.left) / CELL, gy: (py - b.top) / CELL };
    set({ zoom: next });
  };

  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    if (!a || !gridEl.current || !view.current) return;
    zoomAnchor.current = null;
    const b = gridEl.current.getBoundingClientRect();
    view.current.scrollLeft += b.left + a.gx * CELL - a.cx;
    view.current.scrollTop += b.top + a.gy * CELL - a.cy;
  }, [CELL]);

  const fit = () => {
    const v = view.current;
    if (!v) return;
    const z = Math.floor(Math.min((v.clientWidth - PAD * 2) / GW, (v.clientHeight - PAD * 2) / GH));
    set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)) });
    v.scrollTo(0, 0);
  };

  // Wheel: Ctrl/⌘ zooms at the cursor (and pinch-zoom on trackpads); plain wheel scrolls.
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(CELL * Math.pow(1.0018, -e.deltaY), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  /** Commits a move or copy of the selected rooms by (dx, dy) cells. */
  const commitMove = (ids: string[], dx: number, dy: number, copy: boolean) => {
    const moving = state.rooms.filter((r) => ids.includes(r.id));
    const ignore = new Set(copy ? [] : ids);
    const targets = moving.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
    if (targets.some((r) => !fits(r, state.rooms, ignore))) {
      flash(copy ? 'The copy would overlap another room' : 'Rooms can’t overlap. Moved back');
      return;
    }
    if (copy) {
      const out = pasteRooms(copyRooms(moving, state.doors), state.rooms, state.seq, { x: Math.min(...targets.map((r) => r.x)), y: Math.min(...targets.map((r) => r.y)) }, state.grid);
      if (!out) return;
      edit((s) => ({
        rooms: [...s.rooms, ...out.rooms],
        doors: { ...s.doors, ...out.doors },
        seq: out.seq,
        selRooms: out.rooms.map((r) => r.id),
        selRoom: out.rooms[0].id,
        grid: growGrid(s.grid, out.rooms),
      }));
      flash(`Copied ${out.rooms.length === 1 ? out.rooms[0].name.replace(/ copy$/, '') : `${out.rooms.length} rooms`}`);
      return;
    }
    edit((s) => ({ rooms: s.rooms.map((r) => (ids.includes(r.id) ? { ...r, x: r.x + dx, y: r.y + dy } : r)), grid: growGrid(s.grid, targets) }));
  };

  const commitResize = (id: string, rect: Rect) => {
    const room = state.rooms.find((r) => r.id === id);
    if (!room) return;
    if (!fits(rect, state.rooms, new Set([id]))) {
      flash('Rooms can’t overlap. Size unchanged');
      return;
    }
    if (rect.x === room.x && rect.y === room.y && rect.w === room.w && rect.h === room.h) return;
    edit((s) => {
      const before = s.rooms.find((r) => r.id === id)!;
      const after = reshapeRoom(before, rect);
      return { rooms: s.rooms.map((r) => (r.id === id ? after : r)), nodes: reshapeNodes(s.nodes, before, after), grid: growGrid(s.grid, [after]) };
    });
    flash(`${room.name} is now ${rect.w}×${rect.h}`);
  };

  const copySel = () => {
    const rooms = state.rooms.filter((r) => selSet.has(r.id));
    if (!rooms.length) return;
    writeClip(copyRooms(rooms, state.doors));
    flash(`Copied ${rooms.length === 1 ? rooms[0].name : `${rooms.length} rooms`}`);
  };

  const paste = (at?: { x: number; y: number }) => {
    const clip = readClip();
    if (!clip) return flash('Nothing to paste. Copy rooms first');
    const first = clip.rooms[0];
    const out = pasteRooms(clip, state.rooms, state.seq, at ?? { x: first.x + 1, y: first.y + 1 }, state.grid);
    if (!out) return flash('No free space for the pasted rooms');
    edit((s) => ({
      rooms: [...s.rooms, ...out.rooms],
      doors: { ...s.doors, ...out.doors },
      seq: out.seq,
      selRooms: out.rooms.map((r) => r.id),
      selRoom: out.rooms[0].id,
      grid: growGrid(s.grid, out.rooms),
    }));
    flash(`Pasted ${out.rooms.length === 1 ? out.rooms[0].name : `${out.rooms.length} rooms`}`);
  };

  const duplicate = (ids: string[]) => {
    const rooms = state.rooms.filter((r) => ids.includes(r.id));
    if (!rooms.length) return;
    const out = pasteRooms(copyRooms(rooms, state.doors), state.rooms, state.seq, { x: Math.min(...rooms.map((r) => r.x)) + 1, y: Math.min(...rooms.map((r) => r.y)) + 1 }, state.grid);
    if (!out) return flash('No free space for a copy');
    edit((s) => ({
      rooms: [...s.rooms, ...out.rooms],
      doors: { ...s.doors, ...out.doors },
      seq: out.seq,
      selRooms: out.rooms.map((r) => r.id),
      selRoom: out.rooms[0].id,
      grid: growGrid(s.grid, out.rooms),
    }));
  };

  // Map shortcuts: delete, nudge, copy/paste/duplicate, select all, fit, pan with Space.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        space.current = true;
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyC') return copySel();
      if (mod && e.code === 'KeyV') {
        e.preventDefault();
        return paste(hoverCell.current ?? undefined);
      }
      if (mod && e.code === 'KeyD') {
        e.preventDefault();
        return duplicate(sel);
      }
      if (mod && e.code === 'KeyA') {
        e.preventDefault();
        return set({ selRooms: state.rooms.map((r) => r.id), selRoom: state.rooms[0]?.id ?? null });
      }
      if (mod) return;
      if (e.code === 'KeyF') return fit();
      if (e.code === 'KeyP' && state.selRoom) return playFrom(state.selRoom);
      if (e.code === 'Escape') {
        setMenu(null);
        setHatch(null);
        return set({ selRooms: [], selRoom: null });
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && sel.length) {
        e.preventDefault();
        return deleteRooms(sel);
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const a = arrows[e.code];
      if (a && sel.length) {
        e.preventDefault();
        const k = e.shiftKey ? 4 : 1;
        commitMove(sel, a[0] * k, a[1] * k, false);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    setMenu(null);
    if (e.button === 2) return;
    const target = e.target as HTMLElement;
    if (target.closest('[draggable="true"],[data-hatch],[data-pin]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || space.current) {
      e.preventDefault();
      const v = view.current!;
      gesture.current = { kind: 'pan', x: e.clientX, y: e.clientY, sl: v.scrollLeft, st: v.scrollTop };
      return;
    }
    const c = cellAt(e.clientX, e.clientY);
    if (state.tool === 'draw') {
      gesture.current = { kind: 'draft', x0: c.x, y0: c.y, x1: c.x, y1: c.y };
      set({ draft: { x0: c.x, y0: c.y, x1: c.x, y1: c.y } });
      return;
    }
    const room = roomAt(c.x, c.y);
    if (state.tool === 'erase') {
      if (room) deleteRooms([room.id]);
      return;
    }
    const handle = target.closest<HTMLElement>('[data-handle]');
    if (handle && state.selRoom) {
      const r = state.rooms.find((x) => x.id === state.selRoom)!;
      gesture.current = { kind: 'resize', id: r.id, handle: handle.dataset.handle as Handle, x0: c.x, y0: c.y, rect: { x: r.x, y: r.y, w: r.w, h: r.h } };
      setPreview({ kind: 'resize', rect: { x: r.x, y: r.y, w: r.w, h: r.h } });
      return;
    }
    if (room) {
      let ids = sel;
      if (e.shiftKey) {
        ids = selSet.has(room.id) ? sel.filter((x) => x !== room.id) : [...sel, room.id];
        set({ selRooms: ids, selRoom: ids.includes(room.id) ? room.id : (ids.at(-1) ?? null) });
        if (!ids.includes(room.id)) return;
      } else if (!selSet.has(room.id)) {
        ids = [room.id];
        set({ selRooms: ids, selRoom: room.id });
      } else set({ selRoom: room.id });
      gesture.current = { kind: 'move', ids, x0: c.x, y0: c.y, copy: e.altKey };
      return;
    }
    gesture.current = { kind: 'marquee', x0: c.x, y0: c.y, add: e.shiftKey };
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const raw = cellAt(e.clientX, e.clientY, false);
    hoverCell.current = raw.x >= 0 && raw.y >= 0 && raw.x < GW && raw.y < GH ? raw : null;
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') {
      view.current!.scrollLeft = g.sl - (e.clientX - g.x);
      view.current!.scrollTop = g.st - (e.clientY - g.y);
      return;
    }
    const c = cellAt(e.clientX, e.clientY);
    if (g.kind === 'draft') {
      if (c.x !== g.x1 || c.y !== g.y1) {
        g.x1 = c.x;
        g.y1 = c.y;
        set({ draft: { x0: g.x0, y0: g.y0, x1: c.x, y1: c.y } });
      }
    } else if (g.kind === 'move') {
      const dx = raw.x - g.x0;
      const dy = raw.y - g.y0;
      if (preview?.kind !== 'move' || preview.dx !== dx || preview.dy !== dy) setPreview({ kind: 'move', dx, dy });
    } else if (g.kind === 'resize') {
      setPreview({ kind: 'resize', rect: resized(g.rect, g.handle, raw.x - g.x0, raw.y - g.y0) });
    } else if (g.kind === 'marquee') {
      setPreview({ kind: 'marquee', rect: rectOf(g.x0, g.y0, c.x, c.y) });
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    const p = preview;
    setPreview(null);
    if (!g) return;
    if (g.kind === 'draft') finishDraft(g);
    else if (g.kind === 'move' && p?.kind === 'move' && (p.dx || p.dy)) commitMove(g.ids, p.dx, p.dy, g.copy);
    else if (g.kind === 'resize' && p?.kind === 'resize') commitResize(g.id, p.rect);
    else if (g.kind === 'marquee') {
      if (!p || p.kind !== 'marquee' || (p.rect.w === 1 && p.rect.h === 1)) {
        if (!g.add) set({ selRooms: [], selRoom: null });
        return;
      }
      const hit = state.rooms.filter((r) => r.x < p.rect.x + p.rect.w && p.rect.x < r.x + r.w && r.y < p.rect.y + p.rect.h && p.rect.y < r.y + r.h).map((r) => r.id);
      const ids = g.add ? [...new Set([...sel, ...hit])] : hit;
      set({ selRooms: ids, selRoom: ids[0] ?? null });
    }
  };

  const finishDraft = (d: { x0: number; y0: number; x1: number; y1: number }) => {
    set({ draft: null });
    const seq = state.seq;
    const room: Room = { id: `R${seq}`, name: `Room ${seq}`, ...rectOf(d.x0, d.y0, d.x1, d.y1) };
    if (!fits(room, state.rooms)) {
      flash('Overlaps an existing room');
      return;
    }
    const prev = state.rooms.find((r) => r.id === state.selRoom);
    if (prev?.area) room.area = prev.area;
    edit((s) => ({ rooms: [...s.rooms, room], draft: null, seq: s.seq + 1, selRoom: room.id, selRooms: [room.id] }));
    flash(`Added ${room.name} (${room.w}×${room.h})`);
  };

  const setDoor = (key: string, kind: DoorKind, flag?: string) =>
    edit((s) => {
      const doors = { ...s.doors };
      if (kind === 'open') delete doors[key];
      else doors[key] = { kind, ...(kind === 'grey' ? { flag: flag ?? s.doors[key]?.flag ?? 'boss1' } : {}) };
      return { doors };
    }, flag !== undefined ? `flag:${key}` : undefined);

  const moving = preview?.kind === 'move' ? preview : null;
  const ghostRects: { r: Rect; ok: boolean }[] = [];
  if (moving && (moving.dx || moving.dy)) {
    const copy = gesture.current?.kind === 'move' && gesture.current.copy;
    const ignore = new Set(copy ? [] : sel);
    state.rooms.filter((r) => selSet.has(r.id)).forEach((r) => {
      const t = { x: r.x + moving.dx, y: r.y + moving.dy, w: r.w, h: r.h };
      ghostRects.push({ r: t, ok: fits(t, state.rooms, ignore) });
    });
  }
  if (preview?.kind === 'resize' && state.selRoom) ghostRects.push({ r: preview.rect, ok: fits(preview.rect, state.rooms, new Set([state.selRoom])) });

  const selRoomObj = sel.length === 1 ? state.rooms.find((r) => r.id === sel[0]) : undefined;
  const menuRoom = menu ? state.rooms.find((r) => r.id === menu.room) : undefined;
  const hatchLink = hatch ? links.find((l) => l.key === hatch.key) : undefined;
  const hatchSpec = hatch ? state.doors[hatch.key] : undefined;

  return (
    <>
      <div
        style={{
          minHeight: 40,
          flex: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px 10px',
          padding: '6px 12px',
          borderBottom: `1px solid ${C.line}`,
          background: C.bar,
        }}
      >
        <div style={{ ...segGroup, flex: 'none' }}>
          {TOOLS.map(([id, label, key]) => (
            <button key={id} style={seg(state.tool === id)} onClick={() => set({ tool: id })}>
              {label}
              <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 6 }}>{key}</span>
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 18, background: C.line }} />
        <button className="vw-btn-secondary" onClick={autoPlace} style={{ ...secondaryButton, flex: 'none', whiteSpace: 'nowrap' }}>
          Auto-place keys
        </button>
        <div style={{ ...segGroup, flex: 'none' }} aria-label="Zoom">
          <button style={seg(false)} aria-label="Zoom out" onClick={() => zoomTo(CELL / 1.25)}>
            −
          </button>
          <span style={{ alignSelf: 'center', minWidth: 42, textAlign: 'center', font: `400 11px ${MONO}`, color: C.muted }}>{Math.round((CELL / 24) * 100)}%</span>
          <button style={seg(false)} aria-label="Zoom in" onClick={() => zoomTo(CELL * 1.25)}>
            +
          </button>
          <button style={seg(false)} title="Fit the whole map (F)" onClick={fit}>
            Fit <span style={{ font: `400 10px ${MONO}`, opacity: 0.6, marginLeft: 4 }}>F</span>
          </button>
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            font: `400 11.5px ${SANS}`,
            color: C.muted,
          }}
          title={HINTS[state.tool]}
        >
          {sel.length > 1 ? `${sel.length} rooms selected · arrows nudge · Ctrl+C / Ctrl+D copy · Delete removes` : HINTS[state.tool]}
        </div>
      </div>
      <div ref={view} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', padding: PAD }} onContextMenu={(e) => e.preventDefault()}>
        <div
          ref={gridEl}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => (hoverCell.current = null)}
          onDoubleClick={(e) => {
            // Pointer capture sends the double-click to the grid, so find the room here.
            if (state.tool !== 'select' || (e.target as HTMLElement).closest('[data-hatch],[data-pin]')) return;
            const c = cellAt(e.clientX, e.clientY);
            const r = roomAt(c.x, c.y);
            if (r) set({ selRoom: r.id, selRooms: [r.id], editRoom: r.id });
          }}
          style={{
            position: 'relative',
            flex: 'none',
            margin: 'auto',
            width: GW * CELL,
            height: GH * CELL,
            backgroundColor: '#15181d',
            backgroundImage: `linear-gradient(${C.field} 1px,transparent 1px),linear-gradient(90deg,${C.field} 1px,transparent 1px)`,
            backgroundSize: `${CELL}px ${CELL}px`,
            border: `1px solid ${C.line}`,
            cursor: space.current ? 'grab' : state.tool === 'draw' ? 'crosshair' : 'default',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          {state.rooms.map((r) => (
            <RoomTile
              key={r.id}
              room={r}
              cell={CELL}
              selected={selSet.has(r.id)}
              issues={issuesByRoom[r.id]}
              onMenu={(x, y) => {
                if (!selSet.has(r.id)) set({ selRooms: [r.id], selRoom: r.id });
                setMenu({ x, y, room: r.id });
              }}
            />
          ))}
          {state.tool === 'select' &&
            links.map((l) => {
              const spec = state.doors[l.key];
              const info = doorInfo(spec?.kind ?? 'open');
              return (
                <button
                  key={l.key}
                  data-hatch
                  title={`${l.a.name} ↔ ${l.b.name}: ${info.label}${spec?.flag ? ` (flag ${spec.flag})` : ''}. Click to change`}
                  aria-label={`Doorway ${l.a.name} to ${l.b.name}: ${info.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const b = e.currentTarget.getBoundingClientRect();
                    setHatch(hatch?.key === l.key ? null : { key: l.key, x: b.right + 6, y: b.top - 4 });
                  }}
                  style={{
                    position: 'absolute',
                    left: l.x * CELL - 6,
                    top: l.y * CELL - CELL * 0.5 - 7,
                    width: 12,
                    height: 14,
                    padding: 0,
                    borderRadius: 3,
                    border: `1px solid ${spec ? info.color : C.faint}`,
                    background: spec ? info.color : C.bg,
                    cursor: 'pointer',
                    zIndex: 2,
                  }}
                />
              );
            })}
          {selRoomObj && state.tool === 'select' && !moving && preview?.kind !== 'resize' && <Handles room={selRoomObj} cell={CELL} />}
          {ghostRects.map(({ r, ok }, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: r.x * CELL,
                top: r.y * CELL,
                width: r.w * CELL,
                height: r.h * CELL,
                border: `1.5px dashed ${ok ? C.accent : C.bad}`,
                background: ok ? 'rgba(240,180,76,.12)' : 'rgba(255,107,107,.15)',
                borderRadius: 3,
                pointerEvents: 'none',
                zIndex: 3,
              }}
            >
              {preview?.kind === 'resize' && <span style={{ position: 'absolute', right: 4, bottom: 2, font: `500 10px ${MONO}`, color: C.text }}>{r.w}×{r.h}</span>}
            </div>
          ))}
          {preview?.kind === 'marquee' && (
            <div
              style={{
                position: 'absolute',
                left: preview.rect.x * CELL,
                top: preview.rect.y * CELL,
                width: preview.rect.w * CELL,
                height: preview.rect.h * CELL,
                border: `1px solid ${C.accent}`,
                background: 'rgba(240,180,76,.08)',
                pointerEvents: 'none',
                zIndex: 3,
              }}
            />
          )}
          {draft && (
            <div
              style={{
                position: 'absolute',
                ...(() => {
                  const r = rectOf(draft.x0, draft.y0, draft.x1, draft.y1);
                  return { left: r.x * CELL, top: r.y * CELL, width: r.w * CELL, height: r.h * CELL };
                })(),
                border: `1.5px dashed ${C.accent}`,
                background: 'rgba(240,180,76,.1)',
                borderRadius: 3,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
      {menu && menuRoom && (
        <PopMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {[
            ['Paint tiles', 'dbl-click', () => set({ selRoom: menuRoom.id, editRoom: menuRoom.id })],
            ['Play from here', 'P', () => playFrom(menuRoom.id)],
            ['Duplicate', 'Ctrl+D', () => duplicate(sel)],
            ['Copy', 'Ctrl+C', copySel],
            ['Paste here', 'Ctrl+V', () => paste({ x: menuRoom.x + menuRoom.w, y: menuRoom.y })],
            [sel.length > 1 ? `Delete ${sel.length} rooms` : 'Delete', 'Del', () => deleteRooms(sel)],
          ].map(([label, keys, run]) => (
            <MenuItem key={label as string} label={label as string} keys={keys as string} onClick={() => (setMenu(null), (run as () => void)())} />
          ))}
        </PopMenu>
      )}
      {hatch && hatchLink && (
        <PopMenu x={hatch.x} y={hatch.y} onClose={() => setHatch(null)} label={`${hatchLink.a.name} ↔ ${hatchLink.b.name}`}>
          {DOOR_KINDS.map((d) => (
            <MenuItem
              key={d.kind}
              label={d.label}
              swatch={d.color}
              on={(hatchSpec?.kind ?? 'open') === d.kind}
              onClick={() => {
                setDoor(hatch.key, d.kind);
                if (d.kind !== 'grey') setHatch(null);
              }}
            />
          ))}
          {hatchSpec?.kind === 'grey' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 4px', font: `400 11.5px ${SANS}`, color: C.muted }}>
              Opens on flag
              <FlagField label="Opens on flag" value={hatchSpec.flag ?? ''} onChange={(v) => setDoor(hatch.key, 'grey', v)} style={{ height: 26, flex: 1, minWidth: 0, font: `400 11.5px ${MONO}` }} />
            </div>
          )}
        </PopMenu>
      )}
    </>
  );
}

/** Grows the map grid to hold `rooms`. */
function growGrid(g: { w: number; h: number }, rooms: Rect[]) {
  return { w: Math.max(g.w, ...rooms.map((r) => r.x + r.w)), h: Math.max(g.h, ...rooms.map((r) => r.y + r.h)) };
}

const HANDLES: [Handle, string, string][] = [
  ['n', '50%', '0'],
  ['s', '50%', '100%'],
  ['e', '100%', '50%'],
  ['w', '0', '50%'],
  ['ne', '100%', '0'],
  ['nw', '0', '0'],
  ['se', '100%', '100%'],
  ['sw', '0', '100%'],
];
const CURSORS: Record<Handle, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };

/** Resize handles round the one selected room. */
function Handles({ room: r, cell }: { room: Room; cell: number }) {
  return (
    <div style={{ position: 'absolute', left: r.x * cell, top: r.y * cell, width: r.w * cell, height: r.h * cell, pointerEvents: 'none', zIndex: 4 }}>
      {HANDLES.map(([h, left, top]) => (
        <div
          key={h}
          data-handle={h}
          aria-label={`Resize ${h}`}
          style={{
            position: 'absolute',
            left,
            top,
            width: 9,
            height: 9,
            marginLeft: -4.5,
            marginTop: -4.5,
            borderRadius: 2,
            background: C.accent,
            border: `1px solid ${C.bar}`,
            cursor: CURSORS[h],
            pointerEvents: 'auto',
          }}
        />
      ))}
    </div>
  );
}

/** A small floating menu at a screen position; closes on outside click or Escape. */
export function PopMenu({ x, y, onClose, label, children }: { x: number; y: number; onClose(): void; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) onClose();
    };
    const t = window.setTimeout(() => window.addEventListener('mousedown', close));
    window.addEventListener('keydown', close);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 250);
  const top = Math.min(y, window.innerHeight - 280);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 40,
        minWidth: 220,
        padding: 4,
        background: C.panelDeep,
        border: `1px solid ${C.lineStrong}`,
        borderRadius: 6,
        boxShadow: '0 12px 32px rgba(0,0,0,.45)',
      }}
    >
      {label && <div style={{ padding: '6px 10px 4px', font: `500 11px ${SANS}`, color: C.muted }}>{label}</div>}
      {children}
    </div>
  );
}

export function MenuItem({ label, keys, swatch, on, onClick }: { label: string; keys?: string; swatch?: string; on?: boolean; onClick(): void }) {
  return (
    <button
      role="menuitem"
      className="vw-menu-item"
      onClick={onClick}
      style={{
        width: '100%',
        height: 30,
        padding: '0 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: 0,
        borderRadius: 4,
        background: on ? C.fieldHover : 'transparent',
        color: C.text,
        font: `500 12.5px ${SANS}`,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {swatch !== undefined && <span style={{ width: 10, height: 12, borderRadius: 2, background: swatch === 'transparent' ? C.bg : swatch, border: `1px solid ${C.faint}` }} />}
      <span style={{ flex: 1 }}>{label}</span>
      {keys && <span style={{ font: `400 11px ${MONO}`, color: C.dim }}>{keys}</span>}
    </button>
  );
}

function RoomTile({
  room: r,
  cell: CELL,
  selected,
  issues,
  onMenu,
}: {
  room: Room;
  cell: number;
  selected: boolean;
  issues?: { errors: number; warns: number };
  onMenu(x: number, y: number): void;
}) {
  const { state, check, world, hatchUnreachable, set, place } = useEditor();
  const wr = world.find((w) => w.id === r.id);
  const corridor = r.w === 1 || r.h === 1;
  const unreachable = hatchUnreachable && !check.busy && !check.reached.has(r.id);
  const nodes = state.showItems ? state.nodes.filter((n) => n.room === r.id) : [];
  const area = state.areas.find((a) => a.id === r.area) ?? state.areas[0];
  const ents = state.showItems ? (r.entities ?? []) : [];
  return (
    <div
      title={r.name}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu(e.clientX, e.clientY);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) place(id, r.id);
      }}
      style={{
        position: 'absolute',
        left: r.x * CELL,
        top: r.y * CELL,
        width: r.w * CELL,
        height: r.h * CELL,
        pointerEvents: state.tool === 'draw' ? 'none' : 'auto',
        cursor: state.tool === 'erase' ? 'not-allowed' : 'move',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: corridor ? 2 : 4,
          background: unreachable
            ? 'repeating-linear-gradient(135deg,rgba(255,107,107,.16) 0 5px,rgba(255,107,107,.04) 5px 10px),#22262d'
            : corridor
              ? '#272c34'
              : '#2e343d',
          border: `1px solid ${selected ? C.accent : unreachable ? 'rgba(255,107,107,.5)' : '#464d59'}`,
          boxShadow: selected ? '0 0 0 2px rgba(240,180,76,.3)' : `inset 3px 0 0 ${area?.color ?? 'transparent'}`,
        }}
      />
      {wr && <RoomThumb room={wr} cell={CELL} />}
      {r.w >= 3 && r.h >= 2 && CELL >= 16 && (
        <div
          style={{
            position: 'absolute',
            top: 5,
            left: 8,
            right: issues ? 26 : 6,
            font: `500 11px ${SANS}`,
            color: C.textSoft,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
          }}
        >
          {r.name}
        </div>
      )}
      {issues && (
        <button
          data-pin
          title={`${issues.errors ? `${issues.errors} blocking` : ''}${issues.errors && issues.warns ? ', ' : ''}${issues.warns ? `${issues.warns} warning${issues.warns > 1 ? 's' : ''}` : ''}. Click to see`}
          aria-label={`Issues in ${r.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            set({ selRoom: r.id, selRooms: [r.id], tab: 'validate' });
          }}
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            border: 0,
            background: issues.errors ? C.bad : C.accent,
            color: C.bar,
            font: `700 9.5px/16px ${MONO}`,
            cursor: 'pointer',
            zIndex: 1,
          }}
        >
          {issues.errors || issues.warns}
        </button>
      )}
      <div style={{ position: 'absolute', left: 3, right: 3, bottom: 3, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {nodes.map((n) => (
          <NodeChip key={n.id} node={n} />
        ))}
        {ents
          .filter((e) => e.type === 'save' || e.type === 'boss' || e.type === 'recharge' || e.type === 'map' || e.type === 'exit')
          .map((e) => (
            <span
              key={e.id}
              title={e.type}
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                display: 'grid',
                placeItems: 'center',
                background: e.type === 'boss' ? '#ff8a5c' : e.type === 'save' ? '#4fd1a5' : e.type === 'recharge' ? '#ff6fae' : e.type === 'exit' ? '#4fd1a5' : '#7aa2ff',
                color: C.bg,
                font: `700 8.5px ${MONO}`,
                pointerEvents: 'none',
              }}
            >
              {e.type === 'boss' ? 'B' : e.type === 'save' ? 'S' : e.type === 'recharge' ? 'R' : e.type === 'exit' ? 'X' : 'M'}
            </span>
          ))}
      </div>
    </div>
  );
}

/** Faint picture of the room's tiles; with the reach overlay, tiles the player can reach are tinted. */
function RoomThumb({ room, cell }: { room: WorldRoom; cell: number }) {
  const { state, check } = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  const px = Math.max(1, Math.round(cell / TILES_PER_CELL));
  const res = state.showReach ? check.solved?.result : undefined;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, room.tw * px, room.th * px);
    for (let y = 0; y < room.th; y++)
      for (let x = 0; x < room.tw; x++) {
        const t = room.g[y * room.tw + x];
        if (res) {
          const wx = room.tx + x;
          const wy = room.ty + y;
          if (wx < res.W && wy < res.H && res.covered[wy * res.W + wx]) {
            ctx.fillStyle = 'rgba(79,209,165,.35)';
            ctx.fillRect(x * px, y * px, px, px);
          }
        }
        if (t === Tile.Empty) continue;
        ctx.fillStyle =
          t === Tile.Spikes || t === Tile.Lava
            ? 'rgba(255,107,107,.45)'
            : t === Tile.Water
              ? 'rgba(63,134,214,.4)'
              : t === Tile.Platform
                ? 'rgba(223,226,231,.22)'
                : t >= Tile.ShotBlock
                  ? 'rgba(240,180,76,.3)'
                  : 'rgba(223,226,231,.1)';
        ctx.fillRect(x * px, y * px, px, t === Tile.Platform ? 1 : px);
      }
  }, [room, px, res]);
  return (
    <canvas
      ref={ref}
      width={room.tw * px}
      height={room.th * px}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 4 }}
    />
  );
}
