'use client';

import { isSameDay, startOfWeek, addDays } from 'date-fns';
import { eventsForDay, weekStartsOnFor, clampGridMaxEventsPerCell } from '@/lib/calendar-utils';
import { dayDecorFor, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { CalendarConfig, CalendarEvent, ModuleStyle } from '@/types/config';
import { withAlpha, type EventDisplayStyle } from './support';
import { DayCellEvents, WeekNumberCell, gridTemplateFor } from './grid';

export function WeekView({ events, config, style, today, now, accentColor, eventStyle }: {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  now: Date;
}) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const weekStart = startOfWeek(today, { weekStartsOn: weekStartsOnFor(config.startDay) });
  const daysInWeek = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const gridTemplate = gridTemplateFor(showWeekNumbers);
  const dayRows = daysInWeek.map((date) => {
    const dayEvents = eventsForDay(events, date, eventStyle.timezone);
    return { date, dayEvents, decor: dayDecorFor(config, date, dayEvents, { today, now, timezone: eventStyle.timezone, isDark: true }) };
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="grid gap-px mb-1" style={{ gridTemplateColumns: gridTemplate }}>
        {showWeekNumbers && (
          <div className="flex items-center justify-center px-1">
            <span style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary }}>{t('calendar.weekShort')}</span>
          </div>
        )}
        {dayRows.map(({ date, decor }) => {
          const isToday = isSameDay(date, today);
          return (
            <div key={date.toISOString()} className="text-center py-1">
              <p className="uppercase tracking-wider" style={{ fontSize: '0.6em', opacity: isToday ? TEXT_OPACITY.primary : TEXT_OPACITY.tertiary }}>
                {formatDateSync(date, 'EEE', { locale })}
              </p>
              <div
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  width: '1.8em',
                  height: '1.8em',
                  fontSize: '0.85em',
                  fontWeight: isToday ? 700 : 500,
                  backgroundColor: isToday ? withAlpha(accentColor, 'cc') : 'transparent',
                  opacity: isToday ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary,
                }}
              >
                {formatDateSync(date, 'd', { locale })}
              </div>
              <DayBadges badges={decor.badges} style={{ justifyContent: 'center', display: 'flex', fontSize: '0.75em' }} />
            </div>
          );
        })}
      </div>

      {/* Event grid */}
      <div className="grid gap-px flex-1 overflow-hidden" style={{ gridTemplateColumns: gridTemplate }}>
        {showWeekNumbers && (
          <WeekNumberCell date={weekStart} config={config} className="pt-1" fontSize="0.6em" />
        )}
        {dayRows.map(({ date, dayEvents, decor }) => {
          return (
            <div
              key={date.toISOString()}
              className="flex flex-col p-0.5 overflow-hidden rounded"
              style={mergeCellDecor({ backgroundColor: 'rgba(255,255,255,0.03)' }, decor)}
            >
              <DayCellEvents events={dayEvents} eventStyle={eventStyle} maxPerCell={clampGridMaxEventsPerCell(config.gridMaxEventsPerCell, 'week')} textColor={style.textColor} accentColor={accentColor} t={t} locale={locale} gapClass="gap-0.5" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
