'use client';

import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addDays, startOfDay } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarX, MapPin, List, Columns3, Grid3X3, CalendarClock, ScrollText } from 'lucide-react';
import { useFullscreenDims } from '@/hooks/useFullscreenDims';
import { useTZClock } from '@/hooks/useTZClock';
import { getWeatherIcon } from '@/lib/weather-icons';
import type { FullscreenCalendarConfig, ModuleStyle, CalendarEvent } from '@/types/config';
import { getThemeTokens, migrateFromDarkMode, getTypoMultiplier, getDensityMultiplier } from '@/lib/fullscreen-themes';
import { ScheduleView } from './ScheduleView';
import { WeekListView } from './WeekListView';
import { MonthGridView } from './MonthGridView';
import { DayTimelineView } from './DayTimelineView';
import { AgendaView } from './AgendaView';

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
}

// Re-export MapPin for use in subviews
export { MapPin };

// ─── Helpers ───

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

export function filterEvents(events: CalendarEvent[], sourceFilter?: string[]): CalendarEvent[] {
  if (!sourceFilter || sourceFilter.length === 0) return events;
  return events.filter(ev => {
    if (ev.sourceId && sourceFilter.includes(ev.sourceId)) return true;
    if (!ev.sourceId) return true;
    return false;
  });
}

// ─── Color helpers (safe alpha + dark-mode adjustment) ───

function parseHexToRgb(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  if (/^[0-9a-f]{6,8}$/i.test(hex)) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  return [59, 130, 246]; // fallback blue-500
}

function darkAdjustRgb(r: number, g: number, b: number): [number, number, number] {
  // Approximate CSS saturate(0.85) brightness(1.1) — desaturate toward luminance, then brighten
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [
    Math.min(255, Math.round((lum + 0.85 * (r - lum)) * 1.1)),
    Math.min(255, Math.round((lum + 0.85 * (g - lum)) * 1.1)),
    Math.min(255, Math.round((lum + 0.85 * (b - lum)) * 1.1)),
  ];
}

