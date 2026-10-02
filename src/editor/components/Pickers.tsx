import { useId, useMemo, type CSSProperties } from 'react';
import { allAbilities } from '../../model/abilities';
import { flagTable } from '../../model/flags';
import { useEditor } from '../context';
import { C, MONO, textInput } from '../ui';
import { reqError } from './EntityInspector';

/** Flag names used anywhere in the project. */
export function useFlagNames(): string[] {
  const { state } = useEditor();
  const { rooms, doors, nodes } = state;
  return useMemo(() => flagTable({ rooms, doors, nodes }).map((f) => f.name), [rooms, doors, nodes]);
}

/**
 * A world flag: pick one already in the project or type a new name. A flag that nothing
 * sets is outlined, because whatever checks it will never pass.
 */
export function FlagField({
  value,
  onChange,
  style,
  label,
  setsFlag = false,
}: {
  value: string;
  onChange(v: string): void;
  style?: CSSProperties;
  label: string;
  /** This field sets the flag (a boss or trigger), so it is never "unset". */
  setsFlag?: boolean;
}) {
  const { state } = useEditor();
  const id = useId();
  const { rooms, doors, nodes } = state;
  const table = useMemo(() => flagTable({ rooms, doors, nodes }), [rooms, doors, nodes]);
  const known = table.find((f) => f.name === value);
  const unset = !setsFlag && !!value && !known?.setBy.length;
  return (
    <>
      <input
        aria-label={label}
        list={id}
        value={value}
        placeholder="flag name"
        title={unset ? 'Nothing in the project sets this flag yet' : undefined}
        onChange={(e) => onChange(e.target.value.replace(/\s+/g, '_'))}
        style={{ ...textInput, fontFamily: MONO, borderColor: unset ? C.accent : undefined, ...style }}
      />
      <datalist id={id}>
        {table.map((f) => (
          <option key={f.name} value={f.name}>
            {f.setBy.length ? `set by ${f.setBy[0].what}` : 'not set anywhere yet'}
          </option>
        ))}
      </datalist>
    </>
  );
}

/** A requirement expression, with the project's abilities and flags offered as completions. */
export function ReqField({ value, onChange, label, style }: { value: string; onChange(v: string): void; label: string; style?: CSSProperties }) {
  const { state } = useEditor();
  const id = useId();
  const flags = useFlagNames();
  const options = useMemo(() => {
    const caps = new Set<string>(['shot']);
    allAbilities(state.abilities).forEach((a) => a.caps.forEach((c) => caps.add(c)));
    return [...caps, ...flags.map((f) => `flag:${f}`)];
  }, [state.abilities, flags]);
  const err = reqError(value);
  return (
    <>
      <input
        aria-label={label}
        list={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...textInput, fontFamily: MONO, borderColor: err ? C.bad : undefined, ...style }}
      />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {err && <span style={{ color: C.badSoft }}>{err}</span>}
    </>
  );
}
