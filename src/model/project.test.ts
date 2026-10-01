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

  it('names exported files after the project', () => {
    expect(projectFileName('Hollow Depths')).toBe('hollow-depths.vwm.json');
    expect(projectFileName('  ')).toBe('project.vwm.json');
  });
});
