import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from './editor/Editor';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
);
