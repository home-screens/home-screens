'use client';

import { useMemo } from 'react';
import { isSameDay } from 'date-fns';
import {
  parseEventWallTime, isEventOnDay, bucketEventsForDay, weekStartsOnFor, formatEventTime, isWeekendDay,
  eventRowTimeLabel, withSavedSuffix,
  type EventDaySegment,
} from '@/lib/calendar-utils';
import { EVERYONE_COLOR, buildPersonRows, eventsForRow, type PersonRow } from '@/lib/calendar-people';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { clampStyle, dayCellFill, resolveTodayHighlight, useDayDecors, useWeekDays } from './view-support';
import type { CalendarEvent, CalendarViewProps, RowCtx } from './view-support';
import { PersonAvatar, PeopleHint } from './person-view-bits';
import type { DayDecor } from '@/lib/calendar-rules';
import { eventSurface } from '@/lib/calendar-event-surface';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { eventGlyph, eventOpacity, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import { DayWeatherBadge } from './WeatherInline';
import { eventAriaLabel } from './list-view-bits';
import { useContainerHeight } from './shared-time-grid';
import { DEFAULT_TIME_FORMAT } from '@/types/config';

interface CellEvent {
  ev: CalendarEvent;
  segment: EventDaySegment;
}

/**
 * People as rows, the week as columns. Every person gets a stable row all
 * week (an empty row is information: nobody has anything on), shared events
 * sit once on the Everyone row, and a cell that overflows shows "+N" rather
 * than shrinking its text — the board must stay legible at seven people.
 */
export function FamilyGridView({ events, timezone, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, weather, people, failingSourceIds }: CalendarViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const isLandscape = scale.orientation === 'landscape';
  const { scrollRef, containerH } = useContainerHeight();

  const { showTodayBg, showTodayMarker } = resolveTodayHighlight(config);
  const rowCtx = useMemo<RowCtx>(
    () => ({ t, locale, timeFormat, timezone, scale, fontSize, config }),
    [t, locale, timeFormat, timezone, scale, fontSize, config],
  );

  const days = useWeekDays(today, weekStartsOnFor(config.startDay));

  const weekEvents = useMemo(
    () => events.filter((ev) => days.some((day) => isEventOnDay(ev, day, timezone))),
    [events, days, timezone],
  );

  const everyoneLabel = t('fullscreen-calendar.everyone');
  const rows = useMemo(
    () => buildPersonRows(weekEvents, people, {
      everyoneLabel, everyoneColor: EVERYONE_COLOR, includeEveryone: config.familyShowEveryoneRow !== false,
    }),
    [weekEvents, people, everyoneLabel, config.familyShowEveryoneRow],
  );

  // Per row: the week's events bucketed by day, all-day first then by start.
  const grid = useMemo(() => rows.map((row) => {
    const own = eventsForRow(weekEvents, row, rows);
    const cells: CellEvent[][] = days.map((day) => bucketEventsForDay(own, day, timezone));
    return { row, cells, count: own.length };
  }), [rows, weekEvents, days, timezone]);

  const decorByDay = useDayDecors(days, weekEvents, config, { today, now, timezone, isDark: scale.isDark });

  // Fixed geometry so a cell can budget how many chips fit: the grid never
  // scrolls on a kiosk, so overflow must be a "+N" chip, not clipped text.
  // Wide enough for a real calendar name next to the avatar (the no-people
  // fallback names rows after sources), and rows are capped so one or two
  // calendars never become giant bands; leftover space stays empty.
  const nameColW = scale.bu * (isLandscape ? 13 : 18);
  // The day headers stack label + date circle, plus a weather line when the
  // day placement is active; the fixed row must budget for what actually
  // renders, or the centered stack bleeds under the module header above and
  // over the grid below.
  const hasDayWeather = weather != null && (weather.placement === 'days' || weather.placement === 'days-and-events');
  const headerH = fontSize * (hasDayWeather ? 5.4 : 4.4);
  // Rows are capped so one or two calendars never become a giant band, but
  // the old cap left a four-person household ~500px short of the bottom on a
  // portrait board, which read as a truncated grid rather than a finished
  // one. A roomier cap plus centring the block absorbs the remainder either
  // way: a short household sits centred, a full one fills.
  const rowMaxH = fontSize * 30;
  const rowH = containerH > 0 && rows.length > 0 ? Math.min(rowMaxH, (containerH - headerH) / rows.length) : 0;
  const noPeople = !people || people.length === 0;
  const cellPad = scale.bu * 0.5;
  const chipGap = scale.bu * 0.4;
  const chipH = fontSize * (isLandscape ? 2.1 : 3.0);
  const maxPerCell = rowH > 0 ? Math.max(1, Math.floor((rowH - cellPad * 2 + chipGap) / (chipH + chipGap))) : 3;

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={t('fullscreen-calendar.ariaLabels.familyGrid')}
      style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: `${nameColW}px repeat(7, minmax(0, 1fr))`,
        gridTemplateRows: `${headerH}px repeat(${Math.max(rows.length, 1)}, ${rowH > 0 ? `${rowH}px` : 'minmax(0, 1fr)'})`,
        height: rowH > 0 ? undefined : '100%',
      }}>
        {/* Header row: blank name cell, then one day per column */}
        <div style={{ borderBottom: '1px solid var(--cal-border)', background: 'var(--cal-surface-alt)' }} />
        {days.map((day, dayIdx) => {
          const isToday = isSameDay(day, today);
          const isWeekend = isWeekendDay(day);
          return (
            <div
              key={day.toISOString()}
              role="columnheader"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: scale.bu * 0.15,
                borderBottom: '1px solid var(--cal-border)',
                borderLeft: '1px solid var(--cal-border-subtle)',
                background: isToday && showTodayBg ? 'var(--cal-today-fill)' : undefined,
              }}
            >
              <div style={{
                fontSize: fontSize * 0.85, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                color: isWeekend ? 'var(--cal-text-tertiary)' : 'var(--cal-text-secondary)',
              }}>
                {formatDateSync(day, 'EEE', { locale })}
              </div>
              <div style={{ fontSize: fontSize * 1.5, fontWeight: 600, lineHeight: 1, color: 'var(--cal-text-primary)' }}>
                {isToday && showTodayMarker ? (
                  <span className="fsc-today-pulse" style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: fontSize * 2.0, height: fontSize * 2.0, borderRadius: '50%',
                    background: 'var(--cal-accent)', color: 'var(--cal-on-accent, #fff)',
                  }}>
                    {formatDateSync(day, 'd', { locale })}
                  </span>
                ) : formatDateSync(day, 'd', { locale })}
              </div>
              <DayBadges badges={decorByDay[dayIdx].badges} style={{ justifyContent: 'center', display: 'flex', fontSize: fontSize * 0.8 }} />
              {weather && <DayWeatherBadge weather={weather} day={day} fontSize={fontSize} align="center" />}
            </div>
          );
        })}

        {/* One row per person */}
        {grid.map(({ row, cells, count }) => (
          <PersonRowCells
            key={row.id}
            row={row}
            cells={cells}
            count={count}
            days={days}
            today={today}
            now={now}
            ctx={rowCtx}
            cellPad={cellPad}
            chipGap={chipGap}
            maxPerCell={maxPerCell}
            wrapTitles={!isLandscape}
            showTodayBg={showTodayBg}
            decorByDay={decorByDay}
            failingSourceIds={failingSourceIds}
          />
        ))}
      </div>
      {noPeople && <PeopleHint fontSize={fontSize} padding={`${scale.bu * 1.2}px ${scale.bu * 1.5}px`} t={t} />}
    </div>
  );
}

