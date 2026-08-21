'use client';

import { useMemo } from 'react';
import { isSameDay } from 'date-fns';
import { parseEventWallTime, isEventOnDay, sanitizeEventDescription, formatEventTime, birthdayAge } from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { MapPin, eventBg, eventBorder } from './FullscreenCalendarModule';
import { computeTimedEventLayout } from './event-layout';
import type { CalendarScale, CalendarViewProps } from './FullscreenCalendarModule';
import { DEFAULT_TIME_FORMAT } from '@/types/config';
import { formatHourLabel, useContainerHeight, HourLines, NowLine, NowBadge } from './shared-time-grid';


// Tinted morning/afternoon/evening bands. Each zone spans [start, end) hours and
// is clamped to the visible [hourStart, hourEnd] window; it renders only when the
// clamped span has positive height.
const ZONES = [
  { start: 0, end: 12, tint: 'rgba(251,191,36,0.03)', labelKey: 'fullscreen-calendar.zones.morning' },
  { start: 12, end: 17, tint: 'rgba(59,130,246,0.03)', labelKey: 'fullscreen-calendar.zones.afternoon' },
  { start: 17, end: 24, tint: 'rgba(139,92,246,0.03)', labelKey: 'fullscreen-calendar.zones.evening' },
] as const;

function ZoneBand({
  zone,
  hourStart,
  hourEnd,
  hourHeight,
  scale,
  fontSize,
  label,
}: {
  zone: (typeof ZONES)[number];
  hourStart: number;
  hourEnd: number;
  hourHeight: number;
  scale: CalendarScale;
  fontSize: number;
  label: string;
}) {
  const clampedStart = Math.max(zone.start, hourStart);
  const clampedEnd = Math.min(zone.end, hourEnd);
  if (clampedStart >= clampedEnd) return null;
  const top = (clampedStart - hourStart) * hourHeight;
  return (
    <>
      <div style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: (clampedEnd - clampedStart) * hourHeight,
        background: zone.tint,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        top: top + scale.bu * 0.3,
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
        {label}
      </div>
    </>
  );
}

