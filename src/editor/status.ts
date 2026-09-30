import type { Analysis } from '../model/graph';
import { C, plural } from './ui';

/** Short solvability summary shown in the top bar and status bar. */
export function statusSummary(a: Analysis): { text: string; color: string } {
  const warns = a.issues.length - a.errors;
  if (a.errors) return { text: plural(a.errors, 'blocking issue'), color: C.bad };
  if (warns) return { text: `Solvable · ${plural(warns, 'warning')}`, color: C.accent };
  return { text: 'Solvable', color: C.ok };
}
