import { create } from 'zustand';

/** A run of days as epoch milliseconds, so the store's answer keeps its identity between renders. */
export interface LookAheadSpan {
  start: number;
  end: number;
}

interface LookAheadState {
  /** What each calendar module stepped away from now may still show, by module id. */
  reaches: Record<string, LookAheadSpan>;
  /** Every module's reach together, or null while none is away. */
  span: LookAheadSpan | null;
  /** A module stepped away (`reach`) or came back (`null`). */
  setReach: (moduleId: string, reach: LookAheadSpan | null) => void;
}

function unionOf(reaches: Record<string, LookAheadSpan>): LookAheadSpan | null {
  let span: LookAheadSpan | null = null;
  for (const r of Object.values(reaches)) {
    span = span ? { start: Math.min(span.start, r.start), end: Math.max(span.end, r.end) } : { ...r };
  }
  return span;
}

/**
 * The days stepped calendars want, read by the display's shared calendar
 * fetch (`getCalendarFetchWindow`). A module registers its whole reach on
 * the first step away, so the fetch widens once rather than on every tap,
 * and clears it when it slides back to now.
 */
export const useLookAheadStore = create<LookAheadState>((set) => ({
  reaches: {},
  span: null,
  setReach: (moduleId, reach) => set((state) => {
    const had = state.reaches[moduleId];
    if (reach && had && had.start === reach.start && had.end === reach.end) return state;
    if (!reach && !had) return state;
    const reaches = { ...state.reaches };
    if (reach) reaches[moduleId] = reach;
    else delete reaches[moduleId];
    const span = unionOf(reaches);
    const same = span && state.span && span.start === state.span.start && span.end === state.span.end;
    return { reaches, span: same ? state.span : span };
  }),
}));
