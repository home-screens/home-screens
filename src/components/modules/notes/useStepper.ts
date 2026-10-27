'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Note } from '@/types/notes';
import { stepOrder } from '@/lib/notes-rules';

/** Seconds a stepping view holds each note: the setting's range and default. */
export const STEP_SECONDS = { min: 5, max: 60, fallback: 10 } as const;

/**
 * The note a stepping view (Spotlight, Strip) shows now. Walks
 * `stepOrder(notes)`, where a pinned or important note takes two turns in a
 * row, one step every `stepSeconds`. A changed set of notes starts over at
 * the first. The swap is plain state: the view re-renders with the next
 * note, no enter or exit transition.
 *
 * `position` is the shown note's index in `notes` (not in the doubled walk),
 * for the "2 of 6" counter and the dots.
 */
export function useStepper<T extends Pick<Note, 'id' | 'pinned' | 'important'>>(
  notes: readonly T[],
  stepSeconds: number,
): { note: T | null; position: number } {
  const order = useMemo(() => stepOrder(notes), [notes]);
  // The doubled walk's ids: a note pinned or unpinned changes it too.
  const key = order.map((n) => n.id).join('|');
  const [state, setState] = useState({ key, index: 0 });
  let index = state.index;
  if (state.key !== key) {
    index = 0;
    setState({ key, index: 0 });
  }
  const length = order.length;
  useEffect(() => {
    if (length < 2) return;
    const timer = setInterval(
      () => setState((s) => ({ key: s.key, index: (s.index + 1) % length })),
      stepSeconds * 1000,
    );
    return () => clearInterval(timer);
  }, [key, length, stepSeconds]);
  const note = length > 0 ? order[index % length] : null;
  const position = note ? notes.findIndex((n) => n.id === note.id) : -1;
  return { note, position };
}
