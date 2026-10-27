'use client';

import { useRef } from 'react';
import type { Note } from '@/types/notes';
import { tiltFor } from '@/lib/notes-rules';
import { useFitCount } from './useFitCount';
import { DANGER, MORE_LINE_EM, MoreLine, PinGlyph, WarnGlyph, ageOf, authorOf, fitKeyOf, type NotesContext } from './shared';

/** Paper for a note with no author: the Sticky Note module's yellow. */
const PLAIN_PAPER = '#fef08a';
/**
 * Ink on the paper. The papers are always light (a colour mixed with white),
 * so their text is the Sticky Note module's dark ink, not the card's.
 */
const PAPER_INK = '#1a1a1a';
const PAPER_MUTED = 'rgba(0, 0, 0, 0.6)';

/** Below this content width the papers go two to a row instead of three. */
const TWO_COLUMNS_BELOW_PX = 500;

/**
 * Sticky: the fridge door. Paper squares in the author's colour, lightened,
 * with dark ink; an important note on red paper. Each paper leans by a
 * constant from its id (`tiltFor`), never animated. The card behind keeps
 * the module's own style; only the papers carry their own colours.
 */
export function StickyView({ ctx, shown, hidden, width }: { ctx: NotesContext; shown: Note[]; hidden: number; width: number }) {
  const columns = width > 0 && width < TWO_COLUMNS_BELOW_PX ? 2 : 3;
  const gridRef = useRef<HTMLDivElement>(null);
  const visible = useFitCount(
    gridRef,
    fitKeyOf(shown, ctx.fontPx, columns, ctx.showAuthor, ctx.showAge),
    hidden > 0 ? 0 : ctx.fontPx * MORE_LINE_EM,
  );
  const drawn = visible === null ? shown : shown.slice(0, visible);
  return (
    <>
      <div
        ref={gridRef}
        className="grid flex-1 min-h-0 overflow-hidden content-start"
        // The padding keeps a leaning paper's corners inside the clip.
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '0.75em 0.66em', padding: '0.3em 0.2em' }}
      >
        {drawn.map((note) => {
          const author = authorOf(note, ctx.members, ctx.t);
          const age = ageOf(note, ctx);
          const paper = note.important
            ? `color-mix(in srgb, ${DANGER} 62%, #fff)`
            : `color-mix(in srgb, ${author.color ?? PLAIN_PAPER} 55%, #fff)`;
          return (
            <div
              key={note.id}
              data-testid="notes-note"
              data-fit={note.id}
              data-important={note.important ? '' : undefined}
              data-pinned={note.pinned ? '' : undefined}
              className="flex flex-col min-w-0"
              style={{
                background: paper,
                color: PAPER_INK,
                fontSize: '0.78em',
                minHeight: '8em',
                padding: '0.75em 0.75em 0.62em',
                borderRadius: '0.3em',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                transform: `rotate(${tiltFor(note.id)}deg)`,
              }}
            >
              <div className="line-clamp-4" style={{ lineHeight: 1.28, fontWeight: 500, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                {note.text}
              </div>
              <div
                className="flex items-center mt-auto min-w-0"
                style={{ paddingTop: '0.62em', fontSize: '0.78em', color: PAPER_MUTED, gap: '0.3em', fontWeight: 600 }}
              >
                {ctx.showAuthor && <span className="truncate">{author.name}</span>}
                {note.pinned && <PinGlyph />}
                {/* The glyph alone: the red paper already says it, and the word
                    would squeeze the author's name out of a paper this narrow. */}
                {note.important && <WarnGlyph color="currentColor" />}
                {age && <span className="ml-auto shrink-0 whitespace-nowrap" style={{ fontWeight: 500 }}>{age}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <MoreLine n={hidden + shown.length - drawn.length} t={ctx.t} />
    </>
  );
}
