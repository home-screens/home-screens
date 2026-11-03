'use client';

import { useMemo } from 'react';
import { isSameDay, startOfDay, addDays } from 'date-fns';
import {
  parseEventWallTime, compareEventStarts, isAllDayEvent, classifyTimedSpan, eventStatusSlot, boundaryBetween, weekStartsOnFor,
} from '@/lib/calendar-utils';
import { dayDecorFor, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import { DayArtLayer } from '../shared/DayArtLayer';
import { SectionHeader } from '../shared/SectionHeader';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { useTranslate, useFormattingLocale, formatDateSync, dayMonthPattern } from '@/i18n';
import type { CalendarConfig, CalendarEvent, ModuleStyle } from '@/types/config';
import { EventCard } from './EventCard';
import { formatRelativeDay, type EventDisplayStyle } from './support';
import { DayNoteLines } from '../shared/DayNoteLine';
import { NO_DAY_NOTES, dayNotesFor, type DayNotes } from '@/lib/day-notes';
import { WallScroller } from '../shared/WallScroller';
import { smallWallScrollLook } from '../shared/wallScrollLook';

export function AgendaView({ events, config, style, today, now, anchor, stepped = false, accentColor, eventStyle, dayNotes, scroll = false }: {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  now: Date;
  /**
   * Where a stepped list starts (look-ahead: the first day of another week);
   * `today` when absent. The module has already dropped what ends before it.
   */
  anchor?: Date;
  /**
   * Stepped to another week (look-ahead): the list is that week alone, every
   * day of it ("No events" on an empty one), and nothing is faded as past.
   */
  stepped?: boolean;
  /** The family's day notes; absent or empty when the Day notes switch is off. */
  dayNotes?: DayNotes;
  /** A finger scrolls the list past what fits, and it goes back to today by itself. */
  scroll?: boolean;
}) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const locale = useFormattingLocale();
  const look = useMemo(() => smallWallScrollLook(accentColor), [accentColor]);
  const showTime = config.showTime !== false;
  const showLocation = config.showLocation !== false;
  const showDescription = config.agendaShowDescription === true;
  const showFinishedToday = config.agendaShowFinishedToday === true;
  const maxEvents = config.maxEvents ?? 20;
  const weekStartsOn = weekStartsOnFor(config.startDay);
  const timezone = eventStyle.timezone;

  // A week someone stepped back to is read, not faded.
  const isFinished = (ev: CalendarEvent) => !stepped && parseEventWallTime(ev.end, timezone) <= now;

  // maxEvents is an upcoming-first budget. A plain ascending slice would let
  // events that already ended today (the earliest starts, present only with
  // agendaShowFinishedToday) crowd out every upcoming row; keep the nearest
  // upcoming events and backfill leftover budget with the most recent
  // finished ones. Without finished rows this is the original slice. (The
  // fullscreen agenda instead caps finished rows at FINISHED_TODAY_MAX — a
  // deliberate policy split, noted on both config types.) Memoized so the
  // budget-and-group pass doesn't rebuild on unrelated re-renders (opening
  // the tap-detail overlay); `now` legitimately re-keys it each tick.
  const fromMs = (anchor ?? today).getTime();
  const groups = useMemo(() => {
    const from = new Date(fromMs);
    // Stepped to another week, the list is that week, in order from its first
    // day (the module has dropped what ends before it), past weeks included.
    // Without the bound it ran on under a "Next week" heading into the weeks
    // after, and a family read a later Saturday as next Saturday.
    const weekEnd = addDays(from, 7);
    const finishedAt = (ev: CalendarEvent) => parseEventWallTime(ev.end, timezone) <= now;
    const inView = stepped ? events.filter((ev) => parseEventWallTime(ev.start, timezone) < weekEnd) : events;
    const chronological = [...inView].sort((a, b) => compareEventStarts(a.start, b.start, timezone));
    const upcoming = chronological.filter((ev) => !finishedAt(ev)).slice(0, maxEvents);
    const finished = chronological.filter(finishedAt);
    const sorted = stepped
      ? chronological.slice(0, maxEvents)
      : [...finished.slice(Math.max(0, finished.length - (maxEvents - upcoming.length))), ...upcoming]
        .sort((a, b) => compareEventStarts(a.start, b.start, timezone));

    // Group by day
    const out: { date: Date; events: CalendarEvent[] }[] = [];
    for (const ev of sorted) {
      const evDate = startOfDay(parseEventWallTime(ev.start, timezone));
      // With showFinishedToday the list starts at today (a stepped list at its
      // first day), so an ongoing multi-day event that started earlier
      // re-homes there instead of anchoring an earlier group above everything else.
      const groupDate = (showFinishedToday || stepped) && evDate < from ? from : evDate;
      const existing = out.find((g) => isSameDay(g.date, groupDate));
      if (existing) {
        existing.events.push(ev);
      } else {
        out.push({ date: groupDate, events: [ev] });
      }
    }
    // A stepped week names every one of its days, so an empty Saturday says
    // so instead of the list skipping to the next one.
    if (stepped) {
      for (let day = from; day < weekEnd; day = addDays(day, 1)) {
        if (!out.some((g) => isSameDay(g.date, day))) out.push({ date: day, events: [] });
      }
      out.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    // A day with a note and no events still gets its heading, from the list's
    // first day to the last day it reaches (at least a week out, so a quiet
    // calendar still shows what is coming).
    if (dayNotes && dayNotes !== NO_DAY_NOTES) {
      const lastListed = out.length > 0 ? out[out.length - 1].date : from;
      const end = lastListed > addDays(from, 6) ? lastListed : addDays(from, 6);
      for (let day = from; day <= end; day = addDays(day, 1)) {
        if (dayNotesFor(dayNotes, day).length > 0 && !out.some((g) => isSameDay(g.date, day))) out.push({ date: day, events: [] });
      }
      out.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    return out;
  }, [events, now, maxEvents, showFinishedToday, timezone, fromMs, stepped, dayNotes]);

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>{t('calendar.noUpcomingEvents')}</p>
      </div>
    );
  }

  // Every event up to maxEvents is drawn; the box shows what fits from today
  // down, and on a touch wall a finger reads on.
  return (
    <WallScroller
      enabled={scroll}
      // A stepped list's top is that week's first day, not today.
      backLabel={t(stepped ? 'wallScroll.backToTop' : 'wallScroll.backToToday')}
      {...look}
      className="flex flex-col gap-3"
      frameStyle={{ height: '100%' }}
      homeKey={fromMs}
      testId="calendar-agenda-scroll"
    >
      {groups.map(({ date, events: dayEvents }, gi) => {
        const boundary = gi > 0
          ? boundaryBetween(groups[gi - 1].date, date, config.agendaSeparators, weekStartsOn)
          : null;
        const decor = dayDecorFor(config, date, dayEvents, { today, now, timezone, isDark: true });
        const notes = dayNotesFor(dayNotes, date);
        return (
        <div key={date.toISOString()} style={mergeCellDecor({ borderRadius: decor.background || decor.backgroundImage || decor.borderColor ? 6 : undefined }, decor)}>
          {decor.backgroundImage != null && <DayArtLayer decor={decor} />}
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
                {t('calendar.weekOf', { date: formatDateSync(addDays(date, -((date.getDay() - weekStartsOn + 7) % 7)), dayMonthPattern(locale, 'short'), { locale }) })}
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
          <DayNoteLines notes={notes} tone="module" lines={3} style={{ fontSize: '0.82em', padding: '0.35em 0.55em', marginBottom: '0.4em', borderRadius: 5 }} />
          {stepped && dayEvents.length === 0 && notes.length === 0 && (
            <p data-testid="calendar-agenda-no-events" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary, fontStyle: 'italic' }}>{t('calendar.noEvents')}</p>
          )}
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
    </WallScroller>
  );
}
