'use client';

import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isSameDay, startOfDay, addDays, differenceInMinutes, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getWeek, isSameMonth } from 'date-fns';
import { useTZClock } from '@/hooks/useTZClock';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { EventDetailOverlay } from './shared/EventDetailOverlay';
import { CalendarLegend } from './shared/CalendarLegend';
import { parseEventWallTime, isEventUpcoming, buildLegend, viewDayWindow, type LegendSource, compareEventStarts, sanitizeEventDescription, clampWeeksToShow, isGridView, weekStartsOnFor, weekNumberOptions, eventsForDay, formatEventTime, formatEventTimeCompact, allDaySpanSegment, formatMonthRangeLabel, pickGridTimeColor, isAllDayEvent, pickPillTextColor, pickTintedTextColor, classifyTimedSpan, eventStatusSlot, eventProgress, isPastInDailyColumn, boundaryBetween, applyTitleFilter, type EventDaySegment } from '@/lib/calendar-utils';
import { useFailingSources } from './shared/useFailingSources';
import { toTZWallTime } from '@/lib/timezone';
import type { CalendarFetchStatus, CalendarSourceStatus } from '@/types/config';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { DEFAULT_TIME_FORMAT, type CalendarConfig, type CalendarEvent, type CalendarViewMode, type ModuleStyle, type MultiWeekTheme, type TimeFormat } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { TEXT_OPACITY } from '@/lib/constants';
import { SectionHeader } from './shared/SectionHeader';
import { MetadataText } from './shared/MetadataText';
import { ContentCard } from './shared/ContentCard';

interface CalendarModuleProps {
  config: CalendarConfig;
  style: ModuleStyle;
  events?: CalendarEvent[];
  timezone?: string;
  timeFormat?: TimeFormat;
  calendarStatus?: CalendarFetchStatus;
  /** Attached only while at least one source is failing (see buildModuleProps). */
  sourceStatus?: CalendarSourceStatus[];
}

/**
 * How event lines render, resolved once per module render and threaded to
 * every view as a single memoized object (its identity only changes when a
 * field does, so the memoized EventCard stays cached across clock ticks).
 * `timezone` rides along because event times must be formatted and bucketed
 * in the display's timezone, exactly like the grid's today-highlight.
 */
interface EventDisplayStyle {
  timeFormat: TimeFormat;
  gridStyle: 'classic' | 'colored';
  pillBackground: boolean;
  timezone?: string;
  /** Sources whose feed is failing; list rows add a "saved" time suffix. */
  failingSourceIds?: ReadonlySet<string>;
}

function formatDuration(start: Date, end: Date): string {
  const mins = differenceInMinutes(end, start);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function formatRelativeDay(
  date: Date,
  today: Date,
  tCore: TranslateFn,
  locale: string,
): string {
  const diffDays = Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return tCore('today');
  if (diffDays === 1) return tCore('tomorrow');
  if (diffDays === -1) return tCore('yesterday');
  return formatDateSync(date, 'EEEE, MMM d', { locale });
}

// ─── Event Card (shared across views) ───

// Memoized: grid views mount hundreds of these and the module re-renders
// every minute on the timezone clock tick with the same event object refs,
// so the shallow compare skips re-parsing/re-formatting every pill per tick.
const EventCard = memo(function EventCard({ event, textColor: _textColor, showTime, showLocation, showDescription, compact, accentColor, eventStyle, t, locale, segment, countdown, progress, dimmed, live }: {
  event: CalendarEvent;
  textColor: string;
  showTime: boolean;
  showLocation: boolean;
  showDescription?: boolean;
  compact?: boolean;
  accentColor: string;
  eventStyle: EventDisplayStyle;
  t: TranslateFn;
  locale: string;
  /** Day-relative part of a multi-day event (list views pass the row's day). */
  segment?: EventDaySegment;
  /** Status slot: countdown text before start / progress fraction while running. */
  countdown?: string | null;
  progress?: number | null;
  /** Daily view only: already-ended today, faded via dimPastEvents. */
  dimmed?: boolean;
  /** Daily view only: currently running, ringed via showNowRule. */
  live?: boolean;
}) {
  const { timeFormat, gridStyle, pillBackground, timezone } = eventStyle;
  const isAllDay = isAllDayEvent(event);
  // Classic compact pills render only the dot and title — return before
  // parsing dates, since grid views mount hundreds of these per render.
  // (Colored timed pills parse the start below for their time prefix.)
  if (compact) {
    const eventColor = event.calendarColor ?? accentColor;
    if (gridStyle === 'colored') {
      if (isAllDay) {
        return (
          <div data-event-id={event.id} className="flex items-center rounded truncate px-1 py-0.5" style={{ backgroundColor: eventColor, color: pickPillTextColor(eventColor) }}>
            <span className="truncate font-semibold" style={{ fontSize: '0.7em' }}>{event.title}</span>
          </div>
        );
      }
      const start = parseEventWallTime(event.start, timezone);
      return (
        <div
          data-event-id={event.id}
          className="flex items-baseline gap-1 px-1 py-0.5 rounded"
          style={pillBackground ? { backgroundColor: 'rgba(255,255,255,0.10)' } : undefined}
        >
          <span className="shrink-0 font-semibold tabular-nums" style={{ fontSize: '0.7em', color: eventColor }}>
            {formatEventTime(start, timeFormat, locale, true)}
          </span>
          <span className="truncate" style={{ fontSize: '0.7em', color: eventColor }}>{event.title}</span>
        </div>
      );
    }
    return (
      <div data-event-id={event.id} className="flex items-center gap-1 px-1 py-0.5 rounded truncate" style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}>
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: event.calendarColor ?? accentColor }}
        />
        <span className="truncate" style={{ fontSize: '0.7em' }}>{event.title}</span>
      </div>
    );
  }

  const start = parseEventWallTime(event.start, timezone);
  const end = parseEventWallTime(event.end, timezone);
  const description = showDescription ? sanitizeEventDescription(event.description) : '';
  // Split multi-day rows: middle days promote to an all-day label, first and
  // last days show only their true partial time. Rows from a source that
  // stopped updating carry a "saved" suffix.
  const baseTimeContent = isAllDay || segment === 'middle' ? t('calendar.allDay')
    : segment === 'first' ? t('calendar.fromTime', { time: formatEventTime(start, timeFormat, locale) })
    : segment === 'last' ? t('calendar.untilTime', { time: formatEventTime(end, timeFormat, locale) })
    : `${formatEventTime(start, timeFormat, locale)} · ${formatDuration(start, end)}`;
  const timeContent = event.sourceId && eventStyle.failingSourceIds?.has(event.sourceId)
    ? `${baseTimeContent} · ${t('calendar.savedShort')}`
    : baseTimeContent;

  return (
    <ContentCard
      data-event-id={event.id}
      className="flex gap-2"
      style={{
        padding: '6px 10px',
        opacity: dimmed ? 0.4 : 1,
        boxShadow: live ? `inset 0 0 0 1px ${accentColor}aa` : undefined,
      }}
    >
      <div
        className="w-0.5 rounded-full shrink-0 self-stretch"
        style={{ backgroundColor: event.calendarColor ?? accentColor }}
      />
      <div className="min-w-0 flex-1">
        {showTime && (
          <div className="flex items-center gap-1.5">
            <MetadataText size="sm">{timeContent}</MetadataText>
            {countdown && (
              <span
                className="shrink-0 rounded-full font-semibold whitespace-nowrap"
                style={{
                  fontSize: '0.6em',
                  color: accentColor,
                  backgroundColor: 'rgba(255,255,255,0.10)',
                  padding: '1px 7px',
                }}
              >
                {countdown}
              </span>
            )}
          </div>
        )}
        <p className="font-medium leading-tight line-clamp-2" style={{ fontSize: '0.85em' }}>{event.title}</p>
        {progress != null && (
          <div
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="rounded-full overflow-hidden"
            style={{ height: 3, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: accentColor }} />
          </div>
        )}
        {showLocation && event.location && (
          <MetadataText size="xs" className="leading-tight">
            {event.location}
          </MetadataText>
        )}
        {description && (
          <p
            className="leading-snug whitespace-pre-line break-words"
            style={{ fontSize: '0.72em', opacity: TEXT_OPACITY.secondary, marginTop: '2px' }}
          >
            {description}
          </p>
        )}
      </div>
    </ContentCard>
  );
});

