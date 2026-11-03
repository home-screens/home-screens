import type { ClockConfig, ClockHourFormat, TimeFormat } from '@/types/config';
import { householdTimeFormat } from '@/lib/clock-time';

/**
 * Where a clock's 12/24-hour choice comes from. Every clock carries
 * `hourFormat` since schema 17; a hand-edited clock without it follows the
 * household, which is what the registry places.
 */
export function clockHourFormat(config: Partial<Pick<ClockConfig, 'hourFormat'>>): ClockHourFormat {
  return config.hourFormat ?? 'inherit';
}

/**
 * Whether a clock renders 24-hour time: `inherit` reads the household
 * setting (absent = the formatting language's own clock, as everywhere, see
 * `householdTimeFormat`), and `12h` / `24h` pin it.
 */
export function resolveClockFormat24h(
  config: Partial<Pick<ClockConfig, 'hourFormat'>>,
  timeFormat: TimeFormat | undefined,
  locale: string,
): boolean {
  const mode = clockHourFormat(config);
  if (mode === 'inherit') return householdTimeFormat(timeFormat, locale) === '24h';
  return mode === '24h';
}