/** Safely compose a source color + alpha, with optional dark-mode desaturation. */
export function eventBg(color: string, alpha: number, isDark: boolean): string {
  let [r, g, b] = parseHexToRgb(color);
  if (isDark) [r, g, b] = darkAdjustRgb(r, g, b);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Return a solid source color, adjusted for dark mode. */
export function eventBorder(color: string, isDark: boolean): string {
  if (!isDark) return color;
  const [r, g, b] = darkAdjustRgb(...parseHexToRgb(color));
  return `rgb(${r},${g},${b})`;
}

function brightenForDark(color: string): string {
  const [r, g, b] = parseHexToRgb(color);
  return `rgb(${Math.min(255, Math.round(r * 1.15))},${Math.min(255, Math.round(g * 1.15))},${Math.min(255, Math.round(b * 1.15))})`;
}

export function getHeaderTitle(view: string, today: Date, scheduleDays?: number): string {
  switch (view) {
    case 'schedule': {
      const endDay = addDays(today, (scheduleDays ?? 7) - 1);
      if (today.getMonth() === endDay.getMonth()) {
        return `${format(today, 'MMMM d')} \u2013 ${format(endDay, 'd, yyyy')}`;
      }
      return `${format(today, 'MMMM d')} \u2013 ${format(endDay, 'MMMM d, yyyy')}`;
    }
    case 'week-list': {
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      return `${format(weekStart, 'MMMM d')} \u2013 ${format(weekEnd, 'd, yyyy')}`;
    }
    case 'month-grid':
      return format(today, 'MMMM yyyy');
    case 'day-timeline':
      return format(today, 'EEEE, MMMM d');
    case 'agenda':
      return 'Upcoming';
    default:
      return format(today, 'MMMM yyyy');
  }
}

const VIEW_LABELS: Record<string, { label: string; icon: typeof Columns3 }> = {
  'schedule': { label: 'Schedule', icon: Columns3 },
  'week-list': { label: 'Week', icon: List },
  'month-grid': { label: 'Month', icon: Grid3X3 },
  'day-timeline': { label: 'Day', icon: CalendarClock },
  'agenda': { label: 'Agenda', icon: ScrollText },
};

// ─── Overlap layout helper (shared by Schedule + DayTimeline) ───

export interface LayoutColumn {
  left: number; // 0-1 fraction
  width: number; // 0-1 fraction
}

export function computeOverlapColumns(
  events: Array<{ startHour: number; endHour: number; id: string }>,
): Map<string, LayoutColumn> {
  const result = new Map<string, LayoutColumn>();
  if (events.length === 0) return result;

  // Sort by start time, then by duration (longer first)
  const sorted = [...events].sort((a, b) =>
    a.startHour - b.startHour || (b.endHour - b.startHour) - (a.endHour - a.startHour),
  );

  // Greedy column assignment
  const columns: Array<{ endHour: number; id: string }>[] = [];
  const eventColumn = new Map<string, number>();

  for (const ev of sorted) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const last = columns[col][columns[col].length - 1];
      if (last.endHour <= ev.startHour) {
        columns[col].push(ev);
        eventColumn.set(ev.id, col);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([ev]);
      eventColumn.set(ev.id, columns.length - 1);
    }
  }

  const maxCols = Math.min(columns.length, 3);
  const colWidth = 1 / maxCols;

  for (const ev of sorted) {
    const col = eventColumn.get(ev.id) ?? 0;
    if (col >= maxCols) {
      // Overflow events get hidden (parent renders "+N more")
      result.set(ev.id, { left: 0, width: 0 });
    } else {
      result.set(ev.id, { left: col * colWidth, width: colWidth });
    }
  }

  return result;
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

function EmptyState({ scale, view }: { scale: CalendarScale; view: string }) {
  const label = view === 'month-grid' ? 'No events this month'
    : view === 'agenda' ? 'No upcoming events'
    : view === 'day-timeline' ? 'No events today'
    : 'No events this week';
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
  hourly?: Array<{ temp: number; icon?: string; description?: string }>;
  units?: string;
  loading?: boolean;
  fullscreenTheme?: string;
}

export default function FullscreenCalendarModule({
  config,
  style: _style,
  events: rawEventsRaw,
  timezone,
  hourly,
  units,
  loading,
  fullscreenTheme,
}: FullscreenCalendarModuleProps) {
  const rawEvents = useMemo(() => rawEventsRaw ?? [], [rawEventsRaw]);
  const { containerRef, dims } = useFullscreenDims();

  // Updates every 60s — drives now-line movement and midnight rollover
  const now = useTZClock(timezone);
  const today = startOfDay(now);

  const events = useMemo(
    () => filterEvents(rawEvents, config.sourceFilter),
    [rawEvents, config.sourceFilter],
  );

  const themeId = config.theme ?? fullscreenTheme ?? migrateFromDarkMode(config.darkMode);
  const theme = getThemeTokens(themeId);

  const scale: CalendarScale = useMemo(() => ({
    bu: Math.min(dims.w, dims.h) / 100,
    width: dims.w,
    height: dims.h,
    orientation: getOrientation(dims.w, dims.h),
    densityMul: getDensityMultiplier(config.density),
    typoMul: getTypoMultiplier(config.typographySize),
    isDark: theme.isDark,
  }), [dims, config.density, config.typographySize, theme.isDark]);
  // For schedule view, compute effective days count for the header title
  const scheduleDays = config.view === 'schedule'
    ? (config.scheduleDaysToShow > 0 ? config.scheduleDaysToShow : autoScheduleDays(scale.width, config.density))
    : undefined;
  const headerTitle = getHeaderTitle(config.view, today, scheduleDays);

  // Current weather from hourly data
  const currentTemp = hourly?.[0]?.temp;
  const weatherIconId = hourly?.[0]?.icon;
  const tempUnit = units === 'metric' ? '\u00B0C' : '\u00B0F';

  // Resolve weather Lucide icon
  const WeatherIcon = weatherIconId ? getWeatherIcon(weatherIconId, 'outline') : null;

  const viewInfo = VIEW_LABELS[config.view] ?? { label: config.view, icon: Columns3 };
  const ViewIcon = viewInfo.icon;

  const viewProps = { events, config, scale, today, now };
  const hasEvents = events.length > 0;
  const isLoading = loading && !hasEvents;

  return (
    <div
      ref={containerRef}
      className="fsc-root"
      style={{
        width: '100%',
        height: '100%',
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
        '--cal-accent': config.accentColor
          ? (theme.isDark ? brightenForDark(config.accentColor) : config.accentColor)
          : (theme.isDark ? '#F97316' : '#EA580C'),
        '--cal-accent-bg': theme.isDark ? '#431407' : '#FFF7ED',
        '--cal-accent-surface': theme.isDark ? '#7C2D12' : '#FFEDD5',
      } as React.CSSProperties}
    >
      <style>{cssTokens}</style>

      {/* Header bar */}
      <header className="fsc-header" style={{ height: `${scale.bu * 5}px` }} role="banner">
        <h1
          className="fsc-header-title"
          style={{ fontSize: `${scale.bu * 3.5 * scale.typoMul}px`, margin: 0 }}
        >
          {headerTitle}
        </h1>
        <div style={{ flex: 1 }} />
        {config.showWeather && currentTemp != null && (
          <span
            className="fsc-weather-pill"
            style={{ fontSize: `${scale.bu * 1.3 * scale.typoMul}px` }}
            aria-label={`Current temperature ${Math.round(currentTemp)} degrees`}
          >
            {WeatherIcon && <WeatherIcon size={scale.bu * 1.6 * scale.typoMul} aria-hidden="true" />}
            {Math.round(currentTemp)}{tempUnit}
          </span>
        )}
        <span
          className="fsc-view-badge"
          style={{ fontSize: `${scale.bu * 1.0 * scale.typoMul}px` }}
          aria-label={`View: ${viewInfo.label}`}
        >
          <ViewIcon size={scale.bu * 1.2 * scale.typoMul} aria-hidden="true" />
          {viewInfo.label}
        </span>
      </header>

      {/* View area */}
      <div className="fsc-content" style={{ height: `calc(100% - ${scale.bu * 5}px)` }}>
        {isLoading ? (
          <SkeletonLoading scale={scale} />
        ) : !hasEvents ? (
          <EmptyState scale={scale} view={config.view} />
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
              {config.view === 'schedule' && <ScheduleView {...viewProps} />}
              {config.view === 'week-list' && <WeekListView {...viewProps} />}
              {config.view === 'month-grid' && <MonthGridView {...viewProps} />}
              {config.view === 'day-timeline' && <DayTimelineView {...viewProps} />}
              {config.view === 'agenda' && <AgendaView {...viewProps} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ─── CSS Custom Properties (injected into component scope) ───

const cssTokens = `
.fsc-root {
  --cal-transition-fast: 150ms ease-out;
  --cal-transition-normal: 250ms ease-out;
  --cal-transition-slow: 400ms ease-out;
  background: var(--cal-bg);
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

/* Today highlight pulse */
@keyframes fsc-today-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--cal-accent); }
  50%      { box-shadow: 0 0 8px 2px var(--cal-accent); }
}
.fsc-today-pulse {
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
  .fsc-today-pulse {
    animation: none !important;
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
  gap: 6px;
  color: var(--cal-text-secondary);
  background: var(--cal-surface);
  border: 1px solid var(--cal-border-subtle);
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 500;
  white-space: nowrap;
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
