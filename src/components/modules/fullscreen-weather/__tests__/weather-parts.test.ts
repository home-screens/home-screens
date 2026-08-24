import { describe, it, expect } from 'vitest';
import { dayName, shortDate } from '../weather-parts';
import type { WeatherViewProps } from '../weather-view-utils';

/**
 * A forecast day's `date` is a calendar date with no zone. The labels must
 * come back as that date whatever zone the Pi's OS runs in and whatever zone
 * the display is configured for; a 12-hour split between the two used to
 * shift every Week band a day forward.
 */
function props(locale: string, timezone: string): WeatherViewProps {
  return { locale, timezone, t: (key: string) => key } as unknown as WeatherViewProps;
}

describe('dayName / shortDate', () => {
  it('formats the calendar date, not a zone-shifted instant', () => {
    // 2026-08-24 is a Monday everywhere.
    for (const tz of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC', 'Pacific/Honolulu']) {
      const p = props('en-US', tz);
      expect(dayName('2026-08-24', 1, p)).toBe('Mon');
      expect(shortDate('2026-08-24', p)).toBe('Aug 24');
    }
  });

  it('names the first row "Today"', () => {
    expect(dayName('2026-08-24', 0, props('en-US', 'UTC'))).toBe('fullscreen-weather.today');
  });

  it('follows the household locale', () => {
    expect(dayName('2026-08-24', 1, props('de-DE', 'Europe/Berlin'))).toMatch(/^Mo/);
    expect(shortDate('2026-08-24', props('de-DE', 'Europe/Berlin'))).toMatch(/24/);
  });

  it('degrades on a malformed date', () => {
    expect(dayName('not-a-date', 1, props('en-US', 'UTC'))).toBe('not-a-date');
    expect(shortDate('not-a-date', props('en-US', 'UTC'))).toBe('');
  });
});
