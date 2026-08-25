'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { startOfWeek, endOfWeek, addDays, startOfDay } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarX, MapPin, List, Columns3, Grid3X3, CalendarClock, ScrollText } from 'lucide-react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useTZClock } from '@/hooks/useTZClock';
import { applyEventRules, resolveDayDecor, type DayDecor } from '@/lib/calendar-rules';
import { applyTitleFilter, buildLegend, effectiveWeatherPlacement, formatEventTime, isEventUpcoming, listViewCutoff, resolveScheduleStart, viewDayWindow, weekStartsOnFor } from '@/lib/calendar-utils';
import { buildHourlyIndex, type HourlyIndex } from './event-weather';
import { toTZWallTime } from '@/lib/timezone';
import { getWeatherIcon } from '@/lib/weather-icons';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { DEFAULT_TIME_FORMAT, type CalendarFetchStatus, type CalendarSourceStatus, type CalendarTitleFilter, type CalendarEventRule, type FullscreenCalendarConfig, type ModuleStyle, type CalendarEvent, type TimeFormat, type WeatherPlacement, type WeekStartDay } from '@/types/config';
import type { ForecastDay, HourlyWeather } from '@/lib/weather/types';
import { getThemeTokens, migrateFromDarkMode, getTypoMultiplier, getDensityMultiplier, surfaceBackdrop } from '@/lib/fullscreen-themes';
import type { FullscreenEventStyle } from '@/lib/fullscreen-themes';
import { brightenForDark, eventBg, eventBorder, resolveCalendarAccent } from '@/lib/calendar-event-surface';
import { ScheduleView } from './ScheduleView';
import { WeekListView } from './WeekListView';
import { MonthGridView } from './MonthGridView';
import { DayTimelineView } from './DayTimelineView';
import { AgendaView } from './AgendaView';
import { EventDetailOverlay } from '../shared/EventDetailOverlay';
import { CalendarLegend } from '../shared/CalendarLegend';
import { useFailingSources } from '../shared/useFailingSources';

// Opening/closing the detail overlay re-renders this module; memo keeps the
// (potentially hundreds of) event blocks from reconciling on those frames —
// and on 60s clock ticks for the views whose props didn't change.
const MemoScheduleView = memo(ScheduleView);
const MemoWeekListView = memo(WeekListView);
const MemoMonthGridView = memo(MonthGridView);
const MemoDayTimelineView = memo(DayTimelineView);
const MemoAgendaView = memo(AgendaView);

// ─── Types ───

// Re-export CalendarEvent from central types for view imports
export type { CalendarEvent } from '@/types/config';

export interface CalendarScale {
  bu: number; // base unit = min(w, h) / 100
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  densityMul: number;
  typoMul: number;
  isDark: boolean;
  /** How the active theme paints event blocks. See `eventSurface`. */
  eventStyle: FullscreenEventStyle;
}

// Re-export MapPin for use in subviews
export { MapPin };

/** Weather data + placement bundle threaded to the list views. The hourly
 *  index is pre-built here (once per fetch) so per-row lookups on every
 *  60s tick are O(1) instead of a scan over the full hourly horizon. */
export interface CalendarWeather {
  hourlyIndex: HourlyIndex;
  forecast?: ForecastDay[];
  placement: WeatherPlacement;
}

/**
 * The one props contract every fullscreen view accepts. `viewProps` below is
 * annotated with it and each view's signature uses it, so adding a field here
 * reaches all five views — a per-view interface would let a JSX spread pass
 * a prop the view silently ignores (spreads skip excess-property checks).
 */
export interface CalendarViewProps {
  events: CalendarEvent[];
  /** Display timezone; event times are bucketed and labeled in it, like `today`/`now`. */
  timezone?: string;
  config: FullscreenCalendarConfig;
  scale: CalendarScale;
  today: Date;
  now: Date;
  timeFormat?: TimeFormat;
  weather?: CalendarWeather;
  /** Sources whose feed is failing; list-view rows add a "saved" time suffix. */
  failingSourceIds?: ReadonlySet<string>;
}

