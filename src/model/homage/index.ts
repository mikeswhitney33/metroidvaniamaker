import type { ProjectContent } from '../project';
import { Builder, RoomBuilder, Tile } from './builder';

/**
 * "Vault of the Hollow King": the showcase game that ships with the tool. Its structure follows a
 * classic exploration-action layout (a hub cavern, a lava forge, a swamp lair, a spire, a sealed
 * core and a surface temple with a stripped-down stealth section), but every name, room and
 * line of text here is original.
 */

/** Empties a one-cell-wide shaft and adds alternating ledges every `gap` rows from `from` upward. */
function shaft(r: RoomBuilder, gap = 4, from = r.floor - gap, skip: number[] = []) {
  r.clear();
  let left = true;
  for (let y = from; y >= 2; y -= gap) {
    if (!skip.some((s) => Math.abs(s - y) <= 1)) r.shelf(left ? 1 : r.tw - 3, left ? 2 : r.tw - 2, y, Tile.Solid);
    left = !left;
  }
  return r;
}

export function homageContent(): ProjectContent {
  const b = new Builder();

  // Verdigris Hollows: the hub cavern where the run begins.
  b.setArea({ id: 'verdigris', name: 'Verdigris Hollows', color: '#6fbf73', style: 'verdant', music: 'caverns' });
  const v1 = b.room('V1', 'Landing Grotto', 20, 14, 4, 2);
  v1.station('save', 10).enemy('crawler', 22).ent('statue', 26, v1.stand, { message: 'West, a hollow small enough to curl up in. East, a run of moss too low to walk.' });
  b.start('V1', 4, v1.stand);

  const v0 = b.room('V0', 'Hush Alcove', 16, 15, 4, 1, 'empty');
  v0.enemy('hopper', 12);
  b.item('roll', 'Roll Form', 'roll', 'V0', 9, v0.stand);

  const v2 = b.room('V2', 'Moss Run', 24, 15, 5, 1, 'empty');
  v2.crawl(14, 26).enemy('crawler', 8).enemy('crawler', 32);

  const v7 = b.room('V7', 'Spore Hall', 29, 15, 4, 2);
  v7.enemy('flyer', 20, 6).enemy('walker', 24);
  b.item('missiles', 'Missiles', 'missiles', 'V7', 6, 10);

  const v3 = shaft(b.room('V3', 'Rootway Shaft', 29, 9, 1, 6), 4, 43, [31]);
  v3.shelf(1, 6, 6, Tile.MissileBlock).enemy('crawler', 3, 3);

  const v5 = b.room('V5', 'Thorn Corridor', 24, 12, 5, 1, 'empty');
  v5.fill(14, 6, 22, 6, Tile.Spikes).shelf(14, 22, 3, Tile.Platform).enemy('swooper', 20, 2).expansion('missiles', 18, 2);

  const v6 = b.room('V6', 'Bramble Hall', 19, 11, 5, 2);
  v6.enemy('walker', 30).ent('statue', 6, v6.stand, { message: 'The old makers sealed their heart below. Two wardens hold its keys.' });
  b.item('long', 'Long Shot', 'long', 'V6', 20, v6.stand);

  const v9 = b.room('V9', 'Lantern Nook', 16, 12, 3, 1, 'empty');
  v9.wall(14, 15, Tile.ShotBlock).station('recharge', 6);
  b.item('charge', 'Charge Shot', 'charge', 'V9', 19, v9.stand);

  const v8 = b.room('V8', 'Glowcap Passage', 33, 16, 6, 1, 'empty');
  v8.enemy('turret', 24, 1, { damage: 8 }).enemy('crawler', 34).station('map', 6);
  v8.fill(30, 3, 34, 6, Tile.SuperBlock).fill(31, 4, 33, 6, Tile.Empty).expansion('energy', 16, 2);
  b.door('V3', 'V5', 'red').door('V7', 'V8', 'red').door('V1', 'V2', 'blue');

  // Surface Wastes: the wreck where the ship came down, and the way to the temple.
  b.setArea({ id: 'surface', name: 'Surface Wastes', color: '#c79a6b', style: 'dusk', music: 'surface' });
  const s1 = b.room('S1', 'Wreck Plateau', 26, 6, 4, 3);
  s1.station('save', 8).ent('exit', 12, s1.stand - 1, { when: 'flag:sentinel' });
  s1.ent('statue', 20, s1.stand, { message: 'Your ship. It will not fly until the temple guardian falls.' });
  const s2 = b.room('S2', 'Windworn Ledge', 30, 7, 5, 2);
  s2.enemy('swooper', 20, 4).enemy('walker', 30).expansion('missiles', 36, 2);
  shaft(b.room('S3', 'Gale Shaft', 35, 4, 1, 5), 8);
  const s4 = b.room('S4', 'Temple Steps', 36, 4, 4, 1, 'empty');
  s4.enemy('hopper', 16);
  b.door('S3', 'S4', 'grey', 'core');

  // Sunken Reliquary: entering strips the player's powers until the old suit is found.
  b.setArea({ id: 'reliquary', name: 'Sunken Reliquary', color: '#d9c27a', style: 'ruins', music: 'ruins' });
  const r1 = b.room('R1', 'Outer Sanctum', 40, 3, 5, 2);
  r1.ent('trigger', 6, r1.stand - 2, { action: 'strip', message: 'A pulse from the altar. Your suit goes dark.', w: 2, h: 3 });
  r1.enemy('sentry', 26, 6).enemy('crawler', 30);
  const r2 = b.room('R2', 'Collapsed Nave', 45, 4, 4, 1, 'empty');
  r2.shelf(10, 20, 3).enemy('walker', 24);
  shaft(b.room('R3', 'Reliquary Well', 49, 1, 1, 5), 4, 35, [31, 15]);
  const r4 = b.room('R4', 'Legacy Hall', 50, 1, 4, 2);
  b.item('legacy', 'Legacy Suit', 'tide', 'R4', 22, r4.stand);
  r4.ent('trigger', 19, r4.stand - 3, { action: 'restore', when: 'key:legacy', message: 'Your suit wakes, and something older wakes with it.', w: 7, h: 4 });
  r4.ent('trigger', 19, r4.stand - 3, { action: 'flag', flag: 'legacy', when: 'key:legacy', w: 7, h: 4 });
  const r5 = b.room('R5', 'Nova Shrine', 54, 1, 3, 1, 'empty');
  r5.wall(6, 7, Tile.BladeBlock).expansion('novas', 14);
  b.item('novas', 'Nova Bombs', 'novas', 'R5', 18, r5.stand);
  const r6 = b.room('R6', 'Sentinel Vault', 50, 4, 5, 2, 'empty');
  r6.ent('boss', 24, r6.stand - 4, { kind: 'mech', name: 'Relic Sentinel', hp: 500, flag: 'sentinel', escape: 90, escapeTo: 'S1' });
  b.door('R3', 'R6', 'yellow');
  b.goal('Relic Sentinel', 'R6');

  // The Mire: a drowned lair under the hollows.
  b.setArea({ id: 'mire', name: 'The Mire', color: '#8fa34a', style: 'mire', music: 'hive' });
  const m1 = shaft(b.room('M1', 'Mire Lift', 15, 15, 1, 6), 4, 43, [7]);
  m1.shelf(1, 6, 10, Tile.BombBlock);
  const m2 = b.room('M2', 'Sludge Run', 7, 19, 8, 2);
  m2.fill(20, 14, 44, 14, Tile.Water).fill(20, 13, 44, 13, Tile.Water).enemy('crawler', 40).enemy('swooper', 30, 4).expansion('energy', 34, 2);
  const m3 = b.room('M3', 'Root Hollow', 3, 19, 4, 2);
  m3.wall(20, 21, Tile.BombBlock, 9, 14);
  b.item('frost', 'Frost Beam', 'frost', 'M3', 10, m3.stand);
  shaft(b.room('M6', 'Drip Shaft', 8, 21, 1, 3), 4, 19, [20]);
  const m4 = b.room('M4', "Gorrath's Bower", 9, 22, 6, 3, 'empty');
  m4.shelf(10, 16, 16).shelf(30, 36, 16).shelf(20, 26, 10);
  m4.ent('boss', 24, m4.stand - 6, { kind: 'giant', name: 'Gorrath the Rooted', hp: 400, flag: 'gorrath', weak: 'missile' });
  const m5 = b.room('M5', 'Bower Spoils', 15, 23, 3, 1, 'empty');
  m5.expansion('missiles', 10);
  b.item('thermal', 'Thermal Suit', 'thermal', 'M5', 18, m5.stand);
  b.door('V0', 'M1', 'red').door('M4', 'M5', 'grey', 'gorrath');

  // Cinder Vaults: the forge, all heat and machinery.
  b.setArea({ id: 'cinder', name: 'Cinder Vaults', color: '#e07a4a', style: 'ember', music: 'forge' });
  const c1 = shaft(b.room('C1', 'Ember Shaft', 39, 13, 1, 8), 4, 59, [31, 15, 39]);
  c1.shelf(1, 6, 22, Tile.BombBlock);
  const c2 = b.room('C2', 'Smelter Crawl', 40, 19, 6, 2, 'empty');
  c2.crawl(16, 30).enemy('crawler', 10).station('recharge', 40);
  b.item('bombs', 'Bombs', 'bombs', 'C2', 36, c2.stand);
  const c3 = b.room('C3', 'Spring Forge', 40, 13, 4, 2);
  c3.enemy('turret', 20, 1);
  b.item('spring', 'Spring Boots', 'spring', 'C3', 24, c3.stand);
  const c4 = b.room('C4', 'Magma Run', 40, 17, 8, 1, 'empty');
  c4.fill(8, 5, 56, 6, Tile.Lava).shelf(28, 32, 3).enemy('hopper', 30, 2);
  const c5 = b.room('C5', 'Velocity Hall', 48, 17, 7, 1, 'empty');
  c5.wall(48, 50, Tile.SpeedBlock).enemy('walker', 20);
  b.item('velocity', 'Velocity Drive', 'velocity', 'C5', 6, c5.stand);
  const c6 = shaft(b.room('C6', 'Cinder Chute', 55, 16, 1, 6), 4, 43, [15]);
  c6.expansion('supers', 5, 26);
  b.door('C1', 'C3', 'blue');

  // Ashen Spire: the wardens' roost.
  b.setArea({ id: 'ashen', name: 'Ashen Spire', color: '#a597c4', style: 'ashen', music: 'depths' });
  const a1 = b.room('A1', 'Spire Landing', 50, 22, 6, 2);
  a1.enemy('flyer', 20, 6).enemy('shelled', 30).expansion('energy', 4, 2);
  const a2 = b.room('A2', 'Spire Hall', 44, 22, 6, 3);
  a2.enemy('spawner', 24, 10).enemy('walker', 12);
  const a3 = b.room('A3', 'Super Vault', 40, 23, 4, 1, 'empty');
  a3.enemy('sentry', 14, 4);
  b.item('supers', 'Super Missiles', 'supers', 'A3', 6, a3.stand);
  const a4 = b.room('A4', "Vrael's Roost", 56, 22, 6, 3, 'empty');
  a4.shelf(8, 14, 16).shelf(34, 40, 16).shelf(20, 28, 10);
  a4.ent('boss', 24, 6, { kind: 'flyer', name: 'Vrael, the Ember Wing', hp: 400, flag: 'vrael', weak: 'missile' });
  const a5 = b.room('A5', 'Ember Spoils', 62, 24, 3, 1, 'empty');
  b.item('blade', 'Blade Spin', 'blade', 'A5', 8, a5.stand);
  b.item('skystep', 'Sky Step', 'skystep', 'A5', 18, a5.stand, { dormantUntil: 'legacy' });
  b.door('A2', 'A3', 'red').door('A1', 'A4', 'green').door('A4', 'A5', 'grey', 'vrael');

  // Heartcore: sealed until both wardens fall.
  b.setArea({ id: 'heart', name: 'Heartcore', color: '#e05cff', style: 'core', music: 'depths' });
  shaft(b.room('H1', 'Sealed Descent', 18, 16, 1, 4), 4, 27, [23]);
  const h2 = b.room('H2', 'Wardens’ Gate', 19, 18, 4, 1, 'empty');
  h2.ent('statue', 16, h2.stand, { message: 'Two seals: one for the rooted warden, one for the winged.' });
  const h3 = b.room('H3', 'Inner Gate', 23, 18, 3, 1, 'empty');
  h3.enemy('sentry', 12, 3);
  shaft(b.room('H4', 'Core Descent', 26, 18, 1, 4), 4, 27, [7]);
  const h5 = b.room('H5', 'Core Approach', 24, 22, 5, 2);
  h5.enemy('shelled', 20).enemy('flyer', 30, 6).station('recharge', 6).expansion('missiles', 36, 2);
  const h6 = b.room('H6', 'Heart Chamber', 29, 21, 6, 3, 'empty');
  h6.ent('boss', 24, 6, { kind: 'brain', name: 'The Heart of the Hollow', hp: 600, flag: 'core', weak: 'missile', escape: 150, escapeTo: 'S1' });
  b.door('H1', 'H2', 'grey', 'gorrath').door('H2', 'H3', 'grey', 'vrael').door('H5', 'H6', 'green');

  // A dormant beam in the forge that only the old suit can wake.
  b.item('phase', 'Phase Beam', 'phase', 'V8', 32, v8.stand, { dormantUntil: 'legacy' });

  return b.build({
    name: 'Vault of the Hollow King',
    style: 'verdant',
    prompt: '',
    seed: 1701,
  });
}