export function DayTimelineView({ events, timezone, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT }: CalendarViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const am = t('fullscreen-calendar.am');
  const pm = t('fullscreen-calendar.pm');
  const { scrollRef, containerH } = useContainerHeight();
  const hourStart = config.dayHourStart ?? 6;
  const hourEnd = config.dayHourEnd ?? 22;
  const totalHours = hourEnd - hourStart;
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const gutterWidth = scale.bu * 5.5;
  const overlapMode = config.eventOverlap ?? 'columns';

  // Fit grid exactly to container — no scrolling on kiosk display
  const baseHourHeight = scale.bu * (config.density === 'cozy' ? 6.5 : 5.5);
  const hourHeight = containerH > 0 ? containerH / totalHours : baseHourHeight;
  const gridHeight = totalHours * hourHeight;

  const isToday = isSameDay(now, today);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const nowInRange = isToday && nowHour >= hourStart && nowHour <= hourEnd;
  const nowY = (nowHour - hourStart) * hourHeight;

  // Day filtering and overlap layout don't depend on the 60s clock tick, so
  // memoize them instead of recomputing on every re-render. Events entirely
  // outside the hour range are excluded up front — clamping alone would leave
  // them as degenerate inputs that still occupy an overlap column.
  const { allDayEvs, birthdayEvs, timedEvs, overlapLayout, hiddenStarts, hourSpans } = useMemo(() => {
    const dayEvents = events.filter(ev => isEventOnDay(ev, today, timezone));
    const allDay = dayEvents.filter(ev => ev.allDay && ev.kind !== 'birthday');
    const birthdays = dayEvents.filter(ev => ev.kind === 'birthday');
    const timed = dayEvents.filter(ev => !ev.allDay);
    const { overlapLayout, hiddenStarts, hourSpans } = computeTimedEventLayout(timed, today, hourStart, hourEnd, overlapMode, timezone);
    return { allDayEvs: allDay, birthdayEvs: birthdays, timedEvs: timed, overlapLayout, hiddenStarts, hourSpans };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- today is a new Date object each render; toDateString() gives a stable key that only changes when the day changes
  }, [events, today.toDateString(), hourStart, hourEnd, overlapMode, timezone]);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* All-day strip */}
      {(allDayEvs.length > 0 || birthdayEvs.length > 0) && (
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
            {t('fullscreen-calendar.allDay')}
          </div>
          {allDayEvs.map(ev => {
            const color = ev.calendarColor ?? '#3B82F6';
            const description = config.dayShowDescription ? sanitizeEventDescription(ev.description) : '';
            return (
              <div key={ev.id} className="fsc-event-block" data-event-id={ev.id} aria-label={t('fullscreen-calendar.ariaLabels.eventAllDay', { title: ev.title })} style={{
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
                {description && (
                  <div style={{
                    fontSize: fontSize * 0.75,
                    fontWeight: 400,
                    marginTop: scale.bu * 0.2,
                    whiteSpace: 'pre-line',
                    wordBreak: 'break-word',
                    lineHeight: 1.35,
                    color: 'var(--cal-text-secondary)',
                    maxHeight: fontSize * 0.75 * 1.35 * 3,
                    overflow: 'hidden',
                  }}>
                    {description}
                  </div>
                )}
              </div>
            );
          })}
          {birthdayEvs.map(ev => {
            const age = birthdayAge(ev.birthYear, today.getFullYear());
            const label = age != null ? t('fullscreen-calendar.birthdayWithAge', { age }) : t('fullscreen-calendar.birthday');
            return (
              <div key={ev.id} className="fsc-event-block flex items-center" data-event-id={ev.id} aria-label={t('fullscreen-calendar.ariaLabels.eventAllDay', { title: ev.title })} style={{
                gap: scale.bu * 0.4,
                padding: `${scale.bu * 0.3}px ${scale.bu * 0.8}px`,
                fontSize: fontSize * 0.95,
                fontWeight: 700,
                color: ev.calendarColor ?? '#EC4899',
                marginBottom: scale.bu * 0.2,
              }}>
                <span aria-hidden="true">🎂</span>
                <span>{ev.title} · {label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div ref={scrollRef} aria-label={t('fullscreen-calendar.ariaLabels.dayTimeline')} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
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
                  {formatHourLabel(h, am, pm)}
                </div>
              );
            })}
            {/* Now badge */}
            {config.showNowLine && nowInRange && (
              <NowBadge nowY={nowY} now={now} scale={scale} fontSize={fontSize} position="left" timePattern={timeFormat === '24h' ? 'HH:mm' : 'h:mm a'} locale={locale} />
            )}
          </div>

          {/* Events area */}
          <div style={{
            flex: 1,
            position: 'relative',
            borderLeft: '1px solid var(--cal-border-subtle)',
          }}>
            {/* Zone tints + labels */}
            {ZONES.map(zone => (
              <ZoneBand
                key={zone.labelKey}
                zone={zone}
                hourStart={hourStart}
                hourEnd={hourEnd}
                hourHeight={hourHeight}
                scale={scale}
                fontSize={fontSize}
                label={t(zone.labelKey)}
              />
            ))}

            {/* Hour lines */}
            <HourLines totalHours={totalHours} hourHeight={hourHeight} hourStart={hourStart} />

            {/* Events with overlap layout */}
            {timedEvs.map(ev => {
              // Absent span = outside the visible hour window (dropped by
              // computeTimedEventLayout's clamp-and-filter).
              const span = hourSpans.get(ev.id);
              if (!span) return null;
              const { startHour: evStart, endHour: evEnd } = span;

              const layout = overlapLayout.get(ev.id);
              if (!layout || layout.width === 0) return null;

              const top = (evStart - hourStart) * hourHeight;
              const height = Math.max((evEnd - evStart) * hourHeight, fontSize * 2.5);
              const color = ev.calendarColor ?? '#3B82F6';
              const isPast = isToday && evEnd <= nowHour;

              const evStartLabel = formatEventTime(parseEventWallTime(ev.start, timezone), timeFormat, locale);
              const evEndLabel = formatEventTime(parseEventWallTime(ev.end, timezone), timeFormat, locale);
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
                    left: `calc(${layout.left * 100}% + ${scale.bu * 0.8}px)`,
                    width: `calc(${layout.width * 100}% - ${scale.bu * 1.6}px)`,
                    borderRadius: 8,
                    borderLeft: `4px solid ${eventBorder(color, scale.isDark)}`,
                    background: overlapMode === 'stacked'
                      ? `linear-gradient(${eventBg(color, 0.13, scale.isDark)}, ${eventBg(color, 0.13, scale.isDark)}), var(--cal-bg)`
                      : eventBg(color, 0.08, scale.isDark),
                    padding: `${scale.bu * 0.6}px ${scale.bu * 0.8}px`,
                    overflow: 'hidden',
                    zIndex: layout.zIndex,
                    boxShadow: overlapMode === 'stacked' ? 'var(--cal-card-shadow)' : undefined,
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
                    {evStartLabel} &ndash; {evEndLabel}
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
                  {config.dayShowDescription && height >= fontSize * 5 && (() => {
                    const description = sanitizeEventDescription(ev.description);
                    if (!description) return null;
                    return (
                      <div style={{
                        fontSize: fontSize * 0.75,
                        color: 'var(--cal-text-secondary)',
                        marginTop: scale.bu * 0.3,
                        whiteSpace: 'pre-line',
                        wordBreak: 'break-word',
                        lineHeight: 1.35,
                        overflow: 'hidden',
                      }}>
                        {description}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Hidden-overflow indicators (columns mode) */}
            {Array.from(hiddenStarts, ([startHour, count]) => (
              <div
                key={startHour}
                aria-label={t('fullscreen-calendar.moreCount', { count })}
                style={{
                  position: 'absolute',
                  top: (startHour - hourStart) * hourHeight + scale.bu * 0.3,
                  right: scale.bu * 0.4,
                  zIndex: 3,
                  fontSize: fontSize * 0.65,
                  fontWeight: 600,
                  color: 'var(--cal-text-secondary)',
                  background: 'var(--cal-surface)',
                  border: '1px solid var(--cal-border)',
                  borderRadius: 999,
                  padding: `${scale.bu * 0.1}px ${scale.bu * 0.4}px`,
                  pointerEvents: 'none',
                }}
              >
                +{count}
              </div>
            ))}

            {/* Now line */}
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
