'use client';

import { Fragment, useMemo, useRef } from 'react';
import type { Note } from '@/types/notes';
import { ink } from '@/lib/constants';
import { groupByDay, sortByTime } from '@/lib/notes-rules';
import { isoDateInTZ } from '@/lib/timezone';
import { AuthorBubble } from './AuthorBubble';
import { useFitCount } from './useFitCount';
import { DANGER_INK, MORE_LINE_EM, MoreLine, PinGlyph, WarnGlyph, ageOf, authorOf, fitKeyOf, type NotesContext } from './shared';

const DAY_MS = 86_400_000;

/** Whole days from one `YYYY-MM-DD` to another. Calendar arithmetic, so a DST day counts as one. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** A day heading: Today, Yesterday, the short weekday inside the last week, else a short date. */
function dayLabel(day: string, today: string, ctx: NotesContext): string {
  const ago = daysBetween(day, today);
  if (ago <= 0) return ctx.t('notes.today');
  if (ago === 1) return ctx.t('notes.yesterday');
  // Noon UTC on that calendar day, formatted in UTC: the date as written,
  // whatever zone the wall's machine is in.
  const date = new Date(`${day}T12:00:00Z`);
  try {
    return ago < 7
      ? new Intl.DateTimeFormat(ctx.locale, { weekday: 'short', timeZone: 'UTC' }).format(date)
      : new Intl.DateTimeFormat(ctx.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return day;
  }
}

/**
 * Timeline: notes under day headings in the household's days, Today first,
 * strictly by time. The one view where a pinned note does not jump the
 * queue, and it shows the whole board whatever the filter says.
 */
export function TimelineView({ ctx, all, max }: { ctx: NotesContext; all: Note[]; max: number }) {
  const timed = useMemo(() => sortByTime(all).slice(0, max), [all, max]);
  const hidden = all.length - timed.length;
  const listRef = useRef<HTMLUListElement>(null);
  const visible = useFitCount(
    listRef,
    fitKeyOf(timed, ctx.fontPx, ctx.showAuthor, ctx.showAge, ctx.timezone ?? ''),
    hidden > 0 ? 0 : ctx.fontPx * MORE_LINE_EM,
  );
  const drawn = visible === null ? timed : timed.slice(0, visible);
  const today = isoDateInTZ(ctx.now, ctx.timezone);
  const groups = groupByDay(drawn, (iso) => isoDateInTZ(new Date(iso), ctx.timezone));
  return (
    <>
      <ul ref={listRef} className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ fontSize: '0.86em', paddingLeft: '0.2em' }}>
        {groups.map((group, g) => (
          <Fragment key={group.day}>
            <li
              data-testid="notes-day"
              className="font-bold uppercase shrink-0"
              style={{ fontSize: '0.66em', letterSpacing: '0.08em', color: ink(0.5), margin: g === 0 ? '0 0 0.5em' : '0.9em 0 0.5em' }}
            >
              {dayLabel(group.day, today, ctx)}
            </li>
            {group.notes.map((note) => {
              const author = authorOf(note, ctx.members, ctx.t);
              // Past a day the heading already names the day; the age would only repeat it.
              const fresh = ctx.now.getTime() - Date.parse(note.createdAt) < DAY_MS;
              const age = fresh ? ageOf(note, ctx) : '';
              const meta = ctx.showAuthor || !!age || note.important || note.pinned;
              return (
                <li
                  key={note.id}
                  data-testid="notes-note"
                  data-fit={note.id}
                  data-important={note.important ? '' : undefined}
                  data-pinned={note.pinned ? '' : undefined}
                  className="flex shrink-0"
                  style={{ gap: '0.5em', padding: '0.25em 0' }}
                >
                  {ctx.showAuthor && <AuthorBubble author={author} em={0.78} style={{ marginTop: '0.15em' }} />}
                  <div className="flex-1 min-w-0">
                    <div
                      className="line-clamp-2"
                      style={{ lineHeight: 1.28, fontWeight: 500, whiteSpace: 'pre-line', overflowWrap: 'anywhere', color: note.important ? DANGER_INK : undefined }}
                    >
                      {note.text}
                    </div>
                    {meta && (
                      <div className="flex items-center min-w-0" style={{ gap: '0.45em', marginTop: '0.15em', fontSize: '0.72em', color: ink(0.5) }}>
                        {ctx.showAuthor && <span className="truncate">{author.name}</span>}
                        {age && <span className="shrink-0 whitespace-nowrap">{age}</span>}
                        {note.important && <WarnGlyph />}
                        {note.pinned && <PinGlyph />}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </Fragment>
        ))}
      </ul>
      <MoreLine n={hidden + timed.length - drawn.length} t={ctx.t} />
    </>
  );
}
