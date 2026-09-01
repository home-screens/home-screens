import { addDays, endOfWeek, startOfWeek } from 'date-fns';
import { CalendarClock, Columns3, Grid3X3, Hourglass, List, ScrollText, Users, Zap, type LucideIcon } from 'lucide-react';
import { formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import { resolveScheduleStart, weekStartsOnFor } from '@/lib/calendar-utils';
import { viewDayWindow } from '@/lib/calendar-legend';
import type { FullscreenCalendarConfig, FullscreenCalendarView, WeatherPlacement } from '@/types/config';
import { autoScheduleDays } from './view-support';

/**
 * Everything that varies per fullscreen-calendar view, in one exhaustive
 * registry. The header title, icon, empty-state wording, legend window,
 * weather surfaces, and the editor's view-gated settings all read from
 * here, so adding a view (or changing what one draws) is a type error at
 * every site that matters instead of a scattered switch hunt.
 */

export interface ViewTitleCtx {
  today: Date;
  t: TranslateFn;
  locale: string;
  config: FullscreenCalendarConfig;
  /** Module pixel width — the schedule view auto-fits its column count from it. */
  scaleWidth: number;
}

export interface ViewWindowCtx {
  today: Date;
  weekStartsOn: 0 | 1;
  config: FullscreenCalendarConfig;
  scaleWidth: number;
}

export interface ViewTraits {
  icon: LucideIcon;
  /** View badge label in the module header. */
  labelKey: string;
  /** EmptyState wording when the feed is genuinely empty (not an outage). */
  emptyKey: string;
  /** Has an hour axis (hour window, now line, overlap settings apply). */
  isTimeGrid: boolean;
  /** Scrolling list shape (countdown / progress / empty-day-text settings apply). */
  isListView: boolean;
  /** People as rows — driven by Settings > Calendar > People. */
  isPersonView: boolean;
  /** Today is the whole board: no today highlight or weekend shade to configure. */
  isSingleDay: boolean;
  /** Which weather surfaces the view can draw (day headers / event rows). */
  weather: { days: boolean; events: boolean };
  /** The module header title. */
  headerTitle(ctx: ViewTitleCtx): string;
  /** Half-open day range the view draws, scoping the legend. */
  legendWindow(ctx: ViewWindowCtx): { start: Date; end: Date };
}

/** "March 2 – 8, 2026" for the week containing today; both month names when
 *  the week crosses a month ("August 30 – September 5, 2026"), both full
 *  dates when it crosses a year. */
function weekRangeTitle(today: Date, weekStartsOn: 0 | 1, locale: string): string {
  const weekStart = startOfWeek(today, { weekStartsOn });
  const weekEnd = endOfWeek(today, { weekStartsOn });
  if (weekStart.getFullYear() !== weekEnd.getFullYear()) {
    return `${formatDateSync(weekStart, 'MMMM d, yyyy', { locale })} – ${formatDateSync(weekEnd, 'MMMM d, yyyy', { locale })}`;
  }
  if (weekStart.getMonth() !== weekEnd.getMonth()) {
    return `${formatDateSync(weekStart, 'MMMM d', { locale })} – ${formatDateSync(weekEnd, 'MMMM d, yyyy', { locale })}`;
  }
  return `${formatDateSync(weekStart, 'MMMM d', { locale })} – ${formatDateSync(weekEnd, 'd, yyyy', { locale })}`;
}

/** The schedule view's resolved first column and column count — the same
 *  numbers the view itself derives, shared by its title and legend window. */
function scheduleGeometry(today: Date, config: FullscreenCalendarConfig, scaleWidth: number): { start: Date; count: number } {
  const weekStartsOn = weekStartsOnFor(config.startDay);
  return {
    start: resolveScheduleStart(today, config.scheduleStartAnchor, weekStartsOn),
    count: config.scheduleDaysToShow > 0 ? config.scheduleDaysToShow : autoScheduleDays(scaleWidth, config.density),
  };
}

export const VIEW_TRAITS: Record<FullscreenCalendarView, ViewTraits> = {
  schedule: {
    icon: Columns3,
    labelKey: 'fullscreen-calendar.viewLabels.schedule',
    emptyKey: 'fullscreen-calendar.noEventsThisWeek',
    isTimeGrid: true, isListView: false, isPersonView: false, isSingleDay: false,
    weather: { days: true, events: false },
    headerTitle({ today, locale, config, scaleWidth }) {
      // The range starts at the anchor-resolved first column, which is only
      // `today` for the default anchor.
      const { start, count } = scheduleGeometry(today, config, scaleWidth);
      const endDay = addDays(start, count - 1);
      if (start.getMonth() === endDay.getMonth()) {
        return `${formatDateSync(start, 'MMMM d', { locale })} – ${formatDateSync(endDay, 'd, yyyy', { locale })}`;
      }
      return `${formatDateSync(start, 'MMMM d', { locale })} – ${formatDateSync(endDay, 'MMMM d, yyyy', { locale })}`;
    },
    legendWindow({ today, weekStartsOn, config, scaleWidth }) {
      const { start, count } = scheduleGeometry(today, config, scaleWidth);
      return viewDayWindow({ kind: 'days', today, weekStartsOn, start, count });
    },
  },
  'week-list': {
    icon: List,
    labelKey: 'fullscreen-calendar.viewLabels.weekList',
    emptyKey: 'fullscreen-calendar.noEventsThisWeek',
    isTimeGrid: false, isListView: true, isPersonView: false, isSingleDay: false,
    weather: { days: true, events: true },
    headerTitle: ({ today, locale, config }) => weekRangeTitle(today, weekStartsOnFor(config.startDay), locale),
    legendWindow: ({ today, weekStartsOn }) => viewDayWindow({ kind: 'week', today, weekStartsOn }),
  },
  'month-grid': {
    icon: Grid3X3,
    labelKey: 'fullscreen-calendar.viewLabels.monthGrid',
    emptyKey: 'fullscreen-calendar.noEventsThisMonth',
    isTimeGrid: false, isListView: false, isPersonView: false, isSingleDay: false,
    weather: { days: false, events: false },
    headerTitle: ({ today, locale }) => formatDateSync(today, 'MMMM yyyy', { locale }),
    legendWindow: ({ today, weekStartsOn }) => viewDayWindow({ kind: 'month-grid', today, weekStartsOn }),
  },
  'day-timeline': {
    icon: CalendarClock,
    labelKey: 'fullscreen-calendar.viewLabels.dayTimeline',
    emptyKey: 'fullscreen-calendar.noEventsToday',
    isTimeGrid: true, isListView: false, isPersonView: false, isSingleDay: true,
    weather: { days: false, events: false },
    headerTitle: ({ today, locale }) => formatDateSync(today, 'EEEE, MMMM d', { locale }),
    legendWindow: ({ today, weekStartsOn }) => viewDayWindow({ kind: 'days', today, weekStartsOn, count: 1 }),
  },
  agenda: {
    icon: ScrollText,
    labelKey: 'fullscreen-calendar.viewLabels.agenda',
    emptyKey: 'fullscreen-calendar.noUpcomingEvents',
    isTimeGrid: false, isListView: true, isPersonView: false, isSingleDay: false,
    weather: { days: true, events: true },
    headerTitle: ({ t }) => t('fullscreen-calendar.headerUpcoming'),
    legendWindow: ({ today, weekStartsOn, config }) =>
      viewDayWindow({ kind: 'days', today, weekStartsOn, count: config.agendaDaysAhead > 0 ? config.agendaDaysAhead : 14 }),
  },
  'family-grid': {
    icon: Users,
    labelKey: 'fullscreen-calendar.viewLabels.familyGrid',
    emptyKey: 'fullscreen-calendar.noEventsThisWeek',
    isTimeGrid: false, isListView: false, isPersonView: true, isSingleDay: false,
    weather: { days: true, events: false },
    headerTitle: ({ today, locale, config }) => weekRangeTitle(today, weekStartsOnFor(config.startDay), locale),
    legendWindow: ({ today, weekStartsOn }) => viewDayWindow({ kind: 'week', today, weekStartsOn }),
  },
  'up-next': {
    icon: Zap,
    labelKey: 'fullscreen-calendar.viewLabels.upNext',
    emptyKey: 'fullscreen-calendar.noUpcomingEvents',
    isTimeGrid: false, isListView: false, isPersonView: false, isSingleDay: true,
    weather: { days: false, events: true },
    headerTitle: ({ t }) => t('fullscreen-calendar.headerUpNext'),
    // The up-next hero can sit on any future day (its feed is forward-
    // unbounded), so its legend scopes to everything from today on.
    legendWindow: ({ today }) => ({ start: today, end: addDays(today, 366) }),
  },
  'free-time': {
    icon: Hourglass,
    labelKey: 'fullscreen-calendar.viewLabels.freeTime',
    emptyKey: 'fullscreen-calendar.noEventsToday',
    isTimeGrid: false, isListView: false, isPersonView: true, isSingleDay: true,
    weather: { days: false, events: false },
    headerTitle: ({ t }) => t('fullscreen-calendar.headerFreeTime'),
    legendWindow: ({ today, weekStartsOn, config }) =>
      viewDayWindow({ kind: 'days', today, weekStartsOn, count: config.freeTimeShowTomorrow !== false ? 2 : 1 }),
  },
};

/** Traits for a view, tolerant of junk in a hand-edited config.json. */
export function viewTraits(view: string | undefined): ViewTraits {
  return VIEW_TRAITS[view as FullscreenCalendarView] ?? VIEW_TRAITS.schedule;
}

/**
 * Resolve the configured weather placement, honoring the legacy
 * `showWeather` boolean from configs saved before the placement enum existed
 * (true → 'header'). Shared by the module and the editor config section.
 */
export function resolveWeatherPlacement(
  config: Pick<FullscreenCalendarConfig, 'weatherPlacement' | 'showWeather'>,
): WeatherPlacement {
  if (config.weatherPlacement) return config.weatherPlacement;
  return config.showWeather === false ? 'off' : 'header';
}

/**
 * The placement a given view actually renders. Placements carry across view
 * switches (the module keeps one config), so a value the current view has no
 * surface for must degrade to the header pill — never to nothing: "I picked
 * a weather option and weather vanished" is the failure mode this prevents.
 * The stored config is untouched; switching back restores the richer
 * placement.
 */
export function effectiveWeatherPlacement(
  view: FullscreenCalendarView,
  config: Pick<FullscreenCalendarConfig, 'weatherPlacement' | 'showWeather'>,
): WeatherPlacement {
  const resolved = resolveWeatherPlacement(config);
  if (resolved === 'off' || resolved === 'header') return resolved;
  const { days, events } = viewTraits(view).weather;
  if (resolved === 'days') return days ? 'days' : 'header';
  if (resolved === 'events') return events ? 'events' : 'header';
  // days-and-events: keep whichever surfaces this view has, in either
  // combination. Falling through to the header pill when the view can draw
  // one of the two would make the richer setting show less than the
  // narrower one (up-next draws event weather but no day headers).
  if (days && events) return 'days-and-events';
  if (days) return 'days';
  if (events) return 'events';
  return 'header';
}
