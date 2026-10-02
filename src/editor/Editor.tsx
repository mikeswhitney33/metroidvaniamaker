import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sound } from '../game/audio';
import { Game, STEP } from '../game/Game';
import { Input } from '../game/input';
import { clearRun, loadRun, saveKey } from '../game/run';
import { analyze, autoPlaceKeys, colorOf, indexNodes, isKey, nextSeed } from '../model/graph';
import {
  blankContent,
  CONTENT_KEYS,
  parseProject,
  pickContent,
  ProjectError,
  projectFileName,
  toProjectFile,
  type ProjectContent,
} from '../model/project';
import { presetById } from '../model/sampleProject';
import { SAMPLES } from '../model/samples';
import { TILE_INFO } from '../model/tiles';
import { buildWorld } from '../model/world';
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
import { EditorContext, type Check, type EditorApi } from './context';
import { buildGameHtml, ExportError } from './exportHtml';
import { record, redo, sameContent, undo } from './history';
import { clearLegacyImages, downloadText, legacyImages, loadAutosave, saveAutosave } from './persist';
import { savePrefs } from './prefs';
import { useSolver } from './solver/useSolver';
import { initialState, type EditorState, type Tool } from './state';
import { C } from './ui';

export interface EditorProps {
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
    editRoom: c.rooms.some((r) => r.id === s.editRoom) ? s.editRoom : null,
    selEntity: null,
  };
}

/** Image elements for sprite sheet slots, so the game can draw them. */
function sheetImages(c: ProjectContent): Record<string, HTMLImageElement> {
  const out: Record<string, HTMLImageElement> = {};
  Object.values(c.sprites).forEach((sh) => {
    const src = c.images[sh.image];
    if (!src || out[sh.image]) return;
    const img = new Image();
    img.src = src;
    out[sh.image] = img;
  });
  return out;
}

