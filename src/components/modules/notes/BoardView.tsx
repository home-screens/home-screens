'use client';

import { useRef } from 'react';
import type { Note } from '@/types/notes';
import { NoteRow, TINTED_LIST_STYLE } from './NoteRow';
import { useFitCount } from './useFitCount';
import { MORE_LINE_EM, MoreLine, fitKeyOf, type NotesContext } from './shared';

/**
 * Board, the default: one row per note, top to bottom like the to-do list
 * beside it. Rows stay top-aligned; a lone note does not stretch.
 */
export function BoardView({ ctx, shown, hidden }: { ctx: NotesContext; shown: Note[]; hidden: number }) {
  const listRef = useRef<HTMLUListElement>(null);
  const visible = useFitCount(
    listRef,
    fitKeyOf(shown, ctx.fontPx, ctx.showAuthor, ctx.showAge),
    hidden > 0 ? 0 : ctx.fontPx * MORE_LINE_EM,
  );
  const drawn = visible === null ? shown : shown.slice(0, visible);
  return (
    <>
      <ul ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={TINTED_LIST_STYLE}>
        {drawn.map((note, i) => (
          <NoteRow key={note.id} note={note} ctx={ctx} last={i === drawn.length - 1} />
        ))}
      </ul>
      <MoreLine n={hidden + shown.length - drawn.length} t={ctx.t} />
    </>
  );
}
