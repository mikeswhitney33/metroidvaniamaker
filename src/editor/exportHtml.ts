import { toProjectFile, type ProjectContent } from '../model/project';
import type { Bindings } from '../game/input';

export class ExportError extends Error {}

/** Global the exported page sets so the bundle boots straight into the game. */
export const EMBED_KEY = '__VAULTWRIGHT_GAME__';

export interface Embedded {
  project: ReturnType<typeof toProjectFile>;
  bindings?: Bindings;
}

const escapeScript = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/**
 * Builds a single HTML file that plays the project: the app's own built bundle, inlined,
 * with the project embedded and a flag that boots it as the game instead of the editor.
 * Only works from a production build, where the app is one script.
 */
export async function buildGameHtml(c: ProjectContent, bindings?: Bindings): Promise<string> {
  if (import.meta.env.DEV) throw new ExportError('Export works from the built app. Run npm run build, then npm run preview.');
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  if (!script) throw new ExportError("Couldn't find the app's script to bundle.");
  const js = await fetch(script.src).then((r) => (r.ok ? r.text() : Promise.reject(new ExportError('Could not read the app bundle.'))));
  const css = (
    await Promise.all(
      [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
        .filter((l) => l.href.startsWith(location.origin))
        .map((l) => fetch(l.href).then((r) => (r.ok ? r.text() : ''))),
    )
  ).join('\n');
  const data: Embedded = { project: toProjectFile(c), bindings };
  const title = c.name.replace(/[<&>]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>window.${EMBED_KEY} = ${escapeScript(JSON.stringify(data))};</script>
<script type="module">${escapeScript(js)}</script>
</body>
</html>
`;
}
