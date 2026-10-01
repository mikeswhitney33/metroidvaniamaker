import type { GraphNode, Room, StylePreset } from './types';

/** Editor grid dimensions, in cells. */
export const GRID_W = 32;
export const GRID_H = 18;

/** The "Hollow Depths" sample map the editor opens with. */
export const SAMPLE_ROOMS: Room[] = [
  { id: 'A', name: 'Crash Site', x: 1, y: 9, w: 4, h: 3 },
  { id: 'B', name: 'West Passage', x: 5, y: 10, w: 4, h: 1 },
  { id: 'C', name: 'Hollow Hub', x: 9, y: 8, w: 4, h: 5 },
  { id: 'D', name: 'Chimney', x: 10, y: 3, w: 1, h: 5 },
  { id: 'E', name: 'Spire Chamber', x: 8, y: 0, w: 5, h: 3 },
  { id: 'F', name: 'Ash Corridor', x: 13, y: 10, w: 5, h: 1 },
  { id: 'G', name: 'Sunken Archive', x: 18, y: 8, w: 5, h: 4 },
  { id: 'H', name: 'Deep Well', x: 20, y: 12, w: 1, h: 3 },
  { id: 'I', name: 'Flooded Vault', x: 17, y: 15, w: 6, h: 3 },
  { id: 'J', name: 'Red Hall', x: 23, y: 9, w: 4, h: 1 },
  { id: 'K', name: 'Forge Heart', x: 27, y: 6, w: 4, h: 5 },
  { id: 'L', name: 'Updraft', x: 28, y: 2, w: 1, h: 4 },
  { id: 'M', name: "Warden's Throne", x: 25, y: 0, w: 6, h: 2 },
  { id: 'N', name: 'Drain', x: 12, y: 16, w: 5, h: 1 },
  { id: 'O', name: 'Root Cellar', x: 7, y: 14, w: 5, h: 4 },
];

export const SAMPLE_NODES: GraphNode[] = [
  { id: 'start', kind: 'start', label: 'Start', room: 'A', req: [] },
  { id: 'dash', kind: 'key', label: 'Dash Boots', color: '#5ec4e8', room: 'E', req: ['start'], ability: 'dash' },
  { id: 'gDash', kind: 'gate', label: 'Collapsed Wall', room: 'F', req: ['dash'] },
  { id: 'grapple', kind: 'key', label: 'Grapple Hook', color: '#b48cff', room: 'G', req: ['gDash'] },
  { id: 'gGrapple', kind: 'gate', label: 'Hook Anchors', room: 'H', req: ['grapple'] },
  { id: 'dive', kind: 'key', label: 'Dive Suit', color: '#4fd1a5', room: 'I', req: ['gGrapple'] },
  { id: 'gFlood', kind: 'gate', label: 'Flooded Drain', room: 'N', req: ['dive'] },
  { id: 'red', kind: 'key', label: 'Red Sigil', color: '#ff6b6b', room: 'O', req: ['gFlood'] },
  { id: 'gRed', kind: 'gate', label: 'Red Door', room: 'J', req: ['red'] },
  { id: 'djump', kind: 'key', label: 'Double Jump', color: '#f0b44c', room: 'K', req: ['gRed'], ability: 'djump' },
  { id: 'gUp', kind: 'gate', label: 'Updraft Gap', room: 'L', req: ['djump', 'grapple'] },
  { id: 'boss', kind: 'boss', label: 'The Warden', room: 'M', req: ['gUp'] },
];

/** Colours handed out to keys added from the editor. */
export const EXTRA_KEY_COLORS = ['#7aa2ff', '#e879c6', '#9be15d', '#ffd166', '#6ee7f2'];

export const PRESETS: StylePreset[] = [
  { id: 'ashen', name: 'Ashen Gothic', bg: '#14121a', bg2: '#1f1a29', wall: '#4a4458', edge: '#a597c4', player: '#f0e6d2' },
  { id: 'neon', name: 'Neon Ruin', bg: '#0a0e19', bg2: '#121b33', wall: '#1d2a4c', edge: '#3ee6d0', player: '#ff4fa3' },
  { id: 'verdant', name: 'Verdant Deep', bg: '#0e1812', bg2: '#16281c', wall: '#2e4a35', edge: '#9fd37f', player: '#f2e3a0' },
  { id: 'ink', name: '1-bit Ink', bg: '#0d0d0d', bg2: '#181818', wall: '#d9d4c7', edge: '#ffffff', player: '#ff5a3c' },
];

export const presetById = (id: string): StylePreset => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
