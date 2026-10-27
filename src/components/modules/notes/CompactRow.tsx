import type { Note } from '@/types/notes';
import { DIVIDER, ink } from '@/lib/constants';
import { AuthorBubble } from './AuthorBubble';
import { DANGER_INK, PinGlyph, WarnGlyph, ageOf, authorOf, type NotesContext } from './shared';

/**
 * One Compact line: bubble, the text cut with an ellipsis, a marker column
 * (warning or pin) and the age on the right. Shared by Compact and the two
 * small lines under Focus's lead note. Sized by the list it sits in.
 */
export function CompactRow({ note, ctx, last }: { note: Note; ctx: NotesContext; last: boolean }) {
  const author = authorOf(note, ctx.members, ctx.t);
  const age = ageOf(note, ctx);
  const imp = note.important;
  return (
    <li
      data-testid="notes-note"
      data-fit={note.id}
      data-important={imp ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      className="flex items-center shrink-0"
      style={{ gap: '0.42em', padding: '0.3em 0', borderBottom: last ? 'none' : `1px solid ${DIVIDER.default}` }}
    >
      {ctx.showAuthor && <AuthorBubble author={author} em={0.78} />}
      <span className="truncate flex-1 min-w-0" style={{ fontWeight: 500, color: imp ? DANGER_INK : undefined }}>
        {note.text}
      </span>
      <span className="inline-flex justify-center shrink-0" style={{ width: '1.1em' }}>
        {imp ? <WarnGlyph /> : note.pinned ? <PinGlyph color={ink(0.55)} /> : null}
      </span>
      {age && (
        <span className="shrink-0 whitespace-nowrap text-right" style={{ fontSize: '0.78em', color: ink(0.5), minWidth: '3.4em' }}>
          {age}
        </span>
      )}
    </li>
  );
}
