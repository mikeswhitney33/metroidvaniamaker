import type { CSSProperties } from 'react';
import type { GraphNode } from '../../model/types';
import { useEditor } from '../context';
import { C, MONO } from '../ui';

/** Small draggable marker for a key, gate, start or boss placed in a room. */
export function NodeChip({ node }: { node: GraphNode }) {
  const { state, stepOf, colorOf, set } = useEditor();
  const c = colorOf(node);
  const selected = state.selNode === node.id;
  const base: CSSProperties = {
    width: 18,
    height: 18,
    display: 'grid',
    placeItems: 'center',
    font: `700 9.5px ${MONO}`,
    cursor: 'grab',
    boxSizing: 'border-box',
    outline: selected ? `2px solid ${C.accent}` : 'none',
    outlineOffset: 1,
  };
  const style: CSSProperties =
    node.kind === 'key'
      ? { ...base, borderRadius: '50%', background: c, color: C.bg }
      : node.kind === 'gate'
        ? { ...base, borderRadius: 3, background: C.bar, border: `2px solid ${c}`, color: c }
        : { ...base, borderRadius: 3, background: c, color: C.bg };
  const step = state.showRoute ? stepOf[node.id] : undefined;

  return (
    <div style={{ position: 'relative' }} title={node.label}>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', node.id);
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          set({ selNode: node.id, tab: 'graph' });
        }}
        style={style}
      >
        {node.kind === 'start' ? 'S' : node.label[0]}
      </div>
      {step && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 13,
            height: 13,
            padding: '0 3px',
            borderRadius: 7,
            background: C.accent,
            color: C.bar,
            font: `700 8.5px/13px ${MONO}`,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {step}
        </div>
      )}
    </div>
  );
}
