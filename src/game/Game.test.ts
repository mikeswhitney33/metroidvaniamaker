import { describe, expect, it } from 'vitest';
import { jumpReach } from '../model/physics';
import { blankContent, DEFAULT_PHYSICS, type ProjectContent } from '../model/project';
import { asciiRoom } from '../model/testing/ascii';
import { Tile } from '../model/tiles';
import type { Entity, GraphNode } from '../model/types';
import { Game, STEP, type GameEvents } from './Game';
import { ControlFrame, type Action } from './input';

/** One-room project from rows: S start, K a key item granting `ability`; entities by letter. */
function project(rows: string[], ability = '', ents: Record<string, Omit<Entity, 'x' | 'y' | 'id'>> = {}): ProjectContent {
  const at = (ch: string) => {
    for (let y = 0; y < rows.length; y++) {
      const x = rows[y].indexOf(ch);
      if (x >= 0) return { x, y };
    }
    return null;
  };
  const entities: Entity[] = [];
  Object.entries(ents).forEach(([ch, e], i) => {
    const p = at(ch);
    if (p) entities.push({ ...e, id: `e${i}`, ...p });
  });
  const clean = rows.map((r) => r.replace(/[A-Z]/g, '.'));
  const nodes: GraphNode[] = [{ id: 'start', kind: 'start', label: 'Start', room: 'A', req: [], pos: at('S')! }];
  const k = at('K');
  if (k) nodes.push({ id: 'item', kind: 'key', label: 'Item', room: 'A', req: [], ability, pos: k });
  return { ...blankContent(), rooms: [asciiRoom('A', 0, 0, clean, { entities })], nodes, doors: {} };
}

function play(c: ProjectContent, events: GameEvents = {}) {
  const game = new Game(c, events, { saveKey: null });
  const run = (seconds: number, held: Action[] = [], tap: Action[] = []) => {
    for (let t = 0, first = true; t < seconds; t += STEP, first = false) {
      game.update(new ControlFrame(new Set(held), new Set(first ? tap : [])));
      if (game.banner?.hold) game.banner = null;
    }
  };
  return { game, run, p: () => game.player };
}

const box = (inner: string[], w = 24) => ['#'.repeat(w), ...inner.map((r) => r.padEnd(w - 1, '.').slice(0, w - 1) + '#'), '#'.repeat(w)];

describe('Game', () => {
  it('jumps up through a platform and lands on it', () => {
    const rows = box(['#'.padEnd(23, '.'), ...Array(9).fill('#'), '#====================', '#', '#', '#S']);
    const { run, p } = play(project(rows));
    run(0.3);
    expect(p().y + p().h).toBeCloseTo(15, 1);
    run(1.4, ['jump'], ['jump']);
    expect(p().ground).toBe(true);
    expect(p().y + p().h).toBeCloseTo(11, 1);
  });

  it('can land on exactly the ledge height the solver allows, and no higher', () => {
    const h = jumpReach(DEFAULT_PHYSICS).normal;
    const ledge = (height: number) => {
      const inner: string[] = [];
      for (let y = 0; y < 14; y++) inner.push(y >= 14 - height ? '#..........############' : '#');
      inner[13] = '#.........S############';
      return box(inner);
    };
    for (const [height, ok] of [
      [h, true],
      [h + 1, false],
    ] as const) {
      const { run, p } = play(project(ledge(height)));
      run(0.2);
      run(1.2, ['jump', 'right'], ['jump']);
      run(0.6, ['right']);
      const feet = p().y + p().h;
      expect(feet < 15 - height + 0.1, `ledge ${height}`).toBe(ok);
    }
  });

  it('takes damage on spikes with knockback and brief invulnerability', () => {
    const rows = box([...Array(13).fill('#'), '#S...^^^^^^']);
    const hurt: number[] = [];
    const { game, run } = play(project(rows), { onHurt: (_, e) => hurt.push(e) });
    run(0.2);
    run(1, ['right']);
    expect(hurt.length).toBeGreaterThan(0);
    expect(game.run.energy).toBeLessThan(99);
    expect(game.run.energy).toBeGreaterThan(0);
  });

  it('grants an ability when its item is picked up', () => {
    const rows = box([...Array(13).fill('#'), '#S..K']);
    const got: string[] = [];
    const { game, run } = play(project(rows, 'missiles'), { onPickup: (l) => got.push(l) });
    expect(game.has('missile')).toBe(false);
    run(1, ['right']);
    expect(got).toEqual(['Item']);
    expect(game.has('missile')).toBe(true);
    expect(game.run.ammo.missiles).toBe(5);
  });

  it('breaks a missile block with a missile but not the beam', () => {
    const rows = box([...Array(12).fill('#'), '#.....m', '#S....m']);
    const { game, run } = play(project(rows));
    run(0.2);
    run(0.5, [], ['shoot']);
    expect(game.level.tile(6, 13)).toBe(Tile.MissileBlock);
    game.run.keys.push('x');
    game.run.ammo.missiles = 3;
    // Grant missiles directly: a key whose ability is missiles.
    game.content.nodes.push({ id: 'x', kind: 'key', label: 'M', room: null, req: [], ability: 'missiles' });
    (game as unknown as { refresh(): void }).refresh();
    run(0.1, [], ['select']);
    expect(game.weapon).toBe('missiles');
    run(0.6, [], ['shoot']);
    expect(game.level.tile(6, 13)).toBe(Tile.Empty);
    expect(game.run.ammo.missiles).toBe(2);
  });

  it('bounces a rolled player with a bomb', () => {
    const rows = box([...Array(13).fill('#'), '#S']);
    const c = project(rows);
    c.nodes.push({ id: 'r', kind: 'key', label: 'Roll', room: null, req: [], ability: 'roll' }, { id: 'b', kind: 'key', label: 'Bombs', room: null, req: [], ability: 'bombs' });
    const game = new Game(c, {}, { saveKey: null, run: { ...new Game(c).run, keys: ['r', 'b'] } });
    const step = (held: Action[] = [], tap: Action[] = []) => game.update(new ControlFrame(new Set(held), new Set(tap)));
    for (let i = 0; i < 10; i++) step();
    step([], ['down']);
    step([], ['down']);
    expect(game.player.form).toBe('roll');
    const floor = game.player.y;
    step([], ['shoot']);
    let best = floor;
    for (let i = 0; i < 80; i++) {
      step();
      best = Math.min(best, game.player.y);
    }
    expect(floor - best).toBeGreaterThan(1.5);
  });

  it('recharges at a recharge station and wins at an exit', () => {
    const rows = box([...Array(13).fill('#'), '#S...R.....E']);
    const wins: string[] = [];
    const { game, run } = play(
      project(rows, '', { R: { type: 'recharge', props: {} }, E: { type: 'exit', props: { when: '' } } }),
      { onWin: (m) => wins.push(m) },
    );
    game.run.energy = 10;
    run(0.2);
    run(2, ['right']);
    expect(game.run.energy).toBe(99);
    expect(wins.length).toBe(1);
  });

  it('crumble blocks give way after being stood on', () => {
    const c = project(box([...Array(9).fill('#'), '#..S', '#.cccc', '#', '#', '#']));
    const { game, run } = play(c);
    run(0.2);
    expect(game.player.ground).toBe(true);
    run(1);
    expect(game.player.y).toBeGreaterThan(11);
  });
});
