'use client';

import { useRef } from 'react';
import type { Note } from '@/types/notes';
import { CompactRow } from './CompactRow';
import { useFitCount } from './useFitCount';
import { MORE_LINE_EM, MoreLine, fitKeyOf, type NotesContext } from './shared';

/**
 * Compact: one line per note, the text cut with an ellipsis and the age on
 * the right. The one to put next to a clock.
 */
export function CompactView({ ctx, shown, hidden }: { ctx: NotesContext; shown: Note[]; hidden: number }) {
  const listRef = useRef<HTMLUListElement>(null);
  const visible = useFitCount(
    listRef,
    fitKeyOf(shown, ctx.fontPx, ctx.showAuthor, ctx.showAge),
    hidden > 0 ? 0 : ctx.fontPx * MORE_LINE_EM,
  );
  const drawn = visible === null ? shown : shown.slice(0, visible);
  return (
    <>
      <ul ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ fontSize: '0.8em' }}>
        {drawn.map((note, i) => (
          <CompactRow key={note.id} note={note} ctx={ctx} last={i === drawn.length - 1} />
        ))}
      </ul>
      <MoreLine n={hidden + shown.length - drawn.length} t={ctx.t} />
    </>
  );
}
