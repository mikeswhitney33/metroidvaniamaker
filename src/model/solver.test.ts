import { describe, expect, it } from 'vitest';
import { blankContent, sampleContent, type ProjectContent } from './project';
import { solve, trickReports } from './solver';
import { asciiRoom } from './testing/ascii';
import type { Entity, GraphNode, Room } from './types';

/** One-room project: start at S, a key item at K granting `ability`, goal exit at E. */
function oneRoom(rows: string[], ability: string, extra: Partial<ProjectContent> = {}): ProjectContent {
  const find = (ch: string) => {
    for (let y = 0; y < rows.length; y++) {
      const x = rows[y].indexOf(ch);
      if (x >= 0) return { x, y };
    }
    throw new Error(`no ${ch}`);
  };
  // Markers take on the tile to their right (so a start in water stands in water).
  const clean = rows.map((r) => r.replace(/[SKE]/g, (_, i: number) => (r[i + 1] === '~' ? '~' : '.')));
  const e = find('E');
  const exit: Entity = { id: 'e1', type: 'exit', x: e.x, y: e.y, props: {} };
  const room = asciiRoom('A', 0, 0, clean, { entities: [exit] });
  const nodes: GraphNode[] = [
    { id: 'start', kind: 'start', label: 'Start', room: 'A', req: [], pos: find('S') },
    { id: 'item', kind: 'key', label: 'Item', room: 'A', req: [], ability, pos: find('K') },
    { id: 'goal', kind: 'boss', label: 'Goal', room: null, req: [] },
  ];
  return { ...blankContent(), rooms: [room], nodes, ...extra };
}

const ROWS = (mid: string[]) => [
  '################',
  ...mid,
  '################',
];