export function Editor({ hatchUnreachable = true }: EditorProps) {
  const [state, setState] = useState<EditorState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const input = useRef(new Input(state.prefs.bindings));
  const sound = useRef<Sound | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

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
      toastTimer.current = window.setTimeout(() => set({ toast: null }), 2600);
    },
    [set],
  );

  const addLog = useCallback((msg: string) => {
    const t = gameRef.current?.clock() ?? '00:00';
    setState((s) => ({ ...s, log: [{ t, msg }, ...s.log].slice(0, 30) }));
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

  const exportGame = useCallback(async () => {
    const S = stateRef.current;
    try {
      const html = await buildGameHtml(pickContent(S), S.prefs.bindings);
      const name = projectFileName(S.name).replace(/\.vwm\.json$/, '.html');
      downloadText(html, name, 'text/html');
      flash(`Exported ${name}: one file that plays anywhere`);
    } catch (e) {
      flash(e instanceof ExportError ? e.message : "Couldn't export the game");
    }
  }, [flash]);

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

  // Settings live in this browser.
  useEffect(() => {
    savePrefs(state.prefs);
    input.current.bindings = state.prefs.bindings;
    if (sound.current) {
      sound.current.muted = state.prefs.muted;
      sound.current.musicOn = state.prefs.music;
    }
  }, [state.prefs]);

  // Whether there's a saved run to continue.
  const runKey = saveKey(state);
  useEffect(() => set({ hasRun: !!loadRun(runKey) }), [runKey, state.mode, set]);

  const startPlay = useCallback(
    (resume = false) => {
      const S = stateRef.current;
      if (!S.rooms.length) return;
      sound.current ??= new Sound();
      sound.current.resume();
      sound.current.muted = S.prefs.muted;
      sound.current.musicOn = S.prefs.music;
      const c = pickContent(S);
      const key = saveKey(S);
      const run = resume ? (loadRun(key) ?? undefined) : undefined;
      if (!resume) clearRun(key);
      let game: Game;
      try {
        game = new Game(
          c,
          {
            onEnterRoom(room) {
              setState((s) => ({
                ...s,
                playRoom: room.id,
                visited: s.visited.includes(room.id) ? s.visited : [...s.visited, room.id],
              }));
              addLog(`Entered ${room.name}`);
            },
            onPickup(label) {
              setState((s) => ({ ...s, have: [...(gameRef.current?.run.keys ?? [])] }));
              addLog(`Picked up ${label}`);
            },
            onMessage: (m) => addLog(m),
            onHurt(room, energy) {
              addLog(`Hurt in ${room.name} · ${energy} energy`);
            },
            onDeath: () => addLog('Died'),
            onSave: () => {
              addLog('Saved');
              set({ hasRun: true });
            },
            onWin(msg) {
              addLog(msg);
              flash(`${msg}. The build is beatable`);
            },
          },
          {
            run,
            saveKey: key,
            damageScale: S.prefs.assist ? 0.5 : 1,
            reducedFlash: S.prefs.reducedFlash,
            images: sheetImages(c),
            sound: sound.current,
          },
        );
      } catch (e) {
        flash(e instanceof Error ? e.message : "Couldn't start the playtest");
        return;
      }
      gameRef.current = game;
      input.current.clear();
      set({
        mode: 'play',
        gen: null,
        playRoom: game.room.id,
        visited: [...game.run.visited],
        have: [...game.run.keys],
        log: [{ t: game.clock(), msg: run ? `Continued in ${game.room.name}` : `Spawned in ${game.room.name}` }],
      });
    },
    [addLog, flash, set],
  );

  const restart = useCallback(() => {
    if (stateRef.current.mode === 'play') startPlay(false);
  }, [startPlay]);

  /** Playtest: blocked by structural errors unless the author chooses to play anyway. */
  const playtest = useCallback(
    (force = false) => {
      const S = stateRef.current;
      const a = analyze(S.rooms, S.nodes);
      if (a.errors && !force) {
        set({ gen: { blocked: true, errors: a.errors } });
        return;
      }
      startPlay(false);
    },
    [set, startPlay],
  );

  const leavePlay = useCallback(() => {
    sound.current?.setTheme(null);
    set({ mode: 'author' });
  }, [set]);

  // Keyboard: tool shortcuts while authoring, controls while playtesting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const S = stateRef.current;
      if (S.mode === 'play') {
        if (input.current.key(e.code, down, e.repeat)) e.preventDefault();
        else if (down && !e.repeat && e.code === 'KeyR') restart();
        else if (down && e.code === 'Escape') leavePlay();
      } else if (down && (e.metaKey || e.ctrlKey)) {
        const shortcut =
          e.code === 'KeyZ' ? (e.shiftKey ? 'redo' : 'undo') : e.code === 'KeyY' ? 'redo' : e.code === 'KeyS' ? 'save' : null;
        if (!shortcut) return;
        e.preventDefault();
        if (shortcut === 'save') saveFile();
        else step(shortcut);
      } else if (down && S.editRoom) {
        const t = TILE_INFO.find((k) => k.key && e.code === `Digit${k.key}`);
        if (t && S.paintLayer === 'tiles') set({ paintTile: t.kind });
        if (e.code === 'KeyT') set({ paintLayer: 'tiles' });
        if (e.code === 'KeyN') set({ paintLayer: 'entities' });
        if ((e.code === 'Delete' || e.code === 'Backspace') && S.selEntity) {
          const id = S.selEntity;
          edit((s) => ({ rooms: s.rooms.map((r) => (r.id === S.editRoom ? { ...r, entities: (r.entities ?? []).filter((x) => x.id !== id) } : r)), selEntity: null }));
        }
        if (e.code === 'Escape') set(S.selEntity ? { selEntity: null } : { editRoom: null });
      } else if (down) {
        const tool = TOOL_KEYS[e.code];
        if (tool) set({ tool });
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    const blur = () => input.current.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, [restart, leavePlay, set, edit, step, saveFile]);

  // Playtest loop: a fixed 60 Hz step, drawn every frame.
  useEffect(() => {
    if (state.mode !== 'play') return;
    let raf = 0;
    let last = 0;
    let acc = 0;
    const loop = (t: number) => {
      const game = gameRef.current;
      if (game) {
        acc += last ? Math.min(0.1, (t - last) / 1000) : STEP;
        while (acc >= STEP) {
          game.update(input.current.frame());
          acc -= STEP;
        }
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
      window.clearTimeout(toastTimer.current);
      sound.current?.close();
    },
    [],
  );

  const analysis = useMemo(() => analyze(state.rooms, state.nodes), [state.rooms, state.nodes]);
  const { solved, busy } = useSolver(pickContent(state), state.rev);
  const byId = useMemo(() => indexNodes(state.nodes), [state.nodes]);
  const roomById = useMemo(() => Object.fromEntries(state.rooms.map((r) => [r.id, r])), [state.rooms]);
  const world = useMemo(() => buildWorld(state.rooms, state.doors), [state.rooms, state.doors]);

  // Combined check: the lock & key graph, plus the tile-level solver once it has run.
  const check = useMemo<Check>(() => {
    const seen = new Set<string>();
    const issues = [...analysis.issues, ...(solved?.result.issues ?? [])].filter((i) => !seen.has(i.msg) && !!seen.add(i.msg));
    const errors = issues.filter((i) => i.sev === 'error').length;
    const r = solved?.result;
    const stepOf: Record<string, number> = {};
    if (r) r.targets.forEach((t) => t.node && r.stepOf[t.id] !== undefined && (stepOf[t.node] = r.stepOf[t.id] + 1));
    else analysis.order.forEach((id, i) => (stepOf[id] = i + 1));
    return { issues, errors, beatable: !errors && (r?.beatable ?? true), busy, reached: r?.rooms ?? analysis.reached, stepOf, solved };
  }, [analysis, solved, busy]);

  const api: EditorApi = {
    state,
    analysis,
    check,
    byId,
    roomById,
    world,
    stepOf: check.stepOf,
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
      edit((s) => ({ nodes: s.nodes.map((x) => (x.id === nodeId ? { ...x, room: roomId, pos: x.room === roomId ? x.pos : undefined } : x)), selNode: nodeId }));
      flash(`Placed ${n.label} in ${r.name}`);
    },
    unplace(nodeId) {
      edit((s) => ({ nodes: s.nodes.map((x) => (x.id === nodeId ? { ...x, room: null, pos: undefined } : x)) }));
    },
    deleteRoom(roomId) {
      edit((s) => ({
        rooms: s.rooms.filter((r) => r.id !== roomId),
        nodes: s.nodes.map((n) => (n.room === roomId ? { ...n, room: null, pos: undefined } : n)),
        doors: Object.fromEntries(Object.entries(s.doors).filter(([k]) => !k.split('|').includes(roomId))),
        selRoom: null,
      }));
    },
    autoPlace() {
      const seed = nextSeed(state.seed);
      edit({ nodes: autoPlaceKeys(state.rooms, state.nodes, seed), seed });
      flash(`Placed ${state.nodes.filter(isKey).length} keys along the gate order · seed ${seed}`);
    },
    playtest,
    continueRun: () => startPlay(true),
    leavePlay,
    restart,
    undo: () => step('undo'),
    redo: () => step('redo'),
    saveFile,
    openFile,
    exportGame,
    newProject: () => replaceContent(blankContent(), 'Started a new project. Undo to get the old one back'),
    loadSample: (id) => {
      const s = SAMPLES.find((x) => x.id === id) ?? SAMPLES[0];
      replaceContent(s.content(), `Loaded ${s.name}`);
    },
    replaceRooms(rooms, msg) {
      edit((s) => ({
        rooms,
        nodes: s.nodes.map((n) => (n.room && !rooms.some((r) => r.id === n.room) ? { ...n, room: null, pos: undefined } : n)),
        doors: {},
        selRoom: null,
        editRoom: null,
        grid: {
          w: Math.max(s.grid.w, ...rooms.map((r) => r.x + r.w)),
          h: Math.max(s.grid.h, ...rooms.map((r) => r.y + r.h)),
        },
      }));
      flash(msg);
    },
    openIssue(issue) {
      set((s) => ({ mode: 'author', editRoom: null, selRoom: issue.room ?? s.selRoom, selNode: issue.node ?? s.selNode }));
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
