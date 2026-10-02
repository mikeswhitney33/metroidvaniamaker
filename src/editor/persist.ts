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

/** The autosaved project, or null when there is none or it can't be read. */
export async function loadAutosave(): Promise<ProjectContent | null> {
  try {
    const text = await run<unknown>('readonly', (s) => s.get(AUTOSAVE));
    return typeof text === 'string' ? parseProject(text) : null;
  } catch {
    return null;
  }
}

export function saveAutosave(c: ProjectContent): Promise<void> {
  const text = JSON.stringify(toProjectFile(c));
  return run('readwrite', (s) => s.put(text, AUTOSAVE)).then(() => undefined);
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
