'use client';

import type { Note } from '@/types/notes';
import { ink } from '@/lib/constants';
import { cardColumns } from '@/lib/notes-rules';
import { AuthorBubble } from './AuthorBubble';
import { useFittedNotes } from './useFittedNotes';
import { MoreLine, NoteMarks, ageOf, authorOf, dangerTint, type NotesContext, NoteDrawingBody } from './shared';

/**
 * Cards: a pinboard of plain cards, columns from the width (one under 400 px,
 * two to 900, three above). A pinned note spans the whole row at the top.
 * The colour is the author bubble in the foot; the card itself is plain.
 */
export function CardsView({ ctx, shown, hidden, width }: { ctx: NotesContext; shown: Note[]; hidden: number; width: number }) {
  const columns = cardColumns(width);
  const { ref: gridRef, drawn, more } = useFittedNotes<HTMLDivElement>(ctx, shown, hidden, { extraKey: [columns] });
  return (
    <>
      <div
        ref={gridRef}
        className="grid flex-1 min-h-0 overflow-hidden content-start"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '0.58em' }}
      >
        {drawn.map((note) => {
          const author = authorOf(note, ctx.members, ctx.t);
          const age = ageOf(note, ctx);
          return (
            <div
              key={note.id}
              data-testid="notes-note"
              data-fit={note.id}
              data-important={note.important ? '' : undefined}
              data-pinned={note.pinned ? '' : undefined}
              className="flex flex-col min-w-0"
              style={{
                gridColumn: note.pinned ? '1 / -1' : undefined,
                fontSize: '0.9em',
                gap: '0.36em',
                padding: '0.72em 0.8em 0.62em',
                borderRadius: '0.72em',
                backgroundColor: note.important ? dangerTint(0.16) : ink(0.08),
              }}
            >
              {note.drawing ? (
                <NoteDrawingBody note={note} ctx={ctx} height="2.8em" />
              ) : (
                <div
                  className={note.pinned ? 'line-clamp-3' : 'line-clamp-2'}
                  style={{ lineHeight: 1.28, fontWeight: 500, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
                >
                  {note.text}
                </div>
              )}
              <div className="flex items-center mt-auto min-w-0" style={{ gap: '0.5em', fontSize: '0.68em', color: ink(0.6) }}>
                {ctx.showAuthor && (
                  <>
                    <AuthorBubble author={author} em={1.17} />
                    <span className="truncate">{author.name}</span>
                  </>
                )}
                <NoteMarks note={note} t={ctx.t} flag={false} />
                {age && <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">{age}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <MoreLine n={more} ctx={ctx} />
    </>
  );
}
