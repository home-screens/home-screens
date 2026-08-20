'use client';

import { useMemo } from 'react';
import { addDays, isSameDay } from 'date-fns';
import { parseEventDate, isEventOnDay, sanitizeEventDescription, formatEventTime, resolveScheduleStart, weekStartsOnFor } from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { autoScheduleDays, eventBg, eventBorder, clampStyle } from './FullscreenCalendarModule';
import { computeTimedEventLayout, eventHoursOnDay } from './event-layout';
import { DayWeatherBadge } from './WeatherInline';
import type { CalendarEvent, CalendarScale, CalendarWeather } from './FullscreenCalendarModule';
import { DEFAULT_TIME_FORMAT, type FullscreenCalendarConfig, type TimeFormat } from '@/types/config';
import { formatHourLabel, useContainerHeight, HourLines, NowLine, NowBadge } from './shared-time-grid';

interface ScheduleViewProps {
  events: CalendarEvent[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
  timeFormat?: TimeFormat;
  weather?: CalendarWeather;
}

export function ScheduleView({ events, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, weather }: ScheduleViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const am = t('fullscreen-calendar.am');
  const pm = t('fullscreen-calendar.pm');
  const { scrollRef, containerH } = useContainerHeight();
  const hourStart = config.scheduleHourStart ?? 6;
  const hourEnd = config.scheduleHourEnd ?? 22;
  const totalHours = hourEnd - hourStart;

  const highlightStyle = config.todayHighlightStyle ?? 'full';
  const showTodayBg = highlightStyle === 'full' || highlightStyle === 'subtle';
  const showTodayMarker = highlightStyle !== 'off';
  const overlapMode = config.eventOverlap ?? 'columns';
  const wrapTitles = config.wrapEventTitles === true;

  // Business hours for visual differentiation
  const businessStart = 8;
  const businessEnd = 18;

  const daysToShow = config.scheduleDaysToShow > 0
    ? config.scheduleDaysToShow
    : autoScheduleDays(scale.width, config.density);

  // First column follows the start anchor: sliding today (default), the
  // calendar-stable week start, or the upcoming weekend. Anchored modes can
  // put whole days in the past; they dim via dimPastEvents below so elapsed
  // days read as intentionally finished rather than broken.
  const scheduleStart = resolveScheduleStart(today, config.scheduleStartAnchor, weekStartsOnFor(config.startDay));
  const days = useMemo(
    () => Array.from({ length: daysToShow }, (_, i) => addDays(scheduleStart, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleStart is a new Date object each render; toDateString() gives a stable key that only changes when the day changes
    [scheduleStart.toDateString(), daysToShow],
  );

  // Fit grid exactly to container — no scrolling on kiosk display
  const gutterWidth = scale.bu * 4.5;
  const baseHourHeight = scale.bu * (config.density === 'cozy' ? 5.5 : 4.5);
  const hourHeight = containerH > 0 ? containerH / totalHours : baseHourHeight;
  const gridHeight = totalHours * hourHeight;
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;

  // Current time position (timezone-aware, updates every 60s via parent).
  // The now-line only makes sense when today is actually one of the visible
  // columns — a next-weekend anchor can render an all-future board, where a
  // live "current time" line would cut across days it doesn't belong to.
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const todayVisible = days.some(day => isSameDay(day, today));
  const nowInRange = todayVisible && nowHour >= hourStart && nowHour <= hourEnd;
  const nowY = (nowHour - hourStart) * hourHeight;

  // Per-day event filtering and overlap layout don't depend on the 60s clock
  // tick, so memoize them instead of recomputing for every day on each
  // re-render. Events entirely outside the hour range are excluded up front —
  // clamping alone would leave them as degenerate inputs that still occupy an
  // overlap column.
  const dayLayouts = useMemo(() => days.map(day => {
    const dayEvents = events.filter(ev => !ev.allDay && isEventOnDay(ev, day));
    const { overlapLayout, hiddenStarts } = computeTimedEventLayout(dayEvents, day, hourStart, hourEnd, overlapMode);
    return { dayEvents, overlapLayout, hiddenStarts };
  }), [days, events, hourStart, hourEnd, overlapMode]);

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
                  {formatDateSync(day, 'EEE', { locale })}
                </div>
                <div style={{
                  fontSize: fontSize * 1.5,
                  fontWeight: 600,
                  color: 'var(--cal-text-primary)',
                  lineHeight: 1,
                  marginTop: scale.bu * 0.2,
                }}>
                  {isToday && showTodayMarker ? (
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
                      {formatDateSync(day, 'd', { locale })}
                    </span>
                  ) : formatDateSync(day, 'd', { locale })}
                </div>
                {weather && <DayWeatherBadge weather={weather} day={day} fontSize={fontSize} align="center" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* All-day events row */}
      <AllDayRow events={events} days={days} config={config} scale={scale} gutterWidth={gutterWidth} fontSize={fontSize} today={today} t={t} />

      {/* Time grid */}
      <div ref={scrollRef} role="grid" aria-label={t('fullscreen-calendar.ariaLabels.scheduleTimeGrid')} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', height: gridHeight, position: 'relative' }}>
          {/* Time gutter */}
          <div style={{ width: gutterWidth, flexShrink: 0, position: 'relative' }}>
            {Array.from({ length: totalHours + 1 }, (_, i) => {
              const h = hourStart + i;
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
                  {formatHourLabel(h, am, pm)}
                </div>
              );
            })}
            {/* Now badge in gutter */}
            {config.showNowLine && nowInRange && (
              <NowBadge nowY={nowY} now={now} scale={scale} fontSize={fontSize} position="right" timePattern={timeFormat === '24h' ? 'HH:mm' : 'h:mm'} locale={locale} />
            )}
          </div>

          {/* Day columns */}
          <div style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: `repeat(${daysToShow}, 1fr)`,
            position: 'relative',
          }}>
            {days.map((day, dayIdx) => {
              const isToday = isSameDay(day, today);
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const isPast = day < today && !isToday;
              const { dayEvents, overlapLayout, hiddenStarts } = dayLayouts[dayIdx];

              return (
                <div
                  key={day.toISOString()}
                  role="gridcell"
                  aria-label={formatDateSync(day, 'EEEE, MMMM d', { locale })}
                  style={{
                    position: 'relative',
                    borderLeft: '1px solid var(--cal-border-subtle)',
                    background: isToday && showTodayBg
                      ? 'var(--cal-today-fill)'
                      : isWeekend && config.shadeWeekends
                        ? 'var(--cal-weekend-shade)'
                        : undefined,
                    opacity: isPast && config.dimPastEvents ? 'var(--cal-past-opacity)' : 1,
                  } as React.CSSProperties}
                >
                  {/* Hour lines */}
                  <HourLines totalHours={totalHours} hourHeight={hourHeight} hourStart={hourStart} dimOffHours={{ businessStart, businessEnd }} />

                  {/* Events with overlap layout */}
                  {dayEvents.map((ev) => {
                    const { startHour, endHour } = eventHoursOnDay(ev, day);
                    const evStart = Math.max(startHour, hourStart);
                    const evEnd = Math.min(endHour, hourEnd);
                    if (evStart >= hourEnd || evEnd <= evStart) return null;

                    const layout = overlapLayout.get(ev.id);
                    if (!layout || layout.width === 0) return null; // overflow hidden

                    const top = (evStart - hourStart) * hourHeight;
                    const height = Math.max((evEnd - evStart) * hourHeight, fontSize * 1.5);
                    const color = ev.calendarColor ?? '#3B82F6';
                    const isPastEvent = isToday && evEnd <= nowHour;

                    const evStartLabel = formatEventTime(parseEventDate(ev.start), timeFormat, locale);
                    const evEndLabel = formatEventTime(parseEventDate(ev.end), timeFormat, locale);
                    const evAriaLabel = ev.location
                      ? t('fullscreen-calendar.ariaLabels.eventTimedAtLocation', {
                          title: ev.title,
                          start: evStartLabel,
                          end: evEndLabel,
                          location: ev.location,
                        })
                      : t('fullscreen-calendar.ariaLabels.eventTimed', {
                          title: ev.title,
                          start: evStartLabel,
                          end: evEndLabel,
                        });

                    return (
                      <div
                        key={ev.id}
                        className="fsc-event-block"
                        data-event-id={ev.id}
                        role="article"
                        aria-label={evAriaLabel}
                        style={{
                          position: 'absolute',
                          top,
                          height,
                          left: `calc(${layout.left * 100}% + 2px)`,
                          width: `calc(${layout.width * 100}% - 4px)`,
                          borderRadius: scale.bu * 0.4,
                          borderLeft: `3px solid ${eventBorder(color, scale.isDark)}`,
                          background: overlapMode === 'stacked'
                            ? `linear-gradient(${eventBg(color, 0.13, scale.isDark)}, ${eventBg(color, 0.13, scale.isDark)}), var(--cal-bg)`
                            : eventBg(color, 0.09, scale.isDark),
                          padding: `${scale.bu * 0.3}px ${scale.bu * 0.5}px`,
                          overflow: 'hidden',
                          zIndex: layout.zIndex,
                          boxShadow: overlapMode === 'stacked' ? 'var(--cal-card-shadow)' : undefined,
                          opacity: isPastEvent && config.dimPastEvents ? 0.4 : 1,
                        }}
                      >
                        <div style={{
                          fontSize: fontSize * 0.85,
                          fontWeight: 600,
                          color: 'var(--cal-text-primary)',
                          lineHeight: 1.3,
                          ...clampStyle(wrapTitles),
                        }}>
                          {ev.title}
                        </div>
                        {height >= fontSize * 2 && (
                          <div style={{
                            fontSize: fontSize * 0.7,
                            color: 'var(--cal-text-secondary)',
                            lineHeight: 1.3,
                          }}>
                            {evStartLabel}
                          </div>
                        )}
                        {config.scheduleShowDescription && height >= fontSize * 4 && (() => {
                          const description = sanitizeEventDescription(ev.description);
                          if (!description) return null;
                          return (
                            <div style={{
                              fontSize: fontSize * 0.7,
                              color: 'var(--cal-text-secondary)',
                              lineHeight: 1.3,
                              marginTop: scale.bu * 0.15,
                              whiteSpace: 'pre-line',
                              wordBreak: 'break-word',
                              overflow: 'hidden',
                              flex: 1,
                            }}>
                              {description}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}

                  {/* Hidden-overflow indicators (columns mode) */}
                  {Array.from(hiddenStarts, ([evStartHour, count]) => (
                    <div
                      key={evStartHour}
                      aria-label={t('fullscreen-calendar.moreCount', { count })}
                      style={{
                        position: 'absolute',
                        top: (evStartHour - hourStart) * hourHeight + 2,
                        right: 2,
                        zIndex: 3,
                        fontSize: fontSize * 0.6,
                        fontWeight: 600,
                        color: 'var(--cal-text-secondary)',
                        background: 'var(--cal-surface)',
                        border: '1px solid var(--cal-border)',
                        borderRadius: 999,
                        padding: `${scale.bu * 0.05}px ${scale.bu * 0.3}px`,
                        pointerEvents: 'none',
                      }}
                    >
                      +{count}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Now line spanning all columns */}
            {config.showNowLine && nowInRange && (
              <NowLine
                nowY={nowY}
                now={now}
                ariaLabel={t('fullscreen-calendar.ariaLabels.currentTime', { time: formatEventTime(now, timeFormat, locale) })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── All-Day Events Row ───

function AllDayRow({ events, days, config, scale, gutterWidth, fontSize, today, t }: {
  events: CalendarEvent[];
  days: Date[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  gutterWidth: number;
  fontSize: number;
  today: Date;
  t: TranslateFn;
}) {
  const hasAllDay = days.some(day => events.some(ev => ev.allDay && isEventOnDay(ev, day)));
  if (!hasAllDay) return null;

  const wrapTitles = config.wrapEventTitles === true;

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
        {t('fullscreen-calendar.allDay')}
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
                    data-event-id={ev.id}
                    aria-label={t('fullscreen-calendar.ariaLabels.eventAllDay', { title: ev.title })}
                    style={{
                      fontSize: fontSize * 0.65,
                      fontWeight: 600,
                      padding: `${scale.bu * 0.1}px ${scale.bu * 0.3}px`,
                      borderRadius: 3,
                      background: eventBg(color, 0.13, scale.isDark),
                      color: eventBorder(color, scale.isDark),
                      border: `1px solid ${eventBg(color, 0.20, scale.isDark)}`,
                      ...clampStyle(wrapTitles),
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
