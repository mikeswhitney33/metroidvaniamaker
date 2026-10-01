import { homageContent } from './homage';
import { sampleContent, type ProjectContent } from './project';

/** Built-in projects the editor can open. */
export const SAMPLES: { id: string; name: string; desc: string; content: () => ProjectContent }[] = [
  { id: 'hollow', name: 'Hollow Depths', desc: 'A small lock & key map to learn the editor on.', content: sampleContent },
  {
    id: 'vault',
    name: 'Vault of the Hollow King',
    desc: 'The full showcase game: six areas, four bosses, an escape, and a temple that strips your powers.',
    content: homageContent,
  },
];
