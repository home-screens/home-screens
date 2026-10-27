import type { Note } from '@/types/notes';
import { DIVIDER, ink } from '@/lib/constants';
import { AuthorBubble } from './AuthorBubble';
import { NoteMarks, ageOf, authorOf, dangerTint, type NotesContext } from './shared';

/**
 * Inset of an important note's tinted block. The list it sits in is widened
 * by the same amount into the card's padding, so the tint reaches past the
 * text while the text stays in line with the plain rows.
 */
export const ROW_TINT_INSET = '0.5em';

/** List style that gives an important row's tint its room (see ROW_TINT_INSET). */
export const TINTED_LIST_STYLE = { margin: `0 -${ROW_TINT_INSET}`, padding: `0 ${ROW_TINT_INSET}` } as const;

/**
 * One Board row: the author's bubble, a line with their name, the age and
 * the markers, then the text in two lines at most. Important notes sit in a
 * tinted block. Shared by Board and both columns of Pinned and new.
 */
export function NoteRow({ note, ctx, last, showPin = true }: {
  note: Note;
  ctx: NotesContext;
  last: boolean;
  /** Off under the "Pinned" heading, which already says so. */
  showPin?: boolean;
}) {
  const author = authorOf(note, ctx.members, ctx.t);
  const age = ageOf(note, ctx);
  const imp = note.important;
  const marks = imp || (note.pinned && showPin);
  const showWho = ctx.showAuthor || !!age || marks;
  return (
    <li
      data-testid="notes-note"
      data-fit={note.id}
      data-important={imp ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      className="flex shrink-0"
      style={{
        gap: '0.58em',
        padding: imp ? `0.58em ${ROW_TINT_INSET}` : '0.58em 0',
        margin: imp ? `0 -${ROW_TINT_INSET} 0.25em` : undefined,
        borderRadius: imp ? '0.58em' : undefined,
        backgroundColor: imp ? dangerTint(0.14) : undefined,
        borderBottom: imp || last ? 'none' : `1px solid ${DIVIDER.visible}`,
      }}
    >
      {ctx.showAuthor && <AuthorBubble author={author} style={{ marginTop: '0.25em' }} />}
      <div className="flex-1 min-w-0">
        {showWho && (
          <div className="flex items-center" style={{ gap: '0.6em', fontSize: '0.66em', color: ink(0.6), marginBottom: '0.3em' }}>
            {ctx.showAuthor && (
              <b className="truncate" style={{ color: ink(0.85), fontWeight: 600 }}>{author.name}</b>
            )}
            {age && <span className="shrink-0 whitespace-nowrap">{age}</span>}
            {marks && (
              // With no name or age beside them the marks lead the line, so a
              // lone pin does not float at the far edge of an empty row.
              <span className={ctx.showAuthor || age ? 'ml-auto inline-flex' : 'inline-flex'}>
                <NoteMarks note={note} t={ctx.t} showPin={showPin} />
              </span>
            )}
          </div>
        )}
        <div className="line-clamp-2" style={{ lineHeight: 1.3, fontWeight: 500, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
          {note.text}
        </div>
      </div>
    </li>
  );
}
