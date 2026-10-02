import { DEFAULT_BINDINGS, type Bindings } from '../game/input';

/** Per-person settings that aren't part of the project: they stay in this browser. */
export interface Prefs {
  bindings: Bindings;
  /** Assist mode: take half damage. */
  assist: boolean;
  reducedFlash: boolean;
  muted: boolean;
  music: boolean;
  /** Side panels hidden to give the map or painter more room. */
  hideLeft: boolean;
  hideRight: boolean;
  /** Items a "play from here" run starts with. */
  loadout: 'route' | 'all' | 'none';
}

export const DEFAULT_PREFS: Prefs = { bindings: DEFAULT_BINDINGS, assist: false, reducedFlash: false, muted: false, music: true, hideLeft: false, hideRight: false, loadout: 'route' };

const KEY = 'vaultwright.prefs';

export function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { ...DEFAULT_PREFS, reducedFlash: reduced, ...p, bindings: { ...DEFAULT_BINDINGS, ...p.bindings } };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not saved: settings last for this session only.
  }
}
