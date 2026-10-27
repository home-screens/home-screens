import type { Note } from '@/types/notes';
import { ink } from '@/lib/constants';
import TickerMarquee from '../TickerMarquee';
import { AuthorBubble } from './AuthorBubble';
import { DANGER_INK, PinGlyph, WarnGlyph, ageOf, authorOf, type NotesContext } from './shared';

/** The right edge fades out, so a note runs off the card rather than being cut. */
const FADE_MASK = 'linear-gradient(90deg, #000 0, #000 94%, transparent)';

/**
 * Ticker: every live note in one slow continuous crawl, through the shared
 * marquee the Sports ticker uses, so the motion matches. A dot sits between
 * notes; important text is in the danger colour.
 */
export function TickerView({ ctx, all, speed }: { ctx: NotesContext; all: Note[]; speed: number }) {
  return (
    <div className="flex-1 min-h-0 min-w-0" style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}>
      <TickerMarquee itemCount={all.length} speed={speed} gap={0}>
        {all.map((note) => {
          const author = authorOf(note, ctx.members, ctx.t);
          const age = ageOf(note, ctx);
          return (
            <span
              key={note.id}
              data-testid="notes-note"
              data-important={note.important ? '' : undefined}
              data-pinned={note.pinned ? '' : undefined}
              className="inline-flex items-center shrink-0"
              style={{ gap: '0.5em' }}
            >
              {ctx.showAuthor && (
                <>
                  <AuthorBubble author={author} em={0.84} />
                  <b style={{ fontWeight: 600, color: ink(0.75) }}>{author.name}</b>
                </>
              )}
              {age && <span style={{ fontSize: '0.62em', color: ink(0.5) }}>{age}</span>}
              {note.important ? <WarnGlyph /> : note.pinned ? <PinGlyph color={ink(0.55)} /> : null}
              <span style={{ fontWeight: 500, color: note.important ? DANGER_INK : undefined }}>{note.text}</span>
              <i
                aria-hidden="true"
                className="rounded-full shrink-0"
                style={{ width: '0.25em', height: '0.25em', margin: '0 1.6em', backgroundColor: ink(0.3) }}
              />
            </span>
          );
        })}
      </TickerMarquee>
    </div>
  );
}
