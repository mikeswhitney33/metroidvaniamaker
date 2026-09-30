import type { CSSProperties } from 'react';
import type { GraphNode } from '../model/types';

/** Colour tokens from the Vaultwright design. */
export const C = {
  bg: '#111317',
  bar: '#15171b',
  panel: '#181b20',
  panelDeep: '#1b1e23',
  field: '#1f2329',
  fieldHover: '#262b33',
  line: '#2b3038',
  lineStrong: '#343a44',
  text: '#dfe2e7',
  textSoft: '#b7bdc7',
  muted: '#9aa1ad',
  dim: '#6f7682',
  faint: '#4a515c',
  accent: '#f0b44c',
  ok: '#4fd1a5',
  bad: '#ff6b6b',
  badSoft: '#ff8a8a',
  canvas: '#0b0c0f',
} as const;

export const SANS = "'IBM Plex Sans', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', monospace";

/** Uppercase mono section heading. */
export const sectionLabel: CSSProperties = {
  font: `500 10.5px ${MONO}`,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: C.muted,
};

/** Wrapper for a segmented control. */
export const segGroup: CSSProperties = {
  display: 'flex',
  gap: 2,
  padding: 2,
  background: C.bg,
  border: `1px solid ${C.line}`,
  borderRadius: 6,
};

/** One segment of a segmented control. */
export const seg = (on: boolean): CSSProperties => ({
  flex: 1,
  height: 26,
  padding: '0 10px',
  border: 0,
  borderRadius: 4,
  background: on ? C.line : 'transparent',
  color: on ? C.text : C.muted,
  font: `500 12px ${SANS}`,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

/** Overlay toggle button. */
export const toggle = (on: boolean): CSSProperties => ({
  flex: 1,
  height: 28,
  borderRadius: 5,
  border: `1px solid ${on ? C.faint : C.line}`,
  background: on ? C.fieldHover : 'transparent',
  color: on ? C.text : C.dim,
  font: `500 12px ${SANS}`,
  cursor: 'pointer',
});

export const secondaryButton: CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 5,
  border: `1px solid ${C.lineStrong}`,
  background: C.field,
  color: C.text,
  font: `500 12px ${SANS}`,
  cursor: 'pointer',
};

export const dangerButton: CSSProperties = {
  height: 28,
  borderRadius: 5,
  border: '1px solid rgba(255,107,107,.35)',
  background: 'transparent',
  color: C.badSoft,
  font: `500 12px ${SANS}`,
  cursor: 'pointer',
};

export const primaryButton: CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: 5,
  border: 0,
  background: C.accent,
  color: C.bar,
  font: `600 12px ${SANS}`,
  cursor: 'pointer',
};

export const textInput: CSSProperties = {
  height: 30,
  padding: '0 8px',
  borderRadius: 5,
  border: `1px solid ${C.lineStrong}`,
  background: C.bg,
  color: C.text,
  font: `500 13px ${SANS}`,
  outline: 'none',
};

/** Legend swatch: keys are dots, gates are outlined squares, start/boss are filled squares. */
export const swatch = (n: GraphNode | undefined, c: string): CSSProperties =>
  n && n.kind === 'gate'
    ? { width: 10, height: 10, flex: 'none', borderRadius: 2, border: `2px solid ${c}`, boxSizing: 'border-box' }
    : { width: 10, height: 10, flex: 'none', borderRadius: n && n.kind === 'key' ? '50%' : 2, background: c };

export const dot = (color: string, size = 7): CSSProperties => ({
  width: size,
  height: size,
  flex: 'none',
  borderRadius: '50%',
  background: color,
});

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
