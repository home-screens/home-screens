'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import { dailyForDay, weatherForEvent } from './event-weather';
import type { CalendarWeather } from './FullscreenCalendarModule';

/**
 * Inline weather for the list views (agenda + week-list): the daily
 * forecast on day headers, the event-start-time forecast on event rows.
 * Fixed truncation priority in tight spaces: the temperature never
 * truncates, the condition words give way first.
 */

/** Day-header daily forecast: icon + high, low de-emphasized. List-view day
 *  headers push it to the row end; schedule column headers center it under
 *  the day number (`align="center"`) and drop the low to fit a 1/7 column. */
export function DayWeatherBadge({ weather, day, fontSize, align = 'end' }: {
  weather: CalendarWeather;
  day: Date;
  fontSize: number;
  align?: 'end' | 'center';
}) {
  if (weather.placement !== 'days' && weather.placement !== 'days-and-events') return null;
  const daily = dailyForDay(weather.forecast, day);
  if (!daily) return null;
  const Icon = daily.icon ? getWeatherIcon(daily.icon, 'outline') : null;
  const centered = align === 'center';
  return (
    <span style={{
      marginLeft: centered ? undefined : 'auto',
      display: centered ? 'flex' : 'inline-flex',
      justifyContent: centered ? 'center' : undefined,
      alignItems: 'center',
      gap: fontSize * 0.25,
      fontFamily: "var(--font-inter), 'Inter', system-ui, sans-serif",
      fontSize: fontSize * 0.75,
      fontWeight: 600,
      color: 'var(--cal-text-secondary)',
      whiteSpace: 'nowrap',
      flexShrink: 0,
      marginTop: centered ? fontSize * 0.25 : undefined,
    }}>
      {Icon && <Icon size={fontSize * 0.85} aria-hidden="true" />}
      {Math.round(daily.high)}°
      {!centered && (
        <span style={{ fontWeight: 500, color: 'var(--cal-text-tertiary)' }}>
          / {Math.round(daily.low)}°
        </span>
      )}
    </span>
  );
}

/** Event-row forecast at the event's start time (hourly → daily fallback). */
export function EventWeatherLine({ weather, start, fontSize, marginTop }: {
  weather: CalendarWeather;
  start: Date;
  fontSize: number;
  marginTop?: number;
}) {
  if (weather.placement !== 'events' && weather.placement !== 'days-and-events') return null;
  const wx = weatherForEvent(weather.hourlyIndex, weather.forecast, start);
  if (!wx) return null;
  const Icon = wx.icon ? getWeatherIcon(wx.icon, 'outline') : null;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: fontSize * 0.25,
      fontSize: fontSize * 0.7,
      color: 'var(--cal-text-secondary)',
      marginTop,
      minWidth: 0,
    }}>
      {Icon && <Icon size={fontSize * 0.8} style={{ flexShrink: 0 }} aria-hidden="true" />}
      <span style={{ flexShrink: 0, fontWeight: 600 }}>{Math.round(wx.temp)}°</span>
      {wx.description && (
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          · {wx.description}
        </span>
      )}
    </div>
  );
}
