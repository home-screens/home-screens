'use client';

import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameDay, isSameMonth, getWeek,
} from 'date-fns';
import { isEventOnDay, weekStartsOnFor, weekNumberOptions } from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { dayCellFill, dayDecorFor, resolveTodayHighlight } from './view-support';
import { eventBg } from '@/lib/calendar-event-surface';
import { mergeCellDecor } from '@/lib/calendar-rules';
import type { CalendarViewProps } from './view-support';
import { useContainerHeight } from './shared-time-grid';
import { GridCellBody } from './grid-view-bits';

export function MonthGridView({ events, timezone, config, scale, today, now }: CalendarViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const showWeekNumbers = config.monthShowWeekNumbers;
  const { showTodayBg, showTodayMarker } = resolveTodayHighlight(config);
  const wrapTitles = config.wrapEventTitles === true;

  const weekStartsOn = weekStartsOnFor(config.startDay);
  const { scrollRef, containerH } = useContainerHeight();

  const { cells, weekCount } = useMemo(() => {
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    const gridStart = startOfWeek(monthStart, { weekStartsOn });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn });

    const result: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      result.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return { cells: result, weekCount: Math.ceil(result.length / 7) };
    // `today` is identity-stable until midnight, so this holds across ticks.
  }, [today, weekStartsOn]);

  // Localized day-of-week labels derived from the active formatting locale
  const dowDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(cells[0] ?? today, i)),
    [cells, today],
  );

  return (
    <div role="grid" aria-label={formatDateSync(today, 'MMMM yyyy', { locale })} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Day-of-week header */}
      <div role="row" style={{
        display: 'grid',
        gridTemplateColumns: showWeekNumbers ? `${scale.bu * 3}px repeat(7, 1fr)` : 'repeat(7, 1fr)',
        borderBottom: '1px solid var(--cal-border)',
        flexShrink: 0,
      }}>
        {showWeekNumbers && <div role="columnheader" />}
        {dowDates.map((d, i) => (
          <div key={i} role="columnheader" style={{
            textAlign: 'center',
            padding: `${scale.bu * 0.5}px 0`,
            fontSize: fontSize * 0.7,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--cal-text-tertiary)',
          }}>
            {formatDateSync(d, 'EEE', { locale })}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div ref={scrollRef} style={{
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
          const isPastDay = isCurrentMonth && day < today;
          // Sat/Sun columns: the last two when the week starts Monday,
          // the outer two when it starts Sunday
          const isWeekend = weekStartsOn === 1 ? dow >= 5 : (dow === 0 || dow === 6);

          const showWeekNum = showWeekNumbers && dow === 0;

          const dayEvents = events.filter(ev => isEventOnDay(ev, day, timezone));
          const hasBirthday = dayEvents.some(ev => ev.kind === 'birthday');
          const decor = dayDecorFor(config, day, dayEvents, { today, now, timezone, isDark: scale.isDark });

          // Auto-calculate max visible events from the measured grid height
          // (header, legend, and weekday row already excluded); the estimate
          // from full module height minus a fixed chrome allowance is only
          // the pre-measurement fallback. Wrapped titles can take two lines,
          // so budget double the pill height.
          const approxCellHeight = (containerH > 0 ? containerH : scale.height - scale.bu * 7) / weekCount;
          const pillHeight = fontSize * (wrapTitles ? 2.0 : 1.0);
          const autoMax = config.monthMaxEventsPerCell > 0
            ? config.monthMaxEventsPerCell
            : Math.max(2, Math.floor((approxCellHeight - fontSize * 2) / pillHeight));

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
                  {getWeek(day, weekNumberOptions(config.startDay))}
                </div>
              )}
              <div
                role="gridcell"
                aria-label={t('fullscreen-calendar.ariaLabels.monthCell', { date: formatDateSync(day, 'MMMM d', { locale }), count: dayEvents.length })}
                style={mergeCellDecor({
                  borderRight: dow < 6 ? '1px solid var(--cal-border-subtle)' : undefined,
                  borderBottom: '1px solid var(--cal-border-subtle)',
                  borderLeft: isToday && showTodayMarker ? '2px solid var(--cal-accent)' : undefined,
                  padding: scale.bu * 0.3,
                  position: 'relative',
                  overflow: 'hidden',
                  opacity: !isCurrentMonth ? 0.35
                    : isPastDay && config.dimPastEvents ? 'var(--cal-past-opacity)'
                    : 1,
                  background: dayCellFill(isToday, showTodayBg, isWeekend, config)
                    ?? (hasBirthday
                      // Cell-level "a birthday is here" signal, not any one
                      // kid's color — a fixed tint avoids picking one
                      // source's color arbitrarily when several birthdays
                      // land on the same day.
                      ? eventBg('#EC4899', scale.isDark ? 0.16 : 0.10, scale.isDark)
                      : undefined),
                }, decor)}
              >
                <GridCellBody
                  day={day}
                  dayEvents={dayEvents}
                  maxEvents={autoMax}
                  fontSize={fontSize}
                  scale={scale}
                  config={config}
                  today={today}
                  decor={decor}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
