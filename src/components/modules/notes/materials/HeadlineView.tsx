'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Note } from '@/types/notes';
import { ageOf, authorOf, fitKeyOf } from '../shared';
import type { MaterialViewProps } from './types';

const NEWSPRINT_INK = '#1b1a17';
const KICKER_RED = '#9a1b1b';
const BYLINE_INK = '#4b4740';
const MASTHEAD_FACE = 'var(--font-dm-serif), var(--font-lora), Georgia, serif';
const HEADLINE_FACE = 'var(--font-playfair), var(--font-lora), Georgia, serif';
/** Below this content width the stories run in one column instead of two. */
const ONE_COLUMN_BELOW_PX = 300;

/**
 * How many of the column stories fit, or null when they all do. The columns
 * balance at their own height inside the box, so this measures whether any
 * story (or the "and N more" line, marked `data-fit="more"`) ends past the
 * box's bottom (or right, should a browser spill a column sideways) edge,
 * and drops stories from the end until none does. Runs before paint, so a cut never shows. A new
 * key, a resize or the faces loading starts over from every story.
 */
function useColumnFit(boxRef: RefObject<HTMLDivElement | null>, key: string): number | null {
  // `round` restarts the measure when nothing else changed (a resize, the faces arriving).
  const [fit, setFit] = useState<{ key: string; count: number | null; round: number }>({ key, count: null, round: 0 });
  let count = fit.count;
  if (fit.key !== key) {
    count = null;
    setFit({ key, count: null, round: fit.round });
  }
  const round = fit.round;
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width <= 0) return;
    // The headline took all the room: no story fits, only the count.
    if (rect.height <= 0) {
      if (count !== 0) setFit({ key, count: 0, round });
      return;
    }
    const items = Array.from(box.querySelectorAll<HTMLElement>('[data-fit]'));
    const stories = items.filter((el) => el.dataset.fit !== 'more');
    const outside = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.right > rect.right + 1 || r.bottom > rect.bottom + 1;
    };
    if (!items.some(outside)) return;
    const current = count ?? stories.length;
    if (current === 0) return;
    // One story at a time: balanced columns move every story when one goes,
    // so where the first one spilled says little about how many fit.
    setFit({ key, count: current - 1, round });
  }, [boxRef, key, count, round]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const restart = () => setFit((f) => ({ key: f.key, count: null, round: f.round + 1 }));
    const ro = new ResizeObserver(restart);
    ro.observe(box);
    let live = true;
    if (typeof document !== 'undefined' && document.fonts?.status === 'loading') {
      document.fonts.ready.then(() => { if (live) restart(); });
    }
    return () => { live = false; ro.disconnect(); };
  }, [boxRef]);
  return count;
}

/**
 * Headline: the board as a family newspaper. Newsprint, a masthead between a
 * double and a single rule (the Heading when it is set, else "The Family
 * Times"), a dateline, the pinned note (else the newest) as the headline
 * with a byline, and the rest as stories in two columns, an important one
 * led by a red "Important:". Honours "Notes to show"; stories that do not
 * fit are counted into "and N more" at the foot of the columns.
 */
