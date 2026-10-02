import type { RoomClip } from '../model/rooms';

/** Copied rooms live in this browser's storage, so they paste into another project too. */
const KEY = 'vaultwright.clipboard';

let memory: RoomClip | null = null;

export function writeClip(c: RoomClip) {
  memory = c;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // Too big or storage blocked: the copy still works within this tab.
  }
}

export function readClip(): RoomClip | null {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const c = JSON.parse(s) as RoomClip;
      if (Array.isArray(c.rooms) && c.rooms.length) return c;
    }
  } catch {
    // Fall back to this tab's copy.
  }
  return memory;
}