// ─── Helpers ───

/** Shared chrome for the header/footer legend strips; the caller adds the one differing border. */
function legendStripStyle(scale: CalendarScale): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: `${scale.bu * 1.1 * scale.typoMul}px`,
    color: 'var(--cal-text-secondary)',
    background: 'var(--cal-header-bg)',
    padding: `${scale.bu * 0.6}px 1.5%`,
    position: 'relative',
    zIndex: 20,
  };
}

function getOrientation(w: number, h: number): 'portrait' | 'landscape' {
  const ratio = w / h;
  return ratio < 1.2 && h > w ? 'portrait' : 'landscape';
}


export function autoScheduleDays(width: number, density: string): number {
  const minColWidth = density === 'cozy' ? 200 : 150;
  const scaledMin = minColWidth * (Math.min(width, 1080) / 1080);
  const gutterWidth = 50;
  return Math.min(7, Math.max(1, Math.floor((width - gutterWidth) / scaledMin)));
}

function filterEvents(events: CalendarEvent[], sourceFilter?: string[]): CalendarEvent[] {
  if (!sourceFilter || sourceFilter.length === 0) return events;
  return events.filter(ev => {
    if (ev.sourceId && sourceFilter.includes(ev.sourceId)) return true;
    if (!ev.sourceId) return true;
    return false;
  });
}

/**
 * Events a fullscreen-calendar view should render: source-filtered, then
 * title-filtered, then — for the agenda view only — narrowed to upcoming
 * events, or to events ending today or later when `showFinishedToday` is
 * on (the agenda iterates days from today, so finished rows land under
 * today and dim via `dimPastEvents`). The other views (schedule, week-list,
 * month-grid, day-timeline) render fixed day/week/month ranges and
 * intentionally show past events, so they take the shared feed as-is.
 * Exported for unit testing this branch without rendering the component.
 */
export function selectVisibleEvents(
  events: CalendarEvent[],
  view: FullscreenCalendarConfig['view'],
  sourceFilter: string[] | undefined,
  now: Date,
  opts: { timezone?: string; titleFilter?: CalendarTitleFilter; showFinishedToday?: boolean; eventRules?: CalendarEventRule[] } = {},
): CalendarEvent[] {
  const filtered = applyEventRules(
    applyTitleFilter(filterEvents(events, sourceFilter), opts.titleFilter),
    opts.eventRules,
    { now, timezone: opts.timezone },
  );
  if (view !== 'agenda') return filtered;
  const cutoff = listViewCutoff(now, opts.showFinishedToday === true);
  return filtered.filter(ev => isEventUpcoming(ev, cutoff, opts.timezone));
}

/** Day-rule decor for one day cell / header in a fullscreen view. The auto
 *  tint is stronger on dark themes, where a light wash reads as nothing. */
export function dayDecorFor(
  config: FullscreenCalendarConfig,
  day: Date,
  dayEvents: CalendarEvent[],
  ctx: { today: Date; now: Date; timezone?: string; isDark: boolean },
): DayDecor {
  return resolveDayDecor(day, dayEvents, config.dayRules, ctx, { autoTintAlpha: ctx.isDark ? 0.22 : 0.14 });
}

/** Title text truncation: two-line clamp when wrapping, single-line ellipsis otherwise. */
export function clampStyle(wrap: boolean): React.CSSProperties {
  return wrap
    ? {
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        overflow: 'hidden',
      }
    : {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      };
}

