'use client';

import { useMemo } from 'react';
import { addDays, isSameDay } from 'date-fns';
import { isEventOnDay, formatEventTime } from '@/lib/calendar-utils';
import {
  buildPersonRows, eventsForRow, busyBlocksForDay, freeGaps, commonFreeGaps, initialsOf, EVERYONE_COLOR, EVERYONE_ROW_ID,
  type BusyBlock, type FreeGap, type PersonRow,
} from '@/lib/calendar-people';
import { PersonAvatar, PeopleHint } from './person-view-bits';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarEvent, CalendarScale, CalendarViewProps } from './view-support';
import { eventSurface } from '@/lib/calendar-event-surface';
import { formatHourLabel } from './shared-time-grid';
import { DEFAULT_TIME_FORMAT, type TimeFormat } from '@/types/config';

/** Gaps shorter than this are not "free time", just a breather. */
const MIN_GAP_HOURS = 0.5;
/** The "everyone is free" card only counts a span this long. */
const EVERYONE_MIN_HOURS = 1;

interface PersonDay {
  row: PersonRow;
  blocks: BusyBlock[];
  /** Free spans still ahead (from now on); drives the labels and the card. */
  gaps: FreeGap[];
  /** Every free span of the day, drawn hatched so the track always tells the day's story. */
  dayGaps: FreeGap[];
}

/**
 * One track per person for today (and a compact tomorrow): busy blocks
 * in the person's color, free gaps hatched and labeled with their length,
 * and a card naming when everyone is free. Shared events (the Everyone
 * row's) are busy for every track, since dinner is dinner for the whole
 * household.
 */
