import { describe, expect, it } from 'vitest';
import { indexNodes } from '../model/graph';
import { PRESETS } from '../model/sampleProject';
import { encodeTiles, Tile } from '../model/tiles';
import type { GraphNode, Room } from '../model/types';
import { Game, type GameEvents } from './Game';
import { roughIn } from './world';

/** A 2×2-cell room (16×16 tiles) with `paint` applied on top of the walls. */
function setup(paint: (g: Uint8Array) => void) {
  const g = roughIn({ w: 2, h: 2 });
  paint(g);
  const rooms: Room[] = [{ id: 'A', name: 'A', x: 0, y: 0, w: 2, h: 2, tiles: encodeTiles(g) }];
  const nodes: GraphNode[] = [{ id: 'start', kind: 'start', label: 'Start', room: 'A', req: [] }];
  const hurt: string[] = [];
  const events: GameEvents = { onEnterRoom() {}, onPickup() {}, onWin() {}, onHurt: (r) => hurt.push(r.id) };
  const game = new Game(rooms, nodes, indexNodes(nodes), PRESETS[0], 30, events);
  const run = (seconds: number, held: string[] = [], jump = false) => {
    for (let t = 0, first = true; t < seconds; t += 1 / 60, first = false) {
      game.step(1 / 60, new Set(held), new Set(jump && first ? ['jump' as const] : []));
    }
  };
  return { game, hurt, run, player: () => (game as unknown as { p: { x: number; y: number; h: number; ground: boolean } }).p };
}

describe('Game tiles', () => {
  it('jumps up through a platform and lands on it', () => {
    const { run, player } = setup((g) => {
      for (let x = 1; x < 15; x++) g[12 * 16 + x] = Tile.Platform;
    });
    run(0.3);
    expect(player().y + player().h).toBeCloseTo(15, 1); // standing on the floor below
    run(1.2, [], true);
    expect(player().ground).toBe(true);
    expect(player().y + player().h).toBeCloseTo(12, 1);
  });

  it('sends the player back to the room entry on spikes', () => {
    const { run, player, hurt } = setup((g) => {
      for (let x = 11; x < 15; x++) g[14 * 16 + x] = Tile.Spikes;
    });
    run(0.3);
    const start = player().x;
    run(1, ['ArrowRight']);
    expect(hurt).toContain('A');
    expect(player().x).toBeLessThan(start + 3);
  });
});
