'use client';

import { isSameDay } from 'date-fns';
import { dayMonthPattern, formatDateSync, useFormattingLocale, useTranslate } from '@/i18n';
import { birthdayAge, formatEventTimeCompact, gridPillTimeLabel, parseEventWallTime } from '@/lib/calendar-utils';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { eventOwner, type EventOwner } from '@/lib/calendar-people';
import { EventMarker, TagPrefix } from '../shared/EventMarker';
import { eventBg, eventSurface } from '@/lib/calendar-event-surface';
import { eventGlyph, eventOpacity, mergeCellDecor } from '@/lib/calendar-rules';
import type { DayDecor } from '@/lib/calendar-rules';
import { DayArtLayer } from '../shared/DayArtLayer';
import { DayBadges } from '../shared/DayBadges';
import { DayNoteLines } from '../shared/DayNoteLine';
import Glyph from '@/components/ui/Glyph';
import { clampStyle, dayCellFill, dayDecorFor, resolveTodayHighlight } from './view-support';
import { openDayCellProps, openDayProps, useDaySheetOpener } from '../shared/useDaySheet';
import type { CalendarScale, CalendarViewProps } from './view-support';
import type { FullscreenCalendarConfig, TimeFormat } from '@/types/config';
import { WallButton } from '../shared/WallButton';

/**
 * The day cell the fullscreen day-grids share (month, rolling weeks):
 * `GridDayCell` is the cell itself (borders, fills, the today edge, the
 * birthday tint, day art) and `GridCellBody` what is in it (the day-number
 * row, notes, all-day bars, birthday rows, timed pills and the overflow
 * count). What each grid still decides for a cell: its pill budget
 * (`maxEvents`), how faded it is (`opacity`: the month grid has days outside
 * its month), whether the day is a weekend (by column in the month grid, by
 * date in the rolling one) and `showMonthName` (rolling grids cross months
 * mid-row, so their 1sts render "MMM d").
 */

/**
 * A day note in a day-grid cell: one line at 0.9 of the cell's type with
 * 0.15 of it as padding above and below, then a small gap. Bigger than the
 * event titles on purpose: it is the thing to notice from across the room.
 */
const GRID_NOTE_FONT = 0.9;

/** The height a day's notes take from a cell's pill budget, px (one line each). */
export function gridNotesHeight(count: number, fontSize: number, scale: CalendarScale): number {
  return count * (fontSize * GRID_NOTE_FONT * 1.3 + fontSize * 0.3 + scale.bu * 0.28);
}

/**
 * How many pills a day cell has room for when the grid picks the number
 * itself: the row's height (measured, or the estimate from the module's
 * height before the first measurement) less the day-number row and the day's
 * notes, in pill heights. A wrapped title can take two lines, so it is
 * budgeted double. Never fewer than two.
 */
export function autoMaxEvents(opts: {
  /** Measured height of the grid, 0 before the first measurement. */
  containerH: number;
  rows: number;
  fontSize: number;
  noteHeight: number;
  wrapTitles: boolean;
  scale: CalendarScale;
}): number {
  const { containerH, rows, fontSize, noteHeight, wrapTitles, scale } = opts;
  const approxCellHeight = (containerH > 0 ? containerH : scale.height - scale.bu * 7) / rows;
  const pillHeight = fontSize * (wrapTitles ? 2.0 : 1.0);
  return Math.max(2, Math.floor((approxCellHeight - fontSize * 2 - noteHeight) / pillHeight));
}

/**
 * "+N more" as the button that opens the day: a pill in the accent's tint,
 * shared by the day grids and the family grid. A block as wide as its words,
 * not an inline box, so it adds no line box of its own above the pill.
 */
