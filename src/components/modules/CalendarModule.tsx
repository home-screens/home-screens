'use client';

import { isSameDay, startOfDay, addDays, differenceInMinutes, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getWeek, isSameMonth, isToday as isDateToday } from 'date-fns';
import { createTZDate } from '@/lib/timezone';
import { parseEventDate, isEventOnDay, compareEventStarts, sanitizeEventDescription } from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarConfig, CalendarEvent, CalendarViewMode, ModuleStyle } from '@/types/config';
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

function EventCard({ event, textColor: _textColor, showTime, showLocation, showDescription, compact, accentColor, t, locale }: {
  event: CalendarEvent;
  textColor: string;
  showTime: boolean;
  showLocation: boolean;
  showDescription?: boolean;
  compact?: boolean;
  accentColor: string;
  t: TranslateFn;
  locale: string;
}) {
  const start = parseEventDate(event.start);
  const end = parseEventDate(event.end);
  const isAllDay = event.allDay || (!event.start.includes('T'));
  const description = showDescription ? sanitizeEventDescription(event.description) : '';

  if (compact) {
    return (
      <div className="flex items-center gap-1 px-1 py-0.5 rounded truncate" style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}>
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: event.calendarColor ?? accentColor }}
        />
        <span className="truncate" style={{ fontSize: '0.7em' }}>{event.title}</span>
      </div>
    );
  }

  return (
    <ContentCard className="flex gap-2" style={{ padding: '6px 10px' }}>
      <div
        className="w-0.5 rounded-full shrink-0 self-stretch"
        style={{ backgroundColor: event.calendarColor ?? accentColor }}
      />
      <div className="min-w-0 flex-1">
        {showTime && (
          <MetadataText size="sm">
            {isAllDay ? t('calendar.allDay') : (
              <>
                {formatDateSync(start, 'h:mm a', { locale })} · {formatDuration(start, end)}
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
}

// ─── Daily View (original) ───

function DailyView({ events, config, style, today, accentColor, t, tCore, locale }: {
  events: CalendarEvent[];
  accentColor: string;
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
    const dayEvents = events.filter((ev) => isEventOnDay(ev, date));
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
                  <EventCard key={ev.id} event={ev} textColor={style.textColor} showTime={showTime} showLocation={showLocation} showDescription={showDescription} accentColor={accentColor} t={t} locale={locale} />
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

function AgendaView({ events, config, style, today, accentColor, t, tCore, locale }: {
  events: CalendarEvent[];
  accentColor: string;
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
    const evDate = startOfDay(parseEventDate(ev.start));
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
              <EventCard key={ev.id} event={ev} textColor={style.textColor} showTime={showTime} showLocation={showLocation} showDescription={showDescription} accentColor={accentColor} t={t} locale={locale} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Week Grid View ───

function WeekView({ events, config, style, today, accentColor, t, locale }: {
  events: CalendarEvent[];
  accentColor: string;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  t: TranslateFn;
  tCore: TranslateFn;
  locale: string;
}) {
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const weekStart = startOfWeek(today, { weekStartsOn: 0 });
  const daysInWeek = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="grid gap-px mb-1" style={{
        gridTemplateColumns: showWeekNumbers ? 'auto repeat(7, 1fr)' : 'repeat(7, 1fr)',
      }}>
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
                  backgroundColor: isToday ? `${accentColor}cc` : 'transparent',
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
      <div className="grid gap-px flex-1 overflow-hidden" style={{
        gridTemplateColumns: showWeekNumbers ? 'auto repeat(7, 1fr)' : 'repeat(7, 1fr)',
      }}>
        {showWeekNumbers && (
          <div className="flex items-start justify-center pt-1 px-1">
            <span style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>{getWeek(weekStart)}</span>
          </div>
        )}
        {daysInWeek.map((date) => {
          const dayEvents = events.filter((ev) => isEventOnDay(ev, date));
          return (
            <div
              key={date.toISOString()}
              className="flex flex-col gap-0.5 p-0.5 overflow-hidden rounded"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
            >
              {dayEvents.slice(0, 5).map((ev) => (
                <EventCard key={ev.id} event={ev} textColor={style.textColor} showTime={false} showLocation={false} compact accentColor={accentColor} t={t} locale={locale} />
              ))}
              {dayEvents.length > 5 && (
                <span className="text-center" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
                  {t('calendar.moreCount', { count: dayEvents.length - 5 })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Month Grid View ───

function MonthView({ events, config, style, today, accentColor, t, locale }: {
  events: CalendarEvent[];
  accentColor: string;
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
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

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

      {/* Day-of-week header */}
      <div className="grid gap-px" style={{
        gridTemplateColumns: showWeekNumbers ? 'auto repeat(7, 1fr)' : 'repeat(7, 1fr)',
      }}>
        {showWeekNumbers && <div />}
        {dayHeaderDates.map((d) => (
          <div key={d.toISOString()} className="text-center py-0.5">
            <span className="uppercase tracking-wider" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>
              {formatDateSync(d, 'EEE', { locale })}
            </span>
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex flex-col gap-px flex-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid gap-px flex-1" style={{
            gridTemplateColumns: showWeekNumbers ? 'auto repeat(7, 1fr)' : 'repeat(7, 1fr)',
          }}>
            {showWeekNumbers && (
              <div className="flex items-start justify-center pt-0.5 px-1">
                <span style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>{getWeek(week[0])}</span>
              </div>
            )}
            {week.map((date) => {
              const isToday = isDateToday(date);
              const inMonth = isSameMonth(date, today);
              const dayEvents = events.filter((ev) => isEventOnDay(ev, date));

              return (
                <div
                  key={date.toISOString()}
                  className="flex flex-col p-0.5 overflow-hidden rounded"
                  style={{
                    backgroundColor: isToday ? `${accentColor}1f` : 'rgba(255,255,255,0.02)',
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
                  <div className="flex flex-col gap-px overflow-hidden">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <EventCard key={ev.id} event={ev} textColor={style.textColor} showTime={false} showLocation={false} compact accentColor={accentColor} t={t} locale={locale} />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-center" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
                        {t('calendar.moreCount', { count: dayEvents.length - 3 })}
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
  accentColor: string;
  t: TranslateFn;
  tCore: TranslateFn;
  locale: string;
}>> = {
  daily: DailyView,
  agenda: AgendaView,
  week: WeekView,
  month: MonthView,
};

export default function CalendarModule({ config, style, events, timezone }: CalendarModuleProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const rawEvents = events ?? [];
  const sourceFilter = config.sourceFilter;
  const allEvents = (sourceFilter && sourceFilter.length > 0)
    ? rawEvents.filter((ev) => !ev.sourceId || sourceFilter.includes(ev.sourceId))
    : rawEvents;
  const today = startOfDay(createTZDate(timezone));
  const viewMode = config.viewMode ?? 'daily';
  const ViewComponent = VIEW_COMPONENTS[viewMode];
  const accentColor = config.accentColor ?? '#3b82f6';

  return (
    <ModuleWrapper style={style}>
      <ViewComponent events={allEvents} config={config} style={style} today={today} accentColor={accentColor} t={t} tCore={tCore} locale={locale} />
    </ModuleWrapper>
  );
}
