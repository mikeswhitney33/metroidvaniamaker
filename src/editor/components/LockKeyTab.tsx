import { allAbilities, abilityById } from '../../model/abilities';
import { depths, isKey } from '../../model/graph';
import { EXTRA_KEY_COLORS } from '../../model/sampleProject';
import type { GraphNode } from '../../model/types';
import { useState } from 'react';
import { useEditor } from '../context';
import { KeyRoute } from './KeyRoute';
import { FlagField } from './Pickers';
import { C, dangerButton, MONO, SANS, secondaryButton, seg, segGroup, swatch, textInput } from '../ui';

const GRAPH_W = 312;
const ROW_H = 40;
const NODE_W = 140;

interface Box {
  x: number;
  y: number;
  w: number;
}

/** Lays nodes out in rows by requirement depth: keys left, gates right, lone start/boss centred. */
function layout(nodes: GraphNode[]) {
  const d = depths(nodes);
  const rows: Record<number, GraphNode[]> = {};
  nodes.forEach((n) => (rows[d[n.id]] ??= []).push(n));
  const pos: Record<string, Box> = {};
  let maxDepth = 0;
  Object.entries(rows).forEach(([k, list]) => {
    const depth = Number(k);
    maxDepth = Math.max(maxDepth, depth);
    const y = depth * ROW_H + 6;
    if (list.length === 1) {
      const n = list[0];
      const x = n.kind === 'key' ? 0 : n.kind === 'gate' ? GRAPH_W - NODE_W : (GRAPH_W - NODE_W) / 2;
      pos[n.id] = { x, y, w: NODE_W };
    } else {
      const w = Math.min(NODE_W, (GRAPH_W - (list.length - 1) * 8) / list.length);
      list.forEach((n, i) => (pos[n.id] = { x: i * (w + 8), y, w }));
    }
  });
  return { pos, height: (maxDepth + 1) * ROW_H + 8 };
}

export function LockKeyTab() {
  const { state } = useEditor();
  const hasGates = state.nodes.some((n) => n.kind === 'gate');
  const [view, setView] = useState<'route' | 'graph'>(hasGates ? 'graph' : 'route');
  return (
    <>
      <div style={{ ...segGroup, marginBottom: 12 }} role="radiogroup" aria-label="Keys view">
        <button role="radio" aria-checked={view === 'route'} style={seg(view === 'route')} onClick={() => setView('route')}>
          Route
        </button>
        <button role="radio" aria-checked={view === 'graph'} style={seg(view === 'graph')} onClick={() => setView('graph')}>
          Gate graph
        </button>
      </div>
      {view === 'route' ? (
        <>
          <div style={{ font: `400 11.5px/1.4 ${SANS}`, color: C.muted, marginBottom: 10 }}>
            What the player collects at each stage, and the hatches and blocks it opens. Built from the rooms themselves.
          </div>
          <KeyRoute />
          <NodeInspector />
        </>
      ) : (
        <GateGraph />
      )}
    </>
  );
}

