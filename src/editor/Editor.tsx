import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game, type GameInput } from '../game/Game';
import { buildWorld } from '../game/world';
import { TILE_KINDS } from '../model/tiles';
import { analyze, autoPlaceKeys, colorOf, indexNodes, isKey, nextSeed } from '../model/graph';
import {
  blankContent,
  CONTENT_KEYS,
  parseProject,
  pickContent,
  ProjectError,
  projectFileName,
  sampleContent,
  toProjectFile,
  type ProjectContent,
} from '../model/project';
import { presetById } from '../model/sampleProject';
import type { Room } from '../model/types';
import { AuthorSidebar } from './components/AuthorSidebar';
import { GenerateDialog } from './components/GenerateDialog';
import { InspectorPanel } from './components/InspectorPanel';
import { MapBoard } from './components/MapBoard';
import { PlaytestPanel } from './components/PlaytestPanel';
import { PlaytestSidebar } from './components/PlaytestSidebar';
import { PlaytestView } from './components/PlaytestView';
import { RoomPainter } from './components/RoomPainter';
import { StatusBar } from './components/StatusBar';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { EditorContext, type EditorApi } from './context';
import { record, redo, sameContent, undo } from './history';
import { clearLegacyImages, downloadText, legacyImages, loadAutosave, saveAutosave } from './persist';
import { initialState, type EditorState, type Tool } from './state';
import { C } from './ui';

export interface EditorProps {
  /** Jump impulse in tiles per second used by the playtest. */
  jumpPower?: number;
  /** Hatch rooms the validator can't reach. */
  hatchUnreachable?: boolean;
}

const TOOL_KEYS: Record<string, Tool> = { KeyV: 'select', KeyB: 'draw', KeyE: 'erase' };

/** Wait this long after the last change before autosaving. */
const AUTOSAVE_MS = 400;

/** Swaps in other content, dropping selections that no longer exist. */
function withContent(s: EditorState, c: ProjectContent): EditorState {
  return {
    ...s,
    ...c,
    rev: s.rev + 1,
    selRoom: c.rooms.some((r) => r.id === s.selRoom) ? s.selRoom : null,
    selNode: c.nodes.some((n) => n.id === s.selNode) ? s.selNode : null,
  };
}

