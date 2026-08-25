'use client';

import { useMemo } from 'react';
import { addDays, isSameDay } from 'date-fns';
import {
  parseEventDate, parseEventWallTime, isEventOnDay, compareEventStarts, formatEventTime, formatCountdown, eventProgress, eventKindLabel,
} from '@/lib/calendar-utils';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { MapPin } from './FullscreenCalendarModule';
import type { CalendarEvent, CalendarScale, CalendarViewProps, CalendarWeather } from './FullscreenCalendarModule';
import { eventSurface, eventBorder } from '@/lib/calendar-event-surface';
import { eventGlyph, eventOpacity } from '@/lib/calendar-rules';
import { EventWeatherLine } from './WeatherInline';
import { EventProgressBar } from './list-view-bits';
import { DEFAULT_TIME_FORMAT, type TimeFormat } from '@/types/config';

interface TimedEvent {
  ev: CalendarEvent;
  start: Date;
  end: Date;
}

const LATER_MAX = 6;
const EARLIER_MAX = 2;
const TOMORROW_MAX = 5;

/**
 * The hallway view: one event rendered huge (what is next, or what is
 * running when nothing else is coming), then short lists for the rest of
 * that day, what already happened today, and tomorrow. The type size is
 * driven by the hero, not a grid, so it reads from across a room.
 */
