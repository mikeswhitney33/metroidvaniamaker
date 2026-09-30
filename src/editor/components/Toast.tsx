import { C, SANS } from '../ui';

export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        padding: '8px 14px',
        borderRadius: 6,
        background: C.fieldHover,
        border: '1px solid #3a414c',
        font: `500 12px ${SANS}`,
        color: C.text,
        boxShadow: '0 8px 24px rgba(0,0,0,.4)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </div>
  );
}