export function moreButtonStyle(fontSize: number, scale: CalendarScale): React.CSSProperties {
  return {
    display: 'flex',
    width: 'fit-content',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 1,
    padding: `0 ${scale.bu * 0.45}px`,
    border: 'none',
    borderRadius: 999,
    background: 'var(--cal-accent-bg)',
    color: 'var(--cal-accent)',
    fontFamily: 'inherit',
    fontSize,
    fontWeight: 700,
    lineHeight: 1.5,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
}

export /** One event as a grid cell draws it: an element of the day's list. */
type CellEvent = CalendarViewProps['events'][number];

interface GridCellBodyProps {
  day: Date;
  /** The family's notes for this day, one line each under the day number. */
  notes?: readonly string[];
  dayEvents: CalendarViewProps['events'];
  /** Total pill budget for the cell; all-day and birthday rows count against it. */
  maxEvents: number;
  /** Render "MMM d" on the 1st of a month (rolling grids only). */
  showMonthName?: boolean;
  fontSize: number;
  scale: CalendarScale;
  config: FullscreenCalendarConfig;
  today: Date;
  /** Per-day rules decor for this cell; the caller needs it for the wrapper too. */
  decor: DayDecor;
  /** Name tags (see CalendarViewProps.owners). */
  owners?: ReadonlyMap<string, EventOwner>;
  /** For the pills' start times (`gridShowTimes`). */
  timezone?: string;
  timeFormat: TimeFormat;
  /**
   * The household put its calendars in an order, so that order decides the
   * rows in a cell and what falls past the cap, whatever kind each event is.
   * Off, the kinds keep their own bands: all-day, then birthdays, then timed.
   */
  prioritised?: boolean;
}

export function GridCellBody({ day, notes, dayEvents, maxEvents, showMonthName = false, fontSize, scale, config, today, decor, owners, timezone, timeFormat, prioritised = false }: GridCellBodyProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const wrapTitles = config.wrapEventTitles === true;
  const showTimes = config.gridShowTimes === true;
  const { showTodayMarker } = resolveTodayHighlight(config);
  const isToday = isSameDay(day, today);
  const marksMonthStart = showMonthName && day.getDate() === 1;

  const allDayEvs = dayEvents.filter(ev => ev.allDay && ev.kind !== 'birthday');
  const birthdayEvs = dayEvents.filter(ev => ev.kind === 'birthday');
  const timedEvs = dayEvents.filter(ev => !ev.allDay);
  const hasBirthday = birthdayEvs.length > 0;
  const maxShow = Math.max(1, maxEvents - allDayEvs.length - birthdayEvs.length);
  // Prioritised, the cap applies to the one ordered list rather than to the
  // timed band alone, so what falls past it is whatever the household put
  // last rather than whatever happens to be timed.
  const shown = prioritised ? dayEvents.slice(0, Math.max(1, maxEvents)) : dayEvents;
  const overflow = prioritised
    ? Math.max(0, dayEvents.length - shown.length)
    : (timedEvs.length > maxShow ? timedEvs.length - maxShow : 0);
  // With taps on, the day number row and "+N more" open the whole day: the
  // cell's buttons. The cell around this makes the rest of it open the day
  // for a finger (openDayCellProps). A day with only a note opens too.
  const dayTap = openDayProps(useDaySheetOpener(), day, dayEvents, t, locale, (notes?.length ?? 0) > 0);

  /** One all-day bar, drawn wherever it lands. */
  const renderAllDay = (ev: CellEvent) => {
      const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
      const glyph = eventGlyph(ev);
      const owner = eventOwner(ev, owners);
      return (
        <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
          fontSize: fontSize * 0.55,
          fontWeight: 600,
          color: '#fff',
          padding: `${scale.bu * 0.05}px ${scale.bu * 0.3}px`,
          borderRadius: 2,
          background: color,
          marginBottom: 1,
          opacity: ev.opacity,
          ...clampStyle(wrapTitles),
        }}>
          <TagPrefix glyph={glyph} owner={owner} color={color} />{ev.title}
        </div>
      );
  };

  /** One birthday row: bold, name first, no bar or dot. */
  const renderBirthday = (ev: CellEvent) => {
      const color = ev.calendarColor ?? '#EC4899';
      const age = birthdayAge(ev.birthYear, day.getFullYear());
      const label = age != null
        ? t('fullscreen-calendar.birthdayAgeShort', { age })
        : t('fullscreen-calendar.birthdayShort');
      return (
        <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: scale.bu * 0.2,
          padding: `${scale.bu * 0.05}px ${scale.bu * 0.2}px`,
          marginBottom: 1,
          overflow: 'hidden',
          opacity: eventOpacity(ev, 1),
        }}>
          <span aria-hidden="true" style={{ fontSize: fontSize * 0.55, flexShrink: 0 }}><Glyph value={eventGlyph(ev)} /></span>
          <span style={{
            fontSize: fontSize * 0.55,
            fontWeight: 700,
            color,
            ...clampStyle(wrapTitles),
          }}>
            {ev.title} {label}
          </span>
        </div>
      );
  };

  /** One timed pill. */
  const renderTimed = (ev: CellEvent) => {
      const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
      const glyph = eventGlyph(ev);
      const owner = eventOwner(ev, owners);
      // The start on the day it starts, nothing on the days between,
      // "Until" on the day it ends: the small grids' rule.
      const time = showTimes
        ? gridPillTimeLabel(
          parseEventWallTime(ev.start, timezone), parseEventWallTime(ev.end, timezone), day,
          (at) => formatEventTimeCompact(at, timeFormat, locale), t,
        )
        : null;
      return (
        <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: scale.bu * 0.2,
          padding: `${scale.bu * 0.05}px ${scale.bu * 0.2}px`,
          marginBottom: 1,
          overflow: 'hidden',
          ...eventSurface(color, scale, 'pill', { radius: 3 }),
          opacity: eventOpacity(ev, 1),
        }}>
          {glyph ? (
            <span aria-hidden="true" style={{ fontSize: fontSize * 0.5, lineHeight: 1, flexShrink: 0 }}><Glyph value={glyph} /></span>
          ) : owner || scale.eventStyle === 'wash' ? (
            // The source-color dot is the only calendar marker a bare
            // `wash` pill has. Under the other styles the surface itself
            // carries the color (a fill or a rule), and a dot would vanish
            // into it or double it up. A name tag is drawn under every
            // style: the surface says which calendar, the tag says who.
            <EventMarker owner={owner} color={color} size={fontSize * 0.35} tagSize={fontSize * 0.8} />
          ) : null}
          {time && (
            <span data-pill-time="" style={{
              fontSize: fontSize * 0.5,
              fontWeight: 600,
              color: 'var(--cal-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {time}
            </span>
          )}
          <span style={{
            fontSize: fontSize * 0.55,
            fontWeight: 500,
            color: 'var(--cal-text-primary)',
            ...clampStyle(wrapTitles),
          }}>
            {ev.title}
          </span>
        </div>
      );
  };

  return (
    <>
      {/* Day number */}
      <div
        {...dayTap}
        role={dayTap ? 'button' : undefined}
        className="flex items-center"
        style={{ gap: scale.bu * 0.15, marginBottom: scale.bu * 0.15, cursor: dayTap ? 'pointer' : undefined }}
      >
        {isToday && showTodayMarker ? (
          <span className="fsc-today-pulse" style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: fontSize * 1.5,
            height: fontSize * 1.5,
            borderRadius: '50%',
            background: 'var(--cal-accent)',
            color: 'var(--cal-on-accent, #fff)',
            fontSize: fontSize * 0.8,
            fontWeight: 600,
          }}>
            {formatDateSync(day, 'd', { locale })}
          </span>
        ) : (
          <span style={{
            fontSize: fontSize * 0.85,
            fontWeight: 600,
            color: 'var(--cal-text-primary)',
          }}>
            {marksMonthStart ? formatDateSync(day, dayMonthPattern(locale, 'short'), { locale }) : formatDateSync(day, 'd', { locale })}
          </span>
        )}
        {hasBirthday && <span aria-hidden="true" style={{ fontSize: fontSize * 0.7 }}>🎂</span>}
        <DayBadges badges={decor.badges} style={{ fontSize: fontSize * 0.8 }} />
      </div>

      {notes && (
        <DayNoteLines
          notes={notes}
          tone="fullscreen"
          style={{ fontSize: fontSize * GRID_NOTE_FONT, padding: `${fontSize * 0.15}px ${fontSize * 0.385}px`, marginBottom: scale.bu * 0.28 }}
        />
      )}

      {/* All-day span bars */}
      {/* In the household's order the cell is one list, each event drawn
          as its own kind wherever it lands; otherwise the kinds keep
          their own bands: all-day, then birthdays, then timed. */}
      {prioritised
        ? shown.map((ev) => (ev.allDay && ev.kind !== 'birthday'
          ? renderAllDay(ev)
          : ev.kind === 'birthday' ? renderBirthday(ev) : renderTimed(ev)))
        : (
          <>
          {allDayEvs.map(ev => {
            const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
            const glyph = eventGlyph(ev);
            const owner = eventOwner(ev, owners);
            return (
              <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
                fontSize: fontSize * 0.55,
                fontWeight: 600,
                color: '#fff',
                padding: `${scale.bu * 0.05}px ${scale.bu * 0.3}px`,
                borderRadius: 2,
                background: color,
                marginBottom: 1,
                opacity: ev.opacity,
                ...clampStyle(wrapTitles),
              }}>
                <TagPrefix glyph={glyph} owner={owner} color={color} />{ev.title}
              </div>
            );
          })}

          {birthdayEvs.map(ev => {
            const color = ev.calendarColor ?? '#EC4899';
            const age = birthdayAge(ev.birthYear, day.getFullYear());
            const label = age != null
              ? t('fullscreen-calendar.birthdayAgeShort', { age })
              : t('fullscreen-calendar.birthdayShort');
            return (
              <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: scale.bu * 0.2,
                padding: `${scale.bu * 0.05}px ${scale.bu * 0.2}px`,
                marginBottom: 1,
                overflow: 'hidden',
                opacity: eventOpacity(ev, 1),
              }}>
                <span aria-hidden="true" style={{ fontSize: fontSize * 0.55, flexShrink: 0 }}><Glyph value={eventGlyph(ev)} /></span>
                <span style={{
                  fontSize: fontSize * 0.55,
                  fontWeight: 700,
                  color,
                  ...clampStyle(wrapTitles),
                }}>
                  {ev.title} {label}
                </span>
              </div>
            );
          })}

          {timedEvs.slice(0, maxShow).map(ev => {
            const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
            const glyph = eventGlyph(ev);
            const owner = eventOwner(ev, owners);
            // The start on the day it starts, nothing on the days between,
            // "Until" on the day it ends: the small grids' rule.
            const time = showTimes
              ? gridPillTimeLabel(
                parseEventWallTime(ev.start, timezone), parseEventWallTime(ev.end, timezone), day,
                (at) => formatEventTimeCompact(at, timeFormat, locale), t,
              )
              : null;
            return (
              <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: scale.bu * 0.2,
                padding: `${scale.bu * 0.05}px ${scale.bu * 0.2}px`,
                marginBottom: 1,
                overflow: 'hidden',
                ...eventSurface(color, scale, 'pill', { radius: 3 }),
                opacity: eventOpacity(ev, 1),
              }}>
                {glyph ? (
                  <span aria-hidden="true" style={{ fontSize: fontSize * 0.5, lineHeight: 1, flexShrink: 0 }}><Glyph value={glyph} /></span>
                ) : owner || scale.eventStyle === 'wash' ? (
                  // The source-color dot is the only calendar marker a bare
                  // `wash` pill has. Under the other styles the surface itself
                  // carries the color (a fill or a rule), and a dot would vanish
                  // into it or double it up. A name tag is drawn under every
                  // style: the surface says which calendar, the tag says who.
                  <EventMarker owner={owner} color={color} size={fontSize * 0.35} tagSize={fontSize * 0.8} />
                ) : null}
                {time && (
                  <span data-pill-time="" style={{
                    fontSize: fontSize * 0.5,
                    fontWeight: 600,
                    color: 'var(--cal-text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                    {time}
                  </span>
                )}
                <span style={{
                  fontSize: fontSize * 0.55,
                  fontWeight: 500,
                  color: 'var(--cal-text-primary)',
                  ...clampStyle(wrapTitles),
                }}>
                  {ev.title}
                </span>
              </div>
            );
          })}
          </>
        )}

      {/* Overflow: a pill in the accent when it opens the day */}
      {overflow > 0 && (dayTap ? (
        // At the event titles' size, as the mockup draws it: the line it
        // replaces was a quiet footnote, the pill is something to tap.
        <WallButton {...dayTap} style={moreButtonStyle(fontSize * 0.55, scale)}>
          {t('fullscreen-calendar.moreCount', { count: overflow })}
        </WallButton>
      ) : (
        <div style={{
          fontSize: fontSize * 0.5,
          fontWeight: 600,
          color: 'var(--cal-text-tertiary)',
          padding: `0 ${scale.bu * 0.2}px`,
        }}>
          {t('fullscreen-calendar.moreCount', { count: overflow })}
        </div>
      ))}
    </>
  );
}