export function Editor({ jumpPower = 30, hatchUnreachable = true }: EditorProps) {
  const [state, setState] = useState<EditorState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const held = useRef(new Set<string>());
  const pressed = useRef(new Set<GameInput>());
  const toastTimer = useRef<number | undefined>(undefined);
  const genTimer = useRef<number | undefined>(undefined);

  const set: EditorApi['set'] = useCallback((patch) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  }, []);

  const edit: EditorApi['edit'] = useCallback((patch, merge) => {
    setState((s) => {
      const next = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) };
      const before = pickContent(s);
      if (sameContent(before, next)) return next;
      return { ...next, rev: s.rev + 1, history: record(s.history, before, merge, Date.now()) };
    });
  }, []);

  const step = useCallback((dir: 'undo' | 'redo') => {
    setState((s) => {
      const r = (dir === 'undo' ? undo : redo)(s.history, pickContent(s));
      return r ? { ...withContent(s, r.content), history: r.history } : s;
    });
  }, []);

  const flash = useCallback(
    (msg: string) => {
      window.clearTimeout(toastTimer.current);
      set({ toast: msg });
      toastTimer.current = window.setTimeout(() => set({ toast: null }), 2200);
    },
    [set],
  );

  const addLog = useCallback((msg: string) => {
    const t = gameRef.current?.clock() ?? '00:00';
    setState((s) => ({ ...s, log: [{ t, msg }, ...s.log].slice(0, 12) }));
  }, []);

  /** Replaces the whole project as one undoable step. */
  const replaceContent = useCallback(
    (c: ProjectContent, msg: string) => {
      setState((s) => ({ ...withContent(s, c), history: record(s.history, pickContent(s), undefined, Date.now()) }));
      flash(msg);
    },
    [flash],
  );

  const saveFile = useCallback(() => {
    const S = stateRef.current;
    downloadText(JSON.stringify(toProjectFile(S), null, 2), projectFileName(S.name));
    flash(`Saved ${projectFileName(S.name)}`);
  }, [flash]);

  const openFile = useCallback(
    async (file: File) => {
      try {
        const c = parseProject(await file.text());
        replaceContent(c, `Opened ${c.name}`);
      } catch (e) {
        flash(e instanceof ProjectError ? `Couldn't open ${file.name}: ${e.message}` : `Couldn't read ${file.name}`);
      }
    },
    [replaceContent, flash],
  );

  /** Old localStorage images, removed only once an autosave holds them. */
  const legacyIds = useRef<string[]>([]);

  // Restore the last autosave once; until then, autosave stays off so it can't overwrite it.
  useEffect(() => {
    let live = true;
    loadAutosave().then((saved) => {
      if (!live) return;
      if (saved) {
        setState((s) => ({ ...withContent(s, saved), saveStatus: 'saved' }));
        return;
      }
      const images = legacyImages();
      legacyIds.current = Object.keys(images);
      setState((s) => ({ ...s, images: { ...s.images, ...images }, saveStatus: 'saving' }));
    });
    return () => {
      live = false;
    };
  }, []);

  const content = CONTENT_KEYS.map((k) => state[k]);
  const loaded = state.saveStatus !== 'loading';
  useEffect(() => {
    if (!loaded) return;
    set({ saveStatus: 'saving' });
    const t = window.setTimeout(() => {
      saveAutosave(pickContent(stateRef.current)).then(
        () => {
          clearLegacyImages(legacyIds.current);
          legacyIds.current = [];
          set({ saveStatus: 'saved' });
        },
        () => set({ saveStatus: 'error' }),
      );
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [loaded, set, ...content]);

  const startPlay = useCallback(() => {
    const S = stateRef.current;
    if (!S.rooms.length) return;
    const byId = indexNodes(S.nodes);
    const game = new Game(S.rooms, S.nodes, byId, presetById(S.style), jumpPower, {
      onEnterRoom(room: Room) {
        setState((s) => ({
          ...s,
          playRoom: room.id,
          visited: s.visited.includes(room.id) ? s.visited : [...s.visited, room.id],
        }));
        addLog(`Entered ${room.name}`);
      },
      onPickup(item, have) {
        set({ have });
        addLog(`Picked up ${item.label}`);
        flash(`Picked up ${item.label}`);
      },
      onHurt(room) {
        addLog(`Hit spikes in ${room.name}`);
      },
      onWin(boss) {
        addLog(`Reached ${boss.label}. Run complete`);
        flash(`${boss.label} reached. The build is beatable`);
      },
    });
    gameRef.current = game;
    held.current.clear();
    pressed.current.clear();
    set({
      mode: 'play',
      playRoom: game.room.id,
      visited: [game.room.id],
      have: [],
      log: [{ t: '00:00', msg: `Spawned in ${game.room.name}` }],
    });
  }, [jumpPower, addLog, flash, set]);

  const restart = useCallback(() => {
    if (stateRef.current.mode === 'play') startPlay();
  }, [startPlay]);

  const generate = useCallback(() => {
    const S = stateRef.current;
    const a = analyze(S.rooms, S.nodes);
    if (a.errors) {
      set({ gen: { blocked: true, errors: a.errors } });
      return;
    }
    if (S.builtRev === S.rev) {
      startPlay();
      return;
    }
    window.clearInterval(genTimer.current);
    let pct = 0;
    set({ gen: { blocked: false, pct } });
    genTimer.current = window.setInterval(() => {
      pct = Math.min(100, pct + 2.2);
      set({ gen: { blocked: false, pct } });
      if (pct >= 100) {
        window.clearInterval(genTimer.current);
        window.setTimeout(() => {
          setState((s) => ({ ...s, gen: null, builtRev: s.rev }));
          startPlay();
        }, 350);
      }
    }, 70);
  }, [set, startPlay]);

  // Keyboard: tool shortcuts while authoring, controls while playtesting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (stateRef.current.mode === 'play') {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
        if (down) {
          held.current.add(e.code);
          if (!e.repeat) {
            if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) pressed.current.add('jump');
            if (['ShiftLeft', 'ShiftRight', 'KeyK'].includes(e.code)) pressed.current.add('dash');
            if (e.code === 'KeyR') restart();
          }
        } else held.current.delete(e.code);
      } else if (down && (e.metaKey || e.ctrlKey)) {
        const shortcut =
          e.code === 'KeyZ' ? (e.shiftKey ? 'redo' : 'undo') : e.code === 'KeyY' ? 'redo' : e.code === 'KeyS' ? 'save' : null;
        if (!shortcut) return;
        e.preventDefault();
        if (shortcut === 'save') saveFile();
        else step(shortcut);
      } else if (down && stateRef.current.editRoom) {
        const t = TILE_KINDS.find((k) => e.code === `Digit${k.key}`);
        if (t) set({ paintTile: t.kind });
        if (e.code === 'Escape') set({ editRoom: null });
      } else if (down) {
        const tool = TOOL_KEYS[e.code];
        if (tool) set({ tool });
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [restart, set, step, saveFile]);

  // Playtest loop.
  useEffect(() => {
    if (state.mode !== 'play') return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      const game = gameRef.current;
      if (game) {
        const dt = last ? Math.min(0.033, (t - last) / 1000) : 0.016;
        game.step(dt, held.current, pressed.current);
        pressed.current.clear();
        if (canvasRef.current) game.draw(canvasRef.current);
      }
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state.mode]);

  useEffect(
    () => () => {
      window.clearInterval(genTimer.current);
      window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const analysis = useMemo(() => analyze(state.rooms, state.nodes), [state.rooms, state.nodes]);
  const byId = useMemo(() => indexNodes(state.nodes), [state.nodes]);
  const roomById = useMemo(() => Object.fromEntries(state.rooms.map((r) => [r.id, r])), [state.rooms]);
  const world = useMemo(() => buildWorld(state.rooms), [state.rooms]);
  const stepOf = useMemo(() => Object.fromEntries(analysis.order.map((id, i) => [id, i + 1])), [analysis]);

  const api: EditorApi = {
    state,
    analysis,
    byId,
    roomById,
    world,
    stepOf,
    palette: presetById(state.style),
    hatchUnreachable,
    canvasRef,
    colorOf: (n) => colorOf(n, byId),
    set,
    edit,
    flash,
    place(nodeId, roomId) {
      const n = byId[nodeId];
      const r = roomById[roomId];
      if (!n || !r) return;
      edit((s) => ({ nodes: s.nodes.map((x) => (x.id === nodeId ? { ...x, room: roomId } : x)), selNode: nodeId }));
      flash(`Placed ${n.label} in ${r.name}`);
    },
    unplace(nodeId) {
      edit((s) => ({ nodes: s.nodes.map((x) => (x.id === nodeId ? { ...x, room: null } : x)) }));
    },
    deleteRoom(roomId) {
      edit((s) => ({
        rooms: s.rooms.filter((r) => r.id !== roomId),
        nodes: s.nodes.map((n) => (n.room === roomId ? { ...n, room: null } : n)),
        selRoom: null,
      }));
    },
    autoPlace() {
      const seed = nextSeed(state.seed);
      edit({ nodes: autoPlaceKeys(state.rooms, state.nodes, seed), seed });
      flash(`Placed ${state.nodes.filter(isKey).length} keys along the gate order · seed ${seed}`);
    },
    generate,
    restart,
    undo: () => step('undo'),
    redo: () => step('redo'),
    saveFile,
    openFile,
    newProject: () => replaceContent(blankContent(), 'Started a new project. Undo to get the old one back'),
    loadSample: () => replaceContent(sampleContent(), 'Loaded the Hollow Depths sample'),
    openIssue(issue) {
      set((s) => ({ mode: 'author', selRoom: issue.room ?? s.selRoom, selNode: issue.node ?? s.selNode }));
    },
  };

  const author = state.mode === 'author';
  return (
    <EditorContext.Provider value={api}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, overflow: 'hidden' }}>
        <TopBar />
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {author ? <AuthorSidebar /> : <PlaytestSidebar />}
          <main
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              background: C.bg,
              overflow: 'hidden',
            }}
          >
            {!author ? <PlaytestView /> : state.editRoom && roomById[state.editRoom] ? <RoomPainter /> : <MapBoard />}
            {state.toast && <Toast message={state.toast} />}
          </main>
          {author ? <InspectorPanel /> : <PlaytestPanel />}
        </div>
        <StatusBar />
        {state.gen && <GenerateDialog />}
      </div>
    </EditorContext.Provider>
  );
}
