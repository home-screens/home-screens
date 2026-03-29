'use client';

import { useMemo } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { parseEventDate, isEventOnDay, compareEventStarts } from '@/lib/calendar-utils';
import { MapPin } from './FullscreenCalendarModule';
import type { CalendarEvent, CalendarScale } from './FullscreenCalendarModule';
import type { FullscreenCalendarConfig } from '@/types/config';

interface AgendaViewProps {
  events: CalendarEvent[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
}

export function AgendaView({ events, config, scale, today, now }: AgendaViewProps) {
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const daysAhead = config.agendaDaysAhead ?? 14;
  const isLandscape = scale.orientation === 'landscape';

  const dayGroups = useMemo(() => {
    const groups: { date: Date; events: CalendarEvent[] }[] = [];
    for (let i = 0; i < daysAhead; i++) {
      const date = addDays(today, i);
      const dayEvents = events
        .filter(ev => isEventOnDay(ev, date))
        .sort((a, b) => {
          // All-day events first
          if (a.allDay && !b.allDay) return -1;
          if (!a.allDay && b.allDay) return 1;
          return compareEventStarts(a.start, b.start);
        });

      if (config.agendaHideEmptyDays && dayEvents.length === 0) continue;
      groups.push({ date, events: dayEvents });
    }
    return groups;
  }, [events, today, daysAhead, config.agendaHideEmptyDays]);

  function renderDayGroup({ date, events: dayEvents }: { date: Date; events: CalendarEvent[] }) {
    const isGroupToday = isSameDay(date, today);

    return (
      <div key={date.toISOString()}>
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
          {format(date, 'EEEE, MMMM d')}
          {isGroupToday && (
            <span style={{
              fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
              fontSize: fontSize * 0.65,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--cal-accent)',
            }}>
              &middot; Today
            </span>
          )}
        </div>

        {/* Event cards */}
        {dayEvents.length === 0 && (
          <div style={{
            fontSize: fontSize * 0.95,
            fontStyle: 'italic',
            color: 'var(--cal-text-tertiary)',
            padding: `${scale.bu * 0.5}px 0`,
          }}>
            No events
          </div>
        )}

        {dayEvents.map(ev => {
          const color = ev.calendarColor ?? '#3B82F6';
          const start = parseEventDate(ev.start);
          const end = parseEventDate(ev.end);
          const nowHour = now.getHours() + now.getMinutes() / 60;
          const isPast = isGroupToday && !ev.allDay &&
            (end.getHours() + end.getMinutes() / 60) <= nowHour;

          if (ev.allDay) {
            return (
              <div
                key={ev.id}
                className="fsc-event-block"
                role="article"
                aria-label={`${ev.title}, all day`}
                style={{
                  background: 'var(--cal-surface)',
                  borderRadius: 10,
                  borderLeft: `4px solid ${color}`,
                  padding: `${scale.bu * 0.6}px ${scale.bu * 1.0}px`,
                  marginBottom: scale.bu * 0.6,
                  boxShadow: 'var(--cal-card-shadow)',
                }}
              >
                <div style={{
                  fontSize: fontSize * 0.65,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--cal-text-tertiary)',
                }}>
                  All Day
                </div>
                <div style={{
                  fontSize: fontSize * 1.2,
                  fontWeight: 600,
                  color: 'var(--cal-text-primary)',
                }}>
                  {ev.title}
                </div>
              </div>
            );
          }

          return (
            <div
              key={ev.id}
              className="fsc-event-block"
              role="article"
              aria-label={`${ev.title}, ${format(start, 'h:mm a')} to ${format(end, 'h:mm a')}${ev.location ? `, at ${ev.location}` : ''}`}
              style={{
                background: 'var(--cal-surface)',
                borderRadius: 10,
                borderLeft: `4px solid ${color}`,
                padding: `${scale.bu * 0.7}px ${scale.bu * 1.0}px`,
                marginBottom: scale.bu * 0.6,
                boxShadow: 'var(--cal-card-shadow)',
                opacity: isPast && config.dimPastEvents ? 0.4 : 1,
              }}
            >
              <div style={{
                fontSize: fontSize * 0.8,
                fontWeight: 500,
                color: 'var(--cal-text-tertiary)',
                marginBottom: scale.bu * 0.1,
              }}>
                {format(start, 'h:mm a')} &ndash; {format(end, 'h:mm a')}
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
            </div>
          );
        })}
      </div>
    );
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
          overflowY: 'auto',
          padding: `0 ${scale.bu * 1.4}px ${scale.bu * 2}px`,
        }}>
          {leftGroups.map(renderDayGroup)}
        </div>
        <div style={{
          overflowY: 'auto',
          padding: `0 ${scale.bu * 1.4}px ${scale.bu * 2}px`,
        }}>
          {rightGroups.map(renderDayGroup)}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: `0 ${scale.bu * 1.4}px ${scale.bu * 2}px`,
    }}>
      {dayGroups.map(renderDayGroup)}
    </div>
  );
}
