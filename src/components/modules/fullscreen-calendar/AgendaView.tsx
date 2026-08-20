'use client';

import { useMemo } from 'react';
import { addDays, isSameDay, startOfWeek } from 'date-fns';
import {
  parseEventDate, isEventOnDay, compareEventStarts, sanitizeEventDescription, formatEventTime,
  classifyEventOnDay, eventStatusSlot, boundaryBetween, weekStartsOnFor,
  type EventDaySegment,
} from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { MapPin } from './FullscreenCalendarModule';
import type { CalendarEvent, CalendarScale, CalendarWeather } from './FullscreenCalendarModule';
import { DayWeatherBadge, EventWeatherLine } from './WeatherInline';
import { CountdownPill, EventProgressBar, WeekSeparator, MonthSeparator } from './list-view-bits';
import { DEFAULT_TIME_FORMAT, type FullscreenCalendarConfig, type TimeFormat } from '@/types/config';

interface AgendaViewProps {
  events: CalendarEvent[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
  timeFormat?: TimeFormat;
  weather?: CalendarWeather;
}

interface DayGroupEvent {
  ev: CalendarEvent;
  segment: EventDaySegment;
}

export function AgendaView({ events, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, weather }: AgendaViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const daysAhead = config.agendaDaysAhead ?? 14;
  const isLandscape = scale.orientation === 'landscape';
  const showDescription = config.agendaShowDescription === true;
  const showTodayMarker = (config.todayHighlightStyle ?? 'full') !== 'off';
  const weekStartsOn = weekStartsOnFor(config.startDay);
  const emptyDayText = config.emptyDayText?.trim();

  const dayGroups = useMemo(() => {
    const groups: { date: Date; events: DayGroupEvent[]; boundary: ReturnType<typeof boundaryBetween> }[] = [];
    for (let i = 0; i < daysAhead; i++) {
      const date = addDays(today, i);
      const dayEvents = events
        .filter(ev => isEventOnDay(ev, date))
        .map(ev => ({ ev, segment: classifyEventOnDay(ev, date) }))
        .sort((a, b) => {
          // All-day rows first — including middle days of split multi-day
          // events, which promote to all-day rendering.
          const aAll = a.ev.allDay === true || a.segment === 'middle';
          const bAll = b.ev.allDay === true || b.segment === 'middle';
          if (aAll !== bAll) return aAll ? -1 : 1;
          return compareEventStarts(a.ev.start, b.ev.start);
        });

      if (config.agendaHideEmptyDays && dayEvents.length === 0) continue;
      // Boundary vs the previous RENDERED group, computed here on the full
      // ordered list — landscape splits groups across two columns, and a
      // per-column computation would drop any separator landing at the top
      // of the right column.
      const prev = groups.length > 0 ? groups[groups.length - 1].date : null;
      const boundary = prev ? boundaryBetween(prev, date, config.agendaSeparators, weekStartsOn) : null;
      groups.push({ date, events: dayEvents, boundary });
    }
    return groups;
  }, [events, today, daysAhead, config.agendaHideEmptyDays, config.agendaSeparators, weekStartsOn]);

  function renderDayGroup({ date, events: dayEvents, boundary }: (typeof dayGroups)[number]) {
    const isGroupToday = isSameDay(date, today);

    return (
      <div key={date.toISOString()}>
        {boundary === 'month' && (
          <MonthSeparator monthStart={date} scale={scale} fontSize={fontSize} locale={locale} />
        )}
        {boundary === 'week' && (
          <WeekSeparator weekStart={startOfWeek(date, { weekStartsOn })} scale={scale} fontSize={fontSize} t={t} locale={locale} />
        )}

        {/* Date header */}
        <div style={{
          fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
          fontSize: fontSize * 1.5,
          color: 'var(--cal-text-primary)',
          padding: `${scale.bu * 1.2}px 0 ${scale.bu * 0.7}px`,
          position: 'sticky',
          top: 0,
          background: 'var(--cal-bg)',
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: scale.bu * 0.6,
        }}>
          {formatDateSync(date, 'EEEE, MMMM d', { locale })}
          {isGroupToday && showTodayMarker && (
            <span style={{
              fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
              fontSize: fontSize * 0.65,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--cal-accent)',
            }}>
              &middot; {tCore('today')}
            </span>
          )}
          {weather && <DayWeatherBadge weather={weather} day={date} fontSize={fontSize} />}
        </div>

        {/* Event cards */}
        {dayEvents.length === 0 && (
          <div style={{
            fontSize: fontSize * 0.95,
            fontStyle: 'italic',
            color: 'var(--cal-text-tertiary)',
            padding: `${scale.bu * 0.5}px 0`,
          }}>
            {emptyDayText || t('fullscreen-calendar.noEvents')}
          </div>
        )}

        {dayEvents.map(({ ev, segment }) => {
          const color = ev.calendarColor ?? '#3B82F6';
          const start = parseEventDate(ev.start);
          const end = parseEventDate(ev.end);
          const nowHour = now.getHours() + now.getMinutes() / 60;
          const isPast = isGroupToday && !ev.allDay && segment !== 'middle' &&
            (end.getHours() + end.getMinutes() / 60) <= nowHour && end <= addDays(date, 1);
          const description = showDescription ? sanitizeEventDescription(ev.description) : '';
          const isAllDayRow = ev.allDay === true || segment === 'middle';
          const status = eventStatusSlot({
            start, end, isAllDayRow, rowDate: date, now, locale, segment,
            showCountdown: config.showCountdown === true,
            showProgressBar: config.showProgressBar === true,
            countdownAllDay: config.countdownAllDay === true,
          });

          if (isAllDayRow) {
            return (
              <div
                key={`${ev.id}-${date.toDateString()}`}
                className="fsc-event-block"
                data-event-id={ev.id}
                role="article"
                aria-label={t('fullscreen-calendar.ariaLabels.eventAllDay', { title: ev.title })}
                style={{
                  background: 'var(--cal-surface)',
                  borderRadius: 10,
                  borderLeft: `4px solid ${color}`,
                  padding: `${scale.bu * 0.6}px ${scale.bu * 1.0}px`,
                  marginBottom: scale.bu * 0.6,
                  boxShadow: 'var(--cal-card-shadow)',
                  position: 'relative',
                }}
              >
                <div style={{
                  fontSize: fontSize * 0.65,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--cal-text-tertiary)',
                }}>
                  {t('fullscreen-calendar.allDay')}
                </div>
                <div style={{
                  fontSize: fontSize * 1.2,
                  fontWeight: 600,
                  color: 'var(--cal-text-primary)',
                }}>
                  {ev.title}
                </div>
                {description && (
                  <div style={{
                    fontSize: fontSize * 0.8,
                    color: 'var(--cal-text-secondary)',
                    marginTop: scale.bu * 0.25,
                    whiteSpace: 'pre-line',
                    wordBreak: 'break-word',
                  }}>
                    {description}
                  </div>
                )}
                {status.countdown && (
                  <span style={{ position: 'absolute', top: scale.bu * 0.6, right: scale.bu * 0.8 }}>
                    <CountdownPill label={status.countdown} fontSize={fontSize} />
                  </span>
                )}
              </div>
            );
          }

          const startLabel = formatEventTime(start, timeFormat, locale);
          const endLabel = formatEventTime(end, timeFormat, locale);
          // Split multi-day rows show only the true partial time on their
          // first and last days ("From 10:00 AM" / "Until 3:00 PM").
          const timeLabel = segment === 'first'
            ? t('fullscreen-calendar.fromTime', { time: startLabel })
            : segment === 'last'
              ? t('fullscreen-calendar.untilTime', { time: endLabel })
              : `${startLabel} – ${endLabel}`;
          const ariaLabel = ev.location
            ? t('fullscreen-calendar.ariaLabels.eventTimedAtLocation', {
                title: ev.title,
                start: startLabel,
                end: endLabel,
                location: ev.location,
              })
            : t('fullscreen-calendar.ariaLabels.eventTimed', {
                title: ev.title,
                start: startLabel,
                end: endLabel,
              });

          return (
            <div
              key={`${ev.id}-${date.toDateString()}`}
              className="fsc-event-block"
              data-event-id={ev.id}
              role="article"
              aria-label={ariaLabel}
              style={{
                background: 'var(--cal-surface)',
                borderRadius: 10,
                borderLeft: `4px solid ${color}`,
                padding: `${scale.bu * 0.7}px ${scale.bu * 1.0}px`,
                marginBottom: scale.bu * 0.6,
                boxShadow: 'var(--cal-card-shadow)',
                opacity: isPast && config.dimPastEvents ? 0.4 : 1,
                position: 'relative',
              }}
            >
              <div style={{
                fontSize: fontSize * 0.8,
                fontWeight: 500,
                color: 'var(--cal-text-tertiary)',
                marginBottom: scale.bu * 0.1,
              }}>
                {timeLabel}
              </div>
              <div style={{
                fontSize: fontSize * 1.4,
                fontWeight: 600,
                color: 'var(--cal-text-primary)',
              }}>
                {ev.title}
              </div>
              {ev.location && (
                <div style={{
                  fontSize: fontSize * 0.7,
                  color: 'var(--cal-text-tertiary)',
                  marginTop: scale.bu * 0.2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <MapPin size={fontSize * 0.6} aria-hidden="true" />
                  {ev.location}
                </div>
              )}
              {weather && (
                <EventWeatherLine weather={weather} start={start} fontSize={fontSize} marginTop={scale.bu * 0.25} />
              )}
              {description && (
                <div style={{
                  fontSize: fontSize * 0.85,
                  color: 'var(--cal-text-secondary)',
                  marginTop: scale.bu * 0.3,
                  whiteSpace: 'pre-line',
                  wordBreak: 'break-word',
                  lineHeight: 1.35,
                }}>
                  {description}
                </div>
              )}
              {ev.sourceName && (
                <div style={{
                  fontSize: fontSize * 0.6,
                  fontWeight: 500,
                  color: 'var(--cal-text-tertiary)',
                  marginTop: scale.bu * 0.3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: color,
                  }} />
                  {ev.sourceName}
                </div>
              )}
              {status.countdown && (
                <span style={{ position: 'absolute', top: scale.bu * 0.7, right: scale.bu * 0.8 }}>
                  <CountdownPill label={status.countdown} fontSize={fontSize} />
                </span>
              )}
              {status.progress != null && (
                <EventProgressBar fraction={status.progress} fontSize={fontSize} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderColumn(groups: typeof dayGroups) {
    return groups.map(renderDayGroup);
  }

  if (isLandscape) {
    // 2-column layout: distribute day groups left-to-right
    const leftGroups: typeof dayGroups = [];
    const rightGroups: typeof dayGroups = [];
    let leftWeight = 0;
    let rightWeight = 0;
    for (const group of dayGroups) {
      const weight = 1 + group.events.length * 1.5;
      if (leftWeight <= rightWeight) {
        leftGroups.push(group);
        leftWeight += weight;
      } else {
        rightGroups.push(group);
        rightWeight += weight;
      }
    }

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        height: '100%',
        gap: scale.bu * 0.5,
      }}>
        <div style={{
          overflow: 'hidden',
          padding: `0 ${scale.bu * 1.4}px ${scale.bu * 2}px`,
        }}>
          {renderColumn(leftGroups)}
        </div>
        <div style={{
          overflow: 'hidden',
          padding: `0 ${scale.bu * 1.4}px ${scale.bu * 2}px`,
        }}>
          {renderColumn(rightGroups)}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      overflow: 'hidden',
      padding: `0 ${scale.bu * 1.4}px ${scale.bu * 2}px`,
    }}>
      {renderColumn(dayGroups)}
    </div>
  );
}
