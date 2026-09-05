'use client';

import { useMemo } from 'react';
import { isSameDay, startOfDay, addDays } from 'date-fns';
import {
  parseEventWallTime, compareEventStarts, isAllDayEvent, classifyTimedSpan, eventStatusSlot, boundaryBetween, weekStartsOnFor,
} from '@/lib/calendar-utils';
import { dayDecorFor, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import { SectionHeader } from '../shared/SectionHeader';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { CalendarConfig, CalendarEvent, ModuleStyle } from '@/types/config';
import { EventCard } from './EventCard';
import { formatRelativeDay, type EventDisplayStyle } from './support';

export function AgendaView({ events, config, style, today, now, accentColor, eventStyle }: {
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
  const showTime = config.showTime !== false;
  const showLocation = config.showLocation !== false;
  const showDescription = config.agendaShowDescription === true;
  const showFinishedToday = config.agendaShowFinishedToday === true;
  const maxEvents = config.maxEvents ?? 20;
  const weekStartsOn = weekStartsOnFor(config.startDay);
  const timezone = eventStyle.timezone;

  const isFinished = (ev: CalendarEvent) => parseEventWallTime(ev.end, timezone) <= now;

  // maxEvents is an upcoming-first budget. A plain ascending slice would let
  // events that already ended today (the earliest starts, present only with
  // agendaShowFinishedToday) crowd out every upcoming row; keep the nearest
  // upcoming events and backfill leftover budget with the most recent
  // finished ones. Without finished rows this is the original slice. (The
  // fullscreen agenda instead caps finished rows at FINISHED_TODAY_MAX — a
  // deliberate policy split, noted on both config types.) Memoized so the
  // budget-and-group pass doesn't rebuild on unrelated re-renders (opening
  // the tap-detail overlay); `now` legitimately re-keys it each tick.
  const groups = useMemo(() => {
    const finishedAt = (ev: CalendarEvent) => parseEventWallTime(ev.end, timezone) <= now;
    const chronological = [...events].sort((a, b) => compareEventStarts(a.start, b.start));
    const upcoming = chronological.filter((ev) => !finishedAt(ev)).slice(0, maxEvents);
    const finished = chronological.filter(finishedAt);
    const sorted = [...finished.slice(Math.max(0, finished.length - (maxEvents - upcoming.length))), ...upcoming]
      .sort((a, b) => compareEventStarts(a.start, b.start));

    // Group by day
    const out: { date: Date; events: CalendarEvent[] }[] = [];
    for (const ev of sorted) {
      const evDate = startOfDay(parseEventWallTime(ev.start, timezone));
      // With showFinishedToday the list starts at today, so an ongoing
      // multi-day event that started earlier re-homes under Today instead of
      // anchoring a past-day group above everything else.
      const groupDate = showFinishedToday && evDate < today ? today : evDate;
      const existing = out.find((g) => isSameDay(g.date, groupDate));
      if (existing) {
        existing.events.push(ev);
      } else {
        out.push({ date: groupDate, events: [ev] });
      }
    }
    return out;
  }, [events, now, maxEvents, showFinishedToday, timezone, today]);

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>{t('calendar.noUpcomingEvents')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-hidden h-full">
      {groups.map(({ date, events: dayEvents }, gi) => {
        const boundary = gi > 0
          ? boundaryBetween(groups[gi - 1].date, date, config.agendaSeparators, weekStartsOn)
          : null;
        const decor = dayDecorFor(config, date, dayEvents, { today, now, timezone, isDark: true });
        return (
        <div key={date.toISOString()} style={mergeCellDecor({ borderRadius: decor.background || decor.borderColor ? 6 : undefined }, decor)}>
          {boundary === 'month' && (
            <div className="mb-2">
              <p className="font-semibold" style={{ fontSize: '0.9em', color: accentColor }}>
                {formatDateSync(date, 'MMMM', { locale })}
              </p>
              <div className="rounded-full" style={{ height: 2, backgroundColor: accentColor, opacity: 0.55, marginTop: 2 }} />
            </div>
          )}
          {boundary === 'week' && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1" style={{ height: 2, backgroundColor: ink(0.18) }} />
              <span className="shrink-0 uppercase tracking-wider" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.tertiary, fontWeight: 600 }}>
                {t('calendar.weekOf', { date: formatDateSync(addDays(date, -((date.getDay() - weekStartsOn + 7) % 7)), 'MMM d', { locale }) })}
              </span>
              <div className="flex-1" style={{ height: 2, backgroundColor: ink(0.18) }} />
            </div>
          )}
          <div className="flex items-center gap-2 mb-1.5">
            <SectionHeader className="shrink-0" active={isSameDay(date, today)}>
              {formatRelativeDay(date, today, tCore, locale)}
            </SectionHeader>
            <DayBadges badges={decor.badges} style={{ fontSize: '0.75em' }} />
            <div className="flex-1 h-px" style={{ backgroundColor: ink(0.1) }} />
          </div>
          <div className="flex flex-col gap-1.5">
            {dayEvents.map((ev) => {
              const start = parseEventWallTime(ev.start, timezone);
              const end = parseEventWallTime(ev.end, timezone);
              const isAllDay = isAllDayEvent(ev);
              // A timed event re-homed under Today (started on an earlier
              // day) must not read as "starts today at <its original
              // time>": classify it day-relative like the daily view does,
              // so it renders "All day" mid-span or "Until 6:00 PM" on its
              // last day. Rows grouped under their own start day keep the
              // plain time + duration.
              const segment = !isAllDay && !isSameDay(start, date) ? classifyTimedSpan(start, end, date) : undefined;
              const status = eventStatusSlot({
                start, end,
                isAllDayRow: isAllDay || segment === 'middle',
                rowDate: date, now, locale, segment,
                showCountdown: config.showCountdown === true,
                showProgressBar: config.showProgressBar === true,
                // No all-day-countdown knob in the compact module (see
                // buildDailyRows / FullscreenCalendarConfig.countdownAllDay).
                countdownAllDay: false,
              });
              return (
                <EventCard key={ev.id} event={ev} segment={segment} countdown={status.countdown} progress={status.progress} textColor={style.textColor} showTime={showTime} showLocation={showLocation} showDescription={showDescription} accentColor={accentColor} eventStyle={eventStyle} t={t} locale={locale} dimmed={isFinished(ev)} />
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}