function PersonRowCells({ row, cells, count, days, today, now, ctx, cellPad, chipGap, maxPerCell, wrapTitles, showTodayBg, decorByDay, failingSourceIds }: {
  row: PersonRow;
  cells: CellEvent[][];
  count: number;
  days: Date[];
  today: Date;
  now: Date;
  ctx: RowCtx;
  cellPad: number;
  chipGap: number;
  maxPerCell: number;
  wrapTitles: boolean;
  showTodayBg: boolean;
  decorByDay: DayDecor[];
  failingSourceIds?: ReadonlySet<string>;
}) {
  const { t, scale, fontSize, config } = ctx;
  const isEveryone = row.sourceIds === null;
  const avatarSize = fontSize * 2.6;
  return (
    <>
      <div
        role="rowheader"
        style={{
          display: 'flex', alignItems: 'center', gap: scale.bu * 0.8,
          padding: `0 ${scale.bu * 0.9}px`,
          borderBottom: '1px solid var(--cal-border-subtle)',
          background: isEveryone ? 'var(--cal-accent-bg)' : 'var(--cal-surface-alt)',
          minWidth: 0,
        }}
      >
        <PersonAvatar row={row} size={avatarSize} fontSize={fontSize * 0.9} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: fontSize * 1.15, fontWeight: 650, color: 'var(--cal-text-primary)', lineHeight: 1.1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
            {row.name}
          </div>
          <div style={{ fontSize: fontSize * 0.75, color: 'var(--cal-text-tertiary)', marginTop: 2, whiteSpace: 'nowrap' }}>
            {t('fullscreen-calendar.thisWeekCount', { count })}
          </div>
        </div>
      </div>
      {cells.map((cell, dayIdx) => {
        const day = days[dayIdx];
        const isToday = isSameDay(day, today);
        const isPast = day < today && !isToday;
        // An overflowing cell gives up one chip slot to the "+N" line —
        // except at a one-chip budget, where the first event still shows and
        // the "+N" rides the cell's corner instead of spending the only slot.
        const visible = cell.slice(0, cell.length > maxPerCell ? Math.max(1, maxPerCell - 1) : maxPerCell);
        const hidden = cell.length - visible.length;
        const cornerBadge = hidden > 0 && maxPerCell === 1;
        return (
          <div
            key={day.toISOString()}
            role="gridcell"
            style={mergeCellDecor({
              display: 'flex', flexDirection: 'column', gap: chipGap,
              position: 'relative',
              padding: cellPad,
              borderBottom: '1px solid var(--cal-border-subtle)',
              borderLeft: '1px solid var(--cal-border-subtle)',
              background: dayCellFill(isToday, showTodayBg, isWeekendDay(day), config),
              opacity: isPast && config.dimPastEvents ? 'var(--cal-past-opacity)' : 1,
              overflow: 'hidden',
              minWidth: 0,
            } as React.CSSProperties, decorByDay[dayIdx])}
          >
            {visible.map(({ ev, segment }) => (
              <EventChip key={ev.id} event={ev} segment={segment} now={now} ctx={ctx} wrapTitles={wrapTitles} failingSourceIds={failingSourceIds} />
            ))}
            {hidden > 0 && (cornerBadge ? (
              <div style={{
                position: 'absolute', top: cellPad, right: cellPad, zIndex: 1,
                fontSize: fontSize * 0.7, fontWeight: 700, color: 'var(--cal-text-secondary)',
                background: 'var(--cal-surface)', border: '1px solid var(--cal-border-subtle)',
                borderRadius: 999, padding: `0 ${scale.bu * 0.5}px`, whiteSpace: 'nowrap',
              }}>
                {t('fullscreen-calendar.moreCount', { count: hidden })}
              </div>
            ) : (
              <div style={{ fontSize: fontSize * 0.75, fontWeight: 600, color: 'var(--cal-text-tertiary)', paddingLeft: scale.bu * 0.3 }}>
                {t('fullscreen-calendar.moreCount', { count: hidden })}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function EventChip({ event, segment, now, ctx, wrapTitles, failingSourceIds }: {
  event: CalendarEvent;
  segment: EventDaySegment;
  now: Date;
  ctx: RowCtx;
  wrapTitles: boolean;
  failingSourceIds?: ReadonlySet<string>;
}) {
  const { t, locale, timeFormat, timezone, scale, fontSize } = ctx;
  const color = event.calendarColor ?? DEFAULT_EVENT_COLOR;
  const isAllDay = event.allDay || segment === 'middle';
  const start = parseEventWallTime(event.start, timezone);
  const end = parseEventWallTime(event.end, timezone);
  const timeLabel = isAllDay
    ? null
    : withSavedSuffix(
        eventRowTimeLabel({
          segment,
          startLabel: formatEventTime(start, timeFormat, locale),
          endLabel: formatEventTime(end, timeFormat, locale),
          t, ns: 'fullscreen-calendar', single: 'start',
        }),
        event, failingSourceIds, t,
      );
  const finished = !isAllDay && end <= now;
  const glyph = eventGlyph(event);
  const ariaLabel = eventAriaLabel(t, event, {
    startLabel: formatEventTime(start, timeFormat, locale),
    endLabel: formatEventTime(end, timeFormat, locale),
    allDay: isAllDay,
  });
  return (
    <div
      className="fsc-event-block"
      data-event-id={event.id}
      role="article"
      aria-label={ariaLabel}
      style={{
        ...eventSurface(color, scale, 'chip', { radius: scale.bu * 0.5 }),
        padding: `${scale.bu * 0.3}px ${scale.bu * 0.5}px`,
        display: 'flex', flexDirection: 'column', gap: 1,
        flexShrink: 0,
        opacity: eventOpacity(event, finished ? 0.55 : 1),
        minWidth: 0,
      }}
    >
      {timeLabel && (
        <span style={{ fontSize: fontSize * 0.72, fontWeight: 500, color: 'var(--cal-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
          {timeLabel}
        </span>
      )}
      <span style={{ fontSize: fontSize * 0.95, fontWeight: 600, color: 'var(--cal-text-primary)', lineHeight: 1.15, ...clampStyle(wrapTitles) }}>
        {glyph ? `${glyph} ` : ''}{event.title}
      </span>
    </div>
  );
}