export function UpNextView({ events, timezone, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, weather, failingSourceIds }: CalendarViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const laterCount = Math.max(0, Math.min(LATER_MAX, Math.round(config.upNextLaterCount ?? 3)));
  const showEarlier = config.upNextShowEarlier !== false;
  const showTomorrow = config.upNextShowTomorrow !== false;
  const tomorrow = addDays(today, 1);

  const model = useMemo(() => {
    const timed: TimedEvent[] = events
      .filter((ev) => !ev.allDay)
      .map((ev) => ({ ev, start: parseEventWallTime(ev.start, timezone), end: parseEventWallTime(ev.end, timezone) }));
    const upcoming = timed.filter((x) => x.start > now).sort((a, b) => a.start.getTime() - b.start.getTime());
    const running = timed.filter((x) => x.start <= now && x.end > now).sort((a, b) => a.end.getTime() - b.end.getTime());
    const finishedToday = timed
      .filter((x) => x.end <= now && isSameDay(x.end, today))
      .sort((a, b) => b.end.getTime() - a.end.getTime());

    const hero = upcoming[0] ?? running[0] ?? null;
    const heroIsRunning = hero != null && upcoming.length === 0;
    const heroDay = hero ? hero.start : today;
    const heroToday = hero ? isSameDay(hero.start, today) : true;
    const later = hero
      ? upcoming.filter((x) => x !== hero && isSameDay(x.start, hero.start)).slice(0, laterCount)
      : [];
    // Running rows always show; only the finished list is capped, so a
    // running hero never buys an extra "Done" row.
    const earlier = showEarlier
      ? [...running.filter((x) => x !== hero), ...finishedToday.slice(0, EARLIER_MAX)]
      : [];
    const allDayToday = events.filter((ev) => ev.allDay && isEventOnDay(ev, today, timezone));
    // Tomorrow shows whatever the sections above did not already draw: the
    // hero can sit on any future day (and all-day events never hero), so
    // exclude drawn ids instead of gating the section on the hero being today.
    // A still-running multi-day event is the Now/Earlier story, not
    // tomorrow's schedule, so it never rides the Tomorrow list either.
    const runningIds = new Set(running.map((x) => x.ev.id));
    const shownIds = new Set([
      ...(hero ? [hero.ev.id] : []),
      ...later.map((x) => x.ev.id),
      ...allDayToday.map((ev) => ev.id),
    ]);
    const tomorrowRows = showTomorrow
      ? events
          .filter((ev) => isEventOnDay(ev, tomorrow, timezone) && !shownIds.has(ev.id) && !runningIds.has(ev.id))
          .sort((a, b) => (a.allDay === b.allDay ? compareEventStarts(a.start, b.start) : a.allDay ? -1 : 1))
          .slice(0, TOMORROW_MAX)
      : [];
    const remainingToday = upcoming.filter((x) => isSameDay(x.start, today)).length;
    return { hero, heroIsRunning, heroDay, heroToday, later, earlier, allDayToday, tomorrowRows, remainingToday, hasAnyUpcoming: upcoming.length > 0 };
  }, [events, now, today, tomorrow, timezone, laterCount, showEarlier, showTomorrow]);

  const { hero, heroIsRunning, heroDay, heroToday, later, earlier, allDayToday, tomorrowRows, remainingToday } = model;
  const pad = scale.bu * 3.5;
  const sectionGap = scale.bu * 3;

  return (
    <div
      aria-label={t('fullscreen-calendar.viewLabels.upNext')}
      style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: `${scale.bu * 2.5}px ${pad}px 0` }}
    >
      {/* Date line */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
          fontSize: fontSize * 3.6, lineHeight: 1.05, color: 'var(--cal-text-primary)',
        }}>
          {formatDateSync(today, 'EEEE, MMMM d', { locale })}
        </div>
        <div style={{ fontSize: fontSize * 1.9, color: 'var(--cal-text-secondary)', marginTop: scale.bu * 0.6, fontVariantNumeric: 'tabular-nums' }}>
          {formatEventTime(now, timeFormat, locale)}
          {' · '}
          {t('fullscreen-calendar.upNext.moreToday', { count: remainingToday })}
        </div>
      </div>

      {/* All-day banner */}
      {allDayToday.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: scale.bu * 0.8, marginTop: scale.bu * 2, flexShrink: 0 }}>
          {allDayToday.map((ev) => {
            const color = ev.calendarColor ?? '#3B82F6';
            const glyph = eventGlyph(ev);
            const kind = eventKindLabel(ev, today.getFullYear(), t, 'fullscreen-calendar');
            return (
              <div
                key={ev.id}
                className="fsc-event-block"
                data-event-id={ev.id}
                aria-label={t('fullscreen-calendar.ariaLabels.eventAllDay', { title: ev.title })}
                style={{
                  ...eventSurface(color, scale, 'chip', { radius: 999 }),
                  padding: `${scale.bu * 0.5}px ${scale.bu * 1.4}px`,
                  fontSize: fontSize * 1.35, fontWeight: 600, color: 'var(--cal-text-primary)',
                  display: 'inline-flex', alignItems: 'center', gap: scale.bu * 0.6,
                  opacity: eventOpacity(ev, 1),
                }}
              >
                {glyph && <span aria-hidden="true">{glyph}</span>}
                <span>{ev.title}</span>
                <span style={{ fontSize: fontSize * 0.9, color: 'var(--cal-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {kind ?? t('fullscreen-calendar.allDay')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Hero */}
      <div style={{ marginTop: scale.bu * 4, flexShrink: 0 }}>
        {hero ? (
          <HeroCard item={hero} running={heroIsRunning} heroToday={heroToday} heroDay={heroDay} now={now} scale={scale} fontSize={fontSize} timeFormat={timeFormat} locale={locale} weather={weather} failingSourceIds={failingSourceIds} t={t} />
        ) : (
          <div style={{
            borderRadius: scale.bu * 2, padding: `${scale.bu * 3.5}px ${scale.bu * 4}px`,
            background: 'var(--cal-surface)', border: '1px solid var(--cal-border-subtle)', boxShadow: 'var(--cal-card-shadow)',
          }}>
            <div style={{ fontSize: fontSize * 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--cal-text-tertiary)' }}>
              {t('fullscreen-calendar.upNext.next')}
            </div>
            <div style={{ fontSize: fontSize * 4.5, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', marginTop: scale.bu * 1.5, color: 'var(--cal-text-primary)' }}>
              {t('fullscreen-calendar.upNext.nothingElseToday')}
            </div>
          </div>
        )}
      </div>

      {/* Later on the hero's day */}
      {later.length > 0 && (
        <Section title={heroToday ? t('fullscreen-calendar.upNext.laterToday') : t('fullscreen-calendar.upNext.alsoOn', { day: formatDateSync(heroDay, 'EEEE', { locale }) })} fontSize={fontSize} gap={sectionGap}>
          {later.map((x) => (
            <ListRow key={x.ev.id} item={x} now={now} scale={scale} fontSize={fontSize} timeFormat={timeFormat} locale={locale} t={t}
              trailing={formatCountdown(x.start, now, locale)} />
          ))}
        </Section>
      )}

      {/* Earlier today: running first, then the last finished */}
      {earlier.length > 0 && (
        <Section title={t('fullscreen-calendar.upNext.earlier')} fontSize={fontSize} gap={sectionGap}>
          {earlier.map((x) => {
            const progress = eventProgress(x.start, x.end, now);
            const isRunning = progress != null;
            return (
              <ListRow key={x.ev.id} item={x} now={now} scale={scale} fontSize={fontSize} timeFormat={timeFormat} locale={locale} t={t}
                dim={!isRunning}
                trailing={isRunning
                  ? t('fullscreen-calendar.upNext.minutesLeft', { count: Math.max(1, Math.ceil((x.end.getTime() - now.getTime()) / 60_000)) })
                  : t('fullscreen-calendar.upNext.done')}
                progress={progress} />
            );
          })}
        </Section>
      )}

      {/* Tomorrow */}
      {tomorrowRows.length > 0 && (
        <Section title={t('fullscreen-calendar.upNext.tomorrow', { day: formatDateSync(tomorrow, 'EEEE', { locale }) })} fontSize={fontSize} gap={sectionGap}>
          {tomorrowRows.map((ev) => (
            <ListRow
              key={ev.id}
              item={{ ev, start: parseEventWallTime(ev.start, timezone), end: parseEventWallTime(ev.end, timezone) }}
              allDay={ev.allDay}
              now={now} scale={scale} fontSize={fontSize} timeFormat={timeFormat} locale={locale} t={t}
              trailing={ev.sourceName ?? ''}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, fontSize, gap, children }: { title: string; fontSize: number; gap: number; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: gap, flexShrink: 0, minHeight: 0 }}>
      <div style={{ fontSize: fontSize * 1.05, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--cal-text-tertiary)', marginBottom: fontSize * 0.9 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: fontSize * 0.7 }}>
        {children}
      </div>
    </div>
  );
}

function HeroCard({ item, running, heroToday, heroDay, now, scale, fontSize, timeFormat, locale, weather, failingSourceIds, t }: {
  item: TimedEvent;
  running: boolean;
  heroToday: boolean;
  heroDay: Date;
  now: Date;
  scale: CalendarScale;
  fontSize: number;
  timeFormat: TimeFormat;
  locale: string;
  weather?: CalendarWeather;
  failingSourceIds?: ReadonlySet<string>;
  t: TranslateFn;
}) {
  const { ev, start, end } = item;
  const color = ev.calendarColor ?? '#3B82F6';
  const bar = eventBorder(color, scale.isDark);
  const progress = running ? eventProgress(start, end, now) : null;
  const countdown = running ? '' : formatCountdown(start, now, locale);
  const startLabel = formatEventTime(start, timeFormat, locale);
  const endLabel = formatEventTime(end, timeFormat, locale);
  const glyph = eventGlyph(ev);
  const saved = ev.sourceId != null && failingSourceIds?.has(ev.sourceId);
  return (
    <div
      className="fsc-event-block"
      data-event-id={ev.id}
      role="article"
      aria-label={t('fullscreen-calendar.ariaLabels.eventTimed', { title: ev.title, start: startLabel, end: endLabel })}
      style={{
        position: 'relative', overflow: 'hidden',
        ...eventSurface(color, scale, 'block', { radius: scale.bu * 2, washAlpha: 0.14 }),
        padding: `${scale.bu * 3.2}px ${scale.bu * 3.6}px ${scale.bu * 3.6}px ${scale.bu * 4.4}px`,
        boxShadow: 'var(--cal-card-shadow)',
        opacity: eventOpacity(ev, 1),
      }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: scale.bu * 0.9, background: bar }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: scale.bu * 1.2, flexWrap: 'wrap' }}>
        <span style={{ fontSize: fontSize * 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: bar }}>
          {running ? t('fullscreen-calendar.upNext.now') : heroToday ? t('fullscreen-calendar.upNext.next') : formatDateSync(heroDay, 'EEEE', { locale })}
        </span>
        {countdown && (
          <span style={{
            fontSize: fontSize * 1.6, fontWeight: 600, color: 'var(--cal-on-accent, #fff)', background: 'var(--cal-accent)',
            borderRadius: 999, padding: `${scale.bu * 0.3}px ${scale.bu * 1.4}px`, whiteSpace: 'nowrap',
          }}>
            {countdown}
          </span>
        )}
        {saved && (
          <span style={{ fontSize: fontSize * 1.1, color: 'var(--cal-text-tertiary)' }}>{t('calendar.savedShort')}</span>
        )}
      </div>
      <div style={{
        fontSize: fontSize * 7, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.025em', marginTop: scale.bu * 1.8,
        color: 'var(--cal-text-primary)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word',
      }}>
        {glyph ? `${glyph} ` : ''}{ev.title}
      </div>
      <div style={{ marginTop: scale.bu * 2.2, fontSize: fontSize * 2.6, lineHeight: 1.35, color: 'var(--cal-text-secondary)' }}>
        <span style={{ color: 'var(--cal-text-primary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{startLabel} {'–'} {endLabel}</span>
        {ev.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: scale.bu * 0.6 }}>
            <MapPin size={fontSize * 2} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.location}</span>
          </div>
        )}
        {weather && <EventWeatherLine weather={weather} start={parseEventDate(ev.start)} fontSize={fontSize * 2.2} marginTop={scale.bu * 0.4} />}
      </div>
      {ev.sourceName && (
        <div style={{ marginTop: scale.bu * 2, display: 'flex', alignItems: 'center', gap: scale.bu * 0.8, fontSize: fontSize * 1.8, color: 'var(--cal-text-secondary)' }}>
          <span aria-hidden="true" style={{ width: fontSize * 1.2, height: fontSize * 1.2, borderRadius: '50%', background: bar, flexShrink: 0 }} />
          {ev.sourceName}
        </div>
      )}
      {progress != null && (
        <div style={{ marginTop: scale.bu * 2.4 }}>
          <EventProgressBar fraction={progress} fontSize={fontSize * 2.6} />
        </div>
      )}
    </div>
  );
}

function ListRow({ item, allDay, now, scale, fontSize, timeFormat, locale, t, trailing, dim, progress }: {
  item: TimedEvent;
  allDay?: boolean;
  now: Date;
  scale: CalendarScale;
  fontSize: number;
  timeFormat: TimeFormat;
  locale: string;
  t: TranslateFn;
  trailing?: string;
  dim?: boolean;
  progress?: number | null;
}) {
  const { ev, start, end } = item;
  const color = ev.calendarColor ?? '#3B82F6';
  const glyph = eventGlyph(ev);
  const startLabel = formatEventTime(start, timeFormat, locale);
  const endLabel = formatEventTime(end, timeFormat, locale);
  const ariaLabel = allDay
    ? t('fullscreen-calendar.ariaLabels.eventAllDay', { title: ev.title })
    : t('fullscreen-calendar.ariaLabels.eventTimed', { title: ev.title, start: startLabel, end: endLabel });
  void now;
  return (
    <div
      className="fsc-event-block"
      data-event-id={ev.id}
      role="article"
      aria-label={ariaLabel}
      style={{
        ...eventSurface(color, scale, 'row', { radius: scale.bu * 1.1 }),
        display: 'flex', flexDirection: 'column',
        padding: `${scale.bu * 1.3}px ${scale.bu * 1.6}px ${scale.bu * 1.3}px ${scale.bu * 2.2}px`,
        borderLeft: `${scale.bu * 0.55}px solid ${eventBorder(color, scale.isDark)}`,
        opacity: eventOpacity(ev, dim ? 'var(--cal-past-opacity)' : 1),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: scale.bu * 2, minWidth: 0 }}>
        <span style={{ fontSize: fontSize * 2, color: 'var(--cal-text-secondary)', fontVariantNumeric: 'tabular-nums', width: fontSize * 9, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {allDay ? t('fullscreen-calendar.allDay') : startLabel}
        </span>
        <span style={{ fontSize: fontSize * 2.5, fontWeight: 600, color: 'var(--cal-text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {glyph ? `${glyph} ` : ''}{ev.title}
        </span>
        {ev.location && (
          <span style={{ fontSize: fontSize * 1.6, color: 'var(--cal-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '28%' }}>
            {ev.location}
          </span>
        )}
        {trailing && (
          <span style={{ fontSize: fontSize * 1.5, color: 'var(--cal-text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {trailing}
          </span>
        )}
      </div>
      {progress != null && <EventProgressBar fraction={progress} fontSize={fontSize * 1.6} />}
    </div>
  );
}