/** Abstract lock & key graph: keys and the gate nodes they open. */
function GateGraph() {
  const { state, roomById, colorOf, edit } = useEditor();
  const { pos, height } = layout(state.nodes);

  const edges = state.nodes
    .flatMap((n) =>
      n.req.map((r) => {
        const A = pos[r];
        const B = pos[n.id];
        if (!A) return null;
        const x1 = A.x + A.w / 2;
        const y1 = A.y + 26;
        const x2 = B.x + B.w / 2;
        const y2 = B.y;
        return {
          key: `${r}->${n.id}`,
          d: `M${x1} ${y1} C${x1} ${y1 + 18}, ${x2} ${y2 - 18}, ${x2} ${y2}`,
          hot: state.selNode === n.id || state.selNode === r,
        };
      }),
    )
    .filter((e) => e !== null)
    .sort((a, b) => Number(a.hot) - Number(b.hot));

  const addKey = () => {
    const id = `k${Date.now()}`;
    const color = EXTRA_KEY_COLORS[state.nodes.filter(isKey).length % EXTRA_KEY_COLORS.length];
    edit((s) => ({ nodes: [...s.nodes, { id, kind: 'key', label: 'New Key', color, room: null, req: [] }], selNode: id }));
  };
  const addGate = () => {
    const id = `g${Date.now()}`;
    edit((s) => ({ nodes: [...s.nodes, { id, kind: 'gate', label: 'New Gate', room: null, req: [] }], selNode: id }));
  };
  const smallButton = { ...secondaryButton, height: 26, padding: '0 8px', borderRadius: 4, font: `500 11.5px ${SANS}` };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <div style={{ flex: 1, font: `400 11.5px/1.4 ${SANS}`, color: C.muted }}>
          Gate nodes seal a whole room until their keys are found. Keys left, gates right; drag a node onto a room to place it.
        </div>
        <button onClick={addKey} style={smallButton}>
          + Key
        </button>
        <button onClick={addGate} style={smallButton}>
          + Gate
        </button>
      </div>
      <div style={{ position: 'relative', width: GRAPH_W, height }}>
        <svg
          width={GRAPH_W}
          height={height}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          {edges.map((e) => (
            <path
              key={e.key}
              d={e.d}
              fill="none"
              stroke={e.hot ? C.accent : '#3d4450'}
              strokeWidth={e.hot ? 1.6 : 1.2}
            />
          ))}
        </svg>
        {state.nodes.map((n) => {
          const P = pos[n.id];
          const selected = state.selNode === n.id;
          const room = n.room ? roomById[n.room] : undefined;
          return (
            <div key={n.id} style={{ position: 'absolute', left: P.x, top: P.y, width: P.w }}>
              <GraphChip node={n} selected={selected} placedIn={room?.name} color={colorOf(n)} />
            </div>
          );
        })}
      </div>
      <NodeInspector />
    </>
  );
}

function GraphChip({
  node,
  selected,
  placedIn,
  color,
}: {
  node: GraphNode;
  selected: boolean;
  placedIn: string | undefined;
  color: string;
}) {
  const { set } = useEditor();
  const placed = placedIn !== undefined;
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', node.id)}
      onClick={() => set({ selNode: node.id })}
      title={placed ? `${node.label} · ${placedIn}` : `${node.label} · unplaced`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        height: 26,
        padding: '0 8px',
        borderRadius: 5,
        background: selected ? '#2a2f37' : C.field,
        border: `1px ${placed ? 'solid' : 'dashed'} ${selected ? C.accent : placed ? '#3a414c' : C.dim}`,
        font: `500 12px ${SANS}`,
        color: placed ? C.text : C.muted,
        cursor: 'grab',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <span style={swatch(node, color)} />
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {node.label}
      </span>
    </div>
  );
}

/** Which kinds of node another node may depend on. */
function canRequire(target: GraphNode, other: GraphNode): boolean {
  if (other.id === target.id) return false;
  switch (target.kind) {
    case 'gate':
      return isKey(other);
    case 'key':
      return other.kind === 'gate' || other.kind === 'start';
    case 'boss':
      return other.kind === 'gate' || isKey(other);
    default:
      return false;
  }
}

