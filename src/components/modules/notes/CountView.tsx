import type { Note } from '@/types/notes';
import { ink } from '@/lib/constants';
import { AuthorBubble, MoreBubble } from './AuthorBubble';
import { DANGER_INK, WarnGlyph, authorOf, type NoteAuthor, type NotesContext } from './shared';

/** Author bubbles before the "+N" one (the five-plus-members rule). */
const MAX_AUTHORS = 4;
/** Overlap of neighbouring bubbles, in the bubble letter's ems. */
const OVERLAP = '-0.31em';

/**
 * Count: a tile with how many notes are up, who has posted (aggregate
 * bubbles in wall order, "+N" past four) and whether any is important. With
 * nothing up it still says 0, with the empty line beneath. Always shows who
 * posted: there is nothing else on the tile to show.
 */
export function CountView({ ctx, all, emptyMessage }: { ctx: NotesContext; all: Note[]; emptyMessage: string }) {
  const authors: NoteAuthor[] = [];
  const seen = new Set<string>();
  for (const note of all) {
    const author = authorOf(note, ctx.members, ctx.t);
    const id = author.id ?? '';
    if (seen.has(id)) continue;
    seen.add(id);
    authors.push(author);
  }
  const shownAuthors = authors.slice(0, MAX_AUTHORS);
  const extra = authors.length - shownAuthors.length;
  const important = all.filter((n) => n.important).length;
  // A ring of the card's ink keeps overlapping bubbles apart, as on the to-do cards.
  const ring = `0 0 0 2px ${ink(0.15)}`;
  return (
    <div className="flex flex-col justify-center flex-1 min-h-0 overflow-hidden" style={{ gap: '0.25em' }}>
      <div data-testid="notes-count" className="tabular-nums" style={{ fontSize: '3.2em', fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em' }}>
        {all.length}
      </div>
      <div style={{ fontSize: '0.8em', color: ink(0.65) }}>{ctx.t('notes.countLabel', { count: all.length })}</div>
      {all.length === 0 && (
        <div style={{ fontSize: '0.66em', lineHeight: 1.35, color: ink(0.5) }}>{emptyMessage}</div>
      )}
      {shownAuthors.length > 0 && (
        <div className="flex" style={{ marginTop: '0.33em', paddingLeft: 2 }}>
          {shownAuthors.map((author, i) => (
            <AuthorBubble
              key={author.id ?? 'someone'}
              author={author}
              style={{ boxShadow: ring, marginLeft: i === 0 ? 0 : OVERLAP }}
            />
          ))}
          {extra > 0 && <MoreBubble n={extra} style={{ boxShadow: ring, marginLeft: OVERLAP }} />}
        </div>
      )}
      {important > 0 && (
        <div
          data-testid="notes-important"
          className="inline-flex items-center"
          style={{ gap: '0.3em', marginTop: '0.25em', fontSize: '0.66em', fontWeight: 700, color: DANGER_INK }}
        >
          <WarnGlyph size="1.2em" />
          {ctx.t('notes.importantCount', { count: important })}
        </div>
      )}
    </div>
  );
}
