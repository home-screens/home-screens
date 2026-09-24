/**
 * Timezone utilities for displaying correct local time regardless of server OS timezone.
 *
 * The core problem: on a Raspberry Pi, the OS timezone may be wrong (e.g. UTC).
 * Modules use `new Date()` whose `.getHours()` etc. reflect the OS timezone.
 * We solve this with a "shifted Date" trick: construct a Date whose local-time
 * methods return values matching the configured IANA timezone.
 *
 * Locale-aware helpers (`formatTimeInTZ`, `formatDateInTZ`) accept an
 * optional `locale` argument — defaults to `DEFAULT_LOCALE` (en-US) so
 * legacy callers continue to work without code changes. Internal Intl
 * helpers that only need part extraction (`createTZDate`,
 * `parseDateInTZ`) keep using `'en-US'` because the part values are
 * locale-independent integers.
 */
import { DEFAULT_LOCALE } from '@/i18n/manifest';

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

const CURATED_ZONE_LABELS = new Map(COMMON_TIMEZONES.map((tz) => [tz.value, tz.label]));

/**
 * A zone in the words the picker shows it: the curated label for common zones
 * ("Mumbai" for Asia/Kolkata), otherwise the id's last segment with spaces
 * ("Los Angeles", "Kiritimati", "UTC" for Etc/UTC).
 */
export function timezoneLabel(zone: string): string {
  return CURATED_ZONE_LABELS.get(zone) ?? zone.split('/').pop()!.replace(/_/g, ' ');
}

/**
 * Whether a zone is named after a place ("Chicago time" reads right) or is a
 * bare offset like UTC or Etc/GMT+5, which is named as it is.
 */
export function isPlaceTimezone(zone: string): boolean {
  return zone.includes('/') && !zone.startsWith('Etc/');
}

/**
 * Full IANA zone list for pickers: `Intl.supportedValuesOf('timeZone')` when
 * the runtime supports it, COMMON_TIMEZONES otherwise — the fallback contract
 * the settings Location page established.
 *
 * The Intl list is unioned with COMMON_TIMEZONES and 'UTC' (which the Intl
 * list omits): a runtime's ICU may canonicalize to legacy aliases — Chromium
 * has served "Asia/Calcutta" with no "Asia/Kolkata" — and a user typing the
 * modern id must still find the zone. Both ids of an alias pair are valid
 * IANA names, so on such runtimes both simply appear and both work.
 */
export function listTimezoneValues(): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    return COMMON_TIMEZONES.map((tz) => tz.value);
  }
  const all = new Set(zones);
  for (const tz of COMMON_TIMEZONES) all.add(tz.value);
  all.add('UTC');
  return [...all];
}

/**
 * Zone names only: letters, digits, `_`, `+` and `-` in `/`-separated
 * segments, starting with a letter. This is the shape guard, and the reason
 * it exists is `Intl.DateTimeFormat` below, which also accepts offset forms
 * like "+05:30" that are not zone names and are not what `timedatectl` wants.
 * It rejects every crafted argument on the way past: spaces, `;`, `..`.
 */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/**
 * Is this a genuine IANA zone identifier, and so the one thing the API will
 * hand `timedatectl`?
 *
 * Not `listTimezoneValues().includes(zone)`, which was the first spelling and
 * was wrong: `Intl.supportedValuesOf` lists only the *primary* id of each
 * zone, and which of an alias pair is primary depends on the runtime's ICU
 * vintage. Node here answers "Europe/Kiev", so a household on "Europe/Kyiv"
 * (or "America/Nuuk", or any other renamed zone) was told its own timezone
 * did not exist. Patching COMMON_TIMEZONES zone by zone is how "Asia/Kolkata"
 * came to pass while the other renames did not.
 *
 * ICU's tz database is the allowlist instead. It is a superset of the picker
 * list, current for whatever runtime is asking, and still an enumeration:
 * anything that is not a real zone name throws.
 */
