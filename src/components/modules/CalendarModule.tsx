'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { isSameDay, startOfDay, addDays, differenceInMinutes, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getWeek, isSameMonth } from 'date-fns';
import { createTZDate } from '@/lib/timezone';
import { getThemeTokens } from '@/lib/fullscreen-themes';
import { EventDetailOverlay } from './shared/EventDetailOverlay';
import { parseEventWallTime, isEventUpcoming, compareEventStarts, sanitizeEventDescription, clampWeeksToShow, isGridView, weekStartsOnFor, weekNumberOptions, eventsForDay, formatEventTime, isAllDayEvent, pickPillTextColor } from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { DEFAULT_TIME_FORMAT, type CalendarConfig, type CalendarEvent, type CalendarViewMode, type ModuleStyle, type TimeFormat } from '@/types/config';
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
const EventCard = memo(function EventCard({ event, textColor: _textColor, showTime, showLocation, showDescription, compact, accentColor, eventStyle, t, locale }: {
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

  return (
    <ContentCard data-event-id={event.id} className="flex gap-2" style={{ padding: '6px 10px' }}>
      <div
        className="w-0.5 rounded-full shrink-0 self-stretch"
        style={{ backgroundColor: event.calendarColor ?? accentColor }}
      />
      <div className="min-w-0 flex-1">
        {showTime && (
          <MetadataText size="sm">
            {isAllDay ? t('calendar.allDay') : (
              <>
                {formatEventTime(start, timeFormat, locale)} · {formatDuration(start, end)}
              </>
            )}
          </MetadataText>
        )}
        <p className="font-medium leading-tight line-clamp-2" style={{ fontSize: '0.85em' }}>{event.title}</p>
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

function DailyView({ events, config, style, today, accentColor, t, tCore, locale, eventStyle }: {
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
  const daysToShow = config.daysToShow ?? 3;
  const showTime = config.showTime !== false;
  const showLocation = config.showLocation !== false;
  const showDescription = config.dailyShowDescription === true;

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
                  <p style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>{t('calendar.noEvents')}</p>
                </div>
              ) : (
                dayEvents.map((ev) => (
                  <EventCard key={ev.id} event={ev} textColor={style.textColor} showTime={showTime} showLocation={showLocation} showDescription={showDescription} accentColor={accentColor} eventStyle={eventStyle} t={t} locale={locale} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Agenda View ───

function AgendaView({ events, config, style, today, accentColor, t, tCore, locale, eventStyle }: {
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
  const showTime = config.showTime !== false;
  const showLocation = config.showLocation !== false;
  const showDescription = config.agendaShowDescription === true;
  const maxEvents = config.maxEvents ?? 20;

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
      {groups.map(({ date, events: dayEvents }) => (
        <div key={date.toISOString()}>
          <div className="flex items-center gap-2 mb-1.5">
            <SectionHeader className="shrink-0" active={isSameDay(date, today)}>
              {formatRelativeDay(date, today, tCore, locale)}
            </SectionHeader>
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>
          <div className="flex flex-col gap-1.5">
            {dayEvents.map((ev) => (
              <EventCard key={ev.id} event={ev} textColor={style.textColor} showTime={showTime} showLocation={showLocation} showDescription={showDescription} accentColor={accentColor} eventStyle={eventStyle} t={t} locale={locale} />
            ))}
          </div>
        </div>
      ))}
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

function gridTemplateFor(showWeekNumbers: boolean): string {
  return showWeekNumbers ? 'auto repeat(7, 1fr)' : 'repeat(7, 1fr)';
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

function DayOfWeekHeaderRow({ dates, showWeekNumbers, locale, gapClass = 'gap-px' }: {
  dates: Date[];
  showWeekNumbers: boolean;
  locale: string;
  /** Multi-week doubles its day-cell gutters; the header must match or its
   *  weekday labels drift off the columns below. Month view keeps the 1px default. */
  gapClass?: string;
}) {
  return (
    <div className={`grid ${gapClass}`} style={{ gridTemplateColumns: gridTemplateFor(showWeekNumbers) }}>
      {showWeekNumbers && <div />}
      {dates.map((d) => (
        <div key={d.toISOString()} className="text-center py-0.5">
          <span className="uppercase tracking-wider" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>
            {formatDateSync(d, 'EEE', { locale })}
          </span>
        </div>
      ))}
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

function MultiWeekView({ events, config, style, today, accentColor, t, locale, eventStyle }: {
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
  const weekCount = clampWeeksToShow(config.weeksToShow);
  const maxPerCell = Math.min(10, Math.max(2, config.multiWeekMaxEventsPerCell ?? 4));
  const startDay = config.startDay;
  const gridTemplate = gridTemplateFor(showWeekNumbers);

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
    <div className="flex flex-col h-full gap-0.5">
      <DayOfWeekHeaderRow dates={weeks[0]} showWeekNumbers={showWeekNumbers} locale={locale} gapClass="gap-0.5" />

      {/* Weeks — gutters are 2px (double the month/week grids' 1px): the
          multi-week cells are shorter, so they need more air to separate. */}
      <div className="flex flex-col gap-0.5 flex-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid gap-0.5 flex-1" style={{ gridTemplateColumns: gridTemplate }}>
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
                  <span className="text-center leading-none mb-0.5 block" style={{ fontSize: '0.65em' }}>
                    <span className="flex items-center justify-center rounded" style={{
                      height: '1.8em', fontSize: '0.75em',
                      fontWeight: isToday ? 700 : 400,
                      backgroundColor: isToday ? withAlpha(accentColor, 'cc') : withAlpha(accentColor, '40'),
                      color: isToday ? '#fff' : style.textColor,
                    }}>
                      {isFirstOfMonth && (
                        <span style={{ color: isToday ? '#fff' : accentColor, fontWeight: 600 }}>
                          {formatDateSync(date, 'MMM', { locale })}{' '}
                        </span>
                      )}
                      {formatDateSync(date, 'd', { locale })}
                    </span>
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

// ─── Main Component ───

const VIEW_COMPONENTS: Record<CalendarViewMode, React.ComponentType<{
  events: CalendarEvent[];
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
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

export default function CalendarModule({ config, style, events, timezone, timeFormat }: CalendarModuleProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const rawEvents = events ?? [];
  const sourceFilter = config.sourceFilter;
  const sourcedEvents = (sourceFilter && sourceFilter.length > 0)
    ? rawEvents.filter((ev) => !ev.sourceId || sourceFilter.includes(ev.sourceId))
    : rawEvents;
  const now = createTZDate(timezone);
  const today = startOfDay(now);
  const viewMode = config.viewMode ?? 'daily';
  // Grid views (week/month/multi-week) show their full visible range, past days
  // included; list views stay upcoming-only even when the shared fetch
  // window was widened for a grid view elsewhere on the display.
  const allEvents = isGridView(viewMode)
    ? sourcedEvents
    : sourcedEvents.filter((ev) => isEventUpcoming(ev, now));
  const ViewComponent = VIEW_COMPONENTS[viewMode];
  const accentColor = config.accentColor ?? '#3b82f6';
  const resolvedTimeFormat = timeFormat ?? DEFAULT_TIME_FORMAT;
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
    };
  }, [resolvedTimeFormat, gridEventStyle, gridEventPillBackground, timezone]);

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

  return (
    <ModuleWrapper style={style}>
      <div
        className="h-full"
        data-tap-events={tapDetails ? '' : undefined}
        onClick={tapDetails ? handleRootClick : undefined}
      >
        {tapDetails && <style>{`[data-tap-events] [data-event-id] { cursor: pointer; }`}</style>}
        <ViewComponent events={allEvents} config={config} style={style} today={today} accentColor={accentColor} eventStyle={eventStyle} t={t} tCore={tCore} locale={locale} />
      </div>
      {tapDetails && detailEvent && (
        <EventDetailOverlay
          event={detailEvent}
          variant={config.eventTapStyle ?? 'sheet'}
          theme={getThemeTokens('charcoal')}
          accentColor={detailEvent.calendarColor ?? accentColor}
          timeFormat={resolvedTimeFormat}
          now={now}
          onClose={() => setDetailId(null)}
        />
      )}
    </ModuleWrapper>
  );
}
