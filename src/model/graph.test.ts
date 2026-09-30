import { describe, expect, it } from 'vitest';
import { adj, analyze, autoPlaceKeys, colorOf, depths, indexNodes } from './graph';
import { SAMPLE_NODES, SAMPLE_ROOMS } from './sampleProject';
import type { GraphNode } from './types';

describe('adj', () => {
  it('finds a vertical shared edge', () => {
    expect(adj({ id: 'a', name: '', x: 0, y: 0, w: 2, h: 3 }, { id: 'b', name: '', x: 2, y: 1, w: 2, h: 4 })).toEqual({
      v: true,
      lo: 1,
      hi: 3,
      at: 2,
    });
  });
  it('ignores rooms that only touch at a corner', () => {
    expect(adj({ id: 'a', name: '', x: 0, y: 0, w: 2, h: 2 }, { id: 'b', name: '', x: 2, y: 2, w: 2, h: 2 })).toBeNull();
  });
});

describe('analyze', () => {
  it('solves the sample project in gate order', () => {
    const a = analyze(SAMPLE_ROOMS, SAMPLE_NODES);
    expect(a.errors).toBe(0);
    expect(a.order).toEqual(['dash', 'grapple', 'dive', 'red', 'djump']);
    expect(a.reached.has('M')).toBe(true);
  });

  it('flags a key sealed behind its own gate', () => {
    const nodes: GraphNode[] = SAMPLE_NODES.map((n) => (n.id === 'grapple' ? { ...n, room: 'H' } : n));
    const a = analyze(SAMPLE_ROOMS, nodes);
    expect(a.issues.some((i) => i.sev === 'error' && i.msg.includes('sealed behind the gate it opens'))).toBe(true);
  });

  it('requires a placed start', () => {
    const nodes = SAMPLE_NODES.map((n) => (n.kind === 'start' ? { ...n, room: null } : n));
    expect(analyze(SAMPLE_ROOMS, nodes).issues[0].msg).toMatch(/No start room/);
  });

  it('flags isolated rooms', () => {
    const rooms = [...SAMPLE_ROOMS, { id: 'Z', name: 'Island', x: 0, y: 0, w: 1, h: 1 }];
    expect(analyze(rooms, SAMPLE_NODES).issues.some((i) => i.room === 'Z')).toBe(true);
  });
});

describe('graph helpers', () => {
  it('gives gates the colour of their key', () => {
    const byId = indexNodes(SAMPLE_NODES);
    expect(colorOf(byId.gRed, byId)).toBe(byId.red.color);
  });
  it('computes requirement depth', () => {
    const d = depths(SAMPLE_NODES);
    expect(d.start).toBe(0);
    expect(d.boss).toBe(11);
  });
  it('auto-placement keeps the sample beatable', () => {
    const placed = autoPlaceKeys(SAMPLE_ROOMS, SAMPLE_NODES, 1234);
    expect(analyze(SAMPLE_ROOMS, placed).errors).toBe(0);
  });
});
