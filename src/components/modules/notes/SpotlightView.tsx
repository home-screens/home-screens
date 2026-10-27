'use client';

import type { Note } from '@/types/notes';
import { ink } from '@/lib/constants';
import { AuthorBubble } from './AuthorBubble';
import { useStepper } from './useStepper';
import { NoteMarks, ageOf, authorOf, type NotesContext } from './shared';

/** Past this many notes the dots stop helping; the "2 of 14" counter carries it alone. */
const MAX_DOTS = 12;

/**
 * Spotlight: one note at a time in large type, stepping through every live
 * note. Pinned and important notes get two turns. The swap is a plain
 * re-render with no transition.
 */
export function SpotlightView({ ctx, all, stepSeconds }: { ctx: NotesContext; all: Note[]; stepSeconds: number }) {
  const { note, position } = useStepper(all, stepSeconds);
  if (!note) return null;
  const author = authorOf(note, ctx.members, ctx.t);
  const age = ageOf(note, ctx);
  return (
    <div
      data-testid="notes-note"
      data-important={note.important ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="flex items-center shrink-0 min-w-0" style={{ gap: '0.42em', fontSize: '0.7em', color: ink(0.65) }}>
        {ctx.showAuthor && (
          <>
            <AuthorBubble author={author} em={1.2} />
            <b className="truncate" style={{ color: ink(0.9), fontWeight: 600 }}>{author.name}</b>
          </>
        )}
        {age && <span className="shrink-0 whitespace-nowrap">{age}</span>}
        <span className="ml-auto inline-flex">
          <NoteMarks note={note} t={ctx.t} />
        </span>
      </div>
      <div className="flex flex-1 min-h-0 items-center overflow-hidden">
        <div
          className="line-clamp-3"
          style={{ fontSize: '1.35em', lineHeight: 1.25, fontWeight: 500, letterSpacing: '-0.01em', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
        >
          {note.text}
        </div>
      </div>
      <div className="flex items-center shrink-0" style={{ gap: '0.25em', fontSize: '0.6em', color: ink(0.5) }}>
        {all.length > 1 && all.length <= MAX_DOTS && all.map((n, i) => (
          <i
            key={n.id}
            aria-hidden="true"
            className="rounded-full shrink-0"
            style={{ width: '0.55em', height: '0.55em', backgroundColor: i === position ? ink(1) : ink(0.25) }}
          />
        ))}
        <span data-testid="notes-step" className="ml-auto tabular-nums whitespace-nowrap">
          {ctx.t('notes.of', { index: position + 1, total: all.length })}
        </span>
      </div>
    </div>
  );
}
