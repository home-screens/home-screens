'use client';

import { useRef } from 'react';
import { Star } from 'lucide-react';
import { UI_SANS_STACK } from '@/lib/font-registry';
import { initialOf } from '@/lib/notes-rules';
import type { MaterialViewProps } from './types';
import { useFitCount } from '../useFitCount';
import { ageOf, authorOf, fitKeyOf, type NotesContext } from '../shared';

const PAPER = '#fbf8ee';
const RULE = 'rgba(110, 150, 210, 0.45)';
const MARGIN_LINE = 'rgba(220, 60, 60, 0.55)';
const RED_PEN = '#b91c1c';
const HEADING_INK = '#111827';
const PENCIL_GREY = '#6b7280';
const STAR = '#b45309';

/**
 * The page's geometry in the mockup's pixels at its 24px type, scaled to the
 * fitted type. The rule pitch is held to whole pixels so every wrapped line,
 * however many a note takes, lands on its rule all the way down the page.
 */
const DESIGN_PX = 24;
const RULE_PX = 40;
const MARGIN_LINE_X = 58;
const HOLES_X = 14;
const HOLE_PX = 18;
const HOLE_RING_PX = 3;
const HOLES_INSET_Y = 20;
/** Room from one hole to the next, so a taller page punches more holes. */
const HOLE_PITCH_PX = 46;
/** Where the initial sits in the margin, between the holes and the red line. */
const INITIAL_X = 30;
const INITIAL_W = 28;

/** The longest last word kept on one line with the star and age; a longer one wraps freely. */
const GLUED_WORD_MAX = 24;

/** A note's text up to its last word, and the last word. */
function splitLastWord(text: string): [string, string] {
  const at = text.search(/\S+$/);
  return at > 0 ? [text.slice(0, at), text.slice(at)] : ['', text];
}

/** Today's weekday in the household's zone, for the heading. */
function weekdayOf(ctx: NotesContext): string {
  try {
    return new Intl.DateTimeFormat(ctx.locale, { weekday: 'long', timeZone: ctx.timezone }).format(ctx.now);
  } catch {
    return '';
  }
}

/**
 * A member's pen for the margin initial: their colour taken a quarter of the
 * way to black, so the light ones (green, cyan) still read on cream.
 */
function initialInk(color: string | null): string {
  return color ? `color-mix(in srgb, ${color} 75%, black)` : PENCIL_GREY;
}

/**
 * Notebook: a spiral page of cream paper with blue rules, the red margin
 * line and punched holes down the left. The heading is written on the first
 * rule with the weekday beside it; each note follows in blue pen, wrapping
 * onto as many rules as it needs, with the author's initial in their colour
 * in the margin. Important notes are in red pen; pinned ones get a star.
 * The page holds as many whole notes as its rules do and counts the rest.
 */
