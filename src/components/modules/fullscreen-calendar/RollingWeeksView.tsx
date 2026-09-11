'use client';

import { useMemo } from 'react';
import { addDays, isSameDay, startOfDay } from 'date-fns';
import { clampRollingWeeks, isEventOnDay, isWeekendDay } from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { dayCellFill, dayDecorFor, resolveTodayHighlight } from './view-support';
import { eventBg } from '@/lib/calendar-event-surface';
import { mergeCellDecor } from '@/lib/calendar-rules';
import { GridCellBody } from './grid-view-bits';
import { rollingRangeTitle } from './view-traits';
import { useContainerHeight } from './shared-time-grid';
import type { CalendarViewProps } from './view-support';

/**
 * Rolling weeks: the next n weeks (1-8) as a 7-column grid whose top-left
 * cell is always today. Rows are today-anchored, not week-anchored, so the
 * weekday columns rotate one step left at each midnight; weekend shading is
 * derived from each date (not the column), no past or out-of-month days
 * exist, and the 1st of each month crossed renders "MMM d".
 */
export function RollingWeeksView({ events, timezone, config, scale, today, now }: CalendarViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const { showTodayBg, showTodayMarker } = resolveTodayHighlight(config);
  const wrapTitles = config.wrapEventTitles === true;
  const weeks = clampRollingWeeks(config.rollingWeeksToShow);
  const { scrollRef, containerH } = useContainerHeight();

  const cells = useMemo(
    () => Array.from({ length: weeks * 7 }, (_, i) => addDays(startOfDay(today), i)),
    // `today` is identity-stable until midnight, so this holds across ticks.
    [today, weeks],
  );
  // Header labels come from row 1: columns are stable within a day and the
  // grid re-anchors at midnight.
  const dowDates = useMemo(() => cells.slice(0, 7), [cells]);

  // Auto pill budget from the measured height — same estimate/fallback
  // shape as the month grid, whose rows are 5-6 where ours are 1-8.
  const approxCellHeight = (containerH > 0 ? containerH : scale.height - scale.bu * 7) / weeks;
  const pillHeight = fontSize * (wrapTitles ? 2.0 : 1.0);
  const autoMax = Math.max(2, Math.floor((approxCellHeight - fontSize * 2) / pillHeight));

  return (
    <div role="grid" aria-label={rollingRangeTitle(today, weeks, locale)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div role="row" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: '1px solid var(--cal-border)',
        flexShrink: 0,
      }}>
        {dowDates.map((d, i) => (
          <div key={i} role="columnheader" style={{
            textAlign: 'center',
            padding: `${scale.bu * 0.5}px 0`,
            fontSize: fontSize * 0.7,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: isSameDay(d, today) ? 'var(--cal-accent)' : 'var(--cal-text-tertiary)',
          }}>
            {formatDateSync(d, 'EEE', { locale })}
          </div>
        ))}
      </div>

      <div ref={scrollRef} style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gridTemplateRows: `repeat(${weeks}, 1fr)`,
        flex: 1,
        minHeight: 0,
      }}>
        {cells.map((day, i) => {
          const dow = i % 7;
          const isToday = isSameDay(day, today);
          const isWeekend = isWeekendDay(day);
          const dayEvents = events.filter(ev => isEventOnDay(ev, day, timezone));
          const hasBirthday = dayEvents.some(ev => ev.kind === 'birthday');
          const decor = dayDecorFor(config, day, dayEvents, { today, now, timezone, isDark: scale.isDark });

          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              aria-label={t('fullscreen-calendar.ariaLabels.monthCell', { date: formatDateSync(day, 'MMMM d', { locale }), count: dayEvents.length })}
              style={mergeCellDecor({
                borderRight: dow < 6 ? '1px solid var(--cal-border-subtle)' : undefined,
                borderBottom: '1px solid var(--cal-border-subtle)',
                borderLeft: isToday && showTodayMarker ? '2px solid var(--cal-accent)' : undefined,
                padding: scale.bu * 0.3,
                position: 'relative',
                overflow: 'hidden',
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
                showMonthName
                fontSize={fontSize}
                scale={scale}
                config={config}
                today={today}
                decor={decor}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
