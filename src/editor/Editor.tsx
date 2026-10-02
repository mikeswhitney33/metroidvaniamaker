import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sound } from '../game/audio';
import { Game, STEP } from '../game/Game';
import { Input } from '../game/input';
import { clearRun, loadRun, newRun, runHave, saveKey, type RunData } from '../game/run';
import { flagIssues, flagTable } from '../model/flags';
import { analyze, autoPlaceKeys, colorOf, indexNodes, isKey, nextSeed } from '../model/graph';
import { gameImageIds } from '../model/images';
import { loadoutFor } from '../model/loadout';
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
import { buildWorld, floorSpot } from '../model/world';
import { AuthorSidebar } from './components/AuthorSidebar';
import { ImportDialog } from './components/ImportDialog';
import { PainterSidebar } from './components/PainterSidebar';
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
import { emptyHistory, record, redo, sameContent, undo } from './history';
import { clearLegacyImages, deleteProject, downloadText, legacyImages, loadCurrent, loadProject, newProjectId, saveProject } from './persist';
import { savePrefs } from './prefs';
import { useSolver } from './solver/useSolver';
import type { Solved } from './solver/wire';
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

/** Image elements for the slots the game draws (sprite sheets, tilesets, backdrops). */
function gameImages(c: ProjectContent): Record<string, HTMLImageElement> {
  const out: Record<string, HTMLImageElement> = {};
  gameImageIds(c).forEach((id) => {
    const src = c.images[id];
    if (!src) return;
    const img = new Image();
    img.src = src;
    out[id] = img;
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

  /**
   * Opens other content as its own project. The project that was open stays in this
   * browser's project list, so nothing is lost; undo history starts fresh.
   */
  const switchProject = useCallback(
    (c: ProjectContent, msg: string, id: string = newProjectId()) => {
      setState((s) => ({ ...withContent(s, c), projectId: id, history: emptyHistory, mode: 'author', returnTo: null }));
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
        switchProject(c, `Opened ${c.name}`);
      } catch (e) {
        flash(e instanceof ProjectError ? `Couldn't open ${file.name}: ${e.message}` : `Couldn't read ${file.name}`);
      }
    },
    [switchProject, flash],
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
    loadCurrent().then((saved) => {
      if (!live) return;
      if (saved) {
        setState((s) => ({ ...withContent(s, saved.content), projectId: saved.id, saveStatus: 'saved' }));
        return;
      }
      const images = legacyImages();
      legacyIds.current = Object.keys(images);
      setState((s) => ({ ...s, images: { ...s.images, ...images }, projectId: newProjectId(), saveStatus: 'saving' }));
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
      saveProject(stateRef.current.projectId, pickContent(stateRef.current)).then(
        () => {
          clearLegacyImages(legacyIds.current);
          legacyIds.current = [];
          set({ saveStatus: 'saved' });
        },
        () => set({ saveStatus: 'error' }),
      );
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [loaded, set, state.projectId, ...content]);

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
    (resume = false, from?: { run: RunData; returnTo: string | null }) => {
      const S = stateRef.current;
      if (!S.rooms.length) return;
      sound.current ??= new Sound();
      sound.current.resume();
      sound.current.muted = S.prefs.muted;
      sound.current.musicOn = S.prefs.music;
      const c = pickContent(S);
      const key = saveKey(S);
      const run = from ? from.run : resume ? (loadRun(key) ?? undefined) : undefined;
      if (!resume && !from) clearRun(key);
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
            saveKey: from ? null : key,
            retry: from?.run,
            damageScale: S.prefs.assist ? 0.5 : 1,
            reducedFlash: S.prefs.reducedFlash,
            images: gameImages(c),
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
        returnTo: from?.returnTo ?? null,
        gen: null,
        playRoom: game.room.id,
        visited: [...game.run.visited],
        have: [...game.run.keys],
        log: [{ t: game.clock(), msg: from ? `Testing from ${game.room.name} with ${from.run.keys.length} items` : run ? `Continued in ${game.room.name}` : `Spawned in ${game.room.name}` }],
      });
    },
    [addLog, flash, set],
  );

  /** Last "play from here" start, so Restart repeats it. */
  const lastFrom = useRef<{ run: RunData; returnTo: string | null } | null>(null);

  const restart = useCallback(() => {
    if (stateRef.current.mode === 'play') startPlay(false, lastFrom.current ?? undefined);
  }, [startPlay]);

  const solvedRef = useRef<Solved | null>(null);

  /** Playtest starting in a room (at a tile inside it, or its floor spot) with the chosen loadout. */
  const playFrom = useCallback(
    (roomId: string, at?: { x: number; y: number }) => {
      const S = stateRef.current;
      const c = pickContent(S);
      const wr = buildWorld(S.rooms, S.doors).find((r) => r.id === roomId);
      if (!wr) return;
      const spot = at ? { x: wr.tx + at.x + 0.5, y: wr.ty + at.y + 1 } : floorSpot(wr);
      const run = newRun(roomId, spot.x - 0.375, spot.y - 1.5);
      const lo = loadoutFor(c, solvedRef.current?.result, roomId, S.prefs.loadout);
      run.keys = lo.keys;
      run.expansions = lo.expansions;
      run.flags = lo.flags;
      const have = runHave(c, run);
      run.ammo = { ...have.max };
      run.energy = have.maxEnergy;
      const from = { run, returnTo: S.editRoom };
      lastFrom.current = from;
      startPlay(false, from);
    },
    [startPlay],
  );

  /** Playtest: blocked by structural errors unless the author chooses to play anyway. */
  const playtest = useCallback(
    (force = false) => {
      const S = stateRef.current;
      const a = analyze(S.rooms, S.nodes);
      if (a.errors && !force) {
        set({ gen: { blocked: true, errors: a.errors } });
        return;
      }
      lastFrom.current = null;
      startPlay(false);
    },
    [set, startPlay],
  );

  const leavePlay = useCallback(() => {
    sound.current?.setTheme(null);
    set((s) => ({ mode: 'author', editRoom: s.returnTo && s.rooms.some((r) => r.id === s.returnTo) ? s.returnTo : s.editRoom, returnTo: null }));
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
      } else if (S.editRoom) {
        // The room painter handles its own keys.
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
  solvedRef.current = solved ?? solvedRef.current;
  const byId = useMemo(() => indexNodes(state.nodes), [state.nodes]);
  const roomById = useMemo(() => Object.fromEntries(state.rooms.map((r) => [r.id, r])), [state.rooms]);
  const world = useMemo(() => buildWorld(state.rooms, state.doors), [state.rooms, state.doors]);
  const flagWarnings = useMemo(
    () => flagIssues(flagTable({ rooms: state.rooms, doors: state.doors, nodes: state.nodes })),
    [state.rooms, state.doors, state.nodes],
  );

  // Combined check: the lock & key graph, the tile-level solver once it has run, and flag wiring.
  const check = useMemo<Check>(() => {
    const seen = new Set<string>();
    const issues = [...analysis.issues, ...(solved?.result.issues ?? []), ...flagWarnings].filter((i) => !seen.has(i.msg) && !!seen.add(i.msg));
    const errors = issues.filter((i) => i.sev === 'error').length;
    const r = solved?.result;
    const stepOf: Record<string, number> = {};
    if (r) r.targets.forEach((t) => t.node && r.stepOf[t.id] !== undefined && (stepOf[t.node] = r.stepOf[t.id] + 1));
    else analysis.order.forEach((id, i) => (stepOf[id] = i + 1));
    return { issues, errors, beatable: !errors && (r?.beatable ?? true), busy, reached: r?.rooms ?? analysis.reached, stepOf, solved };
  }, [analysis, solved, busy, flagWarnings]);

  const deleteRooms = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const gone = new Set(ids);
      const names = stateRef.current.rooms.filter((r) => gone.has(r.id)).map((r) => r.name);
      edit((s) => ({
        rooms: s.rooms.filter((r) => !gone.has(r.id)),
        nodes: s.nodes.map((n) => (n.room && gone.has(n.room) ? { ...n, room: null, pos: undefined } : n)),
        doors: Object.fromEntries(Object.entries(s.doors).filter(([k]) => !k.split('|').some((id) => gone.has(id)))),
        selRoom: null,
        selRooms: [],
      }));
      flash(`Deleted ${names.length === 1 ? names[0] : `${names.length} rooms`}. Undo to bring ${names.length === 1 ? 'it' : 'them'} back`);
    },
    [edit, flash],
  );

  // The API object only changes when something it exposes does, so panels that read the
  // context re-render on real changes rather than on every render of the editor.
  const api = useMemo<EditorApi>(
    () => ({
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
      deleteRoom: (roomId) => deleteRooms([roomId]),
      deleteRooms,
      autoPlace() {
        const S = stateRef.current;
        const seed = nextSeed(S.seed);
        edit({ nodes: autoPlaceKeys(S.rooms, S.nodes, seed), seed });
        flash(`Placed ${S.nodes.filter(isKey).length} keys along the gate order · seed ${seed}`);
      },
      playtest,
      playFrom,
      continueRun: () => {
        lastFrom.current = null;
        startPlay(true);
      },
      leavePlay,
      restart,
      undo: () => step('undo'),
      redo: () => step('redo'),
      saveFile,
      openFile,
      exportGame,
      newProject: () => switchProject(blankContent(), 'Started a new project. Your previous one is under Project → Recent'),
      loadSample: (id) => {
        const x = SAMPLES.find((v) => v.id === id) ?? SAMPLES[0];
        switchProject(x.content(), `Opened ${x.name} as a new project`);
      },
      async openRecent(id) {
        const c = await loadProject(id);
        if (!c) return flash("Couldn't read that project");
        switchProject(c, `Opened ${c.name}`, id);
      },
      async deleteRecent(id) {
        if (id === stateRef.current.projectId) return flash("Can't delete the project that's open");
        await deleteProject(id);
        flash('Deleted the project from this browser');
      },
      replaceRooms(rooms, msg) {
        edit((s) => ({
          rooms,
          nodes: s.nodes.map((n) => (n.room && !rooms.some((r) => r.id === n.room) ? { ...n, room: null, pos: undefined } : n)),
          doors: {},
          selRoom: null,
          selRooms: [],
          editRoom: null,
          grid: {
            w: Math.max(s.grid.w, ...rooms.map((r) => r.x + r.w)),
            h: Math.max(s.grid.h, ...rooms.map((r) => r.y + r.h)),
          },
        }));
        flash(msg);
      },
      openIssue(issue) {
        set((s) => ({
          mode: 'author',
          editRoom: issue.tile && issue.room ? issue.room : null,
          selRoom: issue.room ?? s.selRoom,
          selRooms: issue.room ? [issue.room] : s.selRooms,
          selNode: issue.node ?? s.selNode,
        }));
      },
    }),
    [state, analysis, check, byId, roomById, world, hatchUnreachable, set, edit, flash, deleteRooms, playtest, playFrom, startPlay, leavePlay, restart, step, saveFile, openFile, exportGame, switchProject],
  );

  const author = state.mode === 'author';
  const painting = author && !!state.editRoom && !!roomById[state.editRoom];
  return (
    <EditorContext.Provider value={api}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, overflow: 'hidden' }}>
        <TopBar />
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {!state.prefs.hideLeft && (author ? painting ? <PainterSidebar /> : <AuthorSidebar /> : <PlaytestSidebar />)}
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
            {!author ? <PlaytestView /> : painting ? <RoomPainter /> : <MapBoard />}
            {state.toast && <Toast message={state.toast} />}
          </main>
          {!state.prefs.hideRight && (author ? <InspectorPanel /> : <PlaytestPanel />)}
        </div>
        <StatusBar />
        {state.gen && <GenerateDialog />}
        {state.importing && <ImportDialog />}
      </div>
    </EditorContext.Provider>
  );
}
