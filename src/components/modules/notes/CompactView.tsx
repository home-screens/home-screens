'use client';

import type { Note } from '@/types/notes';
import { CompactRow } from './CompactRow';
import { useFittedNotes } from './useFittedNotes';
import { MoreLine, type NotesContext } from './shared';

/**
 * Compact: one line per note, the text cut with an ellipsis and the age on
 * the right. The one to put next to a clock.
 */
export function CompactView({ ctx, shown, hidden }: { ctx: NotesContext; shown: Note[]; hidden: number }) {
  const { ref: listRef, drawn, more } = useFittedNotes<HTMLUListElement>(ctx, shown, hidden);
  return (
    <>
      <ul ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ fontSize: '0.8em' }}>
        {drawn.map((note, i) => (
          <CompactRow key={note.id} note={note} ctx={ctx} last={i === drawn.length - 1} />
        ))}
      </ul>
      <MoreLine n={more} t={ctx.t} />
    </>
  );
}
