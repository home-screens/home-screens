'use client';

import { useRef, type RefObject } from 'react';
import type { Note } from '@/types/notes';
import { useFitCount } from '../shared/useFitCount';
import { MORE_LINE_EM, fitKeyOf, type NotesContext } from './shared';

/**
 * The notes of a fitted list that fit its box whole, and how many are left
 * for the "and N more" line: the ones the cap already left out (`hidden`)
 * plus the ones that did not fit.
 *
 * Room for that line is kept only when cutting has to start; with `hidden`
 * above zero the line is already on screen during the measure.
 *
 * `extraKey` is whatever else changes a row's height in this view (its
 * column count, whether a heading shows); `moreEm` is the height of this
 * view's own "more" line where it is not the shared one; `priority` cuts in
 * another order than the notes are drawn (see useFitCount).
 */
export function useFittedNotes<T extends HTMLElement>(
  ctx: NotesContext,
  notes: Note[],
  hidden: number,
  { extraKey = [], moreEm = MORE_LINE_EM, priority }: {
    extraKey?: (string | number | boolean)[];
    moreEm?: number;
    priority?: readonly string[];
  } = {},
): { ref: RefObject<T | null>; drawn: Note[]; more: number } {
  const ref = useRef<T>(null);
  const visible = useFitCount(
    ref,
    fitKeyOf(notes, ctx.fontPx, ctx.showAuthor, ctx.showAge, ...extraKey),
    hidden > 0 ? 0 : ctx.fontPx * moreEm,
    { priority },
  );
  const drawn = visible === null ? notes : notes.slice(0, visible);
  return { ref, drawn, more: hidden + notes.length - drawn.length };
}