export interface GridDayCellProps extends Omit<GridCellBodyProps, 'decor' | 'notes'> {
  notes: readonly string[];
  /** 0 to 6 across the row: the last column has no right border. */
  column: number;
  isWeekend: boolean;
  /** How faded the whole cell is: a past day, or one outside the month drawn. */
  opacity?: number | string;
  now: Date;
  /**
   * The household put its calendars in an order, so that order decides the
   * rows in a cell and what falls past the cap, whatever kind each event is.
   * Off, the kinds keep their own bands: all-day, then birthdays, then timed.
   */
  prioritised?: boolean;
}

/**
 * One day of a fullscreen day-grid: the cell and everything in it. With taps
 * on, the whole cell opens the day, outside its events.
 */
export function GridDayCell({ prioritised,  column, isWeekend, opacity, now, ...body }: GridDayCellProps) {
  const { day, dayEvents, notes, config, scale, today, timezone } = body;
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const { showTodayBg, showTodayMarker } = resolveTodayHighlight(config);
  const isToday = isSameDay(day, today);
  const hasBirthday = dayEvents.some(ev => ev.kind === 'birthday');
  const decor = dayDecorFor(config, day, dayEvents, { today, now, timezone, isDark: scale.isDark });
  const cellTap = openDayCellProps(useDaySheetOpener(), day, dayEvents, notes.length > 0);

  return (
    <div
      role="gridcell"
      aria-label={t('fullscreen-calendar.ariaLabels.monthCell', { date: formatDateSync(day, dayMonthPattern(locale), { locale }), count: dayEvents.length })}
      {...cellTap}
      style={mergeCellDecor({
        cursor: cellTap ? 'pointer' : undefined,
        borderRight: column < 6 ? '1px solid var(--cal-border-subtle)' : undefined,
        borderBottom: '1px solid var(--cal-border-subtle)',
        borderLeft: isToday && showTodayMarker ? '2px solid var(--cal-accent)' : undefined,
        padding: scale.bu * 0.3,
        position: 'relative',
        overflow: 'hidden',
        opacity,
        background: dayCellFill(isToday, showTodayBg, isWeekend, config)
          ?? (hasBirthday
            // Cell-level "a birthday is here" signal, not any one
            // kid's color — a fixed tint avoids picking one
            // source's color arbitrarily when several birthdays
            // land on the same day.
            ? eventBg('#EC4899', scale.isDark ? 0.16 : 0.10, scale.isDark)
            : undefined),
      }, decor)}
    >
      {decor.backgroundImage != null && <DayArtLayer decor={decor} />}
      <GridCellBody
        prioritised={prioritised} {...body} decor={decor} />
    </div>
  );
}

/** The weekday names over a day-grid; `accentToday` tints today's (the rolling grid, whose columns move). */
export function GridWeekdayHeader({ dates, columns, fontSize, scale, today, leading }: {
  dates: readonly Date[];
  /** The grid's `grid-template-columns`, shared with the cells below. */
  columns: string;
  fontSize: number;
  scale: CalendarScale;
  /** Set to tint today's weekday in the accent. */
  today?: Date;
  /** A cell before the weekdays (the month grid's week-number column). */
  leading?: React.ReactNode;
}) {
  const locale = useFormattingLocale();
  return (
    <div role="row" style={{
      display: 'grid',
      gridTemplateColumns: columns,
      borderBottom: '1px solid var(--cal-border)',
      flexShrink: 0,
    }}>
      {leading}
      {dates.map((d, i) => (
        <div key={i} role="columnheader" style={{
          textAlign: 'center',
          padding: `${scale.bu * 0.5}px 0`,
          fontSize: fontSize * 0.7,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: today && isSameDay(d, today) ? 'var(--cal-accent)' : 'var(--cal-text-tertiary)',
        }}>
          {formatDateSync(d, 'EEE', { locale })}
        </div>
      ))}
    </div>
  );
}
