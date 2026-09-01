'use client';

import { memo, useMemo } from 'react';
import { startOfWeek, addDays, startOfDay } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarX } from 'lucide-react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useTZClock } from '@/hooks/useTZClock';
import { rulesNeedNow, selectCalendarEvents } from '@/lib/calendar-rules';
import { listViewCutoff, weekStartsOnFor } from '@/lib/calendar-utils';
import { buildLegend } from '@/lib/calendar-legend';
import { effectiveWeatherPlacement, viewTraits } from './view-traits';
import type { CalendarScale, CalendarViewProps, CalendarWeather } from './view-support';
import { buildHourlyIndex } from './event-weather';
import { getWeatherIcon } from '@/lib/weather-icons';
import { useTranslate, useFormattingLocale } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarFetchStatus, CalendarPerson, CalendarSourceStatus, CalendarTitleFilter, CalendarEventRule, FullscreenCalendarConfig, ModuleStyle, CalendarEvent, TimeFormat } from '@/types/config';
import { hasExtras } from '@/lib/calendar-extras';
import { toISODate } from '@/lib/meal-constants';
import { useCalendarExtras } from './useCalendarExtras';
import type { ForecastDay, HourlyWeather } from '@/lib/weather/types';
import { getThemeTokens, migrateFromDarkMode, getTypoMultiplier, getDensityMultiplier, surfaceBackdrop } from '@/lib/fullscreen-themes';
import { brightenForDark, eventBg, eventBorder, resolveCalendarAccent } from '@/lib/calendar-event-surface';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { ScheduleView } from './ScheduleView';
import { WeekListView } from './WeekListView';
import { MonthGridView } from './MonthGridView';
import { DayTimelineView } from './DayTimelineView';
import { AgendaView } from './AgendaView';
import { FamilyGridView } from './FamilyGridView';
import { UpNextView } from './UpNextView';
import { FreeTimeView } from './FreeTimeView';
import { EventDetailOverlay } from '../shared/EventDetailOverlay';
import { CalendarLegend } from '../shared/CalendarLegend';
import { calendarStaleStatus, useFailingSources } from '../shared/useFailingSources';
import { useEventTapDetail } from '../shared/useEventTapDetail';

// Opening/closing the detail overlay re-renders this module; memo keeps the
// (potentially hundreds of) event blocks from reconciling on those frames —
// and on 60s clock ticks for the views whose props didn't change.
const MemoScheduleView = memo(ScheduleView);
const MemoWeekListView = memo(WeekListView);
const MemoMonthGridView = memo(MonthGridView);
const MemoDayTimelineView = memo(DayTimelineView);
const MemoAgendaView = memo(AgendaView);
const MemoFamilyGridView = memo(FamilyGridView);
const MemoUpNextView = memo(UpNextView);
const MemoFreeTimeView = memo(FreeTimeView);

// Shared view types/helpers live in view-support (the views import from
// there, never from this module, so there is no parent↔view import cycle).
export type { CalendarEvent } from '@/types/config';

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

/**
 * Events a fullscreen-calendar view should render: source-filtered, then
 * title-filtered, then rule-filtered, then — for the agenda view only —
 * narrowed to upcoming events, or to events ending today or later when
 * `showFinishedToday` is on (the agenda iterates days from today, so
 * finished rows land under today and dim via `dimPastEvents`). Every other
 * view takes the shared feed as-is: the fixed-range views (schedule,
 * week-list, month-grid, day-timeline, family-grid) intentionally show
 * past events, and up-next / free-time narrow to their own upcoming /
 * today-and-tomorrow shapes inside the view. Exported for unit testing
 * this branch without rendering the component.
 */
export function selectVisibleEvents(
  events: CalendarEvent[],
  view: FullscreenCalendarConfig['view'],
  sourceFilter: string[] | undefined,
  now: Date,
  opts: { timezone?: string; titleFilter?: CalendarTitleFilter; showFinishedToday?: boolean; eventRules?: CalendarEventRule[] } = {},
): CalendarEvent[] {
  return selectCalendarEvents(events, {
    sourceFilter,
    titleFilter: opts.titleFilter,
    eventRules: opts.eventRules,
    timezone: opts.timezone,
    now,
    upcomingCutoff: view === 'agenda' ? listViewCutoff(now, opts.showFinishedToday === true) : undefined,
  });
}

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