export function FreeTimeView({ events, timezone, config, scale, today, now, timeFormat = DEFAULT_TIME_FORMAT, people }: CalendarViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const fontSize = scale.bu * scale.typoMul * scale.densityMul;
  const am = t('fullscreen-calendar.am');
  const pm = t('fullscreen-calendar.pm');
  const hourStart = Math.max(0, Math.min(23, config.freeTimeHourStart ?? 7));
  const hourEnd = Math.max(hourStart + 1, Math.min(24, config.freeTimeHourEnd ?? 22));
  const showTomorrow = config.freeTimeShowTomorrow !== false;
  const tomorrow = addDays(today, 1);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const isToday = isSameDay(now, today);
  const nowInRange = isToday && nowHour >= hourStart && nowHour <= hourEnd;
  // Free time only counts from now on: before the window opens the whole
  // day is ahead, after it closes nothing is left today (a board read at
  // 10 PM must not offer "7 AM – 8 AM" as tonight's free hour).
  const dayOver = isToday && nowHour >= hourEnd;
  const fromHour = isToday ? Math.max(hourStart, Math.min(nowHour, hourEnd)) : hourStart;

  const everyoneLabel = t('fullscreen-calendar.everyone');
  const householdLabel = t('fullscreen-calendar.freeTime.household');
  const model = useMemo(() => {
    const windowEvents = events.filter((ev) => isEventOnDay(ev, today, timezone) || isEventOnDay(ev, tomorrow, timezone));
    const allRows = buildPersonRows(windowEvents, people, { everyoneLabel, everyoneColor: EVERYONE_COLOR, includeEveryone: true });
    const everyoneRow = allRows.find((r) => r.id === EVERYONE_ROW_ID) ?? null;
    let personRows = allRows.filter((r) => r.id !== EVERYONE_ROW_ID);
    // Shared events are busy for everybody; with nobody configured or seen,
    // the household is one track.
    const shared = everyoneRow ? eventsForRow(windowEvents, everyoneRow, allRows) : [];
    if (personRows.length === 0) {
      personRows = [{ id: '__household__', name: householdLabel, color: EVERYONE_COLOR, initials: initialsOf(householdLabel), sourceIds: null }];
    }
    const forDay = (day: Date, fromHour: number): PersonDay[] => personRows.map((row) => {
      const own = row.sourceIds ? eventsForRow(windowEvents, row, allRows) : windowEvents;
      const seen = new Set(own.map((ev) => ev.id));
      const merged: CalendarEvent[] = [...own, ...shared.filter((ev) => !seen.has(ev.id))];
      const blocks = busyBlocksForDay(merged, day, hourStart, hourEnd, timezone);
      // Gaps are only counted from now on: what was free this morning is gone.
      const gaps = fromHour >= hourEnd ? [] : freeGaps(blocks, fromHour, hourEnd, MIN_GAP_HOURS);
      const dayGaps = freeGaps(blocks, hourStart, hourEnd, MIN_GAP_HOURS);
      return { row, blocks, gaps, dayGaps };
    });
    const todayRows = forDay(today, fromHour);
    const tomorrowRows = showTomorrow ? forDay(tomorrow, hourStart) : [];
    const everyoneToday = commonFreeGaps(todayRows.map((r) => r.gaps), EVERYONE_MIN_HOURS);
    const everyoneTomorrow = commonFreeGaps(tomorrowRows.map((r) => r.gaps), EVERYONE_MIN_HOURS);
    return { todayRows, tomorrowRows, everyoneToday, everyoneTomorrow };
  }, [events, people, today, tomorrow, timezone, hourStart, hourEnd, fromHour, showTomorrow, everyoneLabel, householdLabel]);

  const { todayRows, tomorrowRows, everyoneToday, everyoneTomorrow } = model;
  const span = hourEnd - hourStart;
  const x = (h: number) => `${(((h - hourStart) / span) * 100).toFixed(3)}%`;
  // Wide enough for a real calendar name ("Smith family") next to the
  // avatar; the fallback rows are named after sources, not first names.
  const nameColW = scale.bu * (scale.orientation === 'landscape' ? 14 : 20);
  // Rows share the height but never balloon: one calendar in the fallback
  // must not become a single 1500px track. Leftover space stays empty.
  const rowMaxH = fontSize * 10;
  const noPeople = !people || people.length === 0;
  const sidePad = scale.bu * 3;
  const fmtHour = (h: number) => formatHourAt(today, h, timeFormat, locale, am, pm);
  const fmtRange = (g: FreeGap) => `${fmtHour(g.start)} – ${fmtHour(g.end)}`;
  const fmtLen = (g: FreeGap) => formatGapLength(g.end - g.start, t);

  return (
    <div aria-label={t('fullscreen-calendar.viewLabels.freeTime')} style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Today heading + hour axis */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: scale.bu * 1.2, padding: `${scale.bu * 1.6}px ${sidePad}px ${scale.bu * 0.4}px` }}>
        <span style={{ fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif", fontSize: fontSize * 3, color: 'var(--cal-text-primary)' }}>
          {t('fullscreen-calendar.freeTime.today')}
        </span>
        <span style={{ fontSize: fontSize * 1.3, color: 'var(--cal-text-secondary)' }}>
          {formatDateSync(today, 'EEEE, MMM d', { locale })} {'·'} {formatEventTime(now, timeFormat, locale)}
        </span>
      </div>
      <HourAxis hourStart={hourStart} hourEnd={hourEnd} nameColW={nameColW} sidePad={sidePad} fontSize={fontSize} am={am} pm={pm} timeFormat={timeFormat} />

      {/* Today: one track per person. The block grows with the household but
          stops at the row cap, so the card follows a short household closely
          instead of sitting at the bottom of an empty board. */}
      <div style={{ flex: '1 1 auto', minHeight: 0, maxHeight: todayRows.length * rowMaxH, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        {todayRows.map(({ row, blocks, gaps, dayGaps }) => (
          <div key={row.id} style={{
            flex: '1 1 0', minHeight: fontSize * 6, maxHeight: rowMaxH,
            display: 'grid', gridTemplateColumns: `${nameColW}px 1fr`, alignItems: 'center',
            padding: `0 ${sidePad}px`, borderTop: '1px solid var(--cal-border-subtle)',
          }}>
            <PersonLabel row={row} gaps={gaps} freeNow={nowInRange && gaps[0] != null && gaps[0].start <= fromHour + 1 / 60} dayOver={dayOver} fontSize={fontSize} scale={scale} fmtHour={fmtHour} t={t} />
            <Track blocks={blocks} gaps={dayGaps} fromHour={isToday ? fromHour : hourStart} nowX={nowInRange ? x(nowHour) : null} x={x} fontSize={fontSize} scale={scale} height={fontSize * 4.2} fmtLen={fmtLen} />
          </div>
        ))}
      </div>
      {noPeople && <PeopleHint fontSize={fontSize} padding={`${scale.bu * 1.2}px ${sidePad}px 0`} t={t} />}

      {/* Everyone card */}
      <div style={{
        margin: `${scale.bu * 2}px ${sidePad}px 0`, flexShrink: 0,
        borderRadius: scale.bu * 1.6, padding: `${scale.bu * 1.8}px ${scale.bu * 2.6}px`,
        background: 'var(--cal-accent-bg)', border: '1px solid var(--cal-accent-surface)', boxShadow: 'var(--cal-card-shadow)',
      }} role="status">
        <div style={{ fontSize: fontSize * 1.05, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--cal-accent)' }}>
          {everyoneToday.length > 0
            ? t('fullscreen-calendar.freeTime.everyoneFree')
            : dayOver ? t('fullscreen-calendar.freeTime.today') : t('fullscreen-calendar.freeTime.nobodyFree')}
        </div>
        <div style={{ fontSize: fontSize * 3.4, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: scale.bu * 0.6, color: 'var(--cal-text-primary)' }}>
          {everyoneToday.length > 0
            ? t('fullscreen-calendar.freeTime.rangeToday', { range: fmtRange(everyoneToday[0]) })
            : dayOver ? t('fullscreen-calendar.freeTime.dayDone') : t('fullscreen-calendar.freeTime.noCommonTimeToday')}
        </div>
        <div style={{ fontSize: fontSize * 1.5, color: 'var(--cal-text-secondary)', marginTop: scale.bu * 0.6 }}>
          {[
            everyoneToday.slice(1).length > 0
              ? t('fullscreen-calendar.freeTime.alsoToday', { ranges: everyoneToday.slice(1).map(fmtRange).join(', ') })
              : null,
            showTomorrow
              ? (everyoneTomorrow.length > 0
                ? t('fullscreen-calendar.freeTime.tomorrowFrom', { range: fmtRange(everyoneTomorrow[0]) })
                : t('fullscreen-calendar.freeTime.tomorrowNone'))
              : null,
          ].filter(Boolean).join(' ')}
        </div>
      </div>

      {/* Tomorrow, compact */}
      {showTomorrow && tomorrowRows.length > 0 && (
        <div style={{ margin: `${scale.bu * 2}px ${sidePad}px ${scale.bu * 1.6}px`, flexShrink: 0 }}>
          <div style={{ fontSize: fontSize * 1.05, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--cal-text-tertiary)', marginBottom: scale.bu * 0.6 }}>
            {t('fullscreen-calendar.freeTime.tomorrow', { day: formatDateSync(tomorrow, 'EEEE', { locale }) })}
          </div>
          {tomorrowRows.map(({ row, blocks, dayGaps }) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: `${nameColW}px 1fr`, alignItems: 'center', height: fontSize * 3.6, borderTop: '1px solid var(--cal-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: scale.bu * 0.6, fontSize: fontSize * 1.1, fontWeight: 600, color: 'var(--cal-text-primary)', minWidth: 0, paddingRight: scale.bu * 0.8 }}>
                <PersonAvatar row={row} size={fontSize * 1.9} fontSize={fontSize * 0.7} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
              </div>
              <Track blocks={blocks} gaps={dayGaps} fromHour={hourStart} nowX={null} x={x} fontSize={fontSize * 0.85} scale={scale} height={fontSize * 2.4} fmtLen={fmtLen} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HourAxis({ hourStart, hourEnd, nameColW, sidePad, fontSize, am, pm, timeFormat }: {
  hourStart: number; hourEnd: number; nameColW: number; sidePad: number; fontSize: number; am: string; pm: string; timeFormat: TimeFormat;
}) {
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);
  // Label every hour like the schedule gutter; only a very long window
  // (18h+) thins to every other hour so labels never collide.
  const step = hours.length > 17 ? 2 : 1;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${nameColW}px 1fr`, padding: `0 ${sidePad}px` }}>
      <div />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hours.length}, 1fr)`, fontSize: fontSize * 0.75, color: 'var(--cal-text-tertiary)', fontVariantNumeric: 'tabular-nums', padding: `${fontSize * 0.4}px 0` }}>
        {hours.map((h, i) => (
          <span key={h} style={{ whiteSpace: 'nowrap', visibility: i % step === 0 ? 'visible' : 'hidden' }}>
            {formatHourLabel(h, timeFormat, am, pm)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PersonLabel({ row, gaps, freeNow, dayOver, fontSize, scale, fmtHour, t }: {
  row: PersonRow; gaps: FreeGap[]; freeNow: boolean; dayOver: boolean; fontSize: number; scale: CalendarScale; fmtHour: (h: number) => string; t: TranslateFn;
}) {
  const next = gaps[0];
  // A gap already underway is "free until 6 PM", not "free after now": the
  // forward gaps start their cursor at now, so gaps[0] beginning at now
  // means the person is free this minute.
  const status = next
    ? (freeNow
      ? t('fullscreen-calendar.freeTime.freeUntil', { time: fmtHour(next.end) })
      : t('fullscreen-calendar.freeTime.freeAfter', { time: fmtHour(next.start) }))
    : dayOver ? t('fullscreen-calendar.freeTime.doneForToday') : t('fullscreen-calendar.freeTime.busyAllDay');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: scale.bu * 0.8, minWidth: 0, paddingRight: scale.bu * 0.8 }}>
      <PersonAvatar row={row} size={fontSize * 2.6} fontSize={fontSize * 0.9} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: fontSize * 1.2, fontWeight: 650, color: 'var(--cal-text-primary)', lineHeight: 1.1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{row.name}</div>
        <div style={{ fontSize: fontSize * 0.78, color: 'var(--cal-text-tertiary)', marginTop: 2, lineHeight: 1.2 }}>{status}</div>
      </div>
    </div>
  );
}

/**
 * One person's day as a bar: hatched free spans and colored busy blocks
 * over a visible track. Everything before `fromHour` (now, on today) is
 * dimmed as one region, so the morning still tells its story without
 * competing with what is left; free-span length labels only count the
 * part that is still ahead.
 */
function Track({ blocks, gaps, fromHour, nowX, x, fontSize, scale, height, fmtLen, compact }: {
  blocks: BusyBlock[];
  gaps: FreeGap[];
  fromHour: number;
  nowX: string | null;
  x: (h: number) => string;
  fontSize: number;
  scale: CalendarScale;
  height: number;
  fmtLen: (g: FreeGap) => string;
  compact?: boolean;
}) {
  const inset = compact ? 3 : 5;
  return (
    <div style={{
      position: 'relative', height, borderRadius: scale.bu * 0.8, overflow: 'hidden',
      background: 'var(--cal-surface)', border: '1px solid var(--cal-border)',
    }}>
      {gaps.map((g) => {
        const ahead = g.end > fromHour ? { start: Math.max(g.start, fromHour), end: g.end } : null;
        // The label's left inset resolves against the gap div's width, not
        // the track's, so it must be a gap-relative percentage.
        const aheadLeft = ahead ? `${(((ahead.start - g.start) / (g.end - g.start)) * 100).toFixed(3)}%` : '0%';
        return (
          <div
            key={`${g.start}-${g.end}`}
            data-free-gap=""
            style={{
              position: 'absolute', top: inset, bottom: inset, left: x(g.start), width: `calc(${x(g.end)} - ${x(g.start)})`,
              borderRadius: scale.bu * 0.6,
              backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, var(--cal-text-tertiary) 6px 7px)',
              opacity: 0.55,
            }}
          >
            {!compact && ahead && ahead.end - ahead.start >= MIN_GAP_HOURS && (
              <span style={{
                position: 'absolute', top: 0, bottom: 0, left: aheadLeft, right: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: fontSize * 0.85, fontWeight: 700, color: 'var(--cal-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden',
                background: 'var(--cal-surface)', borderRadius: scale.bu * 0.6, margin: `${inset}px 0`,
                paddingInline: fontSize * 0.5, width: 'fit-content', marginInline: 'auto', alignSelf: 'center',
              }}>
                {fmtLen(ahead)}
              </span>
            )}
          </div>
        );
      })}
      {blocks.map((b) => (
        <div
          key={b.id}
          className="fsc-event-block"
          data-event-id={b.id}
          title={b.title}
          style={{
            position: 'absolute', top: inset, bottom: inset, left: x(b.start), width: `calc(${x(b.end)} - ${x(b.start)})`,
            ...eventSurface(b.color, scale, 'block', { radius: scale.bu * 0.6, washAlpha: 0.32 }),
            display: 'flex', alignItems: 'center', padding: `0 ${scale.bu * 0.6}px`,
            fontSize: fontSize * 0.95, fontWeight: 600, color: 'var(--cal-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden',
            zIndex: 2,
          }}
        >
          {b.title}
        </div>
      ))}
      {/* What is already behind us, dimmed as one region */}
      {fromHour > 0 && (
        <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: x(fromHour), background: 'var(--cal-bg)', opacity: 0.55, zIndex: 3, pointerEvents: 'none' }} />
      )}
      {nowX && (
        <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: nowX, width: 2, background: 'var(--cal-accent)', zIndex: 4, filter: 'drop-shadow(0 0 4px var(--cal-accent))' }} />
      )}
    </div>
  );
}

/** "7:30 PM" (or "19:30") for a fractional hour on `day`. */
function formatHourAt(day: Date, hour: number, timeFormat: TimeFormat, locale: string, am: string, pm: string): string {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  if (whole >= 24) return timeFormat === '24h' ? '24:00' : formatHourLabel(24, timeFormat, am, pm);
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), whole, minutes);
  return formatEventTime(d, timeFormat, locale);
}

/** "3½ h", "45 min". Half hours get the ½ glyph, which needs no locale. */
function formatGapLength(hours: number, t: TranslateFn): string {
  if (hours < 1) return t('fullscreen-calendar.freeTime.minutes', { count: Math.round(hours * 60) });
  const whole = Math.floor(hours);
  const half = hours - whole >= 0.5;
  return t('fullscreen-calendar.freeTime.hours', { hours: `${whole}${half ? '½' : ''}` });
}