// ─── Daily View (original) ───

/** Thin accent rule marking "now" in today's column, between already-ended
 *  and upcoming/running events. Purely a visual echo of what each row's own
 *  time already says, so it carries no accessible name of its own. */
function NowRule({ now, accentColor, timeFormat, locale }: {
  now: Date;
  accentColor: string;
  timeFormat: TimeFormat;
  locale: string;
}) {
  return (
    <div data-now-rule className="flex items-center gap-1.5" style={{ margin: '2px 0 4px' }} aria-hidden="true">
      <span className="rounded-full shrink-0" style={{ width: 6, height: 6, backgroundColor: accentColor }} />
      <span style={{ fontSize: '0.55em', fontWeight: 700, color: accentColor, whiteSpace: 'nowrap' }}>
        {formatEventTime(now, timeFormat, locale)}
      </span>
      <span className="flex-1" style={{ height: 1, backgroundColor: accentColor, opacity: 0.6 }} />
    </div>
  );
}

function DailyView({ events, config, style, today, now, accentColor, t, tCore, locale, eventStyle }: {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  now: Date;
  t: TranslateFn;
  tCore: TranslateFn;
  locale: string;
}) {
  const daysToShow = config.daysToShow ?? 3;
  const showTime = config.showTime !== false;
  const showLocation = config.showLocation !== false;
  const showDescription = config.dailyShowDescription === true;
  const emptyDayText = config.emptyDayText?.trim();
  const dimPastEvents = config.dimPastEvents === true;
  const showNowRule = config.showNowRule === true;

  const days = Array.from({ length: daysToShow }, (_, i) => {
    const date = addDays(today, i);
    const dayEvents = eventsForDay(events, date, eventStyle.timezone);
    return { date, events: dayEvents };
  });

  return (
    <div className="flex h-full gap-3">
      {days.map(({ date, events: dayEvents }) => {
        const isToday = isSameDay(date, today);
        return (
          <div key={date.toISOString()} className="flex-1 flex flex-col min-w-0">
            <div className="text-center mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <SectionHeader active={isToday}>
                {isToday ? tCore('today') : formatDateSync(date, 'EEE', { locale })}
              </SectionHeader>
              <p
                className="font-bold"
                style={{ fontSize: '1.3em', opacity: isToday ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary }}
              >
                {formatDateSync(date, 'd', { locale })}
              </p>
              <p style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}>
                {formatDateSync(date, 'MMM', { locale })}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 overflow-hidden flex-1">
              {dayEvents.length === 0 ? (
                <div
                  className="flex items-center justify-center rounded-lg px-2.5 py-3"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                >
                  <p style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>{emptyDayText || t('calendar.noEvents')}</p>
                </div>
              ) : (
                (() => {
                  // The now rule sits right after the last already-ended
                  // event, so a currently-running one stays above it with
                  // its live ring/progress bar intact.
                  const rows: ReactNode[] = [];
                  let ruleInserted = false;
                  for (const ev of dayEvents) {
                    const start = parseEventWallTime(ev.start, eventStyle.timezone);
                    const end = parseEventWallTime(ev.end, eventStyle.timezone);
                    const isAllDay = isAllDayEvent(ev);
                    const segment = isAllDay ? 'single' : classifyTimedSpan(start, end, date);
                    const isPast = isPastInDailyColumn(end, now, isToday, isAllDay, segment);
                    const isLive = !isAllDay && !isPast && eventProgress(start, end, now) != null;
                    // All-day rows and 'middle' segments (a multi-day timed
                    // event just passing through today) carry no past/future
                    // meaning for today's column — eventsForDay sorts by the
                    // event's original start, which for a 'middle' segment
                    // can be days ago, so it can't be allowed to trigger
                    // (or block) the now-rule boundary the way a real
                    // today-relative event does.
                    if (showNowRule && isToday && !ruleInserted && !isAllDay && segment !== 'middle' && !isPast) {
                      rows.push(<NowRule key="now-rule" now={now} accentColor={accentColor} timeFormat={eventStyle.timeFormat} locale={locale} />);
                      ruleInserted = true;
                    }
                    const status = eventStatusSlot({
                      start, end,
                      isAllDayRow: isAllDay || segment === 'middle',
                      rowDate: date, now, locale, segment,
                      showCountdown: config.showCountdown === true,
                      showProgressBar: config.showProgressBar === true,
                      countdownAllDay: false,
                    });
                    rows.push(
                      <EventCard key={ev.id} event={ev} segment={segment} countdown={status.countdown} progress={status.progress} textColor={style.textColor} showTime={showTime} showLocation={showLocation} showDescription={showDescription} accentColor={accentColor} eventStyle={eventStyle} t={t} locale={locale} dimmed={dimPastEvents && isPast} live={showNowRule && isLive} />
                    );
                  }
                  if (showNowRule && isToday && !ruleInserted) {
                    rows.push(<NowRule key="now-rule" now={now} accentColor={accentColor} timeFormat={eventStyle.timeFormat} locale={locale} />);
                  }
                  return rows;
                })()
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Agenda View ───

function AgendaView({ events, config, style, today, now, accentColor, t, tCore, locale, eventStyle }: {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  now: Date;
  t: TranslateFn;
  tCore: TranslateFn;
  locale: string;
}) {
  const showTime = config.showTime !== false;
  const showLocation = config.showLocation !== false;
  const showDescription = config.agendaShowDescription === true;
  const maxEvents = config.maxEvents ?? 20;
  const weekStartsOn = weekStartsOnFor(config.startDay);

  // Sort events chronologically and limit
  const sorted = [...events]
    .sort((a, b) => compareEventStarts(a.start, b.start))
    .slice(0, maxEvents);

  // Group by day
  const groups: { date: Date; events: CalendarEvent[] }[] = [];
  for (const ev of sorted) {
    const evDate = startOfDay(parseEventWallTime(ev.start, eventStyle.timezone));
    const existing = groups.find((g) => isSameDay(g.date, evDate));
    if (existing) {
      existing.events.push(ev);
    } else {
      groups.push({ date: evDate, events: [ev] });
    }
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>{t('calendar.noUpcomingEvents')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-hidden h-full">
      {groups.map(({ date, events: dayEvents }, gi) => {
        const boundary = gi > 0
          ? boundaryBetween(groups[gi - 1].date, date, config.agendaSeparators, weekStartsOn)
          : null;
        return (
        <div key={date.toISOString()}>
          {boundary === 'month' && (
            <div className="mb-2">
              <p className="font-semibold" style={{ fontSize: '0.9em', color: accentColor }}>
                {formatDateSync(date, 'MMMM', { locale })}
              </p>
              <div className="rounded-full" style={{ height: 2, backgroundColor: accentColor, opacity: 0.55, marginTop: 2 }} />
            </div>
          )}
          {boundary === 'week' && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1" style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.18)' }} />
              <span className="shrink-0 uppercase tracking-wider" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary, fontWeight: 600 }}>
                {t('calendar.weekOf', { date: formatDateSync(addDays(date, -((date.getDay() - weekStartsOn + 7) % 7)), 'MMM d', { locale }) })}
              </span>
              <div className="flex-1" style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.18)' }} />
            </div>
          )}
          <div className="flex items-center gap-2 mb-1.5">
            <SectionHeader className="shrink-0" active={isSameDay(date, today)}>
              {formatRelativeDay(date, today, tCore, locale)}
            </SectionHeader>
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>
          <div className="flex flex-col gap-1.5">
            {dayEvents.map((ev) => {
              const start = parseEventWallTime(ev.start, eventStyle.timezone);
              const end = parseEventWallTime(ev.end, eventStyle.timezone);
              const status = eventStatusSlot({
                start, end,
                isAllDayRow: isAllDayEvent(ev),
                rowDate: date, now, locale,
                showCountdown: config.showCountdown === true,
                showProgressBar: config.showProgressBar === true,
                countdownAllDay: false,
              });
              return (
                <EventCard key={ev.id} event={ev} countdown={status.countdown} progress={status.progress} textColor={style.textColor} showTime={showTime} showLocation={showLocation} showDescription={showDescription} accentColor={accentColor} eventStyle={eventStyle} t={t} locale={locale} />
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}

/** Accent color at a given alpha. ColorPicker's text input accepts any CSS
 * color, so plain hex-suffix concatenation ("red" + "cc") would produce
 * invalid CSS; only append when the value really is a 6-digit hex. */
function withAlpha(color: string, alphaHex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
  const pct = Math.round((parseInt(alphaHex, 16) / 255) * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

// ─── Shared grid pieces (week / month / multi-week) ───

/** Multi-week doubles the month/week grids' 1px gutters; both values must
 *  reach every grid of a view (header row included) or columns drift. */
const MULTI_WEEK_GAP = 'gap-0.5';

function gridTemplateFor(showWeekNumbers: boolean): string {
  // The week-number column is a fixed width, not `auto`: the header and the
  // body rows are separate grids, so an `auto` column resolves per grid
  // (empty header cell ≈ 0px vs two week-number digits) and shifts every
  // weekday label off the day column below it.
  return showWeekNumbers ? '1.6em repeat(7, 1fr)' : 'repeat(7, 1fr)';
}

function WeekNumberCell({ date, config, className = 'pt-0.5', fontSize = '0.55em' }: {
  date: Date;
  config: CalendarConfig;
  className?: string;
  fontSize?: string;
}) {
  return (
    <div className={`flex items-start justify-center px-1 ${className}`}>
      <span style={{ fontSize, opacity: TEXT_OPACITY.tertiary }}>
        {getWeek(date, weekNumberOptions(config.startDay))}
      </span>
    </div>
  );
}

function DayOfWeekHeaderRow({ dates, showWeekNumbers, locale, gapClass = 'gap-px', today, accentColor }: {
  dates: Date[];
  showWeekNumbers: boolean;
  locale: string;
  /** Multi-week doubles its day-cell gutters; the header must match or its
   *  weekday labels drift off the columns below. Month view keeps the 1px default. */
  gapClass?: string;
  /** Modern multi-week themes: bold + accent the column containing `today`. */
  today?: Date;
  accentColor?: string;
}) {
  return (
    <div className={`grid ${gapClass}`} style={{ gridTemplateColumns: gridTemplateFor(showWeekNumbers) }}>
      {showWeekNumbers && <div />}
      {dates.map((d) => {
        const highlight = today != null && accentColor != null && d.getDay() === today.getDay();
        return (
          <div key={d.toISOString()} className="text-center py-0.5">
            <span
              className={`uppercase tracking-wider${highlight ? ' font-bold' : ''}`}
              style={{ fontSize: '0.6em', ...(highlight ? { color: accentColor } : { opacity: TEXT_OPACITY.tertiary }) }}
            >
              {formatDateSync(d, 'EEE', { locale })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DayCellEvents({ events, maxPerCell, textColor, accentColor, eventStyle, t, locale, gapClass = 'gap-px' }: {
  events: CalendarEvent[];
  maxPerCell: number;
  textColor: string;
  accentColor: string;
  eventStyle: EventDisplayStyle;
  t: TranslateFn;
  locale: string;
  gapClass?: string;
}) {
  return (
    <div className={`flex flex-col ${gapClass} overflow-hidden`}>
      {events.slice(0, maxPerCell).map((ev) => (
        <EventCard key={ev.id} event={ev} textColor={textColor} showTime={false} showLocation={false} compact accentColor={accentColor} eventStyle={eventStyle} t={t} locale={locale} />
      ))}
      {events.length > maxPerCell && (
        <span className="text-center" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
          {t('calendar.moreCount', { count: events.length - maxPerCell })}
        </span>
      )}
    </div>
  );
}

// ─── Week Grid View ───

function WeekView({ events, config, style, today, accentColor, t, locale, eventStyle }: {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  t: TranslateFn;
  tCore: TranslateFn;
  locale: string;
}) {
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const weekStart = startOfWeek(today, { weekStartsOn: weekStartsOnFor(config.startDay) });
  const daysInWeek = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const gridTemplate = gridTemplateFor(showWeekNumbers);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="grid gap-px mb-1" style={{ gridTemplateColumns: gridTemplate }}>
        {showWeekNumbers && (
          <div className="flex items-center justify-center px-1">
            <span style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>{t('calendar.weekShort')}</span>
          </div>
        )}
        {daysInWeek.map((date) => {
          const isToday = isSameDay(date, today);
          return (
            <div key={date.toISOString()} className="text-center py-1">
              <p className="uppercase tracking-wider" style={{ fontSize: '0.6em', opacity: isToday ? TEXT_OPACITY.primary : TEXT_OPACITY.tertiary }}>
                {formatDateSync(date, 'EEE', { locale })}
              </p>
              <div
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  width: '1.8em',
                  height: '1.8em',
                  fontSize: '0.85em',
                  fontWeight: isToday ? 700 : 500,
                  backgroundColor: isToday ? withAlpha(accentColor, 'cc') : 'transparent',
                  opacity: isToday ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary,
                }}
              >
                {formatDateSync(date, 'd', { locale })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Event grid */}
      <div className="grid gap-px flex-1 overflow-hidden" style={{ gridTemplateColumns: gridTemplate }}>
        {showWeekNumbers && (
          <WeekNumberCell date={weekStart} config={config} className="pt-1" fontSize="0.6em" />
        )}
        {daysInWeek.map((date) => {
          const dayEvents = eventsForDay(events, date, eventStyle.timezone);
          return (
            <div
              key={date.toISOString()}
              className="flex flex-col p-0.5 overflow-hidden rounded"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
            >
              <DayCellEvents events={dayEvents} eventStyle={eventStyle} maxPerCell={5} textColor={style.textColor} accentColor={accentColor} t={t} locale={locale} gapClass="gap-0.5" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Month Grid View ───

function MonthView({ events, config, style, today, accentColor, t, locale, eventStyle }: {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  t: TranslateFn;
  tCore: TranslateFn;
  locale: string;
}) {
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const weekStartsOn = weekStartsOnFor(config.startDay);
  const calStart = startOfWeek(monthStart, { weekStartsOn });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn });
  const gridTemplate = gridTemplateFor(showWeekNumbers);

  // Build grid of days
  const weeks: Date[][] = [];
  let current = calStart;
  while (current <= calEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(current);
      current = addDays(current, 1);
    }
    weeks.push(week);
  }

  // Localized day-of-week initials, derived from the active locale via date-fns
  const dayHeaderDates = Array.from({ length: 7 }, (_, i) => addDays(calStart, i));

  return (
    <div className="flex flex-col h-full gap-px">
      {/* Month title */}
      <div className="text-center pb-1">
        <p className="font-semibold" style={{ fontSize: '0.85em' }}>
          {formatDateSync(today, 'MMMM yyyy', { locale })}
        </p>
      </div>

      <DayOfWeekHeaderRow dates={dayHeaderDates} showWeekNumbers={showWeekNumbers} locale={locale} />

      {/* Weeks */}
      <div className="flex flex-col gap-px flex-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid gap-px flex-1" style={{ gridTemplateColumns: gridTemplate }}>
            {showWeekNumbers && <WeekNumberCell date={week[0]} config={config} />}
            {week.map((date) => {
              // `today` is the timezone-shifted date, so the highlight follows
              // the configured display timezone, not the Pi's OS clock
              const isToday = isSameDay(date, today);
              const inMonth = isSameMonth(date, today);
              const dayEvents = eventsForDay(events, date, eventStyle.timezone);

              return (
                <div
                  key={date.toISOString()}
                  className="flex flex-col p-0.5 overflow-hidden rounded"
                  style={{
                    backgroundColor: isToday ? withAlpha(accentColor, '1f') : 'rgba(255,255,255,0.02)',
                    opacity: inMonth ? TEXT_OPACITY.primary : TEXT_OPACITY.tertiary,
                  }}
                >
                  <span
                    className="text-center leading-none mb-0.5"
                    style={{
                      fontSize: '0.65em',
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? accentColor : style.textColor,
                    }}
                  >
                    {formatDateSync(date, 'd', { locale })}
                  </span>
                  <DayCellEvents events={dayEvents} eventStyle={eventStyle} maxPerCell={3} textColor={style.textColor} accentColor={accentColor} t={t} locale={locale} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Multi-Week Grid View ───

interface MultiWeekViewProps {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  t: TranslateFn;
  tCore: TranslateFn;
  locale: string;
}

/** `multiWeekTheme` picks the skeleton: the original banner grid, or the
 *  modern shared skeleton with a per-theme pill treatment. */
function MultiWeekView(props: MultiWeekViewProps) {
  const theme = props.config.multiWeekTheme ?? 'banner';
  if (theme === 'banner') return <MultiWeekBannerView {...props} />;
  return <MultiWeekModernView {...props} theme={theme} />;
}

function MultiWeekBannerView({ events, config, style, today, accentColor, t, locale, eventStyle }: MultiWeekViewProps) {
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const weekCount = clampWeeksToShow(config.weeksToShow);
  const maxPerCell = Math.min(10, Math.max(2, config.multiWeekMaxEventsPerCell ?? 4));
  const startDay = config.startDay;
  const gridTemplate = gridTemplateFor(showWeekNumbers);

  // Badge colors are loop-invariant; computed once, not per cell (up to 84
  // cells re-render on every minute tick).
  const todayBadgeBg = withAlpha(accentColor, 'cc');
  const dayBadgeBg = withAlpha(accentColor, '40');
  const todayText = pickPillTextColor(accentColor);
  const dayText = pickTintedTextColor(style.textColor, accentColor, style.backgroundColor);
  const monthText = pickTintedTextColor(accentColor, accentColor, style.backgroundColor);

  // The parent re-renders every minute (timezone clock tick) with a fresh
  // `today` object of the same value, so key the grid and the per-day event
  // buckets on the day itself — up to 84 cells x N events re-filters daily
  // and on refetch, not per tick.
  const todayMs = today.getTime();
  const weeks: Date[][] = useMemo(() => {
    const gridStart = startOfWeek(new Date(todayMs), { weekStartsOn: weekStartsOnFor(startDay) });
    return Array.from({ length: weekCount }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)));
  }, [todayMs, weekCount, startDay]);
  const timezone = eventStyle.timezone;
  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const week of weeks) {
      for (const date of week) {
        map.set(date.getTime(), eventsForDay(events, date, timezone));
      }
    }
    return map;
  }, [weeks, events, timezone]);

  return (
    <div className={`flex flex-col h-full ${MULTI_WEEK_GAP}`}>
      <DayOfWeekHeaderRow dates={weeks[0]} showWeekNumbers={showWeekNumbers} locale={locale} gapClass={MULTI_WEEK_GAP} />

      {/* Weeks — gutters are 2px (double the month/week grids' 1px): the
          multi-week cells are shorter, so they need more air to separate. */}
      <div className={`flex flex-col ${MULTI_WEEK_GAP} flex-1`}>
        {weeks.map((week, wi) => (
          <div key={wi} className={`grid ${MULTI_WEEK_GAP} flex-1`} style={{ gridTemplateColumns: gridTemplate }}>
            {showWeekNumbers && <WeekNumberCell date={week[0]} config={config} />}
            {week.map((date) => {
              const isToday = isSameDay(date, today);
              const isPast = date < today && !isToday;
              const isFirstOfMonth = date.getDate() === 1;
              const dayEvents = eventsByDay.get(date.getTime()) ?? [];

              return (
                <div
                  key={date.toISOString()}
                  className="flex flex-col p-0.5 overflow-hidden rounded"
                  style={{
                    backgroundColor: isToday ? withAlpha(accentColor, '1f') : 'rgba(255,255,255,0.02)',
                    ...(isFirstOfMonth ? { backgroundImage: `linear-gradient(to right, ${withAlpha(accentColor, '33')}, transparent)` } : {}),
                    opacity: isPast ? TEXT_OPACITY.tertiary : 1,
                  }}
                >
                  {/* Digits at 0.65em to match the month/week grids; height
                      1.35em keeps the previous badge's pixel height. Flex
                      splits month + day into separate items, so the spacing
                      between them must come from `gap` — a literal space
                      would be collapsed away. */}
                  <span className="flex items-center justify-center rounded leading-none mb-0.5" style={{
                    height: '1.35em', fontSize: '0.65em', gap: '0.25em',
                    fontWeight: isToday ? 700 : 400,
                    backgroundColor: isToday ? todayBadgeBg : dayBadgeBg,
                    color: isToday ? todayText : dayText,
                  }}>
                    {isFirstOfMonth && (
                      <span style={{ color: isToday ? todayText : monthText, fontWeight: isToday ? 700 : 600 }}>
                        {formatDateSync(date, 'MMM', { locale })}
                      </span>
                    )}
                    {formatDateSync(date, 'd', { locale })}
                  </span>
                  <DayCellEvents events={dayEvents} eventStyle={eventStyle} maxPerCell={maxPerCell} textColor={style.textColor} accentColor={accentColor} t={t} locale={locale} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One event pill in the modern multi-week themes. Clean = neutral pill,
 * compact contrast-guarded time in the calendar color, module-text semibold
 * title. Minimal = title only behind a 3px calendar-color bar. Vivid =
 * solid calendar-color pill with auto-contrast text. Multi-day all-day
 * pills stitch across their span: solid rounded-left first day, hollow
 * squared continuations — the 2px grid gutters read as one interrupted bar. */
const MultiWeekPill = memo(function MultiWeekPill({ event, date, theme, textColor, moduleBackground, accentColor, eventStyle, locale }: {
  event: CalendarEvent;
  date: Date;
  theme: Exclude<MultiWeekTheme, 'banner'>;
  // Primitives, not the ModuleStyle object, so the memo's shallow compare
  // survives a parent re-render that rebuilds the style object (same
  // rationale as EventCard's props).
  textColor: string;
  moduleBackground: string | undefined;
  accentColor: string;
  eventStyle: EventDisplayStyle;
  locale: string;
}) {
  const color = event.calendarColor ?? accentColor;

  if (isAllDayEvent(event)) {
    const segment = allDaySpanSegment(event, date);
    if (segment === 'middle' || segment === 'last') {
      return (
        <div
          data-event-id={event.id}
          className={`px-1 py-0.5 truncate ${segment === 'middle' ? 'rounded-none' : 'rounded-r'}`}
          style={{ boxShadow: `inset 0 0 0 1.5px ${color}`, color: textColor, opacity: TEXT_OPACITY.heading }}
        >
          <span className="truncate font-medium" style={{ fontSize: '0.7em' }}>{event.title}</span>
        </div>
      );
    }
    return (
      <div
        data-event-id={event.id}
        className={`px-1 py-0.5 truncate ${segment === 'first' ? 'rounded-l' : 'rounded'}`}
        style={{ backgroundColor: color, color: pickPillTextColor(color) }}
      >
        <span className="truncate font-semibold" style={{ fontSize: '0.7em' }}>{event.title}</span>
      </div>
    );
  }

  const title = <span className="truncate font-semibold" style={{ fontSize: '0.7em' }}>{event.title}</span>;

  if (theme === 'minimal') {
    return (
      <div
        data-event-id={event.id}
        className="flex items-baseline rounded truncate"
        style={{ padding: '2px 4px 2px 7px', backgroundColor: 'rgba(255,255,255,0.09)', boxShadow: `inset 3px 0 0 ${color}`, color: textColor }}
      >
        {title}
      </div>
    );
  }

  const start = parseEventWallTime(event.start, eventStyle.timezone);
  const time = formatEventTimeCompact(start, eventStyle.timeFormat, locale);

  if (theme === 'vivid') {
    return (
      <div
        data-event-id={event.id}
        className="flex items-baseline gap-1 px-1 py-0.5 rounded"
        style={{ backgroundColor: color, color: pickPillTextColor(color) }}
      >
        <span className="shrink-0 tabular-nums" style={{ fontSize: '0.65em', opacity: 0.8 }}>{time}</span>
        {title}
      </div>
    );
  }

  // clean
  return (
    <div
      data-event-id={event.id}
      className="flex items-baseline gap-1 px-1 py-0.5 rounded"
      style={{ backgroundColor: 'rgba(255,255,255,0.10)', color: textColor }}
    >
      <span className="shrink-0 tabular-nums" style={{ fontSize: '0.65em', color: pickGridTimeColor(color, moduleBackground) }}>{time}</span>
      {title}
    </div>
  );
});

/** Shared skeleton for the modern themes ('clean' | 'minimal' | 'vivid'):
 * month-range header, quiet corner day numbers with a solid badge on today
 * only, an accent ring on the today cell, weekend shading, bold "MMM d"
 * first-of-month labels under an accent hairline, stitched multi-day pills,
 * and a chip-styled overflow row. The theme only swaps the pill treatment
 * (MultiWeekPill); gridEventStyle / gridEventPillBackground do not apply
 * here. data-mw-theme carries the active theme for tests. */
function MultiWeekModernView({ events, config, style, today, accentColor, t, locale, eventStyle, theme }: MultiWeekViewProps & { theme: Exclude<MultiWeekTheme, 'banner'> }) {
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const weekCount = clampWeeksToShow(config.weeksToShow);
  const maxPerCell = Math.min(10, Math.max(2, config.multiWeekMaxEventsPerCell ?? 4));
  const startDay = config.startDay;
  const gridTemplate = gridTemplateFor(showWeekNumbers);
  const { textColor, backgroundColor: moduleBackground } = style;

  // Loop-invariant colors, hoisted like the banner view's (up to 84 cells
  // re-render on every minute tick).
  const todayBadgeText = pickPillTextColor(accentColor);
  const todayCellTint = withAlpha(accentColor, '24');
  const todayRing = `inset 0 0 0 1.5px ${accentColor}`;
  const monthRule = `inset 0 2px 0 ${withAlpha(accentColor, 'bf')}`;

  const todayMs = today.getTime();
  const weeks: Date[][] = useMemo(() => {
    const gridStart = startOfWeek(new Date(todayMs), { weekStartsOn: weekStartsOnFor(startDay) });
    return Array.from({ length: weekCount }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)));
  }, [todayMs, weekCount, startDay]);
  const timezone = eventStyle.timezone;
  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const week of weeks) {
      for (const date of week) {
        map.set(date.getTime(), eventsForDay(events, date, timezone));
      }
    }
    return map;
  }, [weeks, events, timezone]);

  const rangeLabel = formatMonthRangeLabel(weeks[0][0], weeks[weekCount - 1][6], locale);

  return (
    <div data-mw-theme={theme} className={`flex flex-col h-full ${MULTI_WEEK_GAP}`}>
      <p className="text-center font-semibold" style={{ fontSize: '0.85em' }}>{rangeLabel}</p>
      <DayOfWeekHeaderRow dates={weeks[0]} showWeekNumbers={showWeekNumbers} locale={locale} gapClass={MULTI_WEEK_GAP} today={today} accentColor={accentColor} />
      <div className={`flex flex-col ${MULTI_WEEK_GAP} flex-1`}>
        {weeks.map((week, wi) => (
          <div key={wi} className={`grid ${MULTI_WEEK_GAP} flex-1`} style={{ gridTemplateColumns: gridTemplate }}>
            {showWeekNumbers && <WeekNumberCell date={week[0]} config={config} />}
            {week.map((date) => {
              const isToday = isSameDay(date, today);
              const isPast = date < today && !isToday;
              const isFirstOfMonth = date.getDate() === 1;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const dayEvents = eventsByDay.get(date.getTime()) ?? [];
              const shown = dayEvents.slice(0, maxPerCell);
              const overflow = dayEvents.length - shown.length;
              const cellShadow = [isToday ? todayRing : null, isFirstOfMonth ? monthRule : null]
                .filter(Boolean).join(', ');

              return (
                <div
                  key={date.toISOString()}
                  className="flex flex-col p-0.5 overflow-hidden rounded"
                  style={{
                    backgroundColor: isToday ? todayCellTint : `rgba(255, 255, 255, ${isWeekend ? 0.065 : 0.045})`,
                    ...(cellShadow ? { boxShadow: cellShadow } : {}),
                  }}
                >
                  <div className="flex items-center shrink-0" style={{ height: '1.4em', padding: '0 0.15em', marginBottom: '0.1em' }}>
                    {isToday ? (
                      <span
                        className="inline-flex items-center justify-center rounded-full font-bold tabular-nums leading-none"
                        style={{ minWidth: '1.4em', height: '1.4em', padding: '0 0.3em', fontSize: '0.65em', backgroundColor: accentColor, color: todayBadgeText }}
                      >
                        {formatDateSync(date, 'd', { locale })}
                      </span>
                    ) : (
                      <span
                        className="leading-none tabular-nums"
                        style={{
                          fontSize: '0.65em',
                          fontWeight: isFirstOfMonth ? 700 : 400,
                          opacity: isFirstOfMonth ? TEXT_OPACITY.primary : isPast ? TEXT_OPACITY.dim : TEXT_OPACITY.secondary,
                        }}
                      >
                        {formatDateSync(date, isFirstOfMonth ? 'MMM d' : 'd', { locale })}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-px overflow-hidden" style={isPast ? { opacity: TEXT_OPACITY.dim } : undefined}>
                    {shown.map((ev) => (
                      <MultiWeekPill key={ev.id} event={ev} date={date} theme={theme} textColor={textColor} moduleBackground={moduleBackground} accentColor={accentColor} eventStyle={eventStyle} locale={locale} />
                    ))}
                    {overflow > 0 && (
                      <span className="text-center rounded" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.secondary, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                        {t('calendar.moreCount', { count: overflow })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───

const VIEW_COMPONENTS: Record<CalendarViewMode, React.ComponentType<{
  events: CalendarEvent[];
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  now: Date;
  accentColor: string;
  eventStyle: EventDisplayStyle;
  t: TranslateFn;
  tCore: TranslateFn;
  locale: string;
}>> = {
  daily: DailyView,
  agenda: AgendaView,
  week: WeekView,
  'multi-week': MultiWeekView,
  month: MonthView,
};

export default function CalendarModule({ config, style, events, timezone, timeFormat, calendarStatus, sourceStatus }: CalendarModuleProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const rawEvents = events ?? [];
  const sourceFilter = config.sourceFilter;
  const sourcedEvents = applyTitleFilter(
    (sourceFilter && sourceFilter.length > 0)
      ? rawEvents.filter((ev) => !ev.sourceId || sourceFilter.includes(ev.sourceId))
      : rawEvents,
    config.titleFilter,
  );
  // Sub-minute ticking only while a slot actually needs it: a stalled
  // countdown ("in 1 minute") or progress bar is visible within a render
  // cycle, but the now-rule/dimming below tolerate the default cadence just
  // fine (matches the fullscreen calendar's own NowLine).
  const wantsFastTick = config.showCountdown === true || config.showProgressBar === true;
  const now = useTZClock(timezone, wantsFastTick ? 30_000 : 60_000);
  const today = startOfDay(now);
  const viewMode = config.viewMode ?? 'daily';
  // Grid views (week/month/multi-week) show their full visible range, past days
  // included; list views stay upcoming-only even when the shared fetch
  // window was widened for a grid view elsewhere on the display. Daily view
  // is the exception when dimPastEvents/showNowRule are on: today's already-
  // ended events must survive so they can be dimmed and the rule positioned
  // after them — gated on the toggles so default rendering (both off) is
  // unchanged from before this existed.
  const keepPastToday = viewMode === 'daily' && (config.dimPastEvents === true || config.showNowRule === true);
  const allEvents = isGridView(viewMode)
    ? sourcedEvents
    : sourcedEvents.filter((ev) =>
        isEventUpcoming(ev, now, timezone) ||
        (keepPastToday && isSameDay(parseEventWallTime(ev.end, timezone), today)));
  const resolvedTimeFormat = timeFormat ?? DEFAULT_TIME_FORMAT;
  // Legend ring, named stale banner, and per-row "saved" suffixes all key
  // off this shared derivation (see useFailingSources).
  const { failingSources, failingSourceIds, soloFailingName, soloFailingSince } = useFailingSources({
    sourceStatus, sourceFilter, timezone, timeFormat: resolvedTimeFormat, locale, today, t,
  });
  // Legend rows come from the events the current view actually draws — the
  // shared fetch window is wider than any single view, so scope to the
  // view's day range first (agenda has no day bound beyond the upcoming
  // filter). Only the view→window mapping lives here; the date math and the
  // holidays-label remap are shared (calendar-utils).
  const legendPlacement = config.showLegend ?? 'off';
  let legend: LegendSource[] = [];
  if (legendPlacement !== 'off') {
    const weekStartsOn = weekStartsOnFor(config.startDay);
    const window =
      viewMode === 'daily' ? viewDayWindow({ kind: 'days', today, weekStartsOn, count: config.daysToShow ?? 3 })
      : viewMode === 'week' ? viewDayWindow({ kind: 'week', today, weekStartsOn })
      : viewMode === 'month' ? viewDayWindow({ kind: 'month-grid', today, weekStartsOn })
      : viewMode === 'multi-week' ? viewDayWindow({ kind: 'weeks', today, weekStartsOn, count: clampWeeksToShow(config.weeksToShow) })
      : null; // agenda
    legend = buildLegend(allEvents, window, timezone, t('calendar.publicHolidays'));
  }
  const ViewComponent = VIEW_COMPONENTS[viewMode];
  const accentColor = config.accentColor ?? '#3b82f6';
  const gridEventStyle = config.gridEventStyle;
  const gridEventPillBackground = config.gridEventPillBackground;
  // Stable identity across clock ticks so the memoized EventCard's shallow
  // compare holds; only a real settings change produces a new object.
  const eventStyle = useMemo<EventDisplayStyle>(() => {
    const gridStyle = gridEventStyle === 'colored' ? 'colored' : 'classic';
    return {
      timeFormat: resolvedTimeFormat,
      gridStyle,
      pillBackground: gridStyle === 'colored' && gridEventPillBackground === true,
      timezone,
      failingSourceIds,
    };
  }, [resolvedTimeFormat, gridEventStyle, gridEventPillBackground, timezone, failingSourceIds]);

  // Tap-to-open detail: same delegated-handler contract as the fullscreen
  // calendar — every EventCard carries data-event-id, state holds the id and
  // the event is re-resolved each render so refetches never leave the overlay
  // showing a stale snapshot. The module renders light-on-dark over a photo
  // background with no theme system, so the overlay uses the Charcoal tokens.
  const tapDetails = config.eventTapDetails === true;
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEvent = detailId ? allEvents.find((ev) => ev.id === detailId) ?? null : null;
  useEffect(() => {
    if (!tapDetails) setDetailId(null);
  }, [tapDetails]);
  const handleRootClick = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest?.('[data-event-id]')?.getAttribute('data-event-id');
    if (id) setDetailId(id);
  };

  // Failure ≠ empty: while the shared calendar fetch is failing, kept
  // events get a quiet "saved" line. Only a failure with NO successful fetch
  // ever (updatedAt null) renders the "can't load" message — last-good data
  // whose upcoming window happens to be empty is a normal quiet day. The
  // saved-from time is day-scoped and display-timezone-formatted.
  const fetchFailed = calendarStatus?.error != null;
  const neverLoaded = fetchFailed && calendarStatus?.updatedAt == null;
  const savedWall = fetchFailed && calendarStatus?.updatedAt != null
    ? (timezone ? toTZWallTime(new Date(calendarStatus.updatedAt), timezone) : new Date(calendarStatus.updatedAt))
    : null;
  const staleSince = savedWall && isSameDay(savedWall, today)
    ? formatEventTime(savedWall, resolvedTimeFormat, locale)
    : null;


  if (neverLoaded) {
    return (
      <ModuleWrapper style={style}>
        <div className="flex items-center justify-center h-full">
          <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>{t('calendar.cantLoadEvents')}</p>
        </div>
      </ModuleWrapper>
    );
  }

  return (
    <ModuleWrapper style={style}>
      <div
        className="h-full flex flex-col"
        data-tap-events={tapDetails ? '' : undefined}
        onClick={tapDetails ? handleRootClick : undefined}
      >
        {tapDetails && <style>{`[data-tap-events] [data-event-id] { cursor: pointer; }`}</style>}
        {fetchFailed ? (
          <div className="flex items-center gap-1.5 shrink-0" role="status" style={{ fontSize: '0.6em', marginBottom: 4 }}>
            <span className="rounded-full shrink-0" style={{ width: '0.7em', height: '0.7em', backgroundColor: '#d9a441' }} aria-hidden="true" />
            <span style={{ color: '#d9a441', fontWeight: 600 }}>
              {staleSince ? t('calendar.savedFrom', { time: staleSince }) : t('calendar.savedEvents')}
            </span>
          </div>
        ) : failingSources.length > 0 && (
          // Per-source outage while the shared fetch itself is fine: name the
          // one failing source; several at once fall back to generic wording.
          <div className="flex items-center gap-1.5 shrink-0" role="status" style={{ fontSize: '0.6em', marginBottom: 4 }}>
            <span className="rounded-full shrink-0" style={{ width: '0.7em', height: '0.7em', backgroundColor: '#d9a441' }} aria-hidden="true" />
            <span style={{ color: '#d9a441', fontWeight: 600 }}>
              {soloFailingName
                ? (soloFailingSince
                  ? t('calendar.sourceNotUpdating', { name: soloFailingName, time: soloFailingSince })
                  : t('calendar.sourceNotUpdatingNoTime', { name: soloFailingName }))
                : t('calendar.savedEvents')}
            </span>
          </div>
        )}
        {legendPlacement === 'header' && (
          <CalendarLegend
            sources={legend}
            label={t('calendar.legendLabel')}
            failingIds={failingSourceIds}
            // maxHeight ≈ two wrapped rows: in a small module an unbounded
            // legend (8+ sources) could starve the flex-1 view area to zero.
            style={{ flexShrink: 0, fontSize: '0.6em', opacity: 0.85, marginBottom: 6, maxHeight: '3.4em', overflow: 'hidden' }}
          />
        )}
        <div className="flex-1 min-h-0">
          <ViewComponent events={allEvents} config={config} style={style} today={today} now={now} accentColor={accentColor} eventStyle={eventStyle} t={t} tCore={tCore} locale={locale} />
        </div>
        {legendPlacement === 'footer' && (
          <CalendarLegend
            sources={legend}
            label={t('calendar.legendLabel')}
            failingIds={failingSourceIds}
            // maxHeight ≈ two wrapped rows: in a small module an unbounded
            // legend (8+ sources) could starve the flex-1 view area to zero.
            style={{ flexShrink: 0, fontSize: '0.6em', opacity: 0.85, marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(128,128,128,0.35)', maxHeight: '3.4em', overflow: 'hidden' }}
          />
        )}
      </div>
      {tapDetails && detailEvent && (
        <EventDetailOverlay
          event={detailEvent}
          variant={config.eventTapStyle ?? 'sheet'}
          theme={getThemeTokens('charcoal')}
          accentColor={detailEvent.calendarColor ?? accentColor}
          timeFormat={resolvedTimeFormat}
          timezone={timezone}
          now={now}
          onClose={() => setDetailId(null)}
        />
      )}
    </ModuleWrapper>
  );
}
