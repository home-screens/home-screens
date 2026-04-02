'use client';

import { format, isSameDay } from 'date-fns';
import { parseEventDate, isEventOnDay } from '@/lib/calendar-utils';
import { computeOverlapColumns, MapPin, eventBg, eventBorder } from './FullscreenCalendarModule';
import type { CalendarEvent, CalendarScale } from './FullscreenCalendarModule';
import type { FullscreenCalendarConfig } from '@/types/config';
import { parseTimeToHours, formatHourLabel, useContainerHeight, HourLines, NowLine, NowBadge } from './shared-time-grid';

interface DayTimelineViewProps {
  events: CalendarEvent[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
}

export function DayTimelineView({ events, config, scale, today, now }: DayTimelineViewProps) {
  const { scrollRef, containerH } = useContainerHeight();
  const hourStart = config.dayHourStart ?? 6;
  const hourEnd = config.dayHourEnd ?? 22;
  const totalHours = hourEnd - hourStart;
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const gutterWidth = scale.bu * 5.5;

  // Fit grid exactly to container — no scrolling on kiosk display
  const baseHourHeight = scale.bu * (config.density === 'cozy' ? 6.5 : 5.5);
  const hourHeight = containerH > 0 ? containerH / totalHours : baseHourHeight;
  const gridHeight = totalHours * hourHeight;

  const dayEvents = events.filter(ev => isEventOnDay(ev, today));
  const allDayEvs = dayEvents.filter(ev => ev.allDay);
  const timedEvs = dayEvents.filter(ev => !ev.allDay);

  const isToday = isSameDay(now, today);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowInRange = isToday && nowHour >= hourStart && nowHour <= hourEnd;
  const nowY = (nowHour - hourStart) * hourHeight;

  // Zone boundaries
  const morningEnd = 12;
  const afternoonEnd = 17;

  // Compute overlap layout for timed events
  const layoutInput = timedEvs.map(ev => ({
    id: ev.id,
    startHour: Math.max(parseTimeToHours(ev.start), hourStart),
    endHour: Math.min(
      parseTimeToHours(ev.end) <= parseTimeToHours(ev.start) ? hourEnd : parseTimeToHours(ev.end),
      hourEnd,
    ),
  }));
  const overlapLayout = computeOverlapColumns(layoutInput);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* All-day strip */}
      {allDayEvs.length > 0 && (
        <div style={{
          padding: `${scale.bu * 0.8}px ${scale.bu * 1.5}px`,
          borderBottom: '1px solid var(--cal-border)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: fontSize * 0.65,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--cal-text-tertiary)',
            marginBottom: scale.bu * 0.3,
          }}>
            All Day
          </div>
          {allDayEvs.map(ev => {
            const color = ev.calendarColor ?? '#3B82F6';
            return (
              <div key={ev.id} className="fsc-event-block" aria-label={`${ev.title}, all day`} style={{
                padding: `${scale.bu * 0.3}px ${scale.bu * 0.8}px`,
                borderRadius: 6,
                background: eventBg(color, 0.13, scale.isDark),
                color: eventBorder(color, scale.isDark),
                border: `1px solid ${eventBg(color, 0.19, scale.isDark)}`,
                fontSize: fontSize * 0.95,
                fontWeight: 600,
                marginBottom: scale.bu * 0.2,
              }}>
                {ev.title}
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div ref={scrollRef} aria-label="Day timeline" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', height: gridHeight, position: 'relative' }}>
          {/* Time gutter */}
          <div style={{ width: gutterWidth, flexShrink: 0, position: 'relative' }}>
            {Array.from({ length: totalHours + 1 }, (_, i) => {
              const h = hourStart + i;
              return (
                <div key={h} style={{
                  position: 'absolute',
                  top: i * hourHeight,
                  right: scale.bu * 0.6,
                  fontSize: fontSize * 0.8,
                  fontWeight: 500,
                  color: 'var(--cal-text-tertiary)',
                  transform: 'translateY(-50%)',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatHourLabel(h)}
                </div>
              );
            })}
            {/* Now badge */}
            {config.showNowLine && nowInRange && (
              <NowBadge nowY={nowY} now={now} scale={scale} fontSize={fontSize} position="left" timeFormat="h:mm a" />
            )}
          </div>

          {/* Events area */}
          <div style={{
            flex: 1,
            position: 'relative',
            borderLeft: '1px solid var(--cal-border-subtle)',
          }}>
            {/* Zone tints + labels */}
            {hourStart < morningEnd && (
              <>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: (Math.min(morningEnd, hourEnd) - hourStart) * hourHeight,
                  background: 'rgba(251,191,36,0.03)',
                  pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute',
                  top: scale.bu * 0.3,
                  left: scale.bu * 0.5,
                  fontSize: fontSize * 0.55,
                  fontWeight: 400,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--cal-text-tertiary)',
                  opacity: 0.6,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}>
                  Morning
                </div>
              </>
            )}
            {hourStart < afternoonEnd && hourEnd > morningEnd && (
              <>
                <div style={{
                  position: 'absolute',
                  top: (Math.max(morningEnd, hourStart) - hourStart) * hourHeight,
                  left: 0,
                  right: 0,
                  height: (Math.min(afternoonEnd, hourEnd) - Math.max(morningEnd, hourStart)) * hourHeight,
                  background: 'rgba(59,130,246,0.03)',
                  pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute',
                  top: (Math.max(morningEnd, hourStart) - hourStart) * hourHeight + scale.bu * 0.3,
                  left: scale.bu * 0.5,
                  fontSize: fontSize * 0.55,
                  fontWeight: 400,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--cal-text-tertiary)',
                  opacity: 0.6,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}>
                  Afternoon
                </div>
              </>
            )}
            {hourEnd > afternoonEnd && (
              <>
                <div style={{
                  position: 'absolute',
                  top: (Math.max(afternoonEnd, hourStart) - hourStart) * hourHeight,
                  left: 0,
                  right: 0,
                  height: (hourEnd - Math.max(afternoonEnd, hourStart)) * hourHeight,
                  background: 'rgba(139,92,246,0.03)',
                  pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute',
                  top: (Math.max(afternoonEnd, hourStart) - hourStart) * hourHeight + scale.bu * 0.3,
                  left: scale.bu * 0.5,
                  fontSize: fontSize * 0.55,
                  fontWeight: 400,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--cal-text-tertiary)',
                  opacity: 0.6,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}>
                  Evening
                </div>
              </>
            )}

            {/* Hour lines */}
            <HourLines totalHours={totalHours} hourHeight={hourHeight} hourStart={hourStart} />

            {/* Events with overlap layout */}
            {timedEvs.map(ev => {
              const rawStart = parseTimeToHours(ev.start);
              const rawEnd = parseTimeToHours(ev.end);
              const evStart = Math.max(rawStart, hourStart);
              const evEnd = rawEnd <= rawStart ? hourEnd : Math.min(rawEnd, hourEnd);
              if (evStart >= hourEnd || evEnd <= hourStart) return null;

              const layout = overlapLayout.get(ev.id);
              if (!layout || layout.width === 0) return null;

              const top = (evStart - hourStart) * hourHeight;
              const height = Math.max((evEnd - evStart) * hourHeight, fontSize * 2.5);
              const color = ev.calendarColor ?? '#3B82F6';
              const isPast = isToday && evEnd <= nowHour;

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
                    left: `calc(${layout.left * 100}% + ${scale.bu * 0.8}px)`,
                    width: `calc(${layout.width * 100}% - ${scale.bu * 1.6}px)`,
                    borderRadius: 8,
                    borderLeft: `4px solid ${eventBorder(color, scale.isDark)}`,
                    background: eventBg(color, 0.08, scale.isDark),
                    padding: `${scale.bu * 0.6}px ${scale.bu * 0.8}px`,
                    overflow: 'hidden',
                    zIndex: 2,
                    opacity: isPast && config.dimPastEvents ? 0.4 : 1,
                  }}
                >
                  <div style={{
                    fontSize: fontSize * 1.1,
                    fontWeight: 600,
                    color: 'var(--cal-text-primary)',
                  }}>
                    {ev.title}
                  </div>
                  <div style={{
                    fontSize: fontSize * 0.8,
                    color: 'var(--cal-text-secondary)',
                    marginTop: 1,
                  }}>
                    {format(parseEventDate(ev.start), 'h:mm a')} &ndash; {format(parseEventDate(ev.end), 'h:mm a')}
                  </div>
                  {config.dayShowLocation && ev.location && (
                    <div style={{
                      fontSize: fontSize * 0.7,
                      color: 'var(--cal-text-tertiary)',
                      marginTop: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}>
                      <MapPin size={fontSize * 0.6} aria-hidden="true" />
                      {ev.location}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Now line */}
            {config.showNowLine && nowInRange && <NowLine nowY={nowY} now={now} />}
          </div>
        </div>
      </div>
    </div>
  );
}
