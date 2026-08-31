'use client';

import { memo, useMemo } from 'react';
import { isSameDay, isSameMonth, addDays, getWeek, differenceInCalendarDays } from 'date-fns';
import {
  parseEventWallTime, eventsForDay, weekStartsOnFor, weekNumberOptions, clampWeeksToShow, clampGridMaxEventsPerCell,
  clampGridDayLabelScale,
  formatEventTimeCompact, allDaySpanSegment, formatMonthRangeLabel, isAllDayEvent, isWeekendDay,
} from '@/lib/calendar-utils';
import { viewDayWindow } from '@/lib/calendar-legend';
import { pickGridTimeColor, pickPillTextColor, pickTintedTextColor } from '@/lib/calendar-color';
import { dayDecorFor, mergeCellDecor } from '@/lib/calendar-rules';
import { DayBadges } from '../shared/DayBadges';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarConfig, CalendarEvent, CalendarGridTheme, ModuleStyle } from '@/types/config';
import { withAlpha, type EventDisplayStyle } from './support';
import { EventCard } from './EventCard';

// ─── Shared grid pieces (week / month / multi-week) ───

/** Gutter for the month and multi-week grids: 2px, double the week grid's
 *  1px, because their cells are short and need more air to separate. The
 *  same value must reach every grid of a view (header row included) or the
 *  weekday labels drift off the columns below. */
const GRID_GAP = 'gap-0.5';

/** An `em` size at the configured day-label scale. Rounded because
 *  `0.6 * 1.1` is 0.66000000000000003 in binary floating point and that whole
 *  string would otherwise land in the DOM. */
export function scaledEm(base: number, scale: number): string {
  return `${Math.round(base * scale * 1000) / 1000}em`;
}

/** Reads the column layout off `config` rather than taking the flags loose,
 *  so it can't be called with a scale that disagrees with the WeekNumberCell
 *  sitting in the column it sizes. */
export function gridTemplateFor(config: CalendarConfig): string {
  // The week-number column is a fixed width, not `auto`: the header and the
  // body rows are separate grids, so an `auto` column resolves per grid
  // (empty header cell ≈ 0px vs two week-number digits) and shifts every
  // weekday label off the day column below it. It tracks the day-label scale
  // so a larger week number still fits its column.
  if (!(config.showWeekNumbers ?? false)) return 'repeat(7, 1fr)';
  return `${scaledEm(1.6, clampGridDayLabelScale(config.gridDayLabelScale))} repeat(7, 1fr)`;
}

/** `fontSize` is the unscaled em size; the cell applies gridDayLabelScale
 *  itself, since week numbers are date furniture like the day numbers. */
export function WeekNumberCell({ date, config, className = 'pt-0.5', fontSize = 0.55 }: {
  date: Date;
  config: CalendarConfig;
  className?: string;
  fontSize?: number;
}) {
  return (
    <div className={`flex items-start justify-center px-1 ${className}`}>
      <span style={{ fontSize: scaledEm(fontSize, clampGridDayLabelScale(config.gridDayLabelScale)), opacity: TEXT_OPACITY.tertiary }}>
        {getWeek(date, weekNumberOptions(config.startDay))}
      </span>
    </div>
  );
}

/** Weekday header for the month and multi-week grids (the week grid renders
 *  its own, with day numbers and badges). */
