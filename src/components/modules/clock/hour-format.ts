import type { ClockConfig, TimeFormat } from '@/types/config';
import { householdTimeFormat } from '@/lib/clock-time';

/**
 * Whether a clock renders 24-hour time.
 *
 * `hourFormat` wins when present: `inherit` reads the household setting
 * (absent = the formatting language's own clock, as everywhere, see
 * `householdTimeFormat`), and
 * `12h` / `24h` pin it. A clock without `hourFormat` was placed before the
 * key existed and keeps reading its own `format24h`, so no clock already on
 * a wall moved when new clocks started following the household (plan 50,
 * item 6b, shape S2).
 */
export function resolveClockFormat24h(
  config: Pick<ClockConfig, 'format24h' | 'hourFormat'>,
  timeFormat: TimeFormat | undefined,
  locale: string,
): boolean {
  const mode = config.hourFormat ?? (config.format24h ? '24h' : '12h');
  if (mode === 'inherit') return householdTimeFormat(timeFormat, locale) === '24h';
  return mode === '24h';
}
