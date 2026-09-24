import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import {
  createTZDate,
  localISODate,
  localISODateTime,
  formatTimeInTZ,
  formatDateInTZ,
  parseDateInTZ,
  listTimezoneValues,
  isKnownTimezone,
  canonicalTimezone,
  sameTimezone,
  COMMON_TIMEZONES,
} from '@/lib/timezone';

describe('createTZDate', () => {
  it('returns a Date close to now when no timezone is provided', () => {
    const before = Date.now();
    const result = createTZDate();
    const after = Date.now();

    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(result.getTime()).toBeLessThanOrEqual(after + 1);
  });

  it('returns a Date whose local-time parts match the given timezone', () => {
    const result = createTZDate('America/New_York');

    // Cross-check: format the current time in NY timezone and compare
    const now = new Date();
    const nyParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(nyParts.find((p) => p.type === type)?.value ?? '0', 10);

    const expectedHour = get('hour') === 24 ? 0 : get('hour');

    expect(result.getFullYear()).toBe(get('year'));
    expect(result.getMonth()).toBe(get('month') - 1);
    expect(result.getDate()).toBe(get('day'));
    expect(result.getHours()).toBe(expectedHour);
    expect(result.getMinutes()).toBe(get('minute'));
  });

  it('returns a Date for a timezone with a large offset (e.g. Asia/Tokyo, UTC+9)', () => {
    const result = createTZDate('Asia/Tokyo');

    const now = new Date();
    const tokyoParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parseInt(tokyoParts.find((p) => p.type === type)?.value ?? '0', 10);

    const expectedHour = get('hour') === 24 ? 0 : get('hour');
    expect(result.getHours()).toBe(expectedHour);
    expect(result.getMinutes()).toBe(get('minute'));
  });

  it('falls back to a Date (does NOT throw) for an invalid timezone string', () => {
    const before = Date.now();
    const result = createTZDate('Not/A_Real_Zone');
    const after = Date.now();

    expect(result).toBeInstanceOf(Date);
    // Should be close to now since it falls back to new Date()
    expect(result.getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(result.getTime()).toBeLessThanOrEqual(after + 1);
  });

  it('handles hour 24 (midnight) by converting to 0', () => {
    // We can't easily force Intl to return hour 24, but we can verify the
    // function handles it by checking the implementation doesn't crash
    // and returns a valid date for a timezone at or near midnight.
    const result = createTZDate('Pacific/Kiritimati'); // UTC+14, often near day boundary
    expect(result).toBeInstanceOf(Date);
    expect(result.getHours()).toBeGreaterThanOrEqual(0);
    expect(result.getHours()).toBeLessThanOrEqual(23);
  });

  it('returns undefined timezone effectively (empty string treated as falsy)', () => {
    const before = Date.now();
    const result = createTZDate('');
    const after = Date.now();

    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(result.getTime()).toBeLessThanOrEqual(after + 1);
  });
});

describe('localISODate / localISODateTime', () => {
  it('spells a date the way a date input reads it back', () => {
    expect(localISODate(new Date(2026, 8, 19, 22, 24))).toBe('2026-09-19');
    expect(localISODateTime(new Date(2026, 8, 19, 22, 24))).toBe('2026-09-19T22:24');
  });

  it('pads single-digit months, days, hours and minutes', () => {
    expect(localISODateTime(new Date(2026, 0, 5, 3, 7))).toBe('2026-01-05T03:07');
  });

  // The bug this exists to stop: seeding a datetime-local input from
  // toISOString() hands it UTC wall-clock text, which the input then reads as
  // local time. Late evening west of Greenwich that is tomorrow, at an hour
  // nobody chose.
  it('stays on the local calendar day when UTC has already moved on', () => {
    const lateEvening = new Date(2026, 8, 19, 22, 24);
    expect(localISODateTime(lateEvening).slice(0, 10)).toBe(localISODate(lateEvening));
    expect(localISODateTime(lateEvening)).toBe(
      `${lateEvening.getFullYear()}-09-19T${String(lateEvening.getHours()).padStart(2, '0')}:24`,
    );
  });

  it('defaults to now', () => {
    const now = new Date();
    expect(localISODateTime()).toBe(localISODateTime(now));
    expect(localISODate()).toBe(localISODateTime(now).slice(0, 10));
  });

  // Every editor file that owns a date or datetime field, found by the field
  // itself rather than by a list that would go stale. A UTC string in one of
  // them is the countdown bug again in a new place.
  it('is what every editor date field is filled from', () => {
    const offenders: string[] = [];
    for (const file of walk('src/components/editor')) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = readFileSync(file, 'utf8');
      if (!/type=["']date(time-local)?["']/.test(source)) continue;
      if (/toISOString\(\)\s*\.\s*(slice|substring)/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe('formatTimeInTZ', () => {
  it('returns "—" (em dash) for an invalid/NaN Date', () => {
    const nanDate = new Date('not-a-date');
    expect(formatTimeInTZ(nanDate, { locale: 'en-US', hour12: true })).toBe('—');
  });

  it('returns "—" for NaN Date even when timezone and options are provided', () => {
    const nanDate = new Date(NaN);
    expect(formatTimeInTZ(nanDate, { timezone: 'America/Chicago', locale: 'en-US', hour12: false })).toBe('—');
  });

  it('formats a valid date with a specific timezone', () => {
    // Use a known UTC instant: 2024-01-15T12:30:00Z (noon UTC)
    const date = new Date('2024-01-15T12:30:00Z');
    const result = formatTimeInTZ(date, { timezone: 'America/New_York', locale: 'en-US', hour12: true });

    // New York is UTC-5 in January, so 12:30 UTC → 7:30 AM ET
    expect(result).toMatch(/7:30/);
    expect(result).toMatch(/AM/);
  });

  it('formats a valid date without timezone (uses system default)', () => {
    const date = new Date('2024-06-15T18:45:00Z');
    const result = formatTimeInTZ(date, { locale: 'en-US', hour12: true });

    // Should return a formatted string, not "—"
    expect(result).not.toBe('—');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('falls back gracefully for an invalid timezone (does NOT throw)', () => {
    const date = new Date('2024-01-15T12:30:00Z');
    const result = formatTimeInTZ(date, { timezone: 'Invalid/Timezone_Zone', locale: 'en-US', hour12: true });

    // Should still format, just without timezone override
    expect(result).not.toBe('—');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('passes through custom Intl options (hour12: false)', () => {
    const date = new Date('2024-01-15T15:30:00Z');
    const result = formatTimeInTZ(date, { timezone: 'UTC', locale: 'en-US', hour12: false });

    // With hour12: false and UTC, should show 15:30 (no AM/PM)
    expect(result).toMatch(/15:30/);
    expect(result).not.toMatch(/AM|PM/);
  });

  it('passes through custom Intl options (second display)', () => {
    const date = new Date('2024-01-15T12:30:45Z');
    const result = formatTimeInTZ(date, { timezone: 'UTC', locale: 'en-US', hour12: true }, { second: '2-digit' });

    // Should include seconds
    expect(result).toMatch(/45/);
  });

  it('correctly applies timezone for dates across different hemispheres', () => {
    // 2024-07-15T00:00:00Z — midnight UTC
    const date = new Date('2024-07-15T00:00:00Z');

    const sydney = formatTimeInTZ(date, { timezone: 'Australia/Sydney', locale: 'en-US', hour12: true });
    // Sydney is UTC+10 in July (AEST, no DST), so midnight UTC → 10:00 AM
    expect(sydney).toMatch(/10:00/);
    expect(sydney).toMatch(/AM/);
  });

  it('honors the locale argument when caller opts into 24h time (proving the tag flows through Intl)', () => {
    // Regression guard for the en-US literal cutover. With an explicit
    // `hour12: false` the German short time is "17:30" while the en-US
    // form would still emit "17:30" too — that proves nothing.
    // Instead, drop hour12 entirely so each locale picks its convention:
    // de-DE uses 24h, en-US uses 12h with " AM/PM". Comparing the two
    // outputs (rather than asserting an exact string) keeps the test
    // resilient to ICU version drift while still proving the locale
    // flowed end-to-end.
    const date = new Date('2024-07-15T15:30:00Z');
    const de = formatTimeInTZ(date, { timezone: 'Europe/Berlin', locale: 'de-DE', hour12: false });
    const en = formatTimeInTZ(date, { timezone: 'Europe/Berlin', locale: 'en-US', hour12: false });
    // Both should hit the locale-default 24h path with Berlin = UTC+2
    // in July, so 15:30 UTC → 17:30 Berlin. The exact separator/spacing
    // can differ between locales (de-DE may include narrow no-break
    // spaces, en-US uses ASCII colons), so assert the digit pattern
    // and the locale-divergence rather than exact string equality.
    expect(de).toMatch(/17:30/);
    expect(en).toMatch(/17:30/);
    // Now read the user-facing weekday format — that one IS locale-
    // sensitive in every locale, so we can compare distinct outputs.
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      hour: 'numeric',
      minute: '2-digit',
    };
    const deLong = formatTimeInTZ(date, { timezone: 'Europe/Berlin', locale: 'de-DE', hour12: false }, dateOptions);
    const enLong = formatTimeInTZ(date, { timezone: 'Europe/Berlin', locale: 'en-US', hour12: false }, dateOptions);
    expect(deLong).not.toBe(enLong);
  });
});

describe('formatDateInTZ', () => {
  it('returns "—" (em dash) for an invalid/NaN Date', () => {
    const nan = new Date('not-a-date');
    expect(formatDateInTZ(nan, 'UTC', { weekday: 'long' })).toBe('—');
  });

  it('formats a date in a specific timezone (en-US default)', () => {
    // Mid-day UTC → still the same date in UTC; assert digits are present.
    const date = new Date('2024-07-15T12:30:00Z');
    const result = formatDateInTZ(date, 'UTC', { year: 'numeric', month: 'long', day: 'numeric' });
    expect(result).toContain('2024');
    expect(result).toContain('July');
    expect(result).toContain('15');
  });

  it('respects the timezone when bucketing across the day boundary', () => {
    // 2024-07-15T23:30:00Z is already July 16 in Tokyo (UTC+9).
    const date = new Date('2024-07-15T23:30:00Z');
    const result = formatDateInTZ(date, 'Asia/Tokyo', { year: 'numeric', month: '2-digit', day: '2-digit' });
    expect(result).toMatch(/07\/16\/2024|2024-07-16/);
  });

  it('falls back gracefully when the timezone is invalid (does NOT throw)', () => {
    const date = new Date('2024-07-15T12:30:00Z');
    const result = formatDateInTZ(date, 'Not/A_Real_Zone', { weekday: 'long' });
    // Should still format using the host TZ, not return "—".
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });

  it('honors the locale argument for user-facing weekday names', () => {
    // Regression guard for the en-US literal cutover: passing a non-en
    // locale must change the Intl-formatted weekday.
    const date = new Date('2024-07-15T12:00:00Z'); // Monday
    const en = formatDateInTZ(date, 'UTC', { weekday: 'long' }, 'en-US');
    const de = formatDateInTZ(date, 'UTC', { weekday: 'long' }, 'de-DE');
    expect(en).toMatch(/Monday/);
    expect(de).toMatch(/Montag/);
    expect(en).not.toBe(de);
  });

  it('honors the locale even when the timezone is invalid (fallback path)', () => {
    // The catch branch must also pass the locale through, otherwise users
    // with a misconfigured timezone would silently get English output.
    const date = new Date('2024-07-15T12:00:00Z');
    const de = formatDateInTZ(date, 'Not/A_Real_Zone', { weekday: 'long' }, 'de-DE');
    expect(de).toMatch(/Montag/);
  });

  it('defaults to en-US when locale is omitted', () => {
    const date = new Date('2024-07-15T12:00:00Z');
    const result = formatDateInTZ(date, 'UTC', { weekday: 'long' });
    expect(result).toMatch(/Monday/);
  });
});

describe('parseDateInTZ', () => {
  it('returns new Date(dateStr) when no timezone is provided', () => {
    const dateStr = '2024-06-15T14:30:00';
    const result = parseDateInTZ(dateStr);
    const expected = new Date(dateStr);

    expect(result.getTime()).toBe(expected.getTime());
  });

  it('parses a date string with Z suffix as UTC (timezone ignored)', () => {
    const dateStr = '2024-06-15T14:30:00Z';
    const result = parseDateInTZ(dateStr, 'Asia/Tokyo');
    const expected = new Date(dateStr);

    // The timezone argument should be ignored for Z-suffixed strings
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('parses a date string with positive offset as-is (timezone ignored)', () => {
    const dateStr = '2024-06-15T14:30:00+05:00';
    const result = parseDateInTZ(dateStr, 'America/Los_Angeles');
    const expected = new Date(dateStr);

    expect(result.getTime()).toBe(expected.getTime());
  });

  it('parses a date string with negative offset as-is (timezone ignored)', () => {
    const dateStr = '2024-06-15T14:30:00-07:00';
    const result = parseDateInTZ(dateStr, 'Europe/London');
    const expected = new Date(dateStr);

    expect(result.getTime()).toBe(expected.getTime());
  });

  it('correctly shifts a naive datetime string to the given timezone', () => {
    // "2024-06-15 14:30:00" intended as America/New_York (UTC-4 in June)
    // The result should be a Date representing 14:30 in NY → 18:30 UTC
    const dateStr = '2024-06-15T14:30:00';
    const result = parseDateInTZ(dateStr, 'America/New_York');

    // Verify: format the result in NY timezone, should show 2:30 PM
    const nyFormatted = result.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
    expect(nyFormatted).toMatch(/14:30/);
  });

  it('correctly shifts a naive date to a timezone ahead of UTC', () => {
    // "2024-01-15 09:00:00" intended as Asia/Tokyo (UTC+9)
    // The result should represent 09:00 in Tokyo → 00:00 UTC
    const dateStr = '2024-01-15T09:00:00';
    const result = parseDateInTZ(dateStr, 'Asia/Tokyo');

    const tokyoFormatted = result.toLocaleString('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
    expect(tokyoFormatted).toMatch(/9:00/);
  });

  it('returns Invalid Date for an invalid date string', () => {
    const result = parseDateInTZ('not-a-date', 'America/New_York');
    expect(isNaN(result.getTime())).toBe(true);
  });

  it('returns Invalid Date for an empty string', () => {
    const result = parseDateInTZ('', 'America/New_York');
    expect(isNaN(result.getTime())).toBe(true);
  });

  it('returns Invalid Date for an empty string without timezone', () => {
    const result = parseDateInTZ('');
    expect(isNaN(result.getTime())).toBe(true);
  });

  it('falls back to parsed date for invalid timezone on a naive string', () => {
    const dateStr = '2024-06-15T14:30:00';
    const result = parseDateInTZ(dateStr, 'Fake/Timezone');
    const fallback = new Date(dateStr);

    // Should fall back to the naive parse, not throw
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(fallback.getTime());
  });

  it('reads a date-only string as midnight in the zone, whatever the machine zone', () => {
    // `new Date('2026-09-26')` is UTC midnight; read on a Chicago machine it
    // became 7 pm the evening before, and on a Kolkata one 05:30.
    expect(parseDateInTZ('2026-09-26', 'America/Chicago').toISOString()).toBe('2026-09-26T05:00:00.000Z');
    expect(parseDateInTZ('2026-09-26', 'Asia/Kolkata').toISOString()).toBe('2026-09-25T18:30:00.000Z');
    expect(parseDateInTZ('2026-09-26', 'UTC').toISOString()).toBe('2026-09-26T00:00:00.000Z');
  });

  it('reads a date-only string without a zone as local midnight', () => {
    expect(parseDateInTZ('2026-09-26').getTime()).toBe(new Date(2026, 8, 26).getTime());
  });

  it('takes the first pass of a fall-back hour and moves a skipped hour on', () => {
    // Chicago passes 01:30 twice on 2026-11-01 (CDT, then CST) and skips
    // 02:00 to 02:59 on 2026-03-08.
    expect(parseDateInTZ('2026-11-01T01:30', 'America/Chicago').toISOString()).toBe('2026-11-01T06:30:00.000Z');
    expect(parseDateInTZ('2026-03-08T02:30', 'America/Chicago').toISOString()).toBe('2026-03-08T08:30:00.000Z');
    expect(parseDateInTZ('2026-03-29T01:30', 'Europe/London').toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(parseDateInTZ('2026-10-25T01:30', 'Europe/London').toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('keeps fractional seconds', () => {
    expect(parseDateInTZ('2024-06-15T14:30:00.5', 'Asia/Tokyo').toISOString()).toBe('2024-06-15T05:30:00.500Z');
  });

  it('preserves date parts when shifting timezone', () => {
    // Verify the date (not just time) is correct after shifting
    const dateStr = '2024-12-31T23:30:00';
    const result = parseDateInTZ(dateStr, 'America/New_York');

    // In NY timezone, this should still be Dec 31 at 11:30 PM
    const nyDate = result.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
    expect(nyDate).toMatch(/12\/31\/2024/);
    expect(nyDate).toMatch(/23:30/);
  });
});

describe('listTimezoneValues', () => {
  it('always contains every curated zone and UTC, without duplicates', () => {
    // The Intl list is runtime-dependent (some ICUs canonicalize to legacy
    // aliases like Asia/Calcutta), so the union with COMMON_TIMEZONES is the
    // guarantee — whatever the runtime serves, these zones must be pickable.
    const zones = listTimezoneValues();
    for (const tz of COMMON_TIMEZONES) {
      expect(zones).toContain(tz.value);
    }
    expect(zones).toContain('UTC');
    expect(new Set(zones).size).toBe(zones.length);
  });
});

describe('isKnownTimezone', () => {
  it('accepts every zone the picker offers', () => {
    for (const tz of COMMON_TIMEZONES) expect(isKnownTimezone(tz.value)).toBe(true);
    expect(isKnownTimezone('UTC')).toBe(true);
  });

  it('accepts both spellings of a renamed zone', () => {
    // `Intl.supportedValuesOf` lists only the primary id, and which one that
    // is depends on the runtime's ICU vintage. Testing membership of that list
    // told a household on Europe/Kyiv that its own timezone did not exist, and
    // no reconciliation button ever appeared. Both names are real zones and
    // both are what a config can legitimately hold.
    for (const pair of [
      ['Europe/Kyiv', 'Europe/Kiev'],
      ['Asia/Kolkata', 'Asia/Calcutta'],
      ['America/Nuuk', 'America/Godthab'],
      ['Europe/Istanbul', 'Asia/Istanbul'],
    ]) {
      for (const zone of pair) expect(isKnownTimezone(zone), zone).toBe(true);
      expect(sameTimezone(pair[0], pair[1]), pair.join(' vs ')).toBe(true);
    }
  });

  it('rejects an offset, which Intl accepts but timedatectl does not want', () => {
    // The shape guard exists for exactly this: `Intl.DateTimeFormat` takes
    // "+05:30" happily, and it is not a zone name.
    expect(isKnownTimezone('+05:30')).toBe(false);
    expect(isKnownTimezone('-08:00')).toBe(false);
    // ...while a real zone whose name contains a sign still passes.
    expect(isKnownTimezone('Etc/GMT+5')).toBe(true);
  });

  it('rejects anything that is not a zone id', () => {
    // This is the gate in front of `timedatectl set-timezone`, so the cases
    // that matter are the crafted ones, not just typos.
    expect(isKnownTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(isKnownTimezone('Europe/Berlin; rm -rf /')).toBe(false);
    expect(isKnownTimezone('Europe/Berlin --adjust-system-clock')).toBe(false);
    expect(isKnownTimezone('../../etc/shadow')).toBe(false);
    expect(isKnownTimezone('')).toBe(false);
  });
});

describe('canonicalTimezone / sameTimezone', () => {
  it('treats the two spellings of an aliased zone as one zone', () => {
    // Which of the pair a runtime calls primary is its own business; both
    // sides go through the same ICU here, so they have to agree either way.
    expect(sameTimezone('Asia/Calcutta', 'Asia/Kolkata')).toBe(true);
    expect(sameTimezone('Etc/UTC', 'UTC')).toBe(true);
  });

  it('keeps distinct zones distinct even when they share an offset today', () => {
    // Berlin and Paris are both UTC+1/+2 year round, but they are different
    // zones and the device reporting one while the screens show the other is
    // still worth saying out loud.
    expect(sameTimezone('Europe/Berlin', 'Europe/Paris')).toBe(false);
    expect(sameTimezone('UTC', 'Europe/Berlin')).toBe(false);
  });

  it('returns an unknown zone unchanged instead of throwing', () => {
    expect(canonicalTimezone('Mars/Olympus_Mons')).toBe('Mars/Olympus_Mons');
    expect(sameTimezone('Mars/Olympus_Mons', 'Mars/Olympus_Mons')).toBe(true);
  });
});
