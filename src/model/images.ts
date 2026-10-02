import type { ProjectContent } from './project';

/** Image slots the game draws from: sprite sheets, area tilesets and backdrops. */
export function gameImageIds(c: Pick<ProjectContent, 'sprites' | 'areas'>): string[] {
  const ids = new Set<string>();
  Object.values(c.sprites).forEach((sh) => ids.add(sh.image));
  c.areas.forEach((a) => {
    if (a.tileset) ids.add(a.tileset);
    if (a.backdrop) ids.add(a.backdrop);
  });
  return [...ids];
}
