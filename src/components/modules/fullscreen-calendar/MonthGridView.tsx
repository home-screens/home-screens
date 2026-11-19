'use client';

import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth,
} from 'date-fns';
import { isEventOnDay, weekStartsOnFor } from '@/lib/calendar-utils';
import { weekNumberFor } from '@/lib/week-number';
import { useFormattingLocale, formatDateSync } from '@/i18n';
import type { CalendarViewProps } from './view-support';
import { useContainerHeight } from './shared-time-grid';
import { GridDayCell, GridWeekdayHeader, autoMaxEvents, gridNotesHeight } from './grid-view-bits';
import { dayNotesFor } from '@/lib/day-notes';
import { dayGridFontSize } from '@/lib/day-grid-type';

export function MonthGridView({ events, timezone, config, scale, today, anchor = today, stepped = false, now, timeFormat, owners, dayNotes }: CalendarViewProps) {
  const locale = useFormattingLocale();
  const showWeekNumbers = config.showWeekNumbers === true;
  const wrapTitles = config.wrapEventTitles === true;

  const weekStartsOn = weekStartsOnFor(config.startDay);
  const { scrollRef, containerH } = useContainerHeight();

  // The month the arrows stepped to (this month at rest).
  const { cells, weekCount } = useMemo(() => {
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn });

    const result: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      result.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return { cells: result, weekCount: Math.ceil(result.length / 7) };
    // `anchor` is identity-stable until midnight, so this holds across ticks.
  }, [anchor, weekStartsOn]);

  // The grid's type follows its cells (dayGridFontSize). The cell is read off
  // the module's size, not the measured grid, so the weekday row this sizes
  // never feeds back into it.
  const fontSize = dayGridFontSize({
    width: (scale.width - (showWeekNumbers ? scale.bu * 3 : 0)) / 7,
    height: (scale.height - scale.bu * 7) / weekCount,
    textScale: scale.typoMul * scale.densityMul,
    settingFont: scale.bu * scale.typoMul * scale.densityMul,
  });

  // Localized day-of-week labels derived from the active formatting locale
  const dowDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(cells[0] ?? today, i)),
    [cells, today],
  );

  const columns = showWeekNumbers ? `${scale.bu * 3}px repeat(7, 1fr)` : 'repeat(7, 1fr)';

  return (
    <div role="grid" aria-label={formatDateSync(anchor, 'MMMM yyyy', { locale })} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <GridWeekdayHeader
        dates={dowDates}
        columns={columns}
        fontSize={fontSize}
        scale={scale}
        leading={showWeekNumbers ? <div role="columnheader" /> : undefined}
      />

      {/* Month grid */}
      <div ref={scrollRef} style={{
        display: 'grid',
        gridTemplateColumns: columns,
        gridTemplateRows: `repeat(${weekCount}, 1fr)`,
        flex: 1,
        minHeight: 0,
      }}>
        {cells.map((day, i) => {
          const dow = i % 7;
          // The month drawn; the past is still before the real today.
          const isCurrentMonth = isSameMonth(day, anchor);
          // A month someone stepped back to is read, not faded.
          const isPastDay = !stepped && isCurrentMonth && day < today;
          const showWeekNum = showWeekNumbers && dow === 0;
          const notes = dayNotesFor(dayNotes, day);

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
                  {weekNumberFor(day, config.startDay)}
                </div>
              )}
              <GridDayCell
                day={day}
                column={dow}
                // Sat/Sun columns: the last two when the week starts Monday,
                // the outer two when it starts Sunday
                isWeekend={weekStartsOn === 1 ? dow >= 5 : (dow === 0 || dow === 6)}
                opacity={!isCurrentMonth ? 0.35
                  : isPastDay && config.dimPastEvents ? 'var(--cal-past-opacity)'
                  : 1}
                notes={notes}
                dayEvents={events.filter(ev => isEventOnDay(ev, day, timezone))}
                // The family's own number, or as many as the measured row fits.
                maxEvents={config.monthMaxEventsPerCell > 0
                  ? config.monthMaxEventsPerCell
                  : autoMaxEvents({ containerH, rows: weekCount, fontSize, noteHeight: gridNotesHeight(notes.length, fontSize, scale), wrapTitles, scale })}
                fontSize={fontSize}
                scale={scale}
                config={config}
                today={today}
                now={now}
                timezone={timezone}
                timeFormat={timeFormat}
                owners={owners}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