function getHeaderTitle(
  view: string,
  today: Date,
  t: TranslateFn,
  locale: string,
  scheduleDays?: number,
  startDay?: WeekStartDay,
  scheduleStart?: Date,
): string {
  switch (view) {
    case 'schedule': {
      // The range starts at the anchor-resolved first column, which is only
      // `today` for the default anchor.
      const first = scheduleStart ?? today;
      const endDay = addDays(first, (scheduleDays ?? 7) - 1);
      if (first.getMonth() === endDay.getMonth()) {
        return `${formatDateSync(first, 'MMMM d', { locale })} \u2013 ${formatDateSync(endDay, 'd, yyyy', { locale })}`;
      }
      return `${formatDateSync(first, 'MMMM d', { locale })} \u2013 ${formatDateSync(endDay, 'MMMM d, yyyy', { locale })}`;
    }
    case 'week-list': {
      const weekStartsOn = weekStartsOnFor(startDay);
      const weekStart = startOfWeek(today, { weekStartsOn });
      const weekEnd = endOfWeek(today, { weekStartsOn });
      return `${formatDateSync(weekStart, 'MMMM d', { locale })} \u2013 ${formatDateSync(weekEnd, 'd, yyyy', { locale })}`;
    }
    case 'month-grid':
      return formatDateSync(today, 'MMMM yyyy', { locale });
    case 'day-timeline':
      return formatDateSync(today, 'EEEE, MMMM d', { locale });
    case 'agenda':
      return t('fullscreen-calendar.headerUpcoming');
    default:
      return formatDateSync(today, 'MMMM yyyy', { locale });
  }
}

const VIEW_ICONS: Record<string, typeof Columns3> = {
  'schedule': Columns3,
  'week-list': List,
  'month-grid': Grid3X3,
  'day-timeline': CalendarClock,
  'agenda': ScrollText,
};

const VIEW_LABEL_KEYS: Record<string, string> = {
  'schedule': 'fullscreen-calendar.viewLabels.schedule',
  'week-list': 'fullscreen-calendar.viewLabels.weekList',
  'month-grid': 'fullscreen-calendar.viewLabels.monthGrid',
  'day-timeline': 'fullscreen-calendar.viewLabels.dayTimeline',
  'agenda': 'fullscreen-calendar.viewLabels.agenda',
};

// ─── Skeleton loading ───

function SkeletonLoading({ scale }: { scale: CalendarScale }) {
  const rows = [0.7, 0.5, 0.85, 0.6, 0.4, 0.75];
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: scale.bu * 1.2,
      padding: `${scale.bu * 3}px ${scale.bu * 2}px`,
    }}>
      {rows.map((w, i) => (
        <div key={i} className="fsc-skeleton" style={{
          height: scale.bu * 3,
          width: `${w * 100}%`,
          borderRadius: scale.bu * 0.4,
          background: 'var(--cal-border)',
        }} />
      ))}
    </div>
  );
}

// ─── Empty state ───

