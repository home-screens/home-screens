'use client';

import { useMemo } from 'react';
import { isSameDay } from 'date-fns';
import { parseEventWallTime, isEventOnDay, formatEventTime, resolveScheduleStart, weekStartsOnFor, birthdayAge, isWeekendDay } from '@/lib/calendar-utils';
import { sanitizeEventDescription } from '@/lib/event-description';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { autoScheduleDays, clampStyle, dayCellFill, resolveTodayHighlight, useDayDecors, useDayList } from './view-support';
import { eventSurface } from '@/lib/calendar-event-surface';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { EVENT_BLOCK_BASE_ZINDEX } from '@/lib/fullscreen-overlap';
import { eventGlyph, eventOpacity, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import { computeTimedEventLayout, eventHoursOnDay } from '@/lib/calendar-event-layout';
import { DayWeatherBadge } from './WeatherInline';
import type { CalendarEvent, CalendarScale, CalendarViewProps } from './view-support';
import { DEFAULT_TIME_FORMAT, type FullscreenCalendarConfig } from '@/types/config';
import { formatHourLabel, hourLabelShift, useContainerHeight, HourLines, NowLine, NowBadge, RollingWindowStrip } from './shared-time-grid';
import { resolveHourWindow } from '@/lib/calendar-hour-window';
import { eventAriaLabel } from './list-view-bits';

export function ScheduleView({ events, timezone, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, weather }: CalendarViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const am = t('fullscreen-calendar.am');
  const pm = t('fullscreen-calendar.pm');
  const { scrollRef, containerH } = useContainerHeight();

  const { showTodayBg, showTodayMarker } = resolveTodayHighlight(config);
  const overlapMode = config.eventOverlap ?? 'columns';
  const wrapTitles = config.wrapEventTitles === true;

  const businessStart = 8;
  const businessEnd = 18;

  const daysToShow = config.scheduleDaysToShow > 0
    ? config.scheduleDaysToShow
    : autoScheduleDays(scale.width, config.density);

  // First column follows the start anchor: sliding today (default), the
  // calendar-stable week start, or the upcoming weekend. Anchored modes can
  // put whole days in the past; they dim via dimPastEvents below so elapsed
  // days read as intentionally finished rather than broken. `today` is
  // identity-stable until midnight, so these memos hold across clock ticks.
  const weekStartsOn = weekStartsOnFor(config.startDay);
  const scheduleStart = useMemo(
    () => resolveScheduleStart(today, config.scheduleStartAnchor, weekStartsOn),
    [today, config.scheduleStartAnchor, weekStartsOn],
  );
  const days = useDayList(scheduleStart, daysToShow);

  // Hour range: the configured fixed hours, or a window that follows the
  // clock. The now-line only makes sense when today is actually one of the
  // visible columns — a next-weekend anchor can render an all-future board,
  // where a live "current time" line would cut across days it doesn't
  // belong to — and a rolling window has nothing to follow there either.
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const todayVisible = days.some(day => isSameDay(day, today));
  const { hourStart, hourEnd, rolling } = resolveHourWindow({
    mode: config.hourWindow, rollingHours: config.rollingHours,
    fixedStart: config.scheduleHourStart ?? 6, fixedEnd: config.scheduleHourEnd ?? 22,
    nowHour, todayVisible,
  });
  const totalHours = hourEnd - hourStart;
  // Today's timed events that ended before a rolling window opens, so the
  // strip can say how many the board is not showing rather than nothing.
  const hiddenEarlier = rolling
    ? events.filter(ev => !ev.allDay && isEventOnDay(ev, today, timezone) && eventHoursOnDay(ev, today, timezone).endHour <= hourStart).length
    : 0;

  const gutterWidth = scale.bu * 4.5;
  const baseHourHeight = scale.bu * (config.density === 'cozy' ? 5.5 : 4.5);
  const hourHeight = containerH > 0 ? containerH / totalHours : baseHourHeight;
  const gridHeight = totalHours * hourHeight;
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;

  // Current time position (timezone-aware, updates every 60s via parent).
  const nowInRange = todayVisible && nowHour >= hourStart && nowHour <= hourEnd;
  const nowY = (nowHour - hourStart) * hourHeight;

  // Per-day event filtering and overlap layout don't depend on the 60s clock
  // tick, so memoize them instead of recomputing for every day on each
  // re-render. Events entirely outside the hour range are excluded up front —
  // clamping alone would leave them as degenerate inputs that still occupy an
  // overlap column.
  const dayLayouts = useMemo(() => days.map(day => {
    const dayEvents = events.filter(ev => !ev.allDay && isEventOnDay(ev, day, timezone));
    const { overlapLayout, hiddenStarts, hourSpans } = computeTimedEventLayout(dayEvents, day, hourStart, hourEnd, overlapMode, timezone);
    return { dayEvents, overlapLayout, hiddenStarts, hourSpans };
  }), [days, events, hourStart, hourEnd, overlapMode, timezone]);

  // Day-rule decor per column (header badges + column look). `dayLayouts`
  // can't supply the events here: it drops all-day rows, which a day match
  // must still see.
  const decorByDay = useDayDecors(days, events, config, { today, now, timezone, isDark: scale.isDark });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Column headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--cal-border)', flexShrink: 0 }} role="row">
        <div style={{ width: gutterWidth, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${daysToShow}, 1fr)` }}>
          {days.map((day, dayIdx) => {
            const isToday = isSameDay(day, today);
            const isWeekend = isWeekendDay(day);
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
                      color: 'var(--cal-on-accent, #fff)',
                    }}>
                      {formatDateSync(day, 'd', { locale })}
                    </span>
                  ) : formatDateSync(day, 'd', { locale })}
                </div>
                <DayBadges badges={decorByDay[dayIdx].badges} style={{ justifyContent: 'center', display: 'flex', fontSize: fontSize * 0.8, marginTop: scale.bu * 0.2 }} />
                {weather && <DayWeatherBadge weather={weather} day={day} fontSize={fontSize} align="center" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* All-day events row */}
      <AllDayRow events={events} timezone={timezone} days={days} config={config} scale={scale} gutterWidth={gutterWidth} fontSize={fontSize} today={today} t={t} />

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
                    transform: hourLabelShift(i, totalHours),
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatHourLabel(h, timeFormat, am, pm)}
                </div>
              );
            })}
            {/* Now badge in gutter */}
            {config.showNowLine && nowInRange && (
              <NowBadge nowY={nowY} now={now} scale={scale} fontSize={fontSize} position="right" timeFormat={timeFormat} locale={locale} />
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
              const isWeekend = isWeekendDay(day);
              const isPast = day < today && !isToday;
              const { dayEvents, overlapLayout, hiddenStarts, hourSpans } = dayLayouts[dayIdx];

              return (
                <div
                  key={day.toISOString()}
                  role="gridcell"
                  aria-label={formatDateSync(day, 'EEEE, MMMM d', { locale })}
                  style={mergeCellDecor({
                    position: 'relative',
                    borderLeft: '1px solid var(--cal-border-subtle)',
                    background: dayCellFill(isToday, showTodayBg, isWeekend, config),
                    opacity: isPast && config.dimPastEvents ? 'var(--cal-past-opacity)' : 1,
                  } as React.CSSProperties, decorByDay[dayIdx])}
                >
                  {/* Hour lines */}
                  <HourLines totalHours={totalHours} hourHeight={hourHeight} hourStart={hourStart} dimOffHours={{ businessStart, businessEnd }} />

                  {/* Events with overlap layout */}
                  {dayEvents.map((ev) => {
                    // Absent span = outside the visible hour window (dropped
                    // by computeTimedEventLayout's clamp-and-filter).
                    const span = hourSpans.get(ev.id);
                    if (!span) return null;
                    const { startHour: evStart, endHour: evEnd } = span;

                    const layout = overlapLayout.get(ev.id);
                    if (!layout || layout.width === 0) return null; // overflow hidden

                    const top = (evStart - hourStart) * hourHeight;
                    const height = Math.max((evEnd - evStart) * hourHeight, fontSize * 1.5);
                    const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
                    const glyph = eventGlyph(ev);
                    const isPastEvent = isToday && evEnd <= nowHour;

                    const evStartLabel = formatEventTime(parseEventWallTime(ev.start, timezone), timeFormat, locale);
                    const evEndLabel = formatEventTime(parseEventWallTime(ev.end, timezone), timeFormat, locale);
                    const evAriaLabel = eventAriaLabel(t, ev, { startLabel: evStartLabel, endLabel: evEndLabel });

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
                          ...eventSurface(color, scale, 'block', {
                            radius: scale.bu * 0.4,
                            washAlpha: overlapMode === 'stacked' ? 0.13 : 0.09,
                            // Only a block layered over another needs to hide
                            // what is beneath it (see DayTimelineView).
                            opaque: overlapMode === 'stacked' && layout.zIndex > EVENT_BLOCK_BASE_ZINDEX,
                          }),
                          padding: `${scale.bu * 0.3}px ${scale.bu * 0.5}px`,
                          overflow: 'hidden',
                          zIndex: layout.zIndex,
                          // Spread conditionally: an unconditional `undefined`
                          // would wipe the inset highlight the glass styles set.
                          ...(overlapMode === 'stacked' ? { boxShadow: 'var(--cal-card-shadow)' } : {}),
                          opacity: eventOpacity(ev, isPastEvent && config.dimPastEvents ? 0.4 : 1),
                        }}
                      >
                        <div style={{
                          fontSize: fontSize * 0.85,
                          fontWeight: 600,
                          color: 'var(--cal-text-primary)',
                          lineHeight: 1.3,
                          ...clampStyle(wrapTitles),
                        }}>
                          {glyph ? `${glyph} ` : ''}{ev.title}
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

      {rolling && (
        <RollingWindowStrip hourStart={hourStart} hourEnd={hourEnd} hiddenEarlier={hiddenEarlier} fontSize={fontSize} scale={scale} timeFormat={timeFormat} am={am} pm={pm} t={t} />
      )}
    </div>
  );
}

// ─── All-Day Events Row ───

function AllDayRow({ events, timezone, days, config, scale, gutterWidth, fontSize, today, t }: {
  events: CalendarEvent[];
  timezone?: string;
  days: Date[];
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  gutterWidth: number;
  fontSize: number;
  today: Date;
  t: TranslateFn;
}) {
  const hasAllDay = days.some(day => events.some(ev => ev.allDay && isEventOnDay(ev, day, timezone)));
  if (!hasAllDay) return null;
  // ev.allDay covers birthdays too, so hasAllDay already accounts for a
  // birthday-only day — no separate check needed to keep the row visible.

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
          const dayAllDay = events.filter(ev => ev.allDay && ev.kind !== 'birthday' && isEventOnDay(ev, day, timezone));
          const dayBirthdays = events.filter(ev => ev.kind === 'birthday' && isEventOnDay(ev, day, timezone));
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
                const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
                const glyph = eventGlyph(ev);
                return (
                  <div
                    key={ev.id}
                    className="fsc-event-block"
                    data-event-id={ev.id}
                    aria-label={eventAriaLabel(t, ev, { allDay: true })}
                    style={{
                      fontSize: fontSize * 0.65,
                      fontWeight: 600,
                      padding: `${scale.bu * 0.1}px ${scale.bu * 0.3}px`,
                      ...eventSurface(color, scale, 'chip', { radius: 3 }),
                      ...clampStyle(wrapTitles),
                      lineHeight: 1.4,
                      marginBottom: 1,
                      opacity: ev.opacity,
                    }}
                  >
                    {glyph ? `${glyph} ` : ''}{ev.title}
                  </div>
                );
              })}
              {dayBirthdays.map(ev => {
                const age = birthdayAge(ev.birthYear, day.getFullYear());
                const label = age != null
                  ? t('fullscreen-calendar.birthdayAgeShort', { age })
                  : t('fullscreen-calendar.birthdayShort');
                return (
                  <div
                    key={ev.id}
                    className="fsc-event-block flex items-center"
                    data-event-id={ev.id}
                    aria-label={eventAriaLabel(t, ev, { allDay: true })}
                    style={{
                      gap: scale.bu * 0.2,
                      fontSize: fontSize * 0.65,
                      fontWeight: 700,
                      padding: `${scale.bu * 0.1}px ${scale.bu * 0.3}px`,
                      opacity: eventOpacity(ev, 1),
                      color: ev.calendarColor ?? '#EC4899',
                      ...clampStyle(wrapTitles),
                      lineHeight: 1.4,
                      marginBottom: 1,
                    }}
                  >
                    <span aria-hidden="true">{eventGlyph(ev)}</span>
                    <span>{ev.title} {label}</span>
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