export function HeadlineView({ ctx, all, shown, hidden, heading, showTitle, padding, width }: MaterialViewProps) {
  const [lead, ...rest] = shown;
  const colsRef = useRef<HTMLDivElement>(null);
  const columns = width > 0 && width - 2 * padding < ONE_COLUMN_BELOW_PX ? 1 : 2;
  const visible = useColumnFit(colsRef, fitKeyOf(rest, ctx.fontPx, columns, hidden, ctx.showAuthor, ctx.showAge));
  const drawn = visible === null ? rest : rest.slice(0, visible);
  const more = hidden + rest.length - drawn.length;

  // The Heading as typed names the paper; unset means the default masthead.
  const masthead = showTitle && heading ? heading : ctx.t('notes.masthead');
  const date = new Intl.DateTimeFormat(ctx.locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: ctx.timezone }).format(ctx.now);
  const leadAge = lead ? ageOf(lead, ctx) : '';
  const byline = lead
    ? [ctx.showAuthor ? ctx.t('notes.byline', { name: authorOf(lead, ctx.members, ctx.t).name }) : '', leadAge].filter(Boolean).join(' · ')
    : '';
  const kicker = lead
    ? [lead.pinned ? ctx.t('notes.pinnedOne') : '', lead.important ? ctx.t('notes.important') : ''].filter(Boolean).join(' · ')
    : '';

  return (
    <div
      className="relative flex flex-col h-full min-h-0 overflow-hidden"
      style={{
        background: [
          'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.02) 0 1px, transparent 1px 3px)',
          'linear-gradient(160deg, #f1ead8, #e7dfc7)',
        ].join(', '),
        color: NEWSPRINT_INK,
        padding,
      }}
    >
      <div
        className="shrink-0 truncate text-center"
        style={{
          fontFamily: MASTHEAD_FACE,
          fontSize: '1.7em',
          lineHeight: 1.25,
          letterSpacing: '0.01em',
          borderTop: `3px double ${NEWSPRINT_INK}`,
          borderBottom: `1px solid ${NEWSPRINT_INK}`,
          padding: '0.1em 0 0.05em',
        }}
      >
        {masthead}
      </div>
      <div
        className="flex shrink-0 justify-between uppercase min-w-0"
        style={{
          gap: '1em',
          fontSize: '0.5em',
          lineHeight: 1.3,
          letterSpacing: '0.12em',
          borderBottom: `3px double ${NEWSPRINT_INK}`,
          padding: '0.33em 0',
          marginBottom: '1.17em',
        }}
      >
        <span className="truncate">{date}</span>
        <span className="shrink-0 whitespace-nowrap">{ctx.t('notes.count', { count: all.length })}</span>
        <span className="shrink-0 whitespace-nowrap">{ctx.t('notes.edition')}</span>
      </div>
      {lead && (
        <div
          data-testid="notes-note"
          data-important={lead.important ? '' : undefined}
          data-pinned={lead.pinned ? '' : undefined}
          className="shrink-0 min-w-0"
        >
          {kicker && (
            <div
              className="uppercase truncate"
              style={{ fontSize: '0.5em', fontWeight: 700, lineHeight: 1.3, letterSpacing: '0.14em', color: KICKER_RED }}
            >
              {kicker}
            </div>
          )}
          <div
            className="line-clamp-3"
            style={{
              fontFamily: HEADLINE_FACE,
              fontWeight: 900,
              fontSize: '1.45em',
              lineHeight: 1.1,
              margin: '0.057em 0 0.17em',
              whiteSpace: 'pre-line',
              overflowWrap: 'anywhere',
            }}
          >
            {lead.text}
          </div>
          {byline && (
            <div className="truncate" data-testid={ctx.showAuthor ? 'notes-author' : undefined} style={{ fontSize: '0.58em', fontStyle: 'italic', lineHeight: 1.3, color: BYLINE_INK, marginBottom: '1em' }}>
              {byline}
            </div>
          )}
        </div>
      )}
      {(rest.length > 0 || hidden > 0) && (
        <div
          ref={colsRef}
          className="flex-1 min-h-0 overflow-hidden"
          // The byline's gap when the headline has no byline under it.
          style={{ fontSize: '0.74em', lineHeight: 1.32, paddingTop: byline ? 0 : '0.9em' }}
        >
          {/* Its own height, so the columns balance and the rule between
              them is as long as the stories, not the card. */}
          <div style={{ columnCount: columns, columnGap: '1.24em', columnRule: '1px solid rgba(27, 26, 23, 0.3)' }}>
            {drawn.map((note) => (
              <Story key={note.id} note={note} ctx={ctx} />
            ))}
            {more > 0 && (
              <p
                data-testid="notes-more"
                data-fit="more"
                style={{ margin: 0, fontStyle: 'italic', fontSize: '0.85em', color: BYLINE_INK, breakInside: 'avoid' }}
              >
                {ctx.t('notes.andMore', { n: more })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Story({ note, ctx }: { note: Note; ctx: MaterialViewProps['ctx'] }) {
  const age = ageOf(note, ctx);
  const credit = [ctx.showAuthor ? authorOf(note, ctx.members, ctx.t).name : '', age].filter(Boolean).join(', ');
  return (
    <p
      data-testid="notes-note"
      data-fit={note.id}
      data-important={note.important ? '' : undefined}
      data-pinned={note.pinned ? '' : undefined}
      style={{ margin: '0 0 0.56em', breakInside: 'avoid' }}
    >
      <b
        className="line-clamp-5"
        style={{
          fontFamily: HEADLINE_FACE,
          fontWeight: 700,
          fontSize: '1.05em',
          color: note.important ? KICKER_RED : undefined,
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
        }}
      >
        {note.important && (
          <>
            <span style={{ fontSize: '0.8em', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {ctx.t('notes.importantLead')}
            </span>{' '}
          </>
        )}
        {note.text}
      </b>
      {credit && <i className="block" data-testid={ctx.showAuthor ? 'notes-author' : undefined} style={{ fontSize: '0.85em', color: BYLINE_INK }}>{credit}</i>}
    </p>
  );
}
