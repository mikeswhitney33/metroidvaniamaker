import { useRef, useState, type DragEvent } from 'react';
import type { ProjectContent } from '../../model/project';
import { useEditor } from '../context';
import { C, SANS } from '../ui';

/**
 * User-fillable image placeholder: drop an image on it or click to browse.
 * The chosen image is saved in the project under `id`, so it autosaves, undoes and exports with it.
 */
export function ImageSlot({
  id,
  placeholder,
  radius = 5,
  link,
}: {
  id: string;
  placeholder: string;
  radius?: number;
  /** Other content to change in the same undo step when the image is set or cleared. */
  link?: (present: boolean, s: ProjectContent) => Partial<ProjectContent>;
}) {
  const { state, edit } = useEditor();
  const src = state.images[id] ?? null;
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const setSrc = (dataUrl: string | null) =>
    edit((s) => {
      const images = { ...s.images };
      if (dataUrl) images[id] = dataUrl;
      else delete images[id];
      return { images, ...link?.(!!dataUrl, s) };
    });

  const read = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setSrc(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    read(e.dataTransfer.files[0]);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={src ? `${placeholder} image. Click to replace` : `Add ${placeholder} image`}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: radius,
        overflow: 'hidden',
        cursor: 'pointer',
        background: over ? 'rgba(240,180,76,.1)' : 'rgba(127,127,127,.08)',
        border: src ? `1px solid ${C.line}` : `1.5px dashed ${over ? C.accent : 'rgba(223,226,231,.35)'}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        color: C.text,
        font: `500 12px ${SANS}`,
      }}
    >
      {src ? (
        <>
          <img src={src} alt={placeholder} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }} />
          <button
            aria-label={`Clear ${placeholder} image`}
            onClick={(e) => {
              e.stopPropagation();
              setSrc(null);
            }}
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: 9,
              border: 0,
              background: 'rgba(17,19,23,.8)',
              color: C.text,
              font: `400 12px/18px ${SANS}`,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ×
          </button>
        </>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ opacity: 0.45 }}>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span style={{ opacity: 0.75 }}>{placeholder}</span>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          read(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