describe('solver', () => {
  it('needs Spring Boots for a ledge too high to jump', () => {
    const rows = ROWS([
      '#E.............#',
      '######.........#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#S...........K.#',
    ]);
    // The exit ledge is 12 tiles above the floor: too high even with Spring Boots.
    expect(solve(oneRoom(rows, 'spring')).beatable).toBe(false);
    const lower = ROWS([
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#E.............#',
      '######.........#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#S...........K.#',
    ]);
    // 7 tiles up: normal jump (6) fails, Spring Boots (9) make it.
    const r = solve(oneRoom(lower, 'spring'));
    expect(r.beatable).toBe(true);
    expect(r.stepOf['key:item']).toBe(0);
    expect(r.stepOf['exit:A:e1']).toBe(1);
    expect(solve(oneRoom(lower, 'dash')).beatable).toBe(false);
  });

  const tunnel = (block: string) =>
    ROWS([
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      `#........######`.padEnd(16, '#'),
      `#.K.S...${block}.....E#`,
    ]);

  it('needs Roll Form for a one-tile tunnel', () => {
    const c = oneRoom(tunnel('.'), 'roll');
    expect(solve(c).beatable).toBe(true);
    expect(solve(oneRoom(tunnel('.'), 'dash')).beatable).toBe(false);
  });

  it('needs Roll Form and Bombs for a bomb block in a tunnel', () => {
    const c = oneRoom(tunnel('b'), 'roll');
    expect(solve(c).beatable).toBe(false);
    // Add Bombs as a second item next to the first.
    c.nodes.push({ id: 'bombs', kind: 'key', label: 'Bombs', room: 'A', req: [], ability: 'bombs', pos: { x: 3, y: 12 } });
    expect(solve(c).beatable).toBe(true);
  });

  it('jumps up through platforms', () => {
    const rows = ROWS([
      '#..............#',
      '#..............#',
      '#..............#',
      '#E.............#',
      '#=====.........#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#=====.........#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#S...........K.#',
    ]);
    expect(solve(oneRoom(rows, 'dash')).beatable).toBe(true);
  });

  it('jumps lower in water without the Tide Suit', () => {
    const rows = ROWS([
      ...Array(8).fill('#..............#'),
      '#E.............#',
      '#####~~~~~~~~~~#',
      '#~~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~~#',
      '#~~~~~~~~~~~~~~#',
      '#~S~~~~~~~~~~K~#',
    ]);
    // 5 tiles up and one across: fine on land, too high from water until the Tide Suit.
    expect(solve(oneRoom(rows, 'dash')).beatable).toBe(false);
    expect(solve(oneRoom(rows, 'tide')).beatable).toBe(true);
  });

  it('opens a red hatch with Missiles only', () => {
    const left = asciiRoom('A', 0, 0, ROWS(Array(14).fill('#..............#')).map((r, i) => (i >= 10 && i <= 14 ? r.slice(0, 15) + '.' : r)));
    const right = asciiRoom('B', 2, 0, ROWS(Array(14).fill('#..............#')), {
      entities: [{ id: 'e1', type: 'exit', x: 8, y: 13, props: {} }],
    });
    const base: ProjectContent = {
      ...blankContent(),
      rooms: [left, right],
      nodes: [
        { id: 'start', kind: 'start', label: 'Start', room: 'A', req: [], pos: { x: 3, y: 14 } },
        { id: 'item', kind: 'key', label: 'Item', room: 'A', req: [], ability: 'missiles', pos: { x: 6, y: 14 } },
        { id: 'goal', kind: 'boss', label: 'Goal', room: null, req: [] },
      ],
      doors: { 'A|B': { kind: 'red' } },
    };
    expect(solve(base).beatable).toBe(true);
    const noMissiles = { ...base, nodes: base.nodes.map((n) => (n.id === 'item' ? { ...n, ability: 'roll' } : n)) };
    const r = solve(noMissiles);
    expect(r.beatable).toBe(false);
    expect(solve({ ...noMissiles, doors: { 'A|B': { kind: 'blue' } } }).beatable).toBe(true);
  });

  it('opens a grey hatch once the boss behind it falls', () => {
    const rows = ROWS(Array(14).fill('#..............#'));
    const a = asciiRoom('A', 0, 0, rows, {
      entities: [{ id: 'b1', type: 'boss', x: 4, y: 10, props: { kind: 'worm', name: 'Worm', flag: 'worm', weak: 'missile', hp: 100 } }],
    });
    const b = asciiRoom('B', 2, 0, rows, { entities: [{ id: 'e1', type: 'exit', x: 8, y: 13, props: {} }] });
    const c: ProjectContent = {
      ...blankContent(),
      rooms: [a, b],
      nodes: [
        { id: 'start', kind: 'start', label: 'Start', room: 'A', req: [], pos: { x: 2, y: 14 } },
        { id: 'item', kind: 'key', label: 'Item', room: 'A', req: [], ability: 'missiles', pos: { x: 5, y: 14 } },
        { id: 'goal', kind: 'boss', label: 'Goal', room: null, req: [] },
      ],
      doors: { 'A|B': { kind: 'grey', flag: 'worm' } },
    };
    const r = solve(c);
    expect(r.beatable).toBe(true);
    expect(r.stepOf['boss:A:b1']).toBe(1);
    expect(r.stepOf['exit:B:e1']).toBe(2);
  });

  it('reports a sequence break that wall jumps allow', () => {
    const rows = ROWS([
      '#E...#.........#',
      '###..#.........#',
      '#....#.........#',
      '#....#.........#',
      '#....#.........#',
      '#....#.........#',
      '#....#.........#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#..............#',
      '#S...........K.#',
    ]);
    const c = oneRoom(rows, 'skystep');
    const base = solve(c);
    expect(base.beatable).toBe(true);
    const reports = trickReports(c, base);
    const wj = reports.find((t) => t.trick === 'walljump')!;
    expect(wj).toBeDefined();
    expect(solve(c, { extraTricks: ['walljump'] }).stepOf['exit:A:e1']).toBe(0);
  });

  it('can finish the Hollow Depths sample', () => {
    const r = solve(sampleContent());
    expect(r.issues.filter((i) => i.sev === 'error')).toEqual([]);
    expect(r.beatable).toBe(true);
  });

  it('flags a key that the moves can never reach', () => {
    const rows = ROWS([
      '#K.............#',
      ...Array(12).fill('#..............#'),
      '#S............E#',
    ]);
    const r = solve(oneRoom(rows, 'dash'));
    expect(r.beatable).toBe(true);
    expect(r.issues.some((i) => i.sev === 'error' && i.msg.includes('Item'))).toBe(true);
  });

  it('warns about a pit the player can fall into and never leave', () => {
    const pit = asciiRoom('B', 0, 1, ['########', ...Array(14).fill('#......#'), '########']);
    const rooms: Room[] = [{ id: 'A', name: 'Ledge', x: 0, y: 0, w: 2, h: 1 }, { ...pit, name: 'Pit' }];
    const nodes: GraphNode[] = [
      { id: 'start', kind: 'start', label: 'Start', room: 'A', req: [], pos: { x: 12, y: 6 } },
      { id: 'k', kind: 'key', label: 'Key', room: 'A', req: [], pos: { x: 14, y: 6 } },
      { id: 'goal', kind: 'boss', label: 'Goal', room: 'A', req: [] },
    ];
    const r = solve({ ...blankContent(), rooms, nodes });
    expect(r.beatable).toBe(true);
    expect(r.issues.some((i) => i.msg.startsWith('Softlock') && i.room === 'B')).toBe(true);
    expect(r.issues.some((i) => i.msg.startsWith('Softlock') && i.room === 'A')).toBe(false);
  });

  it('raises no softlock warnings on the sample map', () => {
    expect(solve(sampleContent()).issues.filter((i) => i.msg.startsWith('Softlock'))).toEqual([]);
  });
});

export type { Room };