function EmptyState({ scale, emptyKey, t, fetchFailed }: { scale: CalendarScale; emptyKey: string; t: TranslateFn; fetchFailed?: boolean }) {
  // A failed fetch with nothing kept is an outage, not a free day — it must
  // never render the same wording as a genuinely empty calendar.
  const label = fetchFailed ? t('fullscreen-calendar.cantLoadEvents') : t(emptyKey);
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
  /** Attached only while Settings > Calendar > People is non-empty (see buildModuleProps). */
  people?: CalendarPerson[];
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
  people,
}: FullscreenCalendarModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const rawEvents = useMemo(() => rawEventsRaw ?? [], [rawEventsRaw]);
  const { containerRef, dims } = useFullscreenDims();

  // Updates every 60s — drives now-line movement and midnight rollover
  const now = useTZClock(timezone);
  // Keyed on the ms value, not `now`: `today`'s identity holds until
  // midnight, so memos and view props keyed on it survive the 60s ticks.
  const todayMs = startOfDay(now).getTime();
  const today = useMemo(() => new Date(todayMs), [todayMs]);

  // Legend ring, named header pill, and per-row "saved" suffix all key off
  // this shared derivation (see useFailingSources).
  const { failingSources, failingSourceIds, soloFailingName, soloFailingSince } = useFailingSources({
    sourceStatus, sourceFilter: config.sourceFilter, timezone, timeFormat, locale, today, t,
  });

  // The 60s tick only changes the selection when the agenda cutoff applies
  // or a rule actually reads the clock; otherwise keep the memo stable
  // across ticks — the rules pass mints new event objects, which would
  // thrash every event-keyed memo in the views for nothing on a Pi.
  const selectionNow = config.view === 'agenda' || rulesNeedNow(config.eventRules) ? now : null;
  const events = useMemo(
    () => selectVisibleEvents(rawEvents, config.view, config.sourceFilter, selectionNow ?? today, {
      timezone, titleFilter: config.titleFilter, showFinishedToday: config.agendaShowFinishedToday === true,
      eventRules: config.eventRules,
    }),
    [rawEvents, config.view, config.sourceFilter, selectionNow, today, timezone, config.titleFilter, config.agendaShowFinishedToday, config.eventRules],
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

  // Everything view-shaped (title, icon, empty wording, legend window,
  // weather surfaces) comes from the shared registry.
  const traits = viewTraits(config.view);
  const headerTitle = traits.headerTitle({ today, t, locale, config, scaleWidth: scale.width });

  // Legend rows come from the events the current view actually draws — the
  // shared fetch window is wider than any single view, so scope to the
  // view's day range first (the registry knows each view's range).
  const legendPlacement = config.showLegend ?? 'off';
  const legend = useMemo(() => {
    if (legendPlacement === 'off') return [];
    const window = traits.legendWindow({ today, weekStartsOn: weekStartsOnFor(config.startDay), config, scaleWidth: scale.width });
    return buildLegend(events, window, timezone, t('calendar.publicHolidays'));
  }, [legendPlacement, events, timezone, today, t, traits, config, scale.width]);

  const currentTemp = hourly?.[0]?.temp;
  const weatherIconId = hourly?.[0]?.icon;
  const tempUnit = units === 'metric' ? '\u00B0C' : '\u00B0F';

  const WeatherIcon = weatherIconId ? getWeatherIcon(weatherIconId, 'outline') : null;

  const ViewIcon = traits.icon;
  const viewLabel = t(traits.labelKey);

  const weatherPlacement = effectiveWeatherPlacement(config.view, config);
  const weather = useMemo<CalendarWeather>(
    () => ({ hourlyIndex: buildHourlyIndex(hourly), forecast, placement: weatherPlacement }),
    [hourly, forecast, weatherPlacement],
  );

  // Household rows for the week list. Only fetched while a toggle is on and
  // the week list is the active view; the hook is a no-op otherwise.
  const weekDates = useMemo(() => {
    const weekStart = startOfWeek(today, { weekStartsOn: weekStartsOnFor(config.startDay) });
    return Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i)));
  }, [today, config.startDay]);
  const wantsExtras = config.view === 'week-list';
  const extras = useCalendarExtras(
    { meals: wantsExtras && config.showMeals === true, chores: wantsExtras && config.showChores === true },
    weekDates,
  );

  const viewProps = useMemo<CalendarViewProps>(
    () => ({ events, config, scale, today, now, timeFormat, weather, timezone, failingSourceIds, people, extras }),
    [events, config, scale, today, now, timeFormat, weather, timezone, failingSourceIds, people, extras],
  );
  const hasEvents = events.length > 0;
  // Views with something to say on an empty feed: the family grid and free
  // time still draw every configured person, and a week list can be all
  // meals and chores.
  const hasContent = hasEvents
    || ((config.view === 'family-grid' || config.view === 'free-time') && (people?.length ?? 0) > 0)
    || (wantsExtras && hasExtras(extras, weekDates));
  const isLoading = loading && !hasContent;

  // Failure \u2260 empty: while the shared calendar fetch is failing, the events
  // on screen are the kept last-good payload \u2014 badge them as saved rather
  // than live. Only a failure with NO successful fetch ever (updatedAt null)
  // renders the "can't load" state: last-good data whose visible window
  // happens to be empty (an agenda after the day's last event) is a normal
  // empty day, not an outage.
  const { neverLoaded, statusText } = calendarStaleStatus({
    calendarStatus, failingSources, soloFailingName, soloFailingSince,
    timezone, timeFormat, locale, today, t, ns: 'fullscreen-calendar',
  });

  // Tap-to-open detail: shared delegated-handler hook (see useEventTapDetail).
  const tapDetails = config.eventTapDetails === true;
  const { detailEvent, onRootClick, close: closeDetail } = useEventTapDetail(events, tapDetails);

  return (
    <div
      ref={containerRef}
      className="fsc-root"
      data-tap-events={tapDetails ? '' : undefined}
      onClick={onRootClick}
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
      {/* The bar grows with the typography setting so a scaled-up serif
          title never spills over the view below; `small` keeps the full
          5bu bar (the pills and badges in it don't shrink as far). */}
      <header className="fsc-header" style={{ height: `${scale.bu * 5 * Math.max(1, scale.typoMul)}px`, flexShrink: 0 }} role="banner">
        <h1
          className="fsc-header-title"
          // Explicit line height: the serif's default line box is ~1.45em,
          // which overshoots the bar and paints descenders over the view.
          style={{ fontSize: `${scale.bu * 3.5 * scale.typoMul}px`, lineHeight: 1.15, margin: 0 }}
        >
          {headerTitle}
        </h1>
        <div style={{ flex: 1 }} />
        {statusText ? (
          // The saved-events / source-outage pill takes the weather pill's
          // slot so the header element count never changes; calm amber, no
          // "error" language (wording shared via calendarStaleStatus).
          <span
            className="fsc-stale-pill"
            style={{
              fontSize: `${scale.bu * 1.1 * scale.typoMul}px`,
              color: scale.isDark ? '#d9a441' : '#92642c',
            }}
            role="status"
          >
            <span className="fsc-stale-dot" aria-hidden="true" />
            {statusText}
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
        ) : neverLoaded || !hasContent ? (
          // A fetch that has never succeeded is an outage even when the view
          // has settings-derived content (people rows, meals/chores): drawing
          // every person with zero events would read as a free week.
          <EmptyState scale={scale} emptyKey={traits.emptyKey} t={t} fetchFailed={neverLoaded} />
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
              {config.view === 'family-grid' && <MemoFamilyGridView {...viewProps} />}
              {config.view === 'up-next' && <MemoUpNextView {...viewProps} />}
              {config.view === 'free-time' && <MemoFreeTimeView {...viewProps} />}
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
          accentColor={eventBorder(detailEvent.calendarColor ?? DEFAULT_EVENT_COLOR, theme.isDark)}
          timeFormat={timeFormat}
          timezone={timezone}
          now={now}
          onClose={closeDetail}
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
