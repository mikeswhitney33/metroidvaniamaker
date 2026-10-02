import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from './editor/Editor';
import { EMBED_KEY, type Embedded } from './editor/exportHtml';
import { Player } from './player/Player';
import './index.css';

/** An exported game page embeds its project; then the bundle boots as the game, not the editor. */
const embedded = (window as unknown as Record<string, Embedded | undefined>)[EMBED_KEY];

createRoot(document.getElementById('root')!).render(
  <StrictMode>{embedded ? <Player project={embedded.project} bindings={embedded.bindings} /> : <Editor />}</StrictMode>,
);
