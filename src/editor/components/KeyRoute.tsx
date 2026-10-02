import { useMemo } from 'react';
import { abilityById } from '../../model/abilities';
import { doorInfo } from '../../model/entities';
import { TILE_INFO } from '../../model/tiles';
import { useEditor } from '../context';
import { C, MONO, SANS, sectionLabel } from '../ui';

/**
 * The lock & key structure as the solver actually finds it: stage by stage, what the player
 * collects or defeats, and which hatches and blocks that opens up. Works whether progress is
 * gated by hatches and blocks in the rooms or by gate nodes.
 */
export function KeyRoute() {
  const { state, check, world, colorOf, byId, set } = useEditor();
  const res = check.solved?.result;

  // How many of each breakable block the world has, to say what an item opens.
  const blockCounts = useMemo(() => {
    const n: Record<number, number> = {};
    world.forEach((r) => r.g.forEach((t) => (n[t] = (n[t] ?? 0) + 1)));
    return n;
  }, [world]);

  if (!res) return <div style={{ font: `400 12px ${SANS}`, color: C.muted }}>Working out the route…</div>;
  const roomName = (id: string) => state.rooms.find((r) => r.id === id)?.name ?? id;

  const stages = res.waves.map((ids, w) => {
    const targets = ids.map((id) => res.targets.find((t) => t.id === id)!).filter((t) => t && t.kind !== 'trigger');
    const doors = Object.entries(res.doorStep)
      .filter(([, step]) => step === w + 1)
      .map(([link]) => {
        const [a, b] = link.split('|');
        const spec = state.doors[link];
        return { link, label: `${spec ? doorInfo(spec.kind).label : 'Hatch'}: ${roomName(a)} ↔ ${roomName(b)}`, color: spec ? doorInfo(spec.kind).color : C.faint };
      });
    const blocks = new Set<string>();
    targets.forEach((t) => {
      if (t.kind !== 'key' || !t.node) return;
      const a = abilityById(byId[t.node]?.ability, state.abilities);
      a?.caps.forEach((cap) =>
        TILE_INFO.forEach((ti) => {
          if (ti.breaks === cap && blockCounts[ti.kind]) blocks.add(`${ti.label}s (${blockCounts[ti.kind]})`);
        }),
      );
    });
    return { w, targets, doors, blocks: [...blocks] };
  });
  const missing = res.targets.filter((t) => t.kind === 'key' && res.stepOf[t.id] === undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {stages.map((st) =>
        st.targets.length || st.doors.length ? (
          <div key={st.w} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={sectionLabel}>{st.w === 0 ? 'From the start' : `Stage ${st.w + 1}`}</div>
            {st.targets.map((t) => {
              const n = t.node ? byId[t.node] : undefined;
              return (
                <button
                  key={t.id}
                  onClick={() => (n ? set({ selNode: n.id }) : set({ selRoom: t.room, selRooms: [t.room] }))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: 0,
                    padding: '2px 4px',
                    borderRadius: 4,
                    background: n && state.selNode === n.id ? C.fieldHover : 'transparent',
                    color: C.text,
                    font: `500 12.5px ${SANS}`,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      flex: 'none',
                      borderRadius: t.kind === 'key' ? '50%' : 2,
                      background: n ? colorOf(n) : t.kind === 'boss' ? '#ff8a5c' : t.kind === 'exit' ? C.ok : '#ff6fae',
                    }}
                  />
                  <span style={{ flex: 1 }}>{t.kind === 'boss' ? `Defeat ${t.label}` : t.kind === 'exit' ? 'Reach the exit' : t.label}</span>
                  <span style={{ font: `400 11px ${SANS}`, color: C.dim }}>{roomName(t.room)}</span>
                </button>
              );
            })}
            {(st.doors.length > 0 || st.blocks.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 4, font: `400 11.5px/1.4 ${SANS}`, color: C.muted }}>
                {st.doors.map((d) => (
                  <div key={d.link} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ width: 6, height: 9, borderRadius: 1, background: d.color, flex: 'none' }} />
                    Opens {d.label}
                  </div>
                ))}
                {st.blocks.length > 0 && <div>Breaks {st.blocks.join(', ')}</div>}
              </div>
            )}
          </div>
        ) : null,
      )}
      {missing.length > 0 && (
        <div style={{ font: `400 12px/1.45 ${SANS}`, color: C.badSoft }}>Never collected: {missing.map((t) => t.label).join(', ')}</div>
      )}
      <div style={{ font: `400 11px ${MONO}`, color: C.dim }}>
        {res.beatable ? 'Beatable' : 'Not beatable yet'} · {res.waves.length} stages
      </div>
    </div>
  );
}
