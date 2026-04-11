/**
 * Timezone utilities for displaying correct local time regardless of server OS timezone.
 *
 * The core problem: on a Raspberry Pi, the OS timezone may be wrong (e.g. UTC).
 * Modules use `new Date()` whose `.getHours()` etc. reflect the OS timezone.
 * We solve this with a "shifted Date" trick: construct a Date whose local-time
 * methods return values matching the configured IANA timezone.
 */

/**
 * Curated list of common IANA zones used as the shared source of truth for
 * every timezone picker UI — both the clock module's world-zones selector
 * and the settings-page fallback when `Intl.supportedValuesOf('timeZone')`
 * is unavailable. Keeping both surfaces on one list avoids the "clock has
 * Sydney but settings doesn't" drift a previous audit caught.
 *
 * Consumers that need an unfiltered picker (location settings) prefer
 * `Intl.supportedValuesOf('timeZone')` when the runtime supports it and
 * fall back to this list otherwise.
 */
export interface TimezoneOption {
  /** Friendly label shown in the picker (e.g. "New York"). */
  label: string;
  /** IANA zone identifier (e.g. "America/New_York"). */
  value: string;
}

export const COMMON_TIMEZONES: readonly TimezoneOption[] = [
  { label: 'New York', value: 'America/New_York' },
  { label: 'Chicago', value: 'America/Chicago' },
  { label: 'Denver', value: 'America/Denver' },
  { label: 'Los Angeles', value: 'America/Los_Angeles' },
  { label: 'Anchorage', value: 'America/Anchorage' },
  { label: 'Honolulu', value: 'Pacific/Honolulu' },
  { label: 'Toronto', value: 'America/Toronto' },
  { label: 'Vancouver', value: 'America/Vancouver' },
  { label: 'Mexico City', value: 'America/Mexico_City' },
  { label: 'São Paulo', value: 'America/Sao_Paulo' },
  { label: 'Buenos Aires', value: 'America/Argentina/Buenos_Aires' },
  { label: 'London', value: 'Europe/London' },
  { label: 'Paris', value: 'Europe/Paris' },
  { label: 'Berlin', value: 'Europe/Berlin' },
  { label: 'Amsterdam', value: 'Europe/Amsterdam' },
  { label: 'Rome', value: 'Europe/Rome' },
  { label: 'Madrid', value: 'Europe/Madrid' },
  { label: 'Zurich', value: 'Europe/Zurich' },
  { label: 'Stockholm', value: 'Europe/Stockholm' },
  { label: 'Moscow', value: 'Europe/Moscow' },
  { label: 'Istanbul', value: 'Europe/Istanbul' },
  { label: 'Dubai', value: 'Asia/Dubai' },
  { label: 'Mumbai', value: 'Asia/Kolkata' },
  { label: 'Bangkok', value: 'Asia/Bangkok' },
  { label: 'Singapore', value: 'Asia/Singapore' },
  { label: 'Hong Kong', value: 'Asia/Hong_Kong' },
  { label: 'Shanghai', value: 'Asia/Shanghai' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Seoul', value: 'Asia/Seoul' },
  { label: 'Sydney', value: 'Australia/Sydney' },
  { label: 'Melbourne', value: 'Australia/Melbourne' },
  { label: 'Auckland', value: 'Pacific/Auckland' },
  { label: 'UTC', value: 'UTC' },
];

/**
 * Create a Date whose local-time methods (getHours, getMonth, etc.) reflect
 * the given IANA timezone. Works by extracting date parts via Intl and
 * reconstructing a local Date from them.
 *
 * If no timezone is provided, returns `new Date()` (system default).
 */
export function createTZDate(timezone?: string): Date {
  if (!timezone) return new Date();

  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

    const hour = get('hour') === 24 ? 0 : get('hour');
    return new Date(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  } catch {
    // Invalid timezone string — fall back to system default
    return new Date();
  }
}

/**
 * Format a Date's time in the given timezone using Intl.
 * Useful for modules that display times from external sources (SunCalc, APIs)
 * where the Date is already a real UTC instant.
 */
export function formatTimeInTZ(
  date: Date,
  timezone?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    // Invalid timezone — format without timezone override
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...options,
    });
  }
}

/**
 * Format a Date in the given IANA timezone using Intl.DateTimeFormat.
 * Prefer this over calling `date.toLocaleDateString('en-US', opts)` directly
 * when `date` is a real UTC instant and the module has a configured timezone,
 * otherwise the Pi's OS timezone leaks into the displayed string.
 */
export function formatDateInTZ(
  date: Date,
  timezone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  if (isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleDateString('en-US', {
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    // Invalid timezone — format without timezone override
    return date.toLocaleDateString('en-US', options);
  }
}

/**
 * Parse a naive datetime string (no Z or offset) as if it were in the
 * given timezone, returning a Date with the correct UTC epoch.
 *
 * If the string already has timezone info (Z, +HH:MM), it's parsed as-is.
 * Used by CountdownModule to interpret user-entered dates correctly.
 */
export function parseDateInTZ(dateStr: string, timezone?: string): Date {
  const parsed = new Date(dateStr);
  if (!timezone || isNaN(parsed.getTime())) return parsed;

  // If the string has explicit timezone info, it's already absolute
  if (/Z|[+-]\d{2}:?\d{2}\s*$/.test(dateStr.trim())) return parsed;

  // Extract the parts the user intended (parsed in OS local time)
  const year = parsed.getFullYear();
  const month = parsed.getMonth();
  const day = parsed.getDate();
  const hour = parsed.getHours();
  const min = parsed.getMinutes();
  const sec = parsed.getSeconds();

  // Create a UTC guess and find how far off the target timezone is
  try {
    const utcGuess = Date.UTC(year, month, day, hour, min, sec);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(new Date(utcGuess));

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

    const tzHour = get('hour') === 24 ? 0 : get('hour');
    const tzLocal = new Date(get('year'), get('month') - 1, get('day'), tzHour, get('minute'), get('second'));
    const intended = new Date(year, month, day, hour, min, sec);
    const offsetMs = intended.getTime() - tzLocal.getTime();

    return new Date(utcGuess + offsetMs);
  } catch {
    return parsed;
  }
}
