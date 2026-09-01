'use client';

import { useMemo, type CSSProperties } from 'react';
import { addDays, startOfWeek } from 'date-fns';
import { NO_DECOR, dayDecorFor, rulesNeedNow, type DayDecor } from '@/lib/calendar-rules';
import { isEventOnDay } from '@/lib/calendar-utils';
import type { TranslateFn } from '@/i18n';
import type { HourlyIndex } from './event-weather';
import type { ForecastDay } from '@/lib/weather/types';
import type { CalendarEvent, CalendarPerson, FullscreenCalendarConfig, TimeFormat, WeatherPlacement } from '@/types/config';
import type { ExtrasIndex } from '@/lib/calendar-extras';
import type { FullscreenEventStyle } from '@/lib/fullscreen-themes';

/**
 * Shared types, helpers, and hooks for the fullscreen calendar views.
 * The module imports the views and the views import this file — never the
 * module — so there is no import cycle between the parent and its views.
 */

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

/** Weather data + placement bundle threaded to the views. The hourly
 *  index is pre-built by the module (once per fetch) so per-row lookups on
 *  every 60s tick are O(1) instead of a scan over the full hourly horizon. */
export interface CalendarWeather {
  hourlyIndex: HourlyIndex;
  forecast?: ForecastDay[];
  placement: WeatherPlacement;
}

/**
 * The one props contract every fullscreen view accepts. The module's
 * `viewProps` is annotated with it and each view's signature uses it, so
 * adding a field here reaches every view — a per-view interface would let a
 * JSX spread pass a prop the view silently ignores (spreads skip
 * excess-property checks).
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
  /** Settings > Calendar > People; absent = the per-person views fall back to one row per source. */
  people?: CalendarPerson[];
  /** Week list household rows (planned meals + chore progress), keyed by local ISO date. */
  extras?: ExtrasIndex;
}

/**
 * The ambient render context a view threads to its row components, so a
 * per-row feature doesn't grow every intermediate signature by one prop.
 * Views build it once per render (memoized on its fields); the ticking pair
 * (`now`, `today`) deliberately stays out and rides as separate props, so
 * memo boundaries that don't need the clock still hold.
 */
export interface RowCtx {
  t: TranslateFn;
  locale: string;
  timeFormat: TimeFormat;
  timezone?: string;
  scale: CalendarScale;
  fontSize: number;
  config: FullscreenCalendarConfig;
}

export function autoScheduleDays(width: number, density: string): number {
  const minColWidth = density === 'cozy' ? 200 : 150;
  const scaledMin = minColWidth * (Math.min(width, 1080) / 1080);
  const gutterWidth = 50;
  return Math.min(7, Math.max(1, Math.floor((width - gutterWidth) / scaledMin)));
}

// Day-rule decor now lives with the rules engine so both calendar modules
// share one helper; re-exported here for the views' convenience.
export { dayDecorFor } from '@/lib/calendar-rules';

/**
 * Bottom fade for a list that clips at its edge. These views deliberately
 * never scroll on a kiosk, so the last card is cut wherever it happens to
 * land — and a hard slice through a card's middle reads as a rendering
 * fault. A short fade reads as "there is more below" instead.
 */
export function clippedListFade(px: number): CSSProperties {
  const mask = `linear-gradient(to bottom, #000 calc(100% - ${px}px), transparent 100%)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/** Title text truncation: two-line clamp when wrapping, single-line ellipsis otherwise. */
export function clampStyle(wrap: boolean): CSSProperties {
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

/**
 * The four-value today-highlight policy every multi-day view shares:
 * 'full' and 'subtle' tint the day (the module scales the alpha behind
 * --cal-today-fill), 'minimal' keeps only the marker, 'off' neither.
 */
export function resolveTodayHighlight(
  config: Pick<FullscreenCalendarConfig, 'todayHighlightStyle'>,
): { showTodayBg: boolean; showTodayMarker: boolean } {
  const style = config.todayHighlightStyle ?? 'full';
  return { showTodayBg: style === 'full' || style === 'subtle', showTodayMarker: style !== 'off' };
}

/**
 * The fill behind a day cell/group: today's tint beats the weekend shade;
 * a day rule beats both (callers merge decor last via `mergeCellDecor`).
 * `shadeWeekends` defaults on, matching the registry default and the editor
 * toggle, so configs predating the field shade consistently in every view.
 */
export function dayCellFill(
  isToday: boolean,
  showTodayBg: boolean,
  isWeekend: boolean,
  config: Pick<FullscreenCalendarConfig, 'shadeWeekends'>,
): string | undefined {
  if (isToday && showTodayBg) return 'var(--cal-today-fill)';
  if (isWeekend && config.shadeWeekends !== false) return 'var(--cal-weekend-shade)';
  return undefined;
}

/**
 * The 7 days of the week containing `today`. `today` is identity-stable
 * until midnight (the module derives it that way), so this holds across
 * 60s clock ticks without any string-key tricks.
 */
export function useWeekDays(today: Date, weekStartsOn: 0 | 1): Date[] {
  return useMemo(() => {
    const start = startOfWeek(today, { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [today, weekStartsOn]);
}

/** `count` consecutive days from `start`, which must be identity-stable
 *  (memoized by the caller) for the memo to hold. */
export function useDayList(start: Date, count: number): Date[] {
  return useMemo(() => Array.from({ length: count }, (_, i) => addDays(start, i)), [start, count]);
}

/**
 * Day-rule decor per day column, computed once per render rather than once
 * per header and once per column. Bails before the per-day filter when no
 * rules exist (the default). The clock only joins the memo key when a rule
 * actually reads `past` — otherwise the 60s tick would rebuild this for
 * nothing (when no rule reads the clock, the decor never looks at `now`,
 * so `today` stands in to keep the dependency array honest).
 */
export function useDayDecors(
  days: Date[],
  events: CalendarEvent[],
  config: FullscreenCalendarConfig,
  ctx: { today: Date; now: Date; timezone?: string; isDark: boolean },
): DayDecor[] {
  const dayRules = config.dayRules;
  const rulesNow = rulesNeedNow(undefined, dayRules) ? ctx.now : null;
  const { today, timezone, isDark } = ctx;
  return useMemo(
    () => (!dayRules || dayRules.length === 0
      ? days.map(() => NO_DECOR)
      : days.map((day) => dayDecorFor(
          config, day,
          events.filter((ev) => isEventOnDay(ev, day, timezone)),
          { today, now: rulesNow ?? today, timezone, isDark },
        ))),
    [days, events, dayRules, config, today, rulesNow, timezone, isDark],
  );
}
