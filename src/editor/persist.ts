import { parseProject, toProjectFile, type ProjectContent } from '../model/project';

const DB = 'vaultwright';
const STORE = 'projects';
const AUTOSAVE = 'autosave';
/** Where reference images lived before they moved into the project. */
const LEGACY_IMAGE_PREFIX = 'vaultwright.image-slot.';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** One project in this browser's list. */
export interface ProjectEntry {
  id: string;
  name: string;
  savedAt: string;
  rooms: number;
}

const INDEX = 'index';
const CURRENT = 'current';
const projectKey = (id: string) => `p:${id}`;

export const newProjectId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function readIndex(): Promise<ProjectEntry[]> {
  const v = await run<unknown>('readonly', (s) => s.get(INDEX));
  return Array.isArray(v) ? (v as ProjectEntry[]) : [];
}

/** Projects saved in this browser, most recently saved first. */
export async function listProjects(): Promise<ProjectEntry[]> {
  try {
    return (await readIndex()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export async function loadProject(id: string): Promise<ProjectContent | null> {
  try {
    const text = await run<unknown>('readonly', (s) => s.get(projectKey(id)));
    return typeof text === 'string' ? parseProject(text) : null;
  } catch {
    return null;
  }
}

/**
 * The project that was open last, by id. A single autosave from before projects had ids
 * becomes the first entry in the list.
 */
export async function loadCurrent(): Promise<{ id: string; content: ProjectContent } | null> {
  try {
    const id = await run<unknown>('readonly', (s) => s.get(CURRENT));
    if (typeof id === 'string') {
      const content = await loadProject(id);
      if (content) return { id, content };
    }
    const legacy = await run<unknown>('readonly', (s) => s.get(AUTOSAVE));
    if (typeof legacy === 'string') {
      const content = parseProject(legacy);
      const nid = newProjectId();
      await saveProject(nid, content);
      await run('readwrite', (s) => s.delete(AUTOSAVE));
      return { id: nid, content };
    }
    const list = await listProjects();
    for (const p of list) {
      const content = await loadProject(p.id);
      if (content) return { id: p.id, content };
    }
    return null;
  } catch {
    return null;
  }
}

/** Saves the project under its id, marks it as the one open, and updates the list. */
export async function saveProject(id: string, c: ProjectContent): Promise<void> {
  const file = toProjectFile(c);
  await run('readwrite', (s) => s.put(JSON.stringify(file), projectKey(id)));
  const list = (await readIndex()).filter((p) => p.id !== id);
  list.push({ id, name: c.name, savedAt: file.savedAt, rooms: c.rooms.length });
  await run('readwrite', (s) => s.put(list, INDEX));
  await run('readwrite', (s) => s.put(id, CURRENT));
}

export async function deleteProject(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(projectKey(id)));
  const list = (await readIndex()).filter((p) => p.id !== id);
  await run('readwrite', (s) => s.put(list, INDEX));
}

/** Reference images the previous version kept in localStorage, so they carry into the first autosave. */
export function legacyImages(): Record<string, string> {
  const images: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = k?.startsWith(LEGACY_IMAGE_PREFIX) ? localStorage.getItem(k) : null;
      if (k && v) images[k.slice(LEGACY_IMAGE_PREFIX.length)] = v;
    }
  } catch {
    // Storage blocked: nothing to carry over.
  }
  return images;
}

export function clearLegacyImages(ids: string[]) {
  try {
    ids.forEach((id) => localStorage.removeItem(LEGACY_IMAGE_PREFIX + id));
  } catch {
    // Ignore: they'll be imported again harmlessly next time.
  }
}

/** Saves the project to the author's computer as a .vwm.json download. */
export function downloadText(text: string, fileName: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
