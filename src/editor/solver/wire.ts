import type { SolveResult, TrickReport } from '../../model/solver';

/** A solve result as it crosses from the worker: sets become arrays. */
export interface WireResult {
  result: Omit<SolveResult, 'rooms'> & { rooms: string[] };
  tricks: TrickReport[];
}

export const toWire = (r: SolveResult, tricks: TrickReport[]): WireResult => ({ result: { ...r, rooms: [...r.rooms] }, tricks });

export interface Solved {
  result: SolveResult;
  tricks: TrickReport[];
  /** Content revision the result is for. */
  rev: number;
}

export const fromWire = (w: WireResult, rev: number): Solved => ({ result: { ...w.result, rooms: new Set(w.result.rooms) }, tricks: w.tricks, rev });
