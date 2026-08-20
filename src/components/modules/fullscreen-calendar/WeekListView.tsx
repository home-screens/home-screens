'use client';

import { useMemo } from 'react';
import { startOfWeek, addDays, isSameDay } from 'date-fns';
import {
  parseEventDate, isEventOnDay, compareEventStarts, sanitizeEventDescription, weekStartsOnFor, formatEventTime,
  classifyEventOnDay, eventStatusSlot,
  type EventDaySegment,
} from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarEvent, CalendarScale, CalendarWeather } from './FullscreenCalendarModule';
import { DayWeatherBadge, EventWeatherLine } from './WeatherInline';
import { CountdownPill, EventProgressBar } from './list-view-bits';
import { DEFAULT_TIME_FORMAT, type FullscreenCalendarConfig, type TimeFormat } from '@/types/config';

interface WeekListViewProps {
  events: CalendarEvent[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
  timeFormat?: TimeFormat;
  weather?: CalendarWeather;
}

export function WeekListView({ events, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, weather }: WeekListViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const isLandscape = scale.orientation === 'landscape';
  const showDescription = config.weekShowDescription === true;
  const showTodayMarker = (config.todayHighlightStyle ?? 'full') !== 'off';
  const emptyDayText = config.emptyDayText?.trim();

  const weekStart = startOfWeek(today, { weekStartsOn: weekStartsOnFor(config.startDay) });
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weekStart is a new Date object each render; toDateString() gives a stable string key that only changes when the day changes
    [weekStart.toDateString()],
  );

  // Landscape: split the first four and last three days
  const leftDays = isLandscape ? days.slice(0, 4) : days;
  const rightDays = isLandscape ? days.slice(4) : [];

  function renderDay(day: Date) {
    const isToday = isSameDay(day, today);
    const isPast = day < today && !isToday;
    const dayEvents = events
      .filter(ev => isEventOnDay(ev, day))
      .map(ev => ({ ev, segment: classifyEventOnDay(ev, day) }));
    // Middle days of split multi-day events promote to the all-day group.
    const allDayEvs = dayEvents.filter(({ ev, segment }) => ev.allDay || segment === 'middle');
    const timedEvs = dayEvents
      .filter(({ ev, segment }) => !ev.allDay && segment !== 'middle')
      .sort((a, b) => compareEventStarts(a.ev.start, b.ev.start));

    const shouldCollapse = isPast && config.weekCollapsePastDays;

    return (
      <div
        key={day.toISOString()}

        style={{
          marginBottom: scale.bu * 0.4,
          opacity: isPast && config.dimPastEvents ? 0.5 : 1,
          borderLeft: isToday && showTodayMarker ? `3px solid var(--cal-accent)` : undefined,
          paddingLeft: isToday && showTodayMarker ? scale.bu * 1.2 : undefined,
          marginLeft: isToday && showTodayMarker ? -scale.bu * 1.5 : undefined,
        }}
      >
        {/* Day header */}
        <div style={{
          fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
          fontSize: fontSize * 1.6,
          color: 'var(--cal-text-primary)',
          padding: `${scale.bu * 1.2}px 0 ${scale.bu * 0.5}px`,
          borderBottom: '1px solid var(--cal-border-subtle)',
          marginBottom: scale.bu * 0.7,
          display: 'flex',
          alignItems: 'baseline',
          gap: scale.bu * 0.8,
        }}>
          {formatDateSync(day, 'EEEE, MMMM d', { locale })}
          {isToday && showTodayMarker && (
            <span style={{
              fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
              fontSize: fontSize * 0.7,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--cal-accent)',
              background: 'var(--cal-accent-bg)',
              padding: `${scale.bu * 0.15}px ${scale.bu * 0.5}px`,
              borderRadius: 4,
            }}>
              {tCore('today')}
            </span>
          )}
          {weather && <DayWeatherBadge weather={weather} day={day} fontSize={fontSize} />}
        </div>

        {!shouldCollapse && (<>
          {/* All-day events (plus promoted middle days) */}
          {allDayEvs.map(({ ev, segment }) => (
            <EventRow key={ev.id} event={ev} segment={segment} rowDate={day} now={now} config={config} weather={weather} fontSize={fontSize} scale={scale} isAllDay showDescription={showDescription} timeFormat={timeFormat} t={t} locale={locale} />
          ))}

          {/* Timed events */}
          {timedEvs.map(({ ev, segment }) => (
            <EventRow key={ev.id} event={ev} segment={segment} rowDate={day} now={now} config={config} weather={weather} fontSize={fontSize} scale={scale} showDescription={showDescription} timeFormat={timeFormat} t={t} locale={locale} />
          ))}

          {/* Empty day */}
          {dayEvents.length === 0 && (
            <div style={{
              padding: `${scale.bu * 0.7}px 0`,
              fontSize: fontSize * 0.95,
              fontStyle: 'italic',
              color: 'var(--cal-text-tertiary)',
            }}>
              {emptyDayText || t('fullscreen-calendar.noEvents')}
            </div>
          )}
        </>)}
      </div>
    );
  }

  if (isLandscape) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr',
        height: '100%',
        gap: 0,
      }}>
        <div style={{
          overflow: 'hidden',
          padding: `0 ${scale.bu * 1.5}px ${scale.bu * 2}px`,
        }}>
          {leftDays.map(renderDay)}
        </div>
        <div style={{ background: 'var(--cal-border)' }} />
        <div style={{
          overflow: 'hidden',
          padding: `0 ${scale.bu * 1.5}px ${scale.bu * 2}px`,
        }}>
          {rightDays.map(renderDay)}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        overflow: 'hidden',
        padding: `0 ${scale.bu * 1.5}px ${scale.bu * 2}px`,
      }}
    >
      {days.map(renderDay)}
    </div>
  );
}

