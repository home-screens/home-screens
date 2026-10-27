'use client';

import { useRef } from 'react';
import { Star } from 'lucide-react';
import type { MaterialViewProps } from './types';
import { useFitCount } from '../useFitCount';
import { ageOf, authorOf, fitKeyOf } from '../shared';

/** The slate: two soft smudges of old chalk, a fine dust grain, and the green-black board. */
const SLATE = [
  'radial-gradient(205% 96% at 20% 10%, rgba(255, 255, 255, 0.06), transparent 60%)',
  'radial-gradient(136% 77% at 80% 90%, rgba(255, 255, 255, 0.05), transparent 60%)',
  'repeating-radial-gradient(circle at 40% 60%, rgba(255, 255, 255, 0.015) 0 2px, transparent 2px 7px)',
  'linear-gradient(160deg, #26423a, #1a2f29 55%, #142420)',
].join(', ');

const CHALK = '#f1ede2';
/** Yellow chalk, for the important note. */
const YELLOW_CHALK = '#ffe27a';
/** The stubs on the tray: white, yellow, then three pastels. */
const STUBS = [CHALK, YELLOW_CHALK, '#9fc0ff', '#f7b1d8', '#a9f0bf'];

/** Height of the chalk tray along the bottom, in base ems (the mockup's 18px at 24px type). */
const TRAY_EM = 0.75;
/** The "and N more" line: 0.8em type at line height 1.4, plus its top gap. */
const MORE_EM = 0.8 * 1.4 + 0.3;

/**
 * Chalkboard: a slate in a wooden frame with a chalk tray along the bottom.
 * The heading is written in chalk capitals with a wavy underline, each note
 * below it in chalk handwriting with the author's name in a lightened member
 * colour; the pinned note is starred, the important one is in yellow chalk
 * behind a double bang. Rows, fitted whole like Board.
 */
export function ChalkboardView({ ctx, all, shown, hidden, title, showTitle, padding }: MaterialViewProps) {
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
        background: SLATE,
        border: '0.58em solid #7a5230',
        boxShadow: 'inset 0 0 0 2px #5a3a1f, inset 0 0 40px rgba(0, 0, 0, 0.45)',
      }}
    >
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ padding: `${padding}px ${padding}px calc(${padding}px + ${TRAY_EM}em) calc(${padding}px + 0.25em)` }}
      >
        <div
          className="flex items-baseline justify-between shrink-0"
          style={{ gap: '0.5em', marginBottom: '0.5em' }}
        >
          {showTitle && (
            <h2
              className="truncate"
              style={{
                fontSize: '1.5em',
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                textDecoration: 'underline wavy rgba(241, 237, 226, 0.55)',
                textDecorationThickness: '0.05em',
                textUnderlineOffset: '0.2em',
                // Room under the line for the wave, which the truncation clip would cut.
                paddingBottom: '0.3em',
              }}
            >
              {title}
            </h2>
          )}
          <span className="ml-auto shrink-0 whitespace-nowrap" style={{ fontSize: '0.82em', fontWeight: 600, opacity: 0.7 }}>
            {ctx.t('notes.count', { count: all.length })}
          </span>
        </div>
        <ul ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ gap: '0.55em' }}>
          {drawn.map((note) => {
            const author = authorOf(note, ctx.members, ctx.t);
            const age = ageOf(note, ctx);
            // With no name and no age the star leads the note itself rather
            // than standing alone on a line of its own.
            const showWho = ctx.showAuthor || !!age;
            // The name line is chalk in the author's colour, lightened: the
            // star and the age too. The important note is yellow throughout.
            const whoColor = ctx.showAuthor && author.color && !note.important
              ? `color-mix(in srgb, ${author.color} 45%, white)`
              : undefined;
            return (
              <li
                key={note.id}
                data-testid="notes-note"
                data-fit={note.id}
                data-important={note.important ? '' : undefined}
                data-pinned={note.pinned ? '' : undefined}
                className="shrink-0 min-w-0"
                style={{
                  fontSize: '1.12em',
                  lineHeight: 1.22,
                  fontWeight: 600,
                  color: note.important ? YELLOW_CHALK : undefined,
                  textShadow: '0 0 1px rgba(255, 255, 255, 0.35)',
                }}
              >
                {showWho && (
                  <div className="flex items-baseline min-w-0" style={{ fontSize: '0.72em', fontWeight: 700, marginBottom: '0.1em', color: whoColor }}>
                    {note.pinned && (
                      <Star size="0.9em" fill="currentColor" strokeWidth={1.5} aria-hidden="true" className="shrink-0 self-center" style={{ marginRight: '0.4em' }} />
                    )}
                    {ctx.showAuthor && (
                      <span
                        data-testid="notes-author"
                        data-author={author.id ?? 'someone'}
                        className="truncate"
                      >
                        {author.name}
                      </span>
                    )}
                    {age && (
                      <span
                        className="shrink-0 whitespace-nowrap"
                        style={{ opacity: 0.6, fontWeight: 400, marginLeft: ctx.showAuthor ? '0.45em' : undefined }}
                      >
                        {age}
                      </span>
                    )}
                  </div>
                )}
                <div className="line-clamp-3" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                  {note.pinned && !showWho && (
                    <Star
                      size="0.8em"
                      fill="currentColor"
                      strokeWidth={1.5}
                      aria-hidden="true"
                      className="inline-block"
                      style={{ marginRight: '0.3em', verticalAlign: '-0.05em' }}
                    />
                  )}
                  {note.important && <span aria-hidden="true">!! </span>}
                  {note.text}
                </div>
              </li>
            );
          })}
        </ul>
        {more > 0 && (
          <div
            data-testid="notes-more"
            className="shrink-0"
            style={{ fontSize: '0.8em', lineHeight: 1.4, paddingTop: '0.3em', fontWeight: 600, opacity: 0.65 }}
          >
            {ctx.t('notes.andMore', { n: more })}
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 bottom-0 flex items-center"
        style={{
          height: `${TRAY_EM}em`,
          gap: '0.42em',
          padding: '0 0.83em',
          background: 'linear-gradient(#8a5f3a, #6e4826)',
          borderTop: '2px solid #a37a52',
        }}
      >
        {STUBS.map((color) => (
          <i
            key={color}
            className="block"
            style={{
              width: '1.75em',
              height: '0.375em',
              borderRadius: '0.12em',
              background: color,
              opacity: 0.9,
              boxShadow: '0 1px 1px rgba(0, 0, 0, 0.4)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
