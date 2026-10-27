'use client';

import { useRef } from 'react';
import { Star } from 'lucide-react';
import { UI_SANS_STACK } from '@/lib/font-registry';
import type { MaterialViewProps } from './types';
import { useFitCount } from '../useFitCount';
import { ageOf, authorOf, fitKeyOf, type NoteAuthor } from '../shared';

/** The board: a glare from the top left over a white that greys a touch to the bottom right. */
const BOARD = [
  'linear-gradient(115deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.4) 35%, rgba(255, 255, 255, 0) 60%)',
  'linear-gradient(160deg, #fbfbfc, #eef1f4)',
].join(', ');

/** The heading's marker. */
const BLUE_MARKER = '#1d4ed8';
const RED_MARKER = '#dc2626';
/** Small print on the board: the count and the "and N more" line. */
const GREY = '#6b7280';
/** Ink and magnet for a note nobody signed. */
const PLAIN_INK = '#1f2937';
const PLAIN_MAGNET = '#9ca3af';
/** The markers lying in the tray. */
const MARKERS = [BLUE_MARKER, RED_MARKER, '#15803d', '#111111'];

/** Room below the content for the marker tray, in base ems (the mockup's 40px bottom padding at 24px type, less the card's own). */
const TRAY_ROOM_EM = 1.1;
/** The "and N more" line: 0.78em type at line height 1.4, plus its top gap. */
const MORE_EM = 0.78 * 1.4 + 0.3;

/**
 * A member's marker: their colour darkened so it reads on white. The raw
 * colour stays for the magnet.
 */
function markerInk(author: NoteAuthor): string {
  return author.color ? `color-mix(in srgb, ${author.color} 65%, black)` : PLAIN_INK;
}

/** A glossy round magnet: a highlight up and left, the colour, then its shade. */
function magnetFill(color: string): string {
  return `radial-gradient(circle at 35% 35%, color-mix(in srgb, ${color} 40%, white), ${color} 55%, color-mix(in srgb, ${color} 55%, black))`;
}

/**
 * Whiteboard: glossy white in an aluminium frame with a marker tray. The
 * heading is in blue marker; each note is in its author's marker with their
 * magnet beside it, the important one in red marker, underlined. Rows,
 * fitted whole like Board.
 */
export function WhiteboardView({ ctx, all, shown, hidden, title, showTitle, padding }: MaterialViewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const visible = useFitCount(
    listRef,
    fitKeyOf(shown, ctx.fontPx, ctx.showAuthor, ctx.showAge, showTitle),
    hidden > 0 ? 0 : ctx.fontPx * MORE_EM,
  );
  const drawn = visible === null ? shown : shown.slice(0, visible);
  const more = hidden + shown.length - drawn.length;
  return (
    <div
      className="relative flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{
        background: BOARD,
        borderStyle: 'solid',
        borderWidth: '0.5em',
        borderImage: 'linear-gradient(180deg, #e8ebef, #c3c8cf) 1',
        boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.08)',
      }}
    >
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ padding: `${padding}px ${padding}px calc(${padding}px + ${TRAY_ROOM_EM}em) calc(${padding}px + 0.15em)` }}
      >
        <div className="flex items-baseline justify-between shrink-0" style={{ gap: '0.5em', marginBottom: '0.42em' }}>
          {showTitle && (
            <h2 className="truncate" style={{ fontSize: '1.45em', fontWeight: 700, lineHeight: 1.15, color: BLUE_MARKER }}>
              {title}
            </h2>
          )}
          <span
            className="ml-auto shrink-0 whitespace-nowrap"
            style={{ fontFamily: UI_SANS_STACK, fontSize: '0.8em', fontWeight: 600, color: GREY, textTransform: 'uppercase', letterSpacing: '0.02em' }}
          >
            {ctx.t('notes.count', { count: all.length })}
          </span>
        </div>
        <ul ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ gap: '0.5em' }}>
          {drawn.map((note) => {
            const author = authorOf(note, ctx.members, ctx.t);
            const age = ageOf(note, ctx);
            const color = markerInk(author);
            const showWho = ctx.showAuthor || !!age;
            return (
              <li
                key={note.id}
                data-testid="notes-note"
                data-fit={note.id}
                data-important={note.important ? '' : undefined}
                data-pinned={note.pinned ? '' : undefined}
                className="flex items-start shrink-0 min-w-0"
                style={{ gap: '0.5em', color }}
              >
                {ctx.showAuthor && (
                  <span
                    data-testid="notes-author"
                    data-author={author.id ?? 'someone'}
                    title={author.name}
                    className="block rounded-full shrink-0"
                    style={{
                      width: '1.05em',
                      height: '1.05em',
                      marginTop: '0.25em',
                      background: magnetFill(author.color ?? PLAIN_MAGNET),
                      boxShadow: '0 2px 3px rgba(0, 0, 0, 0.35), inset 0 -2px 3px rgba(0, 0, 0, 0.25), inset 0 2px 3px rgba(255, 255, 255, 0.6)',
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  {showWho && (
                    <div className="flex items-baseline min-w-0" style={{ fontSize: '0.72em', fontWeight: 600, lineHeight: 1.2 }}>
                      {ctx.showAuthor && <span className="truncate" style={{ opacity: 0.85 }}>{author.name}</span>}
                      {age && (
                        <span
                          className="shrink-0 whitespace-nowrap"
                          style={{ opacity: 0.55, fontWeight: 400, marginLeft: ctx.showAuthor ? '0.4em' : undefined }}
                        >
                          {age}
                        </span>
                      )}
                    </div>
                  )}
                  <div
                    className="line-clamp-3"
                    style={{
                      fontSize: '1.12em',
                      lineHeight: 1.2,
                      fontWeight: 700,
                      whiteSpace: 'pre-line',
                      overflowWrap: 'anywhere',
                      ...(note.important
                        ? { color: RED_MARKER, textDecoration: 'underline', textDecorationThickness: '0.11em', textUnderlineOffset: '0.18em' }
                        : null),
                    }}
                  >
                    {note.text}
                    {note.pinned && (
                      <Star
                        size="0.8em"
                        fill="currentColor"
                        strokeWidth={1.5}
                        aria-hidden="true"
                        className="inline-block"
                        style={{ marginLeft: '0.3em', verticalAlign: '-0.05em' }}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {more > 0 && (
          <div
            data-testid="notes-more"
            className="shrink-0"
            style={{ fontFamily: UI_SANS_STACK, fontSize: '0.78em', lineHeight: 1.4, paddingTop: '0.3em', color: GREY }}
          >
            {ctx.t('notes.andMore', { n: more })}
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="absolute flex items-center"
        style={{
          left: '1em',
          right: '1em',
          bottom: '0.42em',
          height: '0.67em',
          gap: '0.42em',
          padding: '0 0.58em',
          borderRadius: '0.17em',
          background: 'linear-gradient(#d9dde2, #b8bec6)',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
        }}
      >
        {MARKERS.map((color) => (
          <i key={color} className="block" style={{ width: '2.33em', height: '0.33em', borderRadius: '0.17em', background: color }} />
        ))}
      </div>
    </div>
  );
}