function NodeInspector() {
  const { state, byId, roomById, colorOf, edit, unplace } = useEditor();
  const sn = state.selNode ? byId[state.selNode] : undefined;
  if (!sn) return null;
  const room = sn.room ? roomById[sn.room] : undefined;
  const candidates = state.nodes.filter((o) => canRequire(sn, o));
  const reqTitle = sn.kind === 'gate' ? 'Opened by' : sn.kind === 'start' ? 'Start has no requirements' : 'Found behind';

  const toggleReq = (id: string) =>
    edit((s) => ({
      nodes: s.nodes.map((x) =>
        x.id === sn.id ? { ...x, req: x.req.includes(id) ? x.req.filter((q) => q !== id) : [...x.req, id] } : x,
      ),
    }));

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: `1px solid ${C.line}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={swatch(sn, colorOf(sn))} />
        <input
          value={sn.label}
          onChange={(e) => {
            const label = e.target.value;
            edit((s) => ({ nodes: s.nodes.map((x) => (x.id === sn.id ? { ...x, label } : x)) }), `label:${sn.id}`);
          }}
          style={{ ...textInput, flex: 1, minWidth: 0 }}
        />
        <span
          style={{
            font: `500 10.5px ${MONO}`,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: C.muted,
          }}
        >
          {sn.kind}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          font: `400 12px ${SANS}`,
          color: C.muted,
        }}
      >
        <span>Placed in</span>
        <span style={{ color: room ? C.text : C.accent, font: `500 12px ${SANS}` }}>
          {room ? room.name : 'Unplaced: drag onto map'}
        </span>
      </div>
      {sn.kind === 'key' && <AbilityPicker />}
      <div style={{ font: `400 12px ${SANS}`, color: C.muted }}>{reqTitle}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {candidates.map((o) => {
          const on = sn.req.includes(o.id);
          return (
            <button
              key={o.id}
              aria-pressed={on}
              onClick={() => toggleReq(o.id)}
              style={{
                height: 24,
                padding: '0 8px',
                borderRadius: 12,
                border: `1px solid ${on ? colorOf(o) : C.lineStrong}`,
                background: on ? 'rgba(255,255,255,.06)' : 'transparent',
                color: on ? C.text : C.muted,
                font: `500 11.5px ${SANS}`,
                cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => unplace(sn.id)} style={{ ...secondaryButton, flex: 1, padding: 0 }}>
          Unplace
        </button>
        <button
          onClick={() =>
            edit((s) => ({
              nodes: s.nodes.filter((x) => x.id !== sn.id).map((x) => ({ ...x, req: x.req.filter((q) => q !== sn.id) })),
              selNode: null,
            }))
          }
          style={{ ...dangerButton, flex: 1 }}
        >
          Delete node
        </button>
      </div>
    </div>
  );
}

/** What picking up a key does: the ability it grants (its key role), and whether it starts dormant. */
function AbilityPicker() {
  const { state, byId, edit } = useEditor();
  const sn = state.selNode ? byId[state.selNode] : undefined;
  if (!sn) return null;
  const list = allAbilities(state.abilities);
  const a = abilityById(sn.ability, state.abilities);
  const setNode = (patch: Partial<GraphNode>, merge?: string) =>
    edit((s) => ({ nodes: s.nodes.map((x) => (x.id === sn.id ? { ...x, ...patch } : x)) }), merge);
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, font: `400 12px ${SANS}`, color: C.muted } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={row}>
        <span>Grants</span>
        <select
          value={sn.ability ?? ''}
          onChange={(e) => {
            const next = abilityById(e.target.value, state.abilities);
            const renamed = !sn.label || sn.label === 'New Key' || sn.label === a?.name;
            setNode({ ability: e.target.value || undefined, ...(next && renamed ? { label: next.name, color: next.color } : {}) });
          }}
          style={{ ...textInput, height: 28, width: 190 }}
        >
          <option value="">Nothing (a plain key)</option>
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {a && (
        <div style={{ font: `400 11.5px/1.45 ${SANS}`, color: C.dim }}>
          {a.desc} Opens anything needing <span style={{ fontFamily: MONO, color: C.textSoft }}>{a.caps.join(', ')}</span>.
        </div>
      )}
      <label style={row}>
        <span title="Collected, but it does nothing until this world flag is set (by a boss or trigger)">Dormant until flag</span>
        <FlagField
          label="Dormant until flag"
          value={sn.dormantUntil ?? ''}
          onChange={(v) => setNode({ dormantUntil: v || undefined }, `dormant:${sn.id}`)}
          style={{ height: 28, width: 120, fontSize: 12 }}
        />
      </label>
    </div>
  );
}