function DayOfWeekHeaderRow({ dates, config, locale, today, accentColor }: {
  dates: Date[];
  config: CalendarConfig;
  locale: string;
  /** Modern grid themes: bold + accent the column containing `today`. */
  today?: Date;
  accentColor?: string;
}) {
  const dayLabelScale = clampGridDayLabelScale(config.gridDayLabelScale);
  return (
    <div className={`grid ${GRID_GAP}`} style={{ gridTemplateColumns: gridTemplateFor(config) }}>
      {(config.showWeekNumbers ?? false) && <div />}
      {dates.map((d) => {
        const highlight = today != null && accentColor != null && d.getDay() === today.getDay();
        return (
          <div key={d.toISOString()} className="text-center py-0.5">
            <span
              className={`uppercase tracking-wider${highlight ? ' font-bold' : ''}`}
              style={{ fontSize: scaledEm(0.6, dayLabelScale), ...(highlight ? { color: accentColor } : { opacity: TEXT_OPACITY.tertiary }) }}
            >
              {formatDateSync(d, 'EEE', { locale })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DayCellEvents({ events, maxPerCell, textColor, accentColor, eventStyle, t, locale, gapClass = 'gap-px' }: {
  events: CalendarEvent[];
  maxPerCell: number;
  textColor: string;
  accentColor: string;
  eventStyle: EventDisplayStyle;
  t: TranslateFn;
  locale: string;
  gapClass?: string;
}) {
  return (
    <div className={`flex flex-col ${gapClass} overflow-hidden`}>
      {events.slice(0, maxPerCell).map((ev) => (
        <EventCard key={ev.id} event={ev} textColor={textColor} showTime={false} showLocation={false} compact accentColor={accentColor} eventStyle={eventStyle} t={t} locale={locale} />
      ))}
      {events.length > maxPerCell && (
        <span className="text-center" style={{ fontSize: '0.55em', opacity: TEXT_OPACITY.tertiary }}>
          {t('calendar.moreCount', { count: events.length - maxPerCell })}
        </span>
      )}
    </div>
  );
}

// ─── Month + Multi-Week Grid Views ───

interface GridViewProps {
  events: CalendarEvent[];
  accentColor: string;
  eventStyle: EventDisplayStyle;
  config: CalendarConfig;
  style: ModuleStyle;
  today: Date;
  now: Date;
}

type GridSkeletonProps = GridViewProps & { grid: ResolvedGrid; t: TranslateFn; locale: string };

/** Everything the two grid skeletons need to know about the days they draw,
 *  resolved once from `config.viewMode`. Month = the current month padded to
 *  whole weeks: out-of-month days render muted and nothing marks a month
 *  start (the title already names the month). Weeks = `weeksToShow` rows
 *  from the current week: past days render muted and every 1st carries its
 *  month name plus an accent rule. The day math is `viewDayWindow`'s, the
 *  same authority the fetch and legend windows use, so the grid can never
 *  disagree with them. */
interface ResolvedGrid {
  kind: 'month' | 'weeks';
  weeks: Date[][];
  /** The month name on the month grid, the month range on the rolling grid. */
  title: string;
  isMuted(date: Date, isToday: boolean): boolean;
  marksMonthStart(date: Date): boolean;
}

/** Keyed on the day (not the `today` object) so the parent's minute tick
 *  doesn't rebuild up to 84 cells' worth of dates. */
function useResolvedGrid(config: CalendarConfig, today: Date, locale: string): ResolvedGrid {
  const todayMs = today.getTime();
  const kind = config.viewMode === 'month' ? 'month' : 'weeks';
  const count = clampWeeksToShow(config.weeksToShow);
  const { startDay } = config;
  return useMemo(() => {
    const anchor = new Date(todayMs);
    const weekStartsOn = weekStartsOnFor(startDay);
    const { start, end } = kind === 'month'
      ? viewDayWindow({ kind: 'month-grid', today: anchor, weekStartsOn })
      : viewDayWindow({ kind: 'weeks', today: anchor, weekStartsOn, count });
    const weeks = Array.from({ length: differenceInCalendarDays(end, start) / 7 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
    if (kind === 'month') {
      return {
        kind,
        weeks,
        title: formatDateSync(anchor, 'MMMM yyyy', { locale }),
        isMuted: (date) => !isSameMonth(date, anchor),
        marksMonthStart: () => false,
      };
    }
    return {
      kind,
      weeks,
      title: formatMonthRangeLabel(start, addDays(end, -1), locale),
      isMuted: (date, isToday) => date < anchor && !isToday,
      marksMonthStart: (date) => date.getDate() === 1,
    };
  }, [todayMs, startDay, kind, count, locale]);
}

function GridTitle({ children }: { children: string }) {
  return <p className="text-center font-semibold" style={{ fontSize: '0.85em' }}>{children}</p>;
}

function useGridEventsByDay(weeks: Date[][], events: CalendarEvent[], timezone: string | undefined): Map<number, CalendarEvent[]> {
  return useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const week of weeks) {
      for (const date of week) {
        map.set(date.getTime(), eventsForDay(events, date, timezone));
      }
    }
    return map;
  }, [weeks, events, timezone]);
}

/** The month and multi-week views. `gridTheme` picks the skeleton: the
 *  original banner grid, or the modern shared skeleton with a per-theme pill
 *  treatment. The two views are the same grid; only the resolved range differs. */
export function GridView(props: GridViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const theme = props.config.gridTheme ?? 'banner';
  const grid = useResolvedGrid(props.config, props.today, locale);
  if (theme === 'banner') return <GridBannerView {...props} grid={grid} t={t} locale={locale} />;
  return <GridModernView {...props} grid={grid} theme={theme} t={t} locale={locale} />;
}

function GridBannerView({ events, config, style, today, now, accentColor, t, locale, eventStyle, grid }: GridSkeletonProps) {
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const maxPerCell = clampGridMaxEventsPerCell(config.gridMaxEventsPerCell, config.viewMode);
  const dayLabelScale = clampGridDayLabelScale(config.gridDayLabelScale);
  const gridTemplate = gridTemplateFor(config);

  // Badge colors are loop-invariant; computed once, not per cell (up to 84
  // cells re-render on every minute tick).
  const todayBadgeBg = withAlpha(accentColor, 'cc');
  const dayBadgeBg = withAlpha(accentColor, '40');
  const todayText = pickPillTextColor(accentColor);
  const dayText = pickTintedTextColor(style.textColor, accentColor, style.backgroundColor);
  const monthText = pickTintedTextColor(accentColor, accentColor, style.backgroundColor);

  const { weeks } = grid;
  const eventsByDay = useGridEventsByDay(weeks, events, eventStyle.timezone);

  return (
    <div className={`flex flex-col h-full ${GRID_GAP}`}>
      {/* The rolling grid never had a title under the banner look; the month grid keeps its own. */}
      {grid.kind === 'month' && <GridTitle>{grid.title}</GridTitle>}
      <DayOfWeekHeaderRow dates={weeks[0]} config={config} locale={locale} />

      <div className={`flex flex-col ${GRID_GAP} flex-1`}>
        {weeks.map((week, wi) => (
          <div key={wi} className={`grid ${GRID_GAP} flex-1`} style={{ gridTemplateColumns: gridTemplate }}>
            {showWeekNumbers && <WeekNumberCell date={week[0]} config={config} />}
            {week.map((date) => {
              const isToday = isSameDay(date, today);
              const isMuted = grid.isMuted(date, isToday);
              const marksMonthStart = grid.marksMonthStart(date);
              const dayEvents = eventsByDay.get(date.getTime()) ?? [];
              const hasBirthday = dayEvents.some((ev) => ev.kind === 'birthday');
              const decor = dayDecorFor(config, date, dayEvents, { today, now, timezone: eventStyle.timezone, isDark: true });

              return (
                <div
                  key={date.toISOString()}
                  className="flex flex-col p-0.5 overflow-hidden rounded"
                  style={mergeCellDecor({
                    backgroundColor: isToday ? withAlpha(accentColor, '1f') : 'rgba(255,255,255,0.02)',
                    ...(marksMonthStart ? { backgroundImage: `linear-gradient(to right, ${withAlpha(accentColor, '33')}, transparent)` } : {}),
                    opacity: isMuted ? TEXT_OPACITY.tertiary : 1,
                  }, decor)}
                >
                  {/* Digits at 0.65em to match the week grid; height 1.35em
                      keeps the previous badge's pixel height. The height is
                      NOT scaled: a length in `em` resolves against the
                      element's own font-size, so the strip already grows with
                      its digits — scaling it again grows it quadratically.
                      Flex splits month + day into separate items, so the
                      spacing between them must come from `gap` — a literal
                      space would be collapsed away. */}
                  <span className="flex items-center justify-center rounded leading-none mb-0.5" style={{
                    height: '1.35em', fontSize: scaledEm(0.65, dayLabelScale), gap: '0.25em',
                    fontWeight: isToday ? 700 : 400,
                    backgroundColor: isToday ? todayBadgeBg : dayBadgeBg,
                    color: isToday ? todayText : dayText,
                  }}>
                    {marksMonthStart && (
                      <span style={{ color: isToday ? todayText : monthText, fontWeight: isToday ? 700 : 600 }}>
                        {formatDateSync(date, 'MMM', { locale })}
                      </span>
                    )}
                    {formatDateSync(date, 'd', { locale })}
                    {hasBirthday && <span aria-hidden="true">🎂</span>}
                    <DayBadges badges={decor.badges} />
                  </span>
                  <DayCellEvents events={dayEvents} eventStyle={eventStyle} maxPerCell={maxPerCell} textColor={style.textColor} accentColor={accentColor} t={t} locale={locale} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One event pill in the modern grid themes. Clean = neutral pill, compact
 * contrast-guarded time in the calendar color, module-text semibold title.
 * Minimal = title only behind a 3px calendar-color bar. Vivid = solid
 * calendar-color pill with auto-contrast text. Multi-day all-day pills
 * stitch across their span: solid rounded-left first day, hollow squared
 * continuations — the 2px grid gutters read as one interrupted bar. */
const GridPill = memo(function GridPill({ event, date, theme, textColor, moduleBackground, accentColor, eventStyle, locale }: {
  event: CalendarEvent;
  date: Date;
  theme: Exclude<CalendarGridTheme, 'banner'>;
  // Primitives, not the ModuleStyle object, so the memo's shallow compare
  // survives a parent re-render that rebuilds the style object (same
  // rationale as EventCard's props).
  textColor: string;
  moduleBackground: string | undefined;
  accentColor: string;
  eventStyle: EventDisplayStyle;
  locale: string;
}) {
  const color = event.calendarColor ?? accentColor;

  if (isAllDayEvent(event)) {
    const segment = allDaySpanSegment(event, date);
    if (segment === 'middle' || segment === 'last') {
      return (
        <div
          data-event-id={event.id}
          className={`px-1 py-0.5 truncate ${segment === 'middle' ? 'rounded-none' : 'rounded-r'}`}
          style={{ boxShadow: `inset 0 0 0 1.5px ${color}`, color: textColor, opacity: TEXT_OPACITY.heading }}
        >
          <span className="truncate font-medium" style={{ fontSize: '0.7em' }}>{event.title}</span>
        </div>
      );
    }
    return (
      <div
        data-event-id={event.id}
        className={`px-1 py-0.5 truncate ${segment === 'first' ? 'rounded-l' : 'rounded'}`}
        style={{ backgroundColor: color, color: pickPillTextColor(color) }}
      >
        <span className="truncate font-semibold" style={{ fontSize: '0.7em' }}>{event.title}</span>
      </div>
    );
  }

  const title = <span className="truncate font-semibold" style={{ fontSize: '0.7em' }}>{event.title}</span>;

  if (theme === 'minimal') {
    return (
      <div
        data-event-id={event.id}
        className="flex items-baseline rounded truncate"
        style={{ padding: '2px 4px 2px 7px', backgroundColor: 'rgba(255,255,255,0.09)', boxShadow: `inset 3px 0 0 ${color}`, color: textColor }}
      >
        {title}
      </div>
    );
  }

  const start = parseEventWallTime(event.start, eventStyle.timezone);
  const time = formatEventTimeCompact(start, eventStyle.timeFormat, locale);

  if (theme === 'vivid') {
    return (
      <div
        data-event-id={event.id}
        className="flex items-baseline gap-1 px-1 py-0.5 rounded"
        style={{ backgroundColor: color, color: pickPillTextColor(color) }}
      >
        <span className="shrink-0 tabular-nums" style={{ fontSize: '0.65em', opacity: 0.8 }}>{time}</span>
        {title}
      </div>
    );
  }

  // clean
  return (
    <div
      data-event-id={event.id}
      className="flex items-baseline gap-1 px-1 py-0.5 rounded"
      style={{ backgroundColor: 'rgba(255,255,255,0.10)', color: textColor }}
    >
      <span className="shrink-0 tabular-nums" style={{ fontSize: '0.65em', color: pickGridTimeColor(color, moduleBackground) }}>{time}</span>
      {title}
    </div>
  );
});

/** Shared skeleton for the modern themes ('clean' | 'minimal' | 'vivid'):
 * month (or month-range) header, quiet corner day numbers with a solid badge
 * on today only, an accent ring on the today cell, weekend shading, bold
 * "MMM d" labels under an accent hairline where the rolling grid crosses into
 * a new month, stitched multi-day pills, and a chip-styled overflow row. The
 * theme only swaps the pill treatment (GridPill); gridEventStyle /
 * gridEventPillBackground do not apply here. data-grid-theme carries the
 * active theme for tests. */
function GridModernView({ events, config, style, today, now, accentColor, t, locale, eventStyle, theme, grid }: GridSkeletonProps & { theme: Exclude<CalendarGridTheme, 'banner'> }) {
  const showWeekNumbers = config.showWeekNumbers ?? false;
  const maxPerCell = clampGridMaxEventsPerCell(config.gridMaxEventsPerCell, config.viewMode);
  const dayLabelScale = clampGridDayLabelScale(config.gridDayLabelScale);
  const gridTemplate = gridTemplateFor(config);
  const { textColor, backgroundColor: moduleBackground } = style;

  // Loop-invariant colors, hoisted like the banner view's (up to 84 cells
  // re-render on every minute tick).
  const todayBadgeText = pickPillTextColor(accentColor);
  const todayCellTint = withAlpha(accentColor, '24');
  const todayRing = `inset 0 0 0 1.5px ${accentColor}`;
  const monthRule = `inset 0 2px 0 ${withAlpha(accentColor, 'bf')}`;

  const { weeks } = grid;
  const eventsByDay = useGridEventsByDay(weeks, events, eventStyle.timezone);

  return (
    <div data-grid-theme={theme} className={`flex flex-col h-full ${GRID_GAP}`}>
      <GridTitle>{grid.title}</GridTitle>
      <DayOfWeekHeaderRow dates={weeks[0]} config={config} locale={locale} today={today} accentColor={accentColor} />
      <div className={`flex flex-col ${GRID_GAP} flex-1`}>
        {weeks.map((week, wi) => (
          <div key={wi} className={`grid ${GRID_GAP} flex-1`} style={{ gridTemplateColumns: gridTemplate }}>
            {showWeekNumbers && <WeekNumberCell date={week[0]} config={config} />}
            {week.map((date) => {
              const isToday = isSameDay(date, today);
              const isMuted = grid.isMuted(date, isToday);
              const marksMonthStart = grid.marksMonthStart(date);
              const isWeekend = isWeekendDay(date);
              const dayEvents = eventsByDay.get(date.getTime()) ?? [];
              const shown = dayEvents.slice(0, maxPerCell);
              const overflow = dayEvents.length - shown.length;
              const hasBirthday = dayEvents.some((ev) => ev.kind === 'birthday');
              const cellShadow = [isToday ? todayRing : null, marksMonthStart ? monthRule : null]
                .filter(Boolean).join(', ');

              const decor = dayDecorFor(config, date, dayEvents, { today, now, timezone: eventStyle.timezone, isDark: true });

              return (
                <div
                  key={date.toISOString()}
                  className="flex flex-col p-0.5 overflow-hidden rounded"
                  style={mergeCellDecor({
                    backgroundColor: isToday ? todayCellTint : `rgba(255, 255, 255, ${isWeekend ? 0.065 : 0.045})`,
                    ...(cellShadow ? { boxShadow: cellShadow } : {}),
                  }, decor)}
                >
                  {/* The row is a bare div with no font-size of its own, so
                      its 1.4em resolves against the cell and has to be scaled
                      by hand to keep making room for the digits. The badge
                      below sizes its circle in its OWN em, which the scaled
                      font-size already grew — scaling that too would balloon
                      the circle out of the cell. */}
                  <div className="flex items-center shrink-0" style={{ height: scaledEm(1.4, dayLabelScale), padding: '0 0.15em', marginBottom: '0.1em' }}>
                    {isToday ? (
                      <span
                        className="inline-flex items-center justify-center rounded-full font-bold tabular-nums leading-none"
                        style={{ minWidth: '1.4em', height: '1.4em', padding: '0 0.3em', fontSize: scaledEm(0.65, dayLabelScale), backgroundColor: accentColor, color: todayBadgeText }}
                      >
                        {formatDateSync(date, 'd', { locale })}
                      </span>
                    ) : (
                      <span
                        className="leading-none tabular-nums"
                        style={{
                          fontSize: scaledEm(0.65, dayLabelScale),
                          fontWeight: marksMonthStart ? 700 : 400,
                          // Muted wins: a month boundary that has already
                          // passed still reads as one, just not loudly.
                          opacity: isMuted ? TEXT_OPACITY.dim : marksMonthStart ? TEXT_OPACITY.primary : TEXT_OPACITY.secondary,
                        }}
                      >
                        {formatDateSync(date, marksMonthStart ? 'MMM d' : 'd', { locale })}
                      </span>
                    )}
                    {hasBirthday && <span aria-hidden="true" className="shrink-0" style={{ fontSize: scaledEm(0.6, dayLabelScale), marginLeft: '0.2em' }}>🎂</span>}
                    <DayBadges badges={decor.badges} style={{ fontSize: scaledEm(0.65, dayLabelScale), marginLeft: '0.25em' }} />
                  </div>
                  <div className="flex flex-col gap-px overflow-hidden" style={isMuted ? { opacity: TEXT_OPACITY.dim } : undefined}>
                    {shown.map((ev) => {
                      const pill = <GridPill key={ev.id} event={ev} date={date} theme={theme} textColor={textColor} moduleBackground={moduleBackground} accentColor={accentColor} eventStyle={eventStyle} locale={locale} />;
                      return ev.opacity == null ? pill : <div key={ev.id} style={{ opacity: ev.opacity }}>{pill}</div>;
                    })}
                    {overflow > 0 && (
                      <span className="text-center rounded" style={{ fontSize: '0.6em', opacity: TEXT_OPACITY.secondary, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                        {t('calendar.moreCount', { count: overflow })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
