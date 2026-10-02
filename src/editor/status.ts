import type { Check } from './context';
import { C, plural } from './ui';

/** Short solvability summary shown in the top bar and status bar. */
export function statusSummary(a: Check): { text: string; color: string } {
  const warns = a.issues.length - a.errors;
  if (a.errors) return { text: plural(a.errors, 'blocking issue'), color: C.bad };
  if (a.busy && !a.solved) return { text: 'Checking…', color: C.dim };
  if (warns) return { text: `Beatable · ${plural(warns, 'warning')}`, color: C.accent };
  return { text: 'Beatable', color: C.ok };
}
