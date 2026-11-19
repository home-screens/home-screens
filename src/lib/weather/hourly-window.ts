import type { HourlyWeather } from './types';

/**
 * The entries that fall inside the next `hours` hours, by timestamp.
 *
 * Providers disagree on step size (OpenWeatherMap is 3-hourly), so slicing a
 * fixed count would put 36 hours under a "Next 12 hours" heading. The window
 * is half-open from the first entry, so a 3-hour source yields 0h..9h (four
 * entries) and an hourly source yields 0h..11h (twelve).
 */
export function hoursWithin(hourly: HourlyWeather[], hours: number): HourlyWeather[] {
  if (hourly.length === 0) return [];
  const start = new Date(hourly[0].time).getTime();
  const end = start + hours * 3600_000;
  const out: HourlyWeather[] = [];
  for (const h of hourly) {
    const at = new Date(h.time).getTime();
    if (Number.isNaN(at) || at >= end) break;
    out.push(h);
  }
  return out;
}
