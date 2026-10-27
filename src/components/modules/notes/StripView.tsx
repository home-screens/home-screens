'use client';

import type { Note } from '@/types/notes';
import { ink } from '@/lib/constants';
import { AuthorBubble } from './AuthorBubble';
import { useStepper } from './useStepper';
import { DANGER_INK, PinGlyph, WarnGlyph, ageOf, authorOf, type NotesContext } from './shared';

/**
 * Strip: a one-line bar for the top or bottom edge of a wall. Author, one
 * note, its position; steps like Spotlight. A note longer than the line is
 * cut with an ellipsis, so the strip never scrolls.
 */
export function StripView({ ctx, all, stepSeconds }: { ctx: NotesContext; all: Note[]; stepSeconds: number }) {
  const { note, position } = useStepper(all, stepSeconds);
  if (!note) return null;
  const author = authorOf(note, ctx.members, ctx.t);
  const age = ageOf(note, ctx);
  return (
    <div
      data-testid="notes-note"
      data-important={note.important ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      className="flex items-center flex-1 min-h-0 min-w-0"
      style={{ gap: '0.62em', fontSize: '1.05em' }}
    >
      {ctx.showAuthor && (
        <>
          <AuthorBubble author={author} />
          <b className="truncate shrink-0" style={{ maxWidth: '30%', fontWeight: 600, color: ink(0.85) }}>{author.name}</b>
        </>
      )}
      {age && <span className="shrink-0 whitespace-nowrap" style={{ fontSize: '0.62em', color: ink(0.5) }}>{age}</span>}
      {note.important ? <WarnGlyph /> : note.pinned ? <PinGlyph color={ink(0.55)} /> : null}
      <span className="truncate flex-1 min-w-0" style={{ fontWeight: 500, color: note.important ? DANGER_INK : undefined }}>
        {note.text}
      </span>
      <span data-testid="notes-step" className="shrink-0 tabular-nums whitespace-nowrap" style={{ fontSize: '0.62em', color: ink(0.5) }}>
        {ctx.t('notes.of', { index: position + 1, total: all.length })}
      </span>
    </div>
  );
}
