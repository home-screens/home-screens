import type { Note } from '@/types/notes';
import { DIVIDER, ink } from '@/lib/constants';
import { AuthorBubble } from './AuthorBubble';
import { CompactRow } from './CompactRow';
import { MoreLine, NoteMarks, ageOf, authorOf, type NotesContext } from './shared';

/** How many small lines follow the lead note. */
const FOLLOWING = 2;

/**
 * Focus: the first note (pinned, else newest) in large type with its author
 * line, then the next two as single lines. One thing to read, two to know
 * about, and "and N more" for the rest.
 */
export function FocusView({ ctx, all, shown }: { ctx: NotesContext; all: Note[]; shown: Note[] }) {
  const lead = shown[0];
  if (!lead) return null;
  const rest = shown.slice(1, 1 + FOLLOWING);
  const author = authorOf(lead, ctx.members, ctx.t);
  const age = ageOf(lead, ctx);
  const showWho = ctx.showAuthor || !!age || lead.important || lead.pinned;
  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div
          data-testid="notes-note"
          data-important={lead.important ? '' : undefined}
          data-pinned={lead.pinned ? '' : undefined}
          className="shrink-0"
        >
          <div
            className="line-clamp-3"
            style={{ fontSize: '1.25em', lineHeight: 1.25, fontWeight: 500, letterSpacing: '-0.01em', whiteSpace: 'pre-line', overflowWrap: 'anywhere', marginBottom: '0.3em' }}
          >
            {lead.text}
          </div>
          {showWho && (
            <div className="flex items-center min-w-0" style={{ gap: '0.5em', fontSize: '0.66em', color: ink(0.6), marginBottom: '1.1em' }}>
              {ctx.showAuthor && (
                <>
                  <AuthorBubble author={author} em={1.25} />
                  <b className="truncate" style={{ color: ink(0.85), fontWeight: 600 }}>{author.name}</b>
                </>
              )}
              {age && <span className="shrink-0 whitespace-nowrap">{age}</span>}
              <NoteMarks note={lead} t={ctx.t} />
            </div>
          )}
        </div>
        {rest.length > 0 && (
          <ul className="flex flex-col shrink-0" style={{ fontSize: '0.8em', borderTop: `1px solid ${DIVIDER.visible}`, paddingTop: '0.42em' }}>
            {rest.map((note, i) => (
              <CompactRow key={note.id} note={note} ctx={ctx} last={i === rest.length - 1} />
            ))}
          </ul>
        )}
      </div>
      <MoreLine n={all.length - 1 - rest.length} t={ctx.t} />
    </>
  );
}