function EmptyState({ scale, view, t, fetchFailed }: { scale: CalendarScale; view: string; t: TranslateFn; fetchFailed?: boolean }) {
  // A failed fetch with nothing kept is an outage, not a free day — it must
  // never render the same wording as a genuinely empty calendar.
  const label = fetchFailed ? t('fullscreen-calendar.cantLoadEvents')
    : view === 'month-grid' ? t('fullscreen-calendar.noEventsThisMonth')
    : view === 'agenda' ? t('fullscreen-calendar.noUpcomingEvents')
    : view === 'day-timeline' ? t('fullscreen-calendar.noEventsToday')
    : t('fullscreen-calendar.noEventsThisWeek');
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: scale.bu * 1.5,
      color: 'var(--cal-text-tertiary)',
    }}>
      <CalendarX size={scale.bu * 6} strokeWidth={1.2} aria-hidden="true" />
      <span style={{
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        fontSize: scale.bu * 1.5 * scale.typoMul,
        fontWeight: 400,
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main Component ───

interface FullscreenCalendarModuleProps {
  config: FullscreenCalendarConfig;
  style: ModuleStyle;
  events?: CalendarEvent[];
  timezone?: string;
  timeFormat?: TimeFormat;
  hourly?: HourlyWeather[];
  forecast?: ForecastDay[];
  units?: string;
  loading?: boolean;
  fullscreenTheme?: string;
  calendarStatus?: CalendarFetchStatus;
  /** Attached only while at least one source is failing (see buildModuleProps). */
  sourceStatus?: CalendarSourceStatus[];
}

export default function FullscreenCalendarModule({
  config,
  style: _style,
  events: rawEventsRaw,
  timezone,
  timeFormat,
  hourly,
  forecast,
  units,
  loading,
  fullscreenTheme,
  calendarStatus,
  sourceStatus,
}: FullscreenCalendarModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const rawEvents = useMemo(() => rawEventsRaw ?? [], [rawEventsRaw]);
  const { containerRef, dims } = useFullscreenDims();

  // Updates every 60s — drives now-line movement and midnight rollover
  const now = useTZClock(timezone);
  const today = useMemo(() => startOfDay(now), [now]);

  // Legend ring, named header pill, and per-row "saved" suffix all key off
  // this shared derivation (see useFailingSources).
  const { failingSources, failingSourceIds, soloFailingName, soloFailingSince } = useFailingSources({
    sourceStatus, sourceFilter: config.sourceFilter, timezone, timeFormat, locale, today, t,
  });

  const events = useMemo(
    () => selectVisibleEvents(rawEvents, config.view, config.sourceFilter, now, {
      timezone, titleFilter: config.titleFilter, showFinishedToday: config.agendaShowFinishedToday === true,
      eventRules: config.eventRules,
    }),
    [rawEvents, config.view, config.sourceFilter, now, timezone, config.titleFilter, config.agendaShowFinishedToday, config.eventRules],
  );

  const themeId = config.theme ?? fullscreenTheme ?? migrateFromDarkMode(config.darkMode);
  const theme = getThemeTokens(themeId);

  // Today-highlight fill derived from the resolved accent color so the
  // highlight follows accentColor (the fill was previously hardcoded orange).
  const highlightStyle = config.todayHighlightStyle ?? 'full';
  const resolvedAccent = resolveCalendarAccent(config.accentColor, theme);
  // Themes with an atmosphere layer dial the today wash down so the
  // background survives; 'subtle' stays proportionally fainter than 'full'.
  const fullAlpha = theme.todayFill ?? (theme.isDark ? 0.16 : 0.10);
  const subtleAlpha = theme.todayFill != null ? theme.todayFill * 0.55 : (theme.isDark ? 0.07 : 0.05);
  const todayFill =
    highlightStyle === 'full' ? eventBg(resolvedAccent, fullAlpha, theme.isDark)
    : highlightStyle === 'subtle' ? eventBg(resolvedAccent, subtleAlpha, theme.isDark)
    : 'transparent';

  const scale: CalendarScale = useMemo(() => ({
    bu: Math.min(dims.w, dims.h) / 100,
    width: dims.w,
    height: dims.h,
    orientation: getOrientation(dims.w, dims.h),
    densityMul: getDensityMultiplier(config.density),
    typoMul: getTypoMultiplier(config.typographySize),
    isDark: theme.isDark,
    eventStyle: theme.eventStyle ?? 'wash',
  }), [dims, config.density, config.typographySize, theme.isDark, theme.eventStyle]);
  // For schedule view, compute effective days count for the header title
  const scheduleDays = config.view === 'schedule'
    ? (config.scheduleDaysToShow > 0 ? config.scheduleDaysToShow : autoScheduleDays(scale.width, config.density))
    : undefined;
  const scheduleStart = config.view === 'schedule'
    ? resolveScheduleStart(today, config.scheduleStartAnchor, weekStartsOnFor(config.startDay))
    : undefined;
  const headerTitle = getHeaderTitle(config.view, today, t, locale, scheduleDays, config.startDay, scheduleStart);

  // Legend rows come from the events the current view actually draws — the
  // shared fetch window is wider than any single view, so scope to the
  // view's day range first. Only the view→window mapping lives here; the
  // date math and the holidays-label remap are shared (calendar-utils).
  const legendPlacement = config.showLegend ?? 'off';
  const legend = useMemo(() => {
    if (legendPlacement === 'off') return [];
    const weekStartsOn = weekStartsOnFor(config.startDay);
    const window =
      config.view === 'schedule'
        ? viewDayWindow({
            kind: 'days', today, weekStartsOn,
            start: resolveScheduleStart(today, config.scheduleStartAnchor, weekStartsOn),
            count: config.scheduleDaysToShow > 0 ? config.scheduleDaysToShow : autoScheduleDays(scale.width, config.density),
          })
        : config.view === 'week-list' ? viewDayWindow({ kind: 'week', today, weekStartsOn })
        : config.view === 'month-grid' ? viewDayWindow({ kind: 'month-grid', today, weekStartsOn })
        : config.view === 'day-timeline' ? viewDayWindow({ kind: 'days', today, weekStartsOn, count: 1 })
        : viewDayWindow({ kind: 'days', today, weekStartsOn, count: config.agendaDaysAhead > 0 ? config.agendaDaysAhead : 14 });
    return buildLegend(events, window, timezone, t('calendar.publicHolidays'));
  }, [
    legendPlacement, events, timezone, today, t,
    config.view, config.startDay, config.scheduleStartAnchor, config.scheduleDaysToShow,
    config.density, config.agendaDaysAhead, scale.width,
  ]);

  // Current weather from hourly data
  const currentTemp = hourly?.[0]?.temp;
  const weatherIconId = hourly?.[0]?.icon;
  const tempUnit = units === 'metric' ? '\u00B0C' : '\u00B0F';

  // Resolve weather Lucide icon
  const WeatherIcon = weatherIconId ? getWeatherIcon(weatherIconId, 'outline') : null;

  const ViewIcon = VIEW_ICONS[config.view] ?? Columns3;
  const viewLabelKey = VIEW_LABEL_KEYS[config.view];
  const viewLabel = viewLabelKey ? t(viewLabelKey) : config.view;

  const weatherPlacement = effectiveWeatherPlacement(config.view, config);
  const weather = useMemo<CalendarWeather>(
    () => ({ hourlyIndex: buildHourlyIndex(hourly), forecast, placement: weatherPlacement }),
    [hourly, forecast, weatherPlacement],
  );

  const viewProps = useMemo<CalendarViewProps>(
    () => ({ events, config, scale, today, now, timeFormat, weather, timezone, failingSourceIds }),
    [events, config, scale, today, now, timeFormat, weather, timezone, failingSourceIds],
  );
  const hasEvents = events.length > 0;
  const isLoading = loading && !hasEvents;

  // Failure \u2260 empty: while the shared calendar fetch is failing, the events
  // on screen are the kept last-good payload \u2014 badge them as saved rather
  // than live. Only a failure with NO successful fetch ever (updatedAt null)
  // renders the "can't load" state: last-good data whose visible window
  // happens to be empty (an agenda after the day's last event) is a normal
  // empty day, not an outage.
  const fetchFailed = calendarStatus?.error != null;
  const neverLoaded = fetchFailed && calendarStatus?.updatedAt == null;
  // The saved-from time is only meaningful on the day it happened; a
  // multi-day outage falls back to the generic wording. Formatted in the
  // display timezone like every other time in the module.
  const savedWall = fetchFailed && calendarStatus?.updatedAt != null
    ? (timezone ? toTZWallTime(new Date(calendarStatus.updatedAt), timezone) : new Date(calendarStatus.updatedAt))
    : null;
  const staleSince = savedWall && startOfDay(savedWall).getTime() === today.getTime()
    ? formatEventTime(savedWall, timeFormat ?? DEFAULT_TIME_FORMAT, locale)
    : null;


  // Tap-to-open detail: one delegated handler on the root instead of a
  // callback threaded through all five views. Every event element carries
  // data-event-id, so closest() maps a tap back to its event. State holds the
  // id, not the event object: the event is re-resolved each render so a data
  // refresh updates the open overlay (or closes it if the event is gone)
  // instead of showing a stale snapshot.
  const tapDetails = config.eventTapDetails === true;
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEvent = detailId ? events.find(ev => ev.id === detailId) ?? null : null;
  // Config is live-pushed without a remount; turning the feature off must
  // also clear the selection or re-enabling would reopen it unprompted.
  useEffect(() => {
    if (!tapDetails) setDetailId(null);
  }, [tapDetails]);
  const handleRootClick = (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest?.('[data-event-id]')?.getAttribute('data-event-id');
    if (id) setDetailId(id);
  };

  return (
    <div
      ref={containerRef}
      className="fsc-root"
      data-tap-events={tapDetails ? '' : undefined}
      onClick={tapDetails ? handleRootClick : undefined}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        overflow: 'hidden',
        position: 'relative',
        '--cal-bg': theme.bg,
        '--cal-surface': theme.surface,
        '--cal-surface-hover': theme.surfaceHover,
        '--cal-border': theme.border,
        '--cal-border-subtle': theme.borderSubtle,
        '--cal-text-primary': theme.text,
        '--cal-text-secondary': theme.textSecondary,
        '--cal-text-tertiary': theme.textMuted,
        '--cal-header-bg': theme.headerBg,
        '--cal-card-shadow': theme.cardShadow,
        '--cal-past-opacity': String(theme.pastOpacity),
        '--cal-weekend-shade': theme.surfaceAlt,
        '--cal-header-blur': theme.isDark ? '16px' : '12px',
        // A user color still gets the dark-theme lift; a theme's own accent is
        // already tuned for its background and is used verbatim.
        '--cal-accent': config.accentColor
          ? (theme.isDark ? brightenForDark(config.accentColor) : resolvedAccent)
          : resolvedAccent,
        '--cal-accent-bg': eventBg(resolvedAccent, theme.isDark ? 0.20 : 0.12, theme.isDark),
        '--cal-accent-surface': eventBg(resolvedAccent, theme.isDark ? 0.32 : 0.22, theme.isDark),
        '--cal-today-fill': todayFill,
        '--cal-bg-image': theme.bgImage ?? 'none',
        '--cal-surface-backdrop': surfaceBackdrop(theme),
        // A theme's on-accent ink is tuned for that theme's accent only; a
        // user-picked accent may be dark, so it keeps the original white.
        '--cal-on-accent': config.accentColor ? '#fff' : (theme.onAccent ?? '#fff'),
        // Sticky day bands (agenda) must cover what scrolls under them. The
        // flat themes paint their background verbatim, as before; over an
        // atmosphere layer a flat slab would punch a hole in the gradient, so
        // those themes get the header's frosted treatment instead.
        '--cal-band-bg': theme.bgImage ? theme.headerBg : theme.bg,
        '--cal-band-backdrop': theme.bgImage ? `blur(${theme.isDark ? '16px' : '12px'})` : 'none',
      } as React.CSSProperties}
    >
      <style>{cssTokens}</style>

      {/* Header bar */}
      <header className="fsc-header" style={{ height: `${scale.bu * 5}px`, flexShrink: 0 }} role="banner">
        <h1
          className="fsc-header-title"
          style={{ fontSize: `${scale.bu * 3.5 * scale.typoMul}px`, margin: 0 }}
        >
          {headerTitle}
        </h1>
        <div style={{ flex: 1 }} />
        {fetchFailed && !neverLoaded ? (
          // The saved-events pill takes the weather pill's slot so the header
          // element count never changes; calm amber, no "error" language.
          <span
            className="fsc-stale-pill"
            style={{
              fontSize: `${scale.bu * 1.1 * scale.typoMul}px`,
              color: scale.isDark ? '#d9a441' : '#92642c',
            }}
            role="status"
          >
            <span className="fsc-stale-dot" aria-hidden="true" />
            {staleSince
              ? t('fullscreen-calendar.savedFrom', { time: staleSince })
              : t('fullscreen-calendar.savedEvents')}
          </span>
        ) : !fetchFailed && failingSources.length > 0 ? (
          // Per-source outage while the shared fetch itself is fine: name the
          // one failing source; several at once fall back to generic wording.
          <span
            className="fsc-stale-pill"
            style={{
              fontSize: `${scale.bu * 1.1 * scale.typoMul}px`,
              color: scale.isDark ? '#d9a441' : '#92642c',
            }}
            role="status"
          >
            <span className="fsc-stale-dot" aria-hidden="true" />
            {soloFailingName
              ? (soloFailingSince
                ? t('calendar.sourceNotUpdating', { name: soloFailingName, time: soloFailingSince })
                : t('calendar.sourceNotUpdatingNoTime', { name: soloFailingName }))
              : t('fullscreen-calendar.savedEvents')}
          </span>
        ) : weatherPlacement === 'header' && currentTemp != null && (
          <span
            className="fsc-weather-pill"
            style={{ fontSize: `${scale.bu * 1.3 * scale.typoMul}px` }}
            aria-label={t('fullscreen-calendar.ariaLabels.currentTemperature', { temp: Math.round(currentTemp) })}
          >
            {WeatherIcon && <WeatherIcon size={scale.bu * 1.6 * scale.typoMul} aria-hidden="true" />}
            {Math.round(currentTemp)}{tempUnit}
          </span>
        )}
        <span
          className="fsc-view-badge"
          style={{ fontSize: `${scale.bu * 1.0 * scale.typoMul}px` }}
          aria-label={t('fullscreen-calendar.ariaLabels.view', { label: viewLabel })}
        >
          <ViewIcon size={scale.bu * 1.2 * scale.typoMul} aria-hidden="true" />
          {viewLabel}
        </span>
      </header>

      {legendPlacement === 'header' && (
        <CalendarLegend
          sources={legend}
          label={t('fullscreen-calendar.ariaLabels.legend')}
          style={{ ...legendStripStyle(scale), borderBottom: '1px solid var(--cal-border-subtle)' }}
          failingIds={failingSourceIds}
        />
      )}

      {/* View area */}
      <div className="fsc-content" style={{ flex: 1, minHeight: 0 }}>
        {isLoading ? (
          <SkeletonLoading scale={scale} />
        ) : !hasEvents ? (
          <EmptyState scale={scale} view={config.view} t={t} fetchFailed={neverLoaded} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={config.view}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{ height: '100%' }}
              className="fsc-view-motion"
            >
              {config.view === 'schedule' && <MemoScheduleView {...viewProps} />}
              {config.view === 'week-list' && <MemoWeekListView {...viewProps} />}
              {config.view === 'month-grid' && <MemoMonthGridView {...viewProps} />}
              {config.view === 'day-timeline' && <MemoDayTimelineView {...viewProps} />}
              {config.view === 'agenda' && <MemoAgendaView {...viewProps} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {legendPlacement === 'footer' && (
        <CalendarLegend
          sources={legend}
          label={t('fullscreen-calendar.ariaLabels.legend')}
          style={{ ...legendStripStyle(scale), borderTop: '1px solid var(--cal-border-subtle)' }}
          failingIds={failingSourceIds}
        />
      )}

      {tapDetails && detailEvent && (
        <EventDetailOverlay
          event={detailEvent}
          variant={config.eventTapStyle ?? 'sheet'}
          theme={theme}
          accentColor={eventBorder(detailEvent.calendarColor ?? '#3B82F6', theme.isDark)}
          timeFormat={timeFormat}
          timezone={timezone}
          now={now}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

// ─── CSS Custom Properties (injected into component scope) ───

const cssTokens = `
.fsc-root {
  --cal-transition-fast: 150ms ease-out;
  --cal-transition-normal: 250ms ease-out;
  --cal-transition-slow: 400ms ease-out;
  background-color: var(--cal-bg);
  background-image: var(--cal-bg-image, none);
  color: var(--cal-text-primary);
}

/* Smooth theme transitions */
.fsc-root,
.fsc-root *:not(.fsc-skeleton):not(.fsc-view-motion) {
  transition:
    background-color 800ms ease-in-out,
    color 400ms ease-in-out,
    border-color 400ms ease-in-out,
    opacity 500ms ease-out;
}

/* Today highlight pulse. The glow is a composited pseudo-element fading in
   and out: animating box-shadow on the marker itself repaints the gradient
   tiles beneath it on every frame, forever, on atmosphere themes. */
@keyframes fsc-today-pulse {
  0%, 100% { opacity: 0; }
  50%      { opacity: 1; }
}
.fsc-today-pulse {
  position: relative;
}
.fsc-today-pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 8px 2px var(--cal-accent);
  pointer-events: none;
  will-change: opacity;
  animation: fsc-today-pulse 4s ease-in-out infinite;
}

/* Skeleton shimmer */
@keyframes fsc-shimmer {
  0%   { opacity: 0.5; }
  50%  { opacity: 1; }
  100% { opacity: 0.5; }
}
.fsc-skeleton {
  animation: fsc-shimmer 1.5s ease-in-out infinite;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .fsc-root,
  .fsc-root * {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
  }
  .fsc-today-pulse::after {
    animation: none !important;
    opacity: 0;
  }
}

/* Header */
.fsc-header {
  display: flex;
  align-items: center;
  padding: 0 1.5%;
  background: var(--cal-header-bg);
  backdrop-filter: blur(var(--cal-header-blur));
  -webkit-backdrop-filter: blur(var(--cal-header-blur));
  border-bottom: 1px solid var(--cal-border-subtle);
  position: relative;
  z-index: 20;
  gap: 8px;
}
.fsc-header-title {
  font-family: var(--font-dm-serif), 'DM Serif Display', Georgia, serif;
  color: var(--cal-text-primary);
  white-space: nowrap;
  font-weight: 400;
}
.fsc-weather-pill {
  display: flex;
  align-items: center;
  backdrop-filter: var(--cal-surface-backdrop, none);
  -webkit-backdrop-filter: var(--cal-surface-backdrop, none);
  gap: 6px;
  color: var(--cal-text-secondary);
  background: var(--cal-surface);
  border: 1px solid var(--cal-border-subtle);
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 500;
  white-space: nowrap;
}
.fsc-stale-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(217,164,65,0.16);
  border: 1px solid rgba(217,164,65,0.35);
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 600;
  white-space: nowrap;
}
.fsc-stale-dot {
  width: 0.55em;
  height: 0.55em;
  border-radius: 50%;
  background: #d9a441;
  flex-shrink: 0;
}
.fsc-view-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cal-accent);
  background: var(--cal-accent-bg);
  border-radius: 4px;
  padding: 2px 8px;
  white-space: nowrap;
}
.fsc-content {
  position: relative;
  overflow: hidden;
}

/* Tap-to-open event details enabled */
.fsc-root[data-tap-events] .fsc-event-block {
  cursor: pointer;
}

/* Hide scrollbars — kiosk display, no manual scroll */
.fsc-root,
.fsc-root * {
  scrollbar-width: none;
}
.fsc-root::-webkit-scrollbar,
.fsc-root *::-webkit-scrollbar {
  display: none;
}

`;