export function NotebookView({ ctx, shown, hidden, title, showTitle, padding, height }: MaterialViewProps) {
  const unit = ctx.fontPx / DESIGN_PX;
  const px = (design: number) => Math.round(design * unit);
  const rule = Math.max(8, px(RULE_PX));
  const marginX = px(MARGIN_LINE_X);
  const padTop = padding + px(12);
  const padLeft = marginX + 2 + padding;

  const holesInset = px(HOLES_INSET_Y);
  const holeCount = height > 0 ? Math.max(2, Math.floor((height - 2 * holesInset) / px(HOLE_PITCH_PX)) + 1) : 11;

  const boxRef = useRef<HTMLDivElement>(null);
  // The "and N more" line is written on the rule after the last note, inside
  // the measured box, so a rule is always kept for it.
  const visible = useFitCount(boxRef, fitKeyOf(shown, ctx.fontPx, ctx.showAuthor, ctx.showAge, showTitle), rule);
  const drawn = visible === null ? shown : shown.slice(0, visible);
  const more = hidden + shown.length - drawn.length;
  const lineHeight = `${rule}px`;

  return (
    <div
      className="relative flex flex-col flex-1 min-h-0 overflow-hidden"
      style={{
        backgroundColor: PAPER,
        backgroundImage: [
          `linear-gradient(90deg, transparent ${marginX}px, ${MARGIN_LINE} ${marginX}px ${marginX + 2}px, transparent ${marginX + 2}px)`,
          `linear-gradient(180deg, transparent ${rule - 1}px, ${RULE} ${rule - 1}px ${rule}px)`,
        ].join(', '),
        backgroundSize: `100% 100%, 100% ${rule}px`,
        backgroundPosition: `0 0, 0 ${padTop}px`,
        backgroundRepeat: 'no-repeat, repeat',
        boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.06)',
        padding: `${padTop}px ${padding}px ${padding}px ${padLeft}px`,
      }}
    >
      <div
        aria-hidden="true"
        className="absolute flex flex-col justify-between items-center"
        style={{ left: px(HOLES_X), top: holesInset, bottom: holesInset, width: px(HOLE_PX) + 2 * px(HOLE_RING_PX) }}
      >
        {Array.from({ length: holeCount }, (_, i) => (
          <i
            key={i}
            className="block rounded-full shrink-0"
            style={{
              width: px(HOLE_PX),
              height: px(HOLE_PX),
              background: '#1b1e24',
              boxShadow: `inset 0 2px 3px rgba(255, 255, 255, 0.15), 0 0 0 ${px(HOLE_RING_PX)}px #e2dccb`,
            }}
          />
        ))}
      </div>
      {showTitle && (
        <div className="shrink-0 truncate" style={{ height: rule, lineHeight, fontSize: '1.35em', fontWeight: 700, color: HEADING_INK }}>
          {title}
          <small style={{ fontFamily: UI_SANS_STACK, fontSize: '0.62em', fontWeight: 500, color: PENCIL_GREY, marginLeft: '0.6em', lineHeight: 1 }}>
            {weekdayOf(ctx)}
          </small>
        </div>
      )}
      <div ref={boxRef} className="flex-1 min-h-0 overflow-hidden">
        <ul>
          {drawn.map((note) => {
            const author = authorOf(note, ctx.members, ctx.t);
            const age = ageOf(note, ctx);
            const [head, tail] = splitLastWord(note.text);
            return (
              <li
                key={note.id}
                data-testid="notes-note"
                data-fit={note.id}
                data-important={note.important ? '' : undefined}
                data-pinned={note.pinned ? '' : undefined}
                className="relative"
                style={{ fontSize: '1.12em', lineHeight, fontWeight: 600, color: note.important ? RED_PEN : undefined }}
              >
                {ctx.showAuthor && (
                  <span
                    data-testid="notes-author"
                    data-author={author.id ?? 'someone'}
                    title={author.name}
                    className="absolute top-0 text-center"
                    style={{
                      left: px(INITIAL_X) - padLeft,
                      width: px(INITIAL_W),
                      fontFamily: UI_SANS_STACK,
                      fontSize: '0.55em',
                      fontWeight: 800,
                      color: initialInk(author.color),
                    }}
                  >
                    {author.color ? initialOf(author.name) : '?'}
                  </span>
                )}
                <div className="line-clamp-3" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                  {head}
                  {/* The last word, the star and the age wrap as one, so an age
                      never sits alone on a rule of its own. */}
                  <span className={tail.length <= GLUED_WORD_MAX ? 'whitespace-nowrap' : undefined}>
                    {tail}
                    {note.pinned && (
                      <Star
                        size="0.7em"
                        fill="currentColor"
                        strokeWidth={1.5}
                        aria-hidden="true"
                        className="inline-block"
                        style={{ color: STAR, marginLeft: '0.3em', verticalAlign: '-0.02em' }}
                      />
                    )}
                    {age && (
                      <small style={{ fontFamily: UI_SANS_STACK, fontSize: '0.62em', fontWeight: 500, color: PENCIL_GREY, marginLeft: '0.6em', lineHeight: 1 }}>
                        {age}
                      </small>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {more > 0 && (
          <div data-testid="notes-more" data-fit="more" style={{ height: rule, lineHeight, fontSize: '1em', fontWeight: 600, color: PENCIL_GREY }}>
            {ctx.t('notes.andMore', { n: more })}
          </div>
        )}
      </div>
    </div>
  );
}
