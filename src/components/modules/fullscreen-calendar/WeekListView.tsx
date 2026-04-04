'use client';

import { useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { parseEventDate, isEventOnDay, compareEventStarts } from '@/lib/calendar-utils';
import type { CalendarEvent, CalendarScale } from './FullscreenCalendarModule';
import type { FullscreenCalendarConfig } from '@/types/config';

interface WeekListViewProps {
  events: CalendarEvent[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
}

export function WeekListView({ events, config, scale, today, now: _now }: WeekListViewProps) {
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const isLandscape = scale.orientation === 'landscape';

  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weekStart is a new Date object each render; toDateString() gives a stable string key that only changes when the day changes
    [weekStart.toDateString()],
  );

  // Landscape: split Mon-Thu and Fri-Sun
  const leftDays = isLandscape ? days.slice(0, 4) : days;
  const rightDays = isLandscape ? days.slice(4) : [];

  function renderDay(day: Date) {
    const isToday = isSameDay(day, today);
    const isPast = day < today && !isToday;
    const dayEvents = events.filter(ev => isEventOnDay(ev, day));
    const allDayEvs = dayEvents.filter(ev => ev.allDay);
    const timedEvs = dayEvents
      .filter(ev => !ev.allDay)
      .sort((a, b) => compareEventStarts(a.start, b.start));

    const shouldCollapse = isPast && config.weekCollapsePastDays;

    return (
      <div
        key={day.toISOString()}

        style={{
          marginBottom: scale.bu * 0.4,
          opacity: isPast && config.dimPastEvents ? 0.5 : 1,
          borderLeft: isToday ? `3px solid var(--cal-accent)` : undefined,
          paddingLeft: isToday ? scale.bu * 1.2 : undefined,
          marginLeft: isToday ? -scale.bu * 1.5 : undefined,
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
          {format(day, 'EEEE, MMMM d')}
          {isToday && (
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
              Today
            </span>
          )}
        </div>

        {!shouldCollapse && (<>
          {/* All-day events */}
          {allDayEvs.map(ev => (
            <EventRow key={ev.id} event={ev} fontSize={fontSize} scale={scale} isAllDay />
          ))}

          {/* Timed events */}
          {timedEvs.map(ev => (
            <EventRow key={ev.id} event={ev} fontSize={fontSize} scale={scale} />
          ))}

          {/* Empty day */}
          {dayEvents.length === 0 && (
            <div style={{
              padding: `${scale.bu * 0.7}px 0`,
              fontSize: fontSize * 0.95,
              fontStyle: 'italic',
              color: 'var(--cal-text-tertiary)',
            }}>
              No events
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

function EventRow({ event, fontSize, scale, isAllDay }: {
  event: CalendarEvent;
  fontSize: number;
  scale: CalendarScale;
  isAllDay?: boolean;
}) {
  const color = event.calendarColor ?? '#3B82F6';
  const start = parseEventDate(event.start);
  const end = parseEventDate(event.end);

  return (
    <div
      className="fsc-event-block"
      role="article"
      aria-label={`${event.title}${isAllDay ? ', all day' : `, ${format(start, 'h:mm a')} to ${format(end, 'h:mm a')}`}${event.location ? `, at ${event.location}` : ''}`}
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
        }}>
          {isAllDay ? (
            <span style={{
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: fontSize * 0.7,
            }}>
              All Day
            </span>
          ) : (
            `${format(start, 'h:mm a')} \u2013 ${format(end, 'h:mm a')}`
          )}
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
      </div>
    </div>
  );
}
