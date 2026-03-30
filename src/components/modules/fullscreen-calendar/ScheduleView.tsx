'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { parseEventDate, isEventOnDay } from '@/lib/calendar-utils';
import { autoScheduleDays, computeOverlapColumns, eventBg, eventBorder } from './FullscreenCalendarModule';
import type { CalendarEvent, CalendarScale } from './FullscreenCalendarModule';
import type { FullscreenCalendarConfig } from '@/types/config';

interface ScheduleViewProps {
  events: CalendarEvent[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
}

function parseTimeToHours(dateStr: string): number {
  const d = parseEventDate(dateStr);
  return d.getHours() + d.getMinutes() / 60;
}

export function ScheduleView({ events, config, scale, today, now }: ScheduleViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);
  const hourStart = config.scheduleHourStart ?? 6;
  const hourEnd = config.scheduleHourEnd ?? 22;
  const totalHours = hourEnd - hourStart;

  // Business hours for visual differentiation
  const businessStart = 8;
  const businessEnd = 18;

  const daysToShow = config.scheduleDaysToShow > 0
    ? config.scheduleDaysToShow
    : autoScheduleDays(scale.width, config.density);

  // Start from today so the display always shows upcoming events
  const days = useMemo(
    () => Array.from({ length: daysToShow }, (_, i) => addDays(today, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today.toDateString(), daysToShow],
  );

  // Measure scroll container so hourHeight fills available space
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setContainerH(el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      setContainerH(entries[0]?.contentRect.height ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit grid exactly to container — no scrolling on kiosk display
  const gutterWidth = scale.bu * 4.5;
  const baseHourHeight = scale.bu * (config.density === 'cozy' ? 5.5 : 4.5);
  const hourHeight = containerH > 0 ? containerH / totalHours : baseHourHeight;
  const gridHeight = totalHours * hourHeight;
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;

  // Current time position (timezone-aware, updates every 60s via parent)
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowInRange = nowHour >= hourStart && nowHour <= hourEnd;
  const nowY = (nowHour - hourStart) * hourHeight;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Column headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--cal-border)', flexShrink: 0 }} role="row">
        <div style={{ width: gutterWidth, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${daysToShow}, 1fr)` }}>
          {days.map((day) => {
            const isToday = isSameDay(day, today);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <div
                key={day.toISOString()}
                role="columnheader"
                style={{
                  textAlign: 'center',
                  padding: `${scale.bu * 0.8}px ${scale.bu * 0.2}px ${scale.bu * 0.6}px`,
                  borderLeft: '1px solid var(--cal-border-subtle)',
                }}
              >
                <div style={{
                  fontSize: fontSize * 0.9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: isWeekend ? 'var(--cal-text-tertiary)' : 'var(--cal-text-secondary)',
                }}>
                  {format(day, 'EEE')}
                </div>
                <div style={{
                  fontSize: fontSize * 1.5,
                  fontWeight: 600,
                  color: 'var(--cal-text-primary)',
                  lineHeight: 1,
                  marginTop: scale.bu * 0.2,
                }}>
                  {isToday ? (
                    <span className="fsc-today-pulse" style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: fontSize * 2.0,
                      height: fontSize * 2.0,
                      borderRadius: '50%',
                      background: 'var(--cal-accent)',
                      color: '#fff',
                    }}>
                      {format(day, 'd')}
                    </span>
                  ) : format(day, 'd')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* All-day events row */}
      <AllDayRow events={events} days={days} config={config} scale={scale} gutterWidth={gutterWidth} fontSize={fontSize} today={today} />

      {/* Time grid */}
      <div ref={scrollRef} role="grid" aria-label="Schedule time grid" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', height: gridHeight, position: 'relative' }}>
          {/* Time gutter */}
          <div style={{ width: gutterWidth, flexShrink: 0, position: 'relative' }}>
            {Array.from({ length: totalHours + 1 }, (_, i) => {
              const h = hourStart + i;
              const label = h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
              const isCurrentHour = nowInRange && Math.floor(nowHour) === h;
              return (
                <div
                  key={h}
                  style={{
                    position: 'absolute',
                    top: i * hourHeight,
                    right: scale.bu * 0.5,
                    fontSize: fontSize * 0.75,
                    fontWeight: isCurrentHour ? 600 : 400,
                    color: isCurrentHour ? 'var(--cal-text-primary)' : 'var(--cal-text-tertiary)',
                    transform: 'translateY(-50%)',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {label}
                </div>
              );
            })}
            {/* Now badge in gutter */}
            {config.showNowLine && nowInRange && (
              <div style={{
                position: 'absolute',
                top: nowY,
                right: scale.bu * 0.3,
                transform: 'translateY(-50%)',
                fontSize: fontSize * 0.7,
                fontWeight: 600,
                color: '#fff',
                background: 'var(--cal-accent)',
                borderRadius: 999,
                padding: `${scale.bu * 0.15}px ${scale.bu * 0.5}px`,
                whiteSpace: 'nowrap',
                zIndex: 11,
                lineHeight: 1.3,
              }}>
                {format(now, 'h:mm')}
              </div>
            )}
          </div>

          {/* Day columns */}
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${daysToShow}, 1fr)`,
            position: 'relative',
          }}>
            {days.map((day) => {
              const isToday = isSameDay(day, today);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const isPast = day < today && !isToday;
              const dayEvents = events.filter(ev => !ev.allDay && isEventOnDay(ev, day));

              // Compute overlap layout for this day's events
              const layoutInput = dayEvents.map(ev => ({
                id: ev.id,
                startHour: Math.max(parseTimeToHours(ev.start), hourStart),
                endHour: Math.min(
                  parseTimeToHours(ev.end) <= parseTimeToHours(ev.start) ? hourEnd : parseTimeToHours(ev.end),
                  hourEnd,
                ),
              }));
              const overlapLayout = computeOverlapColumns(layoutInput);

              return (
                <div
                  key={day.toISOString()}
                  role="gridcell"
                  aria-label={format(day, 'EEEE, MMMM d')}
                  style={{
                    position: 'relative',
                    borderLeft: '1px solid var(--cal-border-subtle)',
                    background: isToday
                      ? 'var(--cal-accent-bg)'
                      : isWeekend && config.shadeWeekends
                        ? 'var(--cal-weekend-shade)'
                        : undefined,
                    opacity: isPast && config.dimPastEvents ? 'var(--cal-past-opacity)' as unknown as number : 1,
                  }}
                >
                  {/* Hour lines */}
                  {Array.from({ length: totalHours + 1 }, (_, i) => {
                    const h = hourStart + i;
                    const isOffHours = h < businessStart || h >= businessEnd;
                    return (
                      <div key={`h-${i}`}>
                        <div style={{
                          position: 'absolute',
                          top: i * hourHeight,
                          left: 0,
                          right: 0,
                          height: 1,
                          background: 'var(--cal-border)',
                          opacity: isOffHours ? 0.5 : 1,
                        }} />
                        {i < totalHours && (
                          <div style={{
                            position: 'absolute',
                            top: i * hourHeight + hourHeight / 2,
                            left: 0,
                            right: 0,
                            height: 1,
                            borderTop: '1px dashed var(--cal-border-subtle)',
                            opacity: isOffHours ? 0.5 : 1,
                          }} />
                        )}
                      </div>
                    );
                  })}

                  {/* Events with overlap layout */}
                  {dayEvents.map((ev) => {
                    const rawStart = parseTimeToHours(ev.start);
                    const rawEnd = parseTimeToHours(ev.end);
                    const evStart = Math.max(rawStart, hourStart);
                    const evEnd = rawEnd <= rawStart ? hourEnd : Math.min(rawEnd, hourEnd);
                    if (evStart >= hourEnd || evEnd <= hourStart) return null;

                    const layout = overlapLayout.get(ev.id);
                    if (!layout || layout.width === 0) return null; // overflow hidden

                    const top = (evStart - hourStart) * hourHeight;
                    const height = Math.max((evEnd - evStart) * hourHeight, fontSize * 1.5);
                    const color = ev.calendarColor ?? '#3B82F6';
                    const isPastEvent = isToday && evEnd <= nowHour;

                    return (
                      <div
                        key={ev.id}
                        className="fsc-event-block"
                        role="article"
                        aria-label={`${ev.title}, ${format(parseEventDate(ev.start), 'h:mm a')} to ${format(parseEventDate(ev.end), 'h:mm a')}${ev.location ? `, at ${ev.location}` : ''}`}
                        style={{
                          position: 'absolute',
                          top,
                          height,
                          left: `calc(${layout.left * 100}% + 2px)`,
                          width: `calc(${layout.width * 100}% - 4px)`,
                          borderRadius: scale.bu * 0.4,
                          borderLeft: `3px solid ${eventBorder(color, scale.isDark)}`,
                          background: eventBg(color, 0.09, scale.isDark),
                          padding: `${scale.bu * 0.3}px ${scale.bu * 0.5}px`,
                          overflow: 'hidden',
                          zIndex: 2,
                          opacity: isPastEvent && config.dimPastEvents ? 0.4 : 1,
                        }}
                      >
                        <div style={{
                          fontSize: fontSize * 0.85,
                          fontWeight: 600,
                          color: 'var(--cal-text-primary)',
                          lineHeight: 1.3,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {ev.title}
                        </div>
                        {height >= fontSize * 2 && (
                          <div style={{
                            fontSize: fontSize * 0.7,
                            color: 'var(--cal-text-secondary)',
                            lineHeight: 1.3,
                          }}>
                            {format(parseEventDate(ev.start), 'h:mm a')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Now line spanning all columns */}
            {config.showNowLine && nowInRange && (
              <div
                aria-label={`Current time: ${format(now, 'h:mm a')}`}
                style={{
                  position: 'absolute',
                  top: nowY,
                  left: 0,
                  right: 0,
                  height: 2,
                  color: 'var(--cal-accent)',
                  background: 'var(--cal-accent)',
                  zIndex: 10,
                  pointerEvents: 'none',
                  filter: 'drop-shadow(0 0 4px currentColor)',
                }}
              >
                <div style={{
                  position: 'absolute',
                  left: -4,
                  top: -3,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--cal-accent)',
                }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── All-Day Events Row ───

function AllDayRow({ events, days, config, scale, gutterWidth, fontSize, today }: {
  events: CalendarEvent[];
  days: Date[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  gutterWidth: number;
  fontSize: number;
  today: Date;
}) {
  const hasAllDay = days.some(day => events.some(ev => ev.allDay && isEventOnDay(ev, day)));
  if (!hasAllDay) return null;

  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--cal-border)',
      flexShrink: 0,
      minHeight: fontSize * 2,
    }}>
      <div style={{
        width: gutterWidth,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: fontSize * 0.6,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--cal-text-tertiary)',
      }}>
        All Day
      </div>
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `repeat(${days.length}, 1fr)`,
      }}>
        {days.map((day) => {
          const dayAllDay = events.filter(ev => ev.allDay && isEventOnDay(ev, day));
          const isPast = day < today && !isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              style={{
                padding: `${scale.bu * 0.3}px ${scale.bu * 0.2}px`,
                borderLeft: '1px solid var(--cal-border-subtle)',
                opacity: isPast && config.dimPastEvents ? 0.4 : 1,
              }}
            >
              {dayAllDay.map(ev => {
                const color = ev.calendarColor ?? '#3B82F6';
                return (
                  <div
                    key={ev.id}
                    className="fsc-event-block"
                    aria-label={`${ev.title}, all day`}
                    style={{
                      fontSize: fontSize * 0.65,
                      fontWeight: 600,
                      padding: `${scale.bu * 0.1}px ${scale.bu * 0.3}px`,
                      borderRadius: 3,
                      background: eventBg(color, 0.13, scale.isDark),
                      color: eventBorder(color, scale.isDark),
                      border: `1px solid ${eventBg(color, 0.20, scale.isDark)}`,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.4,
                      marginBottom: 1,
                    }}
                  >
                    {ev.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
