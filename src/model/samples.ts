import { sampleContent, type ProjectContent } from './project';

/** Built-in projects the editor can open. */
export const SAMPLES: { id: string; name: string; desc: string; content: () => ProjectContent }[] = [
  { id: 'hollow', name: 'Hollow Depths', desc: 'A small lock & key map to learn the editor on.', content: sampleContent },
];
