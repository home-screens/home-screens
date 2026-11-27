'use client';

import { useMemo } from 'react';
import type { Note } from '@/types/notes';
import { ink } from '@/lib/constants';
import { sortByTime } from '@/lib/notes-rules';
import { AuthorBubble } from './AuthorBubble';
import { useFittedNotes } from './useFittedNotes';
import { MoreLine, PinGlyph, WarnGlyph, ageOf, authorOf, dangerTint, type NotesContext, NoteDrawingBody } from './shared';

/**
 * Bubbles: the family group chat, read-only. Oldest at the top and newest at
 * the bottom, so the eye lands on the latest. Which notes make it is still
 * wall order (pinned first, then newest), so a pinned note is never the one
 * pushed off the top.
 */
export function BubblesView({ ctx, shown, hidden }: { ctx: NotesContext; shown: Note[]; hidden: number }) {
  const priority = useMemo(() => shown.map((n) => n.id), [shown]);
  const { ref: listRef, drawn: kept, more } = useFittedNotes<HTMLDivElement>(ctx, shown, hidden, { priority });
  const drawn = sortByTime(kept).reverse();
  return (
    <>
      <div ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden justify-end" style={{ gap: '0.5em' }}>
        {drawn.map((note) => {
          const author = authorOf(note, ctx.members, ctx.t);
          const age = ageOf(note, ctx);
          const showWho = ctx.showAuthor || !!age || note.important || note.pinned;
          return (
            <div
              key={note.id}
              data-testid="notes-note"
              data-fit={note.id}
              data-important={note.important ? '' : undefined}
              data-pinned={note.pinned ? '' : undefined}
              className="flex items-end shrink-0 min-w-0"
              style={{ gap: '0.42em' }}
            >
              {ctx.showAuthor && <AuthorBubble author={author} em={0.84} />}
              <div
                className="min-w-0"
                style={{
                  maxWidth: '86%',
                  padding: '0.42em 0.58em',
                  borderRadius: '0.66em 0.66em 0.66em 0.16em',
                  backgroundColor: note.important ? dangerTint(0.2) : ink(0.12),
                }}
              >
                {showWho && (
                  <div
                    className="flex items-center min-w-0"
                    style={{ fontSize: '0.6em', fontWeight: 700, gap: '0.4em', marginBottom: '0.25em', color: author.color ?? ink(0.6) }}
                  >
                    {ctx.showAuthor && <span className="truncate">{author.name}</span>}
                    {age && <span className="shrink-0 whitespace-nowrap" style={{ color: ink(0.5), fontWeight: 500 }}>{age}</span>}
                    {note.important && <WarnGlyph />}
                    {note.pinned && <PinGlyph color={ink(0.6)} />}
                  </div>
                )}
                {note.drawing ? (
                  <NoteDrawingBody note={note} ctx={ctx} height="2.6em" />
                ) : (
                  <div className="line-clamp-2" style={{ fontSize: '0.86em', lineHeight: 1.28, fontWeight: 500, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                    {note.text}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <MoreLine n={more} ctx={ctx} />
    </>
  );
}
