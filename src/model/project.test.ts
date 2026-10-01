import { describe, expect, it } from 'vitest';
import {
  blankContent,
  parseProject,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  ProjectError,
  projectFileName,
  sampleContent,
  toProjectFile,
} from './project';
import { roughIn } from '../game/world';
import { encodeTiles, Tile } from './tiles';

const roundTrip = (c = sampleContent()) => parseProject(JSON.stringify(toProjectFile(c)));

describe('project files', () => {
  it('round-trips the sample project', () => {
    const c = { ...sampleContent(), images: { 'style-ref-1': 'data:image/png;base64,AAAA' } };
    expect(roundTrip(c)).toEqual(c);
  });

  it('round-trips a blank project', () => {
    expect(roundTrip(blankContent())).toEqual(blankContent());
  });

  it('stamps the format and version', () => {
    const f = toProjectFile(sampleContent(), new Date('2026-10-01T00:00:00Z'));
    expect(f).toMatchObject({ format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt: '2026-10-01T00:00:00.000Z' });
  });

  it('fills in missing optional fields', () => {
    const c = parseProject(JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, rooms: [], nodes: [] }));
    expect(c).toMatchObject({ name: 'Untitled project', style: 'ashen', tile: '16px', seq: 1, images: {} });
  });

  it.each([
    ['not JSON', '{', "This file isn't valid JSON."],
    ['some other JSON', '{"rooms":[]}', "This file isn't a Vaultwright project."],
    ['a newer version', JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION + 1 }), 'newer version'],
    [
      'a room without a size',
      JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, rooms: [{ id: 'A', x: 0, y: 0 }], nodes: [] }),
      'Room A has no valid w.',
    ],
    [
      'a node of unknown kind',
      JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, rooms: [], nodes: [{ id: 'n', kind: 'door' }] }),
      'Graph node n has an unknown kind.',
    ],
  ])('rejects %s', (_, text, msg) => {
    expect(() => parseProject(text)).toThrow(ProjectError);
    expect(() => parseProject(text)).toThrow(msg);
  });

  it('round-trips painted tiles', () => {
    const c = sampleContent();
    const room = c.rooms[0];
    const tiles = encodeTiles(roughIn(room).map((v, i) => (i % 7 === 0 ? Tile.Platform : v)));
    const painted = { ...c, rooms: [{ ...room, tiles }, ...c.rooms.slice(1)] };
    expect(roundTrip(painted)).toEqual(painted);
  });

  it('upgrades a version 1 project', () => {
    const v1 = { ...toProjectFile(sampleContent()), version: 1 };
    expect(parseProject(JSON.stringify(v1))).toEqual(sampleContent());
  });

  it('rejects tiles that do not fit the room', () => {
    const f = toProjectFile(sampleContent());
    f.rooms = [{ ...f.rooms[0], tiles: '0101' }];
    expect(() => parseProject(JSON.stringify(f))).toThrow("Room A has a tile layer that doesn't match its size.");
  });

  it('names exported files after the project', () => {
    expect(projectFileName('Hollow Depths')).toBe('hollow-depths.vwm.json');
    expect(projectFileName('  ')).toBe('project.vwm.json');
  });
});
