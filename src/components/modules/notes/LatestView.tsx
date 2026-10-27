import type { Note } from '@/types/notes';
import { ink } from '@/lib/constants';
import { sortByTime } from '@/lib/notes-rules';
import { AuthorBubble } from './AuthorBubble';
import { NoteMarks, ageOf, authorOf, type NotesContext } from './shared';

/**
 * Latest: the newest note alone, large, with no stepping and no counter.
 * Whatever was said last is the whole card.
 */
export function LatestView({ ctx, all }: { ctx: NotesContext; all: Note[] }) {
  const note = sortByTime(all)[0];
  if (!note) return null;
  const author = authorOf(note, ctx.members, ctx.t);
  const age = ageOf(note, ctx);
  const showWho = ctx.showAuthor || !!age || note.important || note.pinned;
  return (
    <div
      data-testid="notes-note"
      data-important={note.important ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="font-bold uppercase shrink-0" style={{ fontSize: '0.62em', letterSpacing: '0.08em', color: ink(0.5) }}>
        {ctx.t('notes.latest')}
      </div>
      <div className="flex flex-1 min-h-0 items-center overflow-hidden">
        <div
          className="line-clamp-3"
          style={{ fontSize: '1.5em', lineHeight: 1.22, fontWeight: 500, letterSpacing: '-0.015em', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
        >
          {note.text}
        </div>
      </div>
      {showWho && (
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
      )}
    </div>
  );
}
