'use client';

import { calendarRanker } from '@/lib/calendar-order';
import { useMemo } from 'react';
import { addDays, startOfDay } from 'date-fns';
import { clampRollingWeeks, isEventOnDay, isWeekendDay } from '@/lib/calendar-utils';
import { useFormattingLocale } from '@/i18n';
import { GridDayCell, GridWeekdayHeader, autoMaxEvents, gridNotesHeight } from './grid-view-bits';
import { dayNotesFor } from '@/lib/day-notes';
import { dayGridFontSize } from '@/lib/day-grid-type';
import { rollingRangeTitle } from './view-traits';
import { useContainerHeight } from './shared-time-grid';
import type { CalendarViewProps } from './view-support';

/**
 * Rolling weeks: the next n weeks (1-8) as a 7-column grid whose top-left
 * cell is today at rest. Rows are today-anchored, not week-anchored, so the
 * weekday columns rotate one step left at each midnight; weekend shading is
 * derived from each date (not the column), no out-of-month days exist, and
 * the 1st of each month crossed renders "MMM d". The look-ahead arrows move
 * the whole window a week; stepped back, the days before today dim as the
 * month grid's do.
 */
export function RollingWeeksView({ events, timezone, config, scale, today, anchor = today, stepped = false, now, timeFormat, calendarOrder, owners, dayNotes }: CalendarViewProps) {
  // The household's calendar order: which timed events keep a row in a full cell.
  const rank = useMemo(() => (calendarOrder?.length ? calendarRanker(calendarOrder) : undefined), [calendarOrder]);
  const locale = useFormattingLocale();
  const wrapTitles = config.wrapEventTitles === true;
  const weeks = clampRollingWeeks(config.rollingWeeksToShow);
  // The grid's type follows its cells, as the month grid's does.
  const fontSize = dayGridFontSize({
    width: scale.width / 7,
    height: (scale.height - scale.bu * 7) / weeks,
    textScale: scale.typoMul * scale.densityMul,
    settingFont: scale.bu * scale.typoMul * scale.densityMul,
  });
  const { scrollRef, containerH } = useContainerHeight();

  const cells = useMemo(
    () => Array.from({ length: weeks * 7 }, (_, i) => addDays(startOfDay(anchor), i)),
    // `anchor` is identity-stable until midnight, so this holds across ticks.
    [anchor, weeks],
  );
  // Header labels come from row 1: columns are stable within a day and the
  // grid re-anchors at midnight.
  const dowDates = useMemo(() => cells.slice(0, 7), [cells]);

  return (
    <div role="grid" aria-label={rollingRangeTitle(anchor, weeks, locale)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <GridWeekdayHeader dates={dowDates} columns="repeat(7, 1fr)" fontSize={fontSize} scale={scale} today={today} />

      <div ref={scrollRef} style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gridTemplateRows: `repeat(${weeks}, 1fr)`,
        flex: 1,
        minHeight: 0,
      }}>
        {cells.map((day, i) => {
          const notes = dayNotesFor(dayNotes, day);
          return (
            <GridDayCell
              key={day.toISOString()}
              day={day}
              column={i % 7}
              isWeekend={isWeekendDay(day)}
              opacity={!stepped && day < today && config.dimPastEvents ? 'var(--cal-past-opacity)' : undefined}
              notes={notes}
              dayEvents={events.filter(ev => isEventOnDay(ev, day, timezone))}
              // Always as many as the measured row fits: rows are 1-8 here
              // where the month grid's are 5-6, so one fixed number cannot suit.
              maxEvents={autoMaxEvents({ containerH, rows: weeks, fontSize, noteHeight: gridNotesHeight(notes.length, fontSize, scale), wrapTitles, scale })}
              showMonthName
              fontSize={fontSize}
              scale={scale}
              config={config}
              today={today}
              now={now}
              timezone={timezone}
              timeFormat={timeFormat}
              owners={owners}
              rank={rank}
            />
          );
        })}
      </div>
    </div>
  );
}
