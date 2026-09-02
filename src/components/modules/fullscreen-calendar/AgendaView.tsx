'use client';

import { useMemo } from 'react';
import { addDays, isSameDay, startOfWeek } from 'date-fns';
import {
  parseEventDate, parseEventWallTime, formatEventTime,
  bucketEventsForDay, eventStatusSlot, boundaryBetween, weekStartsOnFor, eventKindLabel, isWeekendDay,
  eventRowTimeLabel, isPastInAgendaGroup, withSavedSuffix,
  type EventDaySegment,
} from '@/lib/calendar-utils';
import { sanitizeEventDescription } from '@/lib/event-description';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { MapPin } from 'lucide-react';
import { clippedListFade, dayCellFill, dayDecorFor, resolveTodayHighlight } from './view-support';
import { eventSurface } from '@/lib/calendar-event-surface';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { eventGlyph, eventOpacity, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import type { CalendarEvent, CalendarViewProps } from './view-support';
import { DayWeatherBadge, EventWeatherLine } from './WeatherInline';
import { CountdownPill, EventProgressBar, WeekSeparator, MonthSeparator, eventAriaLabel } from './list-view-bits';
import { DEFAULT_TIME_FORMAT } from '@/types/config';
import Glyph from '@/components/ui/Glyph';

interface DayGroupEvent {
  ev: CalendarEvent;
  segment: EventDaySegment;
}

// With agendaShowFinishedToday, finished rows sort first under Today and the
// view has no row cap or scrolling, so a busy day could push every upcoming
// row below the fold. Keep only the most recent few finished rows.
const FINISHED_TODAY_MAX = 3;

export function AgendaView({ events, timezone, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, weather, failingSourceIds }: CalendarViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const daysAhead = config.agendaDaysAhead ?? 14;
  const isLandscape = scale.orientation === 'landscape';
  const showDescription = config.agendaShowDescription === true;
  const { showTodayBg, showTodayMarker } = resolveTodayHighlight(config);
  const weekStartsOn = weekStartsOnFor(config.startDay);
  const emptyDayText = config.emptyDayText?.trim();

  const dayGroups = useMemo(() => {
    const groups: { date: Date; events: DayGroupEvent[]; boundary: ReturnType<typeof boundaryBetween> }[] = [];
    for (let i = 0; i < daysAhead; i++) {
      const date = addDays(today, i);
      // All-day rows first — including middle days of split multi-day
      // events, which promote to all-day rendering.
      let dayEvents: DayGroupEvent[] = bucketEventsForDay(events, date, timezone);
      if (i === 0 && config.agendaShowFinishedToday === true) {
        const finished = dayEvents.filter(({ ev, segment }) =>
          ev.allDay !== true && segment !== 'middle' && parseEventWallTime(ev.end, timezone) <= now);
        const dropped = new Set(finished.slice(0, Math.max(0, finished.length - FINISHED_TODAY_MAX)).map(d => d.ev.id));
        if (dropped.size > 0) dayEvents = dayEvents.filter(d => !dropped.has(d.ev.id));
      }

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
  }, [events, today, now, daysAhead, config.agendaHideEmptyDays, config.agendaShowFinishedToday, config.agendaSeparators, weekStartsOn, timezone]);

  function renderDayGroup({ date, events: dayEvents, boundary }: (typeof dayGroups)[number]) {
    const isGroupToday = isSameDay(date, today);
    const decor = dayDecorFor(config, date, dayEvents.map(({ ev }) => ev), { today, now, timezone, isDark: scale.isDark });
    const dayFill = dayCellFill(isGroupToday, showTodayBg, isWeekendDay(date), config);

    return (
      <div key={date.toISOString()} style={mergeCellDecor({
        background: dayFill,
        paddingLeft: dayFill ? scale.bu * 0.8 : undefined,
        paddingRight: dayFill ? scale.bu * 0.8 : undefined,
        borderRadius: dayFill || decor.background || decor.borderColor ? scale.bu * 0.5 : undefined,
      }, decor)}>
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
          background: dayFill
            ? `linear-gradient(${dayFill}, ${dayFill}), var(--cal-band-bg)`
            : 'var(--cal-band-bg)',
          backdropFilter: 'var(--cal-band-backdrop)',
          WebkitBackdropFilter: 'var(--cal-band-backdrop)',
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
          <DayBadges badges={decor.badges} style={{ fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif", fontSize: fontSize * 0.9 }} />
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
          const color = ev.calendarColor ?? DEFAULT_EVENT_COLOR;
          const start = parseEventWallTime(ev.start, timezone);
          const end = parseEventWallTime(ev.end, timezone);
          const description = showDescription ? sanitizeEventDescription(ev.description) : '';
          const isAllDayRow = ev.allDay === true || segment === 'middle';
          const isPast = isPastInAgendaGroup(end, date, now, isGroupToday, isAllDayRow);
          const status = eventStatusSlot({
            start, end, isAllDayRow, rowDate: date, now, locale, segment,
            showCountdown: config.showCountdown === true,
            showProgressBar: config.showProgressBar === true,
            countdownAllDay: config.countdownAllDay === true,
          });
          const glyph = eventGlyph(ev);
          const kindLabel = eventKindLabel(ev, start.getFullYear(), t, 'fullscreen-calendar');

          if (isAllDayRow) {
            return (
              <div
                key={`${ev.id}-${date.toDateString()}`}
                className="fsc-event-block fsc-tap-row"
                data-event-id={ev.id}
                role="article"
                aria-label={eventAriaLabel(t, ev, { allDay: true })}
                style={{
                  ...eventSurface(color, scale, 'card', { radius: 10 }),
                  padding: `${scale.bu * 0.6}px ${scale.bu * 1.0}px`,
                  marginBottom: scale.bu * 0.6,
                  position: 'relative',
                  opacity: ev.opacity,
                }}
              >
                <div style={{
                  fontSize: fontSize * 0.65,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--cal-text-tertiary)',
                }}>
                  {kindLabel ?? t('fullscreen-calendar.allDay')}
                </div>
                <div className="flex items-center gap-1.5" style={{
                  fontSize: fontSize * 1.2,
                  fontWeight: 600,
                  color: 'var(--cal-text-primary)',
                }}>
                  {glyph && <span aria-hidden="true"><Glyph value={glyph} /></span>}
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
          const timeLabel = withSavedSuffix(
            eventRowTimeLabel({ segment, startLabel, endLabel, t, ns: 'fullscreen-calendar' }),
            ev, failingSourceIds, t,
          );
          const ariaLabel = eventAriaLabel(t, ev, { startLabel, endLabel });

          return (
            <div
              key={`${ev.id}-${date.toDateString()}`}
              className="fsc-event-block fsc-tap-row"
              data-event-id={ev.id}
              role="article"
              aria-label={ariaLabel}
              style={{
                ...eventSurface(color, scale, 'card', { radius: 10 }),
                padding: `${scale.bu * 0.7}px ${scale.bu * 1.0}px`,
                marginBottom: scale.bu * 0.6,
                opacity: eventOpacity(ev, isPast && config.dimPastEvents ? 0.4 : 1),
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
              <div className="flex items-center gap-1.5" style={{
                fontSize: fontSize * 1.4,
                fontWeight: 600,
                color: 'var(--cal-text-primary)',
              }}>
                {glyph && <span aria-hidden="true" style={{ fontSize: '0.8em' }}><Glyph value={glyph} /></span>}
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
                // True instant, not the wall-time `start`: the hourly weather
                // index keys on epoch ms, so a shifted Date misses its bucket.
                <EventWeatherLine weather={weather} start={parseEventDate(ev.start)} fontSize={fontSize} marginTop={scale.bu * 0.25} />
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
          ...clippedListFade(scale.bu * 2.5),
        }}>
          {renderColumn(leftGroups)}
        </div>
        <div style={{
          overflow: 'hidden',
          padding: `0 ${scale.bu * 1.4}px ${scale.bu * 2}px`,
          ...clippedListFade(scale.bu * 2.5),
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
      ...clippedListFade(scale.bu * 2.5),
    }}>
      {renderColumn(dayGroups)}
    </div>
  );
}
