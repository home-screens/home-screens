'use client';

import { useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameDay, isSameMonth, getWeek,
} from 'date-fns';
import { isEventOnDay } from '@/lib/calendar-utils';
import type { CalendarEvent, CalendarScale } from './FullscreenCalendarModule';
import type { FullscreenCalendarConfig } from '@/types/config';

interface MonthGridViewProps {
  events: CalendarEvent[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
}

export function MonthGridView({ events, config, scale, today, now: _now }: MonthGridViewProps) {
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const showWeekNumbers = config.monthShowWeekNumbers;

  // Build calendar grid cells
  const { cells, weekCount } = useMemo(() => {
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const result: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      result.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return { cells: result, weekCount: Math.ceil(result.length / 7) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- today is a new Date object each render; toDateString() gives a stable key that only changes when the day changes
  }, [today.toDateString()]);

  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div role="grid" aria-label={format(today, 'MMMM yyyy')} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Day-of-week header */}
      <div role="row" style={{
        display: 'grid',
        gridTemplateColumns: showWeekNumbers ? `${scale.bu * 3}px repeat(7, 1fr)` : 'repeat(7, 1fr)',
        borderBottom: '1px solid var(--cal-border)',
        flexShrink: 0,
      }}>
        {showWeekNumbers && <div role="columnheader" />}
        {dowLabels.map((label, i) => (
          <div key={i} role="columnheader" style={{
            textAlign: 'center',
            padding: `${scale.bu * 0.5}px 0`,
            fontSize: fontSize * 0.7,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--cal-text-tertiary)',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: showWeekNumbers ? `${scale.bu * 3}px repeat(7, 1fr)` : 'repeat(7, 1fr)',
        gridTemplateRows: `repeat(${weekCount}, 1fr)`,
        flex: 1,
        minHeight: 0,
      }}>
        {cells.map((day, i) => {
          const dow = i % 7;
          const isToday = isSameDay(day, today);
          const isCurrentMonth = isSameMonth(day, today);
          const isWeekend = dow === 0 || dow === 6;

          // Week number column
          const showWeekNum = showWeekNumbers && dow === 0;

          const dayEvents = events.filter(ev => isEventOnDay(ev, day));
          const allDayEvs = dayEvents.filter(ev => ev.allDay);
          const timedEvs = dayEvents.filter(ev => !ev.allDay);

          // Auto-calculate max visible events from approximate cell height
          const approxCellHeight = (scale.height - scale.bu * 7) / weekCount;
          const autoMax = config.monthMaxEventsPerCell > 0
            ? config.monthMaxEventsPerCell
            : Math.max(2, Math.floor((approxCellHeight - fontSize * 2) / (fontSize * 1.0)));
          const maxShow = Math.max(1, autoMax - allDayEvs.length);
          const overflow = timedEvs.length > maxShow ? timedEvs.length - maxShow : 0;

          return (
            <div key={day.toISOString()} style={{ display: 'contents' }}>
              {showWeekNum && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  paddingTop: scale.bu * 0.4,
                  fontSize: fontSize * 0.5,
                  fontWeight: 500,
                  color: 'var(--cal-text-tertiary)',
                  borderBottom: '1px solid var(--cal-border-subtle)',
                  gridRow: `span 1`,
                }}>
                  {getWeek(day)}
                </div>
              )}
              <div
                role="gridcell"
                aria-label={`${format(day, 'MMMM d')}, ${dayEvents.length} events`}
                style={{
                  borderRight: dow < 6 ? '1px solid var(--cal-border-subtle)' : undefined,
                  borderBottom: '1px solid var(--cal-border-subtle)',
                  borderLeft: isToday ? '2px solid var(--cal-accent)' : undefined,
                  padding: scale.bu * 0.3,
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: isCurrentMonth ? 1 : 0.35,
                  background: isToday
                    ? 'var(--cal-accent-bg)'
                    : isWeekend && config.shadeWeekends
                      ? 'var(--cal-weekend-shade)'
                      : undefined,
                }}
              >
                {/* Day number */}
                <div style={{ marginBottom: scale.bu * 0.15 }}>
                  {isToday ? (
                    <span className="fsc-today-pulse" style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: fontSize * 1.5,
                      height: fontSize * 1.5,
                      borderRadius: '50%',
                      background: 'var(--cal-accent)',
                      color: '#fff',
                      fontSize: fontSize * 0.8,
                      fontWeight: 600,
                    }}>
                      {format(day, 'd')}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: fontSize * 0.85,
                      fontWeight: 600,
                      color: 'var(--cal-text-primary)',
                    }}>
                      {format(day, 'd')}
                    </span>
                  )}
                </div>

                {/* All-day span bars */}
                {allDayEvs.map(ev => {
                  const color = ev.calendarColor ?? '#3B82F6';
                  return (
                    <div key={ev.id} className="fsc-event-block" style={{
                      fontSize: fontSize * 0.55,
                      fontWeight: 600,
                      color: '#fff',
                      padding: `${scale.bu * 0.05}px ${scale.bu * 0.3}px`,
                      borderRadius: 2,
                      background: color,
                      marginBottom: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {ev.title}
                    </div>
                  );
                })}

                {/* Event pills */}
                {timedEvs.slice(0, maxShow).map(ev => {
                  const color = ev.calendarColor ?? '#3B82F6';
                  return (
                    <div key={ev.id} className="fsc-event-block" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: scale.bu * 0.2,
                      padding: `${scale.bu * 0.05}px ${scale.bu * 0.2}px`,
                      marginBottom: 1,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: fontSize * 0.35,
                        height: fontSize * 0.35,
                        borderRadius: '50%',
                        background: color,
                        flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: fontSize * 0.55,
                        fontWeight: 500,
                        color: 'var(--cal-text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {ev.title}
                      </span>
                    </div>
                  );
                })}

                {/* Overflow */}
                {overflow > 0 && (
                  <div style={{
                    fontSize: fontSize * 0.5,
                    fontWeight: 600,
                    color: 'var(--cal-text-tertiary)',
                    padding: `0 ${scale.bu * 0.2}px`,
                  }}>
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