function EventRow({ event, segment, rowDate, now, config, weather, fontSize, scale, isAllDay, showDescription, timeFormat, t, locale }: {
  event: CalendarEvent;
  segment: EventDaySegment;
  rowDate: Date;
  now: Date;
  config: FullscreenCalendarConfig;
  weather?: CalendarWeather;
  fontSize: number;
  scale: CalendarScale;
  isAllDay?: boolean;
  showDescription?: boolean;
  timeFormat: TimeFormat;
  t: TranslateFn;
  locale: string;
}) {
  const color = event.calendarColor ?? '#3B82F6';
  const start = parseEventDate(event.start);
  const end = parseEventDate(event.end);
  const description = showDescription ? sanitizeEventDescription(event.description) : '';
  const startLabel = formatEventTime(start, timeFormat, locale);
  const endLabel = formatEventTime(end, timeFormat, locale);
  const status = eventStatusSlot({
    start, end, isAllDayRow: isAllDay === true, rowDate, now, locale, segment,
    showCountdown: config.showCountdown === true,
    showProgressBar: config.showProgressBar === true,
    countdownAllDay: config.countdownAllDay === true,
  });
  // Split multi-day rows show only the true partial time on their first and
  // last days; middle days arrive here with isAllDay set.
  const timeLabel = segment === 'first'
    ? t('fullscreen-calendar.fromTime', { time: startLabel })
    : segment === 'last'
      ? t('fullscreen-calendar.untilTime', { time: endLabel })
      : `${startLabel} – ${endLabel}`;

  let ariaLabel: string;
  if (isAllDay) {
    ariaLabel = event.location
      ? `${t('fullscreen-calendar.ariaLabels.eventAllDay', { title: event.title })}, ${event.location}`
      : t('fullscreen-calendar.ariaLabels.eventAllDay', { title: event.title });
  } else if (event.location) {
    ariaLabel = t('fullscreen-calendar.ariaLabels.eventTimedAtLocation', {
      title: event.title,
      start: startLabel,
      end: endLabel,
      location: event.location,
    });
  } else {
    ariaLabel = t('fullscreen-calendar.ariaLabels.eventTimed', {
      title: event.title,
      start: startLabel,
      end: endLabel,
    });
  }

  return (
    <div
      className="fsc-event-block"
      data-event-id={event.id}
      role="article"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: scale.bu * 0.8,
        padding: `${scale.bu * 0.7}px 0`,
      }}
    >
      <div style={{
        width: fontSize * 0.6,
        height: fontSize * 0.6,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        marginTop: fontSize * 0.35,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: fontSize * 0.8,
          fontWeight: 500,
          color: 'var(--cal-text-tertiary)',
          display: 'flex',
          alignItems: 'center',
          gap: scale.bu * 0.6,
        }}>
          {isAllDay ? (
            <span style={{
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: fontSize * 0.7,
            }}>
              {t('fullscreen-calendar.allDay')}
            </span>
          ) : (
            timeLabel
          )}
          {status.countdown && <CountdownPill label={status.countdown} fontSize={fontSize} />}
        </div>
        <div style={{
          fontSize: fontSize * 1.2,
          fontWeight: 500,
          color: 'var(--cal-text-primary)',
        }}>
          {event.title}
        </div>
        {event.location && (
          <div style={{
            fontSize: fontSize * 0.75,
            color: 'var(--cal-text-tertiary)',
            marginTop: 1,
          }}>
            {event.location}
          </div>
        )}
        {!isAllDay && weather && (
          <EventWeatherLine weather={weather} start={start} fontSize={fontSize} marginTop={2} />
        )}
        {description && (
          <div style={{
            fontSize: fontSize * 0.85,
            color: 'var(--cal-text-secondary)',
            marginTop: scale.bu * 0.25,
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
            lineHeight: 1.35,
          }}>
            {description}
          </div>
        )}
        {status.progress != null && (
          <EventProgressBar fraction={status.progress} fontSize={fontSize} />
        )}
      </div>
    </div>
  );
}