export function isKnownTimezone(zone: string): boolean {
  if (!ZONE_NAME.test(zone)) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Collapse an IANA alias to whatever primary id this runtime prefers, so two
 * spellings of one zone compare equal. ICU canonicalizes in either direction
 * depending on its vintage (Chromium has served "Asia/Calcutta" as the
 * primary, other builds "Asia/Kolkata"), which is fine: both sides of a
 * comparison go through here in the same runtime, so the direction never
 * matters. An unknown zone is returned unchanged rather than throwing.
 */
export function canonicalTimezone(zone: string): string {
  try {
    return Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
}

/** Do two zone ids name the same zone, alias spellings included? */
export function sameTimezone(a: string, b: string): boolean {
  return a === b || canonicalTimezone(a) === canonicalTimezone(b);
}

/**
 * Create a Date whose local-time methods (getHours, getMonth, etc.) reflect
 * the given IANA timezone. Works by extracting date parts via Intl and
 * reconstructing a local Date from them.
 *
 * If no timezone is provided, returns `new Date()` (system default).
 */
/**
 * A Date's own calendar day as `YYYY-MM-DD`. The canonical spelling: pass a
 * `toTZWallTime` result to get a day in some other zone.
 */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The calendar day an instant falls on in `timezone`, as `YYYY-MM-DD`; the
 * process's own day without one. Use this for "today" and for keying real
 * instants by day. `toISOString().slice(0, 10)` is the UTC day, and
 * `localISODate(new Date())` is whatever zone the machine happens to be in.
 */
export function isoDateInTZ(instant: Date = new Date(), timezone?: string): string {
  return localISODate(toTZWallTime(instant, timezone));
}

/**
 * A Date's own calendar day and clock time as `YYYY-MM-DDTHH:mm`: the value an
 * `<input type="datetime-local">` reads and writes.
 *
 * Always use this to seed or fill a date or datetime input.
 * `toISOString().slice(0, 16)` looks like the same string but is UTC, and the
 * input reads it back as local time: a countdown created at 10:24 PM in
 * Chicago opened on tomorrow's date at 3:24 AM.
 */
export function localISODateTime(d: Date = new Date()): string {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${localISODate(d)}T${h}:${min}`;
}

/**
 * An instant as an ISO timestamp written in `timezone`'s own offset
 * ("2026-09-23T20:47:00.000-05:00"); the process's zone without one. Its
 * first ten characters are the calendar day there, which any reader can take
 * without knowing the zone.
 */
export function timestampInTZ(now: Date = new Date(), timezone?: string): string {
  const wall = toTZWallTime(now, timezone);
  // The wall time is read to the second; the milliseconds are the instant's
  // own. Dropping them made a stamp sort before a tick made in the same second.
  const ms = now.getMilliseconds();
  const offset = timezone
    ? Math.round((Date.UTC(wall.getFullYear(), wall.getMonth(), wall.getDate(), wall.getHours(), wall.getMinutes(), wall.getSeconds()) - (now.getTime() - ms)) / 60000)
    : -now.getTimezoneOffset();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const abs = Math.abs(offset);
  return `${localISODate(wall)}T${pad(wall.getHours())}:${pad(wall.getMinutes())}:${pad(wall.getSeconds())}.${pad(ms, 3)}`
    + `${offset >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function createTZDate(timezone?: string): Date {
  return toTZWallTime(new Date(), timezone);
}

// Formatter construction dominates Intl cost and this runs per event in
// calendar grids, so cache one formatter per timezone (a handful at most).
const wallTimeFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Shift an absolute instant into a "wall time" Date for the given IANA
 * timezone: the returned Date's local-time methods (getHours, getDate, …)
 * report the instant's clock reading in that timezone, regardless of the
 * OS timezone. This is the same shifted-Date convention as `createTZDate`
 * (which is just this applied to `new Date()`), so shifted values compare
 * correctly against it. Without a timezone (or with an invalid one, or an
 * Invalid Date) the input is returned unchanged.
 */
export function toTZWallTime(date: Date, timezone?: string): Date {
  if (!timezone || isNaN(date.getTime())) return date;

  try {
    // 'en-US' is intentional: `formatToParts` is consumed as integers
    // (parseInt below), so we need a locale that emits ASCII digits
    // — Arabic/Indic locales would emit non-Latin numerals that break
    // parseInt. This is locale-INDEPENDENT machine extraction, not
    // user-facing formatting.
    let formatter = wallTimeFormatters.get(timezone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
      });
      wallTimeFormatters.set(timezone, formatter);
    }
    const parts = formatter.formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

    const hour = get('hour') === 24 ? 0 : get('hour');
    return new Date(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  } catch {
    // Invalid timezone string — fall back to the input unchanged
    return date;
  }
}

/**
 * An instant's wall-clock reading in a zone, as plain numbers.
 *
 * Schedule, sleep and condition checks read this instead of a shifted Date.
 * `toTZWallTime` rebuilds its result in the machine's own zone, so a household
 * time that falls in the machine's spring-forward gap comes back an hour late:
 * 02:30 in London on 2026-03-08 reads as 03:30 on a Chicago laptop, because
 * Chicago skips that hour that night. Plain numbers have no gap to fall into.
 */
export interface WallClock {
  /** 0 = Sunday, the same numbering as `Date.getDay()`. */
  dayOfWeek: number;
  /** Minutes since the zone's midnight, 0 to 1439. */
  minuteOfDay: number;
  /** The zone's calendar day, `YYYY-MM-DD`. */
  isoDate: string;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Read `instant` on `timezone`'s wall clock, straight from Intl. Without a zone
 * (or with one this runtime does not know) it reads the Date's own local
 * getters, which is also the right reading for a shifted Date or a synthetic
 * calendar probe built with `new Date(y, m, d, h, min)`.
 */
export function wallClockParts(instant: Date = new Date(), timezone?: string): WallClock {
  if (timezone && !isNaN(instant.getTime())) {
    try {
      let formatter = wallClockFormatters.get(timezone);
      if (!formatter) {
        // 'en-US' for ASCII digits and English weekday names, as in
        // `toTZWallTime`: these parts are parsed, never shown.
        formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          weekday: 'short',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        });
        wallClockFormatters.set(timezone, formatter);
      }
      const parts = formatter.formatToParts(instant);
      const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
      return {
        dayOfWeek: WEEKDAY_NAMES.indexOf(get('weekday')),
        minuteOfDay: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
        isoDate: `${get('year')}-${get('month')}-${get('day')}`,
      };
    } catch {
      // Unknown zone: read the Date's own clock below, as toTZWallTime does.
    }
  }
  return {
    dayOfWeek: instant.getDay(),
    minuteOfDay: instant.getHours() * 60 + instant.getMinutes(),
    isoDate: localISODate(instant),
  };
}

/**
 * Response header on `GET /api/config` naming the hub's own zone, which is the
 * household's zone while none is saved. The display and the editor read it from
 * the same response as the config, so a hub whose clock zone changes is picked
 * up on their next load or poll.
 */
export const HUB_TIMEZONE_HEADER = 'X-Hub-Timezone';

/**
 * The zone the household runs in: the saved one, or the hub's own while none
 * is saved. Every surface resolves an unset zone to the hub, never to the
 * machine it happens to run on. The hub already keeps the family's data by its
 * own clock (chore days, to-do resets, the phone), so a UTC kiosk or a
 * travelling laptop falling back to itself used to show a different hour and
 * day from the chore chart next to it.
 */
export function resolveHouseholdTimezone(saved: string | undefined, hubZone: string): string {
  return saved || hubZone;
}

/** `settings` with its zone resolved (see `resolveHouseholdTimezone`). */
export function withHouseholdTimezone<S extends { timezone?: string }>(
  settings: S,
  hubZone: string,
): S & { timezone: string } {
  if (settings.timezone) return settings as S & { timezone: string };
  return { ...settings, timezone: hubZone };
}

/**
 * How a clock time should be rendered: which zone, which locale, and 12 or 24
 * hour.
 *
 * All three are required on purpose. This function used to default `locale` to
 * en-US and `hour12` to true, so the obvious call — `formatTimeInTZ(date, tz)` —
 * silently produced American 12-hour output regardless of the household's
 * language or its 12/24 setting. Two modules were written that way and nothing
 * pointed at them. Required fields make the compiler do the pointing.
 */
export interface ClockFormat {
  timezone?: string;
  /** BCP-47 tag for the Intl formatter (`useFormattingLocale()` on the client). */
  locale: string;
  /** true = 12-hour with AM/PM, false = 24-hour. */
  hour12: boolean;
}

/**
 * Format a Date's time in the given timezone using Intl.
 * Useful for modules that display times from external sources (SunCalc, APIs)
 * where the Date is already a real UTC instant.
 */
export function formatTimeInTZ(
  date: Date,
  fmt: ClockFormat,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (isNaN(date.getTime())) return '—';
  const base: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: fmt.hour12,
    ...options,
  };
  try {
    return date.toLocaleTimeString(fmt.locale, {
      ...base,
      ...(fmt.timezone ? { timeZone: fmt.timezone } : {}),
    });
  } catch {
    // Invalid timezone — format without timezone override
    return date.toLocaleTimeString(fmt.locale, base);
  }
}

/**
 * Format a Date in the given IANA timezone using Intl.DateTimeFormat.
 * Prefer this over calling `date.toLocaleDateString(locale, opts)` directly
 * when `date` is a real UTC instant and the module has a configured timezone,
 * otherwise the Pi's OS timezone leaks into the displayed string.
 *
 * `locale` is the BCP-47 tag used for the Intl formatter — defaults to
 * `DEFAULT_LOCALE` (en-US). Pass the value from `useFormattingLocale()`
 * (client) or from `settings.formattingLocale` (server) for
 * locale-aware output.
 */
export function formatDateInTZ(
  date: Date,
  timezone: string | undefined,
  options: Intl.DateTimeFormatOptions,
  locale: string = DEFAULT_LOCALE,
): string {
  if (isNaN(date.getTime())) return '—';
  try {
    return date.toLocaleDateString(locale, {
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    // Invalid timezone — format without timezone override
    return date.toLocaleDateString(locale, options);
  }
}

const NAIVE_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/;
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** `timezone`'s UTC offset at `instantMs`, in ms (Chicago in winter: -6 h). */
function zoneOffsetMs(instantMs: number, timezone: string): number {
  let formatter = offsetFormatters.get(timezone);
  if (!formatter) {
    // 'en-US' for ASCII digits, as in `toTZWallTime`.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    offsetFormatters.set(timezone, formatter);
  }
  const wholeSecond = Math.floor(instantMs / 1000) * 1000;
  const parts = formatter.formatToParts(new Date(wholeSecond));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return wallAsUtc - wholeSecond;
}

/**
 * The real instant of a wall-clock reading in `timezone`, with the same
 * choices as Temporal's "compatible" rule: a reading the zone passes twice on
 * fall-back night is the first pass, and one the zone skips on spring-forward
 * night is moved on by the size of the skip (02:30 in a skipped hour is 03:30).
 */
function wallTimeToInstant(wallAsUtc: number, timezone: string): number {
  const DAY = 86_400_000;
  const before = zoneOffsetMs(wallAsUtc - DAY, timezone);
  const after = zoneOffsetMs(wallAsUtc + DAY, timezone);
  const early = wallAsUtc - before;
  const late = wallAsUtc - after;
  const earlyHolds = zoneOffsetMs(early, timezone) === before;
  const lateHolds = zoneOffsetMs(late, timezone) === after;
  if (earlyHolds && lateHolds) return Math.min(early, late);
  if (earlyHolds) return early;
  if (lateHolds) return late;
  return early;
}

/**
 * Parse a naive datetime string (no Z or offset) as if it were in the
 * given timezone, returning a Date with the correct UTC epoch.
 *
 * A bare `YYYY-MM-DD` is that day's midnight in `timezone`, not the UTC
 * midnight `new Date()` reads it as. If the string already has timezone info
 * (Z, +HH:MM), it's parsed as-is. Without a timezone (or with one this
 * runtime does not know) a naive string is read on this machine's clock.
 * The wall-clock parts come from the string itself, never from a Date built
 * in the machine's zone, so the result does not depend on where it runs.
 */
export function parseDateInTZ(dateStr: string, timezone?: string): Date {
  const trimmed = dateStr.trim();
  // Explicit zone info makes the string an instant already
  if (/Z|[+-]\d{2}:?\d{2}\s*$/.test(trimmed)) return new Date(dateStr);

  let wallAsUtc: number;
  let local: Date;
  const match = NAIVE_DATE_TIME.exec(trimmed);
  if (match) {
    const [y, mo, d, h, mi, s] = match.slice(1, 7).map((v) => (v === undefined ? 0 : Number(v)));
    const ms = match[7] ? Number(match[7].padEnd(3, '0')) : 0;
    wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s, ms);
    local = new Date(y, mo - 1, d, h, mi, s, ms);
  } else {
    // Free-form input: let the engine read it on this machine's clock, then
    // take the wall-clock parts it found.
    local = new Date(dateStr);
    if (isNaN(local.getTime())) return local;
    wallAsUtc = Date.UTC(
      local.getFullYear(), local.getMonth(), local.getDate(),
      local.getHours(), local.getMinutes(), local.getSeconds(), local.getMilliseconds(),
    );
  }
  if (!timezone) return local;

  try {
    return new Date(wallTimeToInstant(wallAsUtc, timezone));
  } catch {
    // Invalid timezone: read it on this machine's clock
    return local;
  }
}
