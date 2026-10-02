import { describe, expect, it } from 'vitest';
import { analyze } from '../graph';
import { solve } from '../solver';
import { homageContent } from './index';

describe('Vault of the Hollow King', () => {
  const c = homageContent();

  it('is beatable with no issues at all', () => {
    const r = solve(c);
    expect(r.issues).toEqual([]);
    expect(r.beatable).toBe(true);
    expect(r.rooms.size).toBe(c.rooms.length);
    expect(analyze(c.rooms, c.nodes).issues).toEqual([]);
  });

  it('follows the intended order of the main powers', () => {
    const { stepOf } = solve(c);
    const order = ['roll', 'missiles', 'bombs', 'thermal', 'velocity', 'supers', 'blade', 'legacy'];
    order.slice(1).forEach((id, i) => expect(stepOf[`key:${id}`], id).toBeGreaterThan(stepOf[`key:${order[i]}`]));
    expect(stepOf['key:novas']).toBeGreaterThanOrEqual(stepOf['key:legacy']);
    expect(stepOf['boss:H6:H6e1']).toBeGreaterThan(stepOf['boss:M4:M4e1']);
    expect(stepOf['boss:H6:H6e1']).toBeGreaterThan(stepOf['boss:A4:A4e1']);
  });

  it('lets a stripped player reach the Legacy Suit from the temple door', () => {
    // The solver doesn't model stripping, so check the temple with no powers at all.
    const nodes = c.nodes.filter((n) => n.kind !== 'key' || n.id === 'legacy').map((n) => (n.kind === 'start' ? { ...n, room: 'R1', pos: { x: 3, y: 14 } } : n));
    expect(solve({ ...c, nodes }).stepOf['key:legacy']).toBe(0);
  });

  it('uses only original names', () => {
    const text = JSON.stringify(c).toLowerCase();
    ['metroid', 'samus', 'zebes', 'chozo', 'ridley', 'kraid', 'brinstar', 'norfair', 'tourian', 'varia', 'morph'].forEach((w) => expect(text).not.toContain(w));
  });
});
