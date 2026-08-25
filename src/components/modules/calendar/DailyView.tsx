'use client';

import { isSameDay, addDays } from 'date-fns';
import {
  parseEventWallTime, isAllDayEvent, classifyTimedSpan, isPastInDailyColumn, eventProgress, eventStatusSlot,
  eventsForDay, formatEventTime,
  type EventDaySegment,
} from '@/lib/calendar-utils';
import { dayDecorFor, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import { SectionHeader } from '../shared/SectionHeader';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { CalendarConfig, CalendarEvent, ModuleStyle, TimeFormat } from '@/types/config';
import { EventCard } from './EventCard';
import type { EventDisplayStyle } from './support';

/** Thin accent rule marking "now" in today's column, between already-ended
 *  and upcoming/running events. Purely a visual echo of what each row's own
 *  time already says, so it carries no accessible name of its own. */
function NowRule({ now, accentColor, timeFormat, locale }: {
  now: Date;
  accentColor: string;
  timeFormat: TimeFormat;
  locale: string;
}) {
  return (
    <div data-now-rule className="flex items-center gap-1.5" style={{ margin: '2px 0 4px' }} aria-hidden="true">
      <span className="rounded-full shrink-0" style={{ width: 6, height: 6, backgroundColor: accentColor }} />
      <span style={{ fontSize: '0.55em', fontWeight: 700, color: accentColor, whiteSpace: 'nowrap' }}>
        {formatEventTime(now, timeFormat, locale)}
      </span>
      <span className="flex-1" style={{ height: 1, backgroundColor: accentColor, opacity: 0.6 }} />
    </div>
  );
}

export type DailyRow =
  | { kind: 'now-rule' }
  | {
      kind: 'event';
      ev: CalendarEvent;
      segment: EventDaySegment;
      isPast: boolean;
      isLive: boolean;
      countdown: string | null;
      progress: number | null;
    };

/**
 * One day column's rows, in render order, with the now rule placed right
 * after the last already-ended event so a currently-running one stays above
 * it with its live ring/progress bar intact. Pure so the boundary logic is
 * testable outside JSX. All-day rows and 'middle' segments (a multi-day
 * timed event just passing through today) carry no past/future meaning for
 * today's column — `eventsForDay` sorts by the event's original start,
 * which for a 'middle' segment can be days ago, so it can't be allowed to
 * trigger (or block) the now-rule boundary the way a real today-relative
 * event does.
 */
export function buildDailyRows(
  dayEvents: CalendarEvent[],
  ctx: {
    date: Date;
    isToday: boolean;
    now: Date;
    timezone?: string;
    locale: string;
    showNowRule: boolean;
    showCountdown: boolean;
    showProgressBar: boolean;
  },
): DailyRow[] {
  const rows: DailyRow[] = [];
  let ruleInserted = false;
  for (const ev of dayEvents) {
    const start = parseEventWallTime(ev.start, ctx.timezone);
    const end = parseEventWallTime(ev.end, ctx.timezone);
    const isAllDay = isAllDayEvent(ev);
    const segment: EventDaySegment = isAllDay ? 'single' : classifyTimedSpan(start, end, ctx.date);
    const isPast = isPastInDailyColumn(end, ctx.now, ctx.isToday, isAllDay, segment);
    const isLive = !isAllDay && !isPast && eventProgress(start, end, ctx.now) != null;
    if (ctx.showNowRule && ctx.isToday && !ruleInserted && !isAllDay && segment !== 'middle' && !isPast) {
      rows.push({ kind: 'now-rule' });
      ruleInserted = true;
    }
    const status = eventStatusSlot({
      start, end,
      isAllDayRow: isAllDay || segment === 'middle',
      rowDate: ctx.date, now: ctx.now, locale: ctx.locale, segment,
      showCountdown: ctx.showCountdown,
      showProgressBar: ctx.showProgressBar,
      // The compact module deliberately exposes no all-day-countdown knob;
      // all-day rows never count down here (see FullscreenCalendarConfig).
      countdownAllDay: false,
    });
    rows.push({ kind: 'event', ev, segment, isPast, isLive, countdown: status.countdown, progress: status.progress });
  }
  if (ctx.showNowRule && ctx.isToday && !ruleInserted) {
    rows.push({ kind: 'now-rule' });
  }
  return rows;
}

export function DailyView({ events, config, style, today, now, accentColor, eventStyle }: {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  now: Date;
}) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const daysToShow = config.daysToShow ?? 3;
  const showTime = config.showTime !== false;
  const showLocation = config.showLocation !== false;
  const showDescription = config.dailyShowDescription === true;
  const emptyDayText = config.emptyDayText?.trim();
  const dimPastEvents = config.dimPastEvents === true;
  const showNowRule = config.showNowRule === true;

  const days = Array.from({ length: daysToShow }, (_, i) => {
    const date = addDays(today, i);
    const dayEvents = eventsForDay(events, date, eventStyle.timezone);
    return { date, events: dayEvents };
  });

  return (
    <div className="flex h-full gap-3">
      {days.map(({ date, events: dayEvents }) => {
        const isToday = isSameDay(date, today);
        const decor = dayDecorFor(config, date, dayEvents, { today, now, timezone: eventStyle.timezone, isDark: true });
        return (
          <div key={date.toISOString()} className="flex-1 flex flex-col min-w-0 rounded" style={mergeCellDecor({}, decor)}>
            <div className="text-center mb-2 pb-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <SectionHeader active={isToday}>
                {isToday ? tCore('today') : formatDateSync(date, 'EEE', { locale })}
              </SectionHeader>
              <p
                className="font-bold"
                style={{ fontSize: '1.3em', opacity: isToday ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary }}
              >
                {formatDateSync(date, 'd', { locale })}
              </p>
              <DayBadges badges={decor.badges} style={{ justifyContent: 'center', fontSize: '0.8em' }} />
              <p style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}>
                {formatDateSync(date, 'MMM', { locale })}
              </p>
            </div>
            <div className="flex flex-col gap-1.5 overflow-hidden flex-1">
              {dayEvents.length === 0 ? (
                <div
                  className="flex items-center justify-center rounded-lg px-2.5 py-3"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                >
                  <p style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>{emptyDayText || t('calendar.noEvents')}</p>
                </div>
              ) : (
                buildDailyRows(dayEvents, {
                  date, isToday, now, timezone: eventStyle.timezone, locale,
                  showNowRule,
                  showCountdown: config.showCountdown === true,
                  showProgressBar: config.showProgressBar === true,
                }).map((row) => row.kind === 'now-rule' ? (
                  <NowRule key="now-rule" now={now} accentColor={accentColor} timeFormat={eventStyle.timeFormat} locale={locale} />
                ) : (
                  <EventCard key={row.ev.id} event={row.ev} segment={row.segment} countdown={row.countdown} progress={row.progress} textColor={style.textColor} showTime={showTime} showLocation={showLocation} showDescription={showDescription} accentColor={accentColor} eventStyle={eventStyle} t={t} locale={locale} dimmed={dimPastEvents && row.isPast} live={showNowRule && row.isLive} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
