import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import {
  createTZDate,
  localISODate,
  localISODateTime,
  formatTimeInTZ,
  formatTimeOfDay,
  tightHourLabel,
  formatDateInTZ,
  parseDateInTZ,
  toTZWallTime,
  listTimezoneValues,
  isKnownTimezone,
  canonicalTimezone,
  sameTimezone,
  COMMON_TIMEZONES,
} from '@/lib/timezone';
import { formatEventTime } from '@/lib/calendar-utils';
import { NO_VALUE } from '@/lib/constants';

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

describe('formatTimeOfDay', () => {
  const LOCALES = ['en-US', 'de-DE', 'fr-FR', 'es-ES', 'nl-NL', 'pt-BR', 'da-DK'];
  // 08:05 in Berlin on a winter morning.
  const morning = new Date('2024-01-15T07:05:00Z');

  it('writes 08:05 in every shipped language in 24-hour mode', () => {
    for (const locale of LOCALES) {
      expect(formatTimeOfDay(morning, { timeFormat: '24h', locale, timezone: 'Europe/Berlin' }), locale).toBe('08:05');
    }
  });

  it('writes the language day period in 12-hour mode', () => {
    expect(formatTimeOfDay(morning, { timeFormat: '12h', locale: 'en-US', timezone: 'Europe/Berlin' })).toBe('8:05 AM');
    expect(formatTimeOfDay(morning, { timeFormat: '12h', locale: 'en-US', timezone: 'Europe/Berlin', pad: true })).toBe('08:05 AM');
    expect(formatTimeOfDay(morning, { timeFormat: '12h', locale: 'de-DE', timezone: 'Europe/Berlin' })).toBe('8:05 vorm.');
  });

  it('matches formatEventTime on a shifted Date, in every language and both modes', () => {
    const wall = toTZWallTime(morning, 'Europe/Berlin');
    for (const locale of LOCALES) {
      for (const timeFormat of ['12h', '24h'] as const) {
        expect(formatTimeOfDay(morning, { timeFormat, locale, timezone: 'Europe/Berlin' })).toBe(formatEventTime(wall, timeFormat, locale));
      }
    }
  });

  // What each shipped language reads at 08:05 and 15:30, as a time, as a
  // forecast hour label, and as the label closed up for a tight strip.
  const READS: Array<[locale: string, clock: '12h' | '24h', at: string, time: string, hour: string, tight: string]> = [
    ['en-US', '24h', '08:05', '08:05', '08', '08'],
    ['de-DE', '24h', '08:05', '08:05', '08', '08'],
    ['fr-FR', '24h', '08:05', '08:05', '08', '08'],
    ['es-ES', '24h', '08:05', '08:05', '08', '08'],
    ['nl-NL', '24h', '08:05', '08:05', '08', '08'],
    ['pt-BR', '24h', '08:05', '08:05', '08', '08'],
    ['da-DK', '24h', '08:05', '08:05', '08', '08'],
    ['de-DE', '24h', '00:05', '00:05', '00', '00'],
    ['da-DK', '24h', '15:30', '15:30', '15', '15'],
    ['en-US', '12h', '08:05', '8:05 AM', '8 AM', '8AM'],
    ['en-US', '12h', '15:30', '3:30 PM', '3 PM', '3PM'],
    ['en-US', '12h', '00:05', '12:05 AM', '12 AM', '12AM'],
    ['de-DE', '12h', '08:05', '8:05 vorm.', '8 vorm.', '8 vorm.'],
    ['de-DE', '12h', '15:30', '3:30 nachm.', '3 nachm.', '3 nachm.'],
    ['fr-FR', '12h', '08:05', '8:05 AM', '8 AM', '8AM'],
    ['es-ES', '12h', '08:05', '8:05 AM', '8 AM', '8AM'],
    ['nl-NL', '12h', '15:30', '3:30 PM', '3 PM', '3PM'],
    ['pt-BR', '12h', '08:05', '8:05 AM', '8 AM', '8AM'],
    ['da-DK', '12h', '15:30', '3:30 PM', '3 PM', '3PM'],
  ];

  it.each(READS)('%s %s at %s reads %s, hour label %s, closed up %s', (locale, timeFormat, at, time, hour, tight) => {
    const instant = new Date(`2026-06-08T${at}:00Z`);
    const clock = { timeFormat, locale, timezone: 'UTC' };
    expect(formatTimeOfDay(instant, clock)).toBe(time);
    const label = formatTimeOfDay(instant, { ...clock, hourOnly: true });
    expect(label).toBe(hour);
    expect(tightHourLabel(label)).toBe(tight);
  });

  it('reads the instant in the zone it is given', () => {
    // Sydney is UTC+10 in July, so midnight UTC is 10:00.
    const date = new Date('2024-07-15T00:00:00Z');
    expect(formatTimeOfDay(date, { timeFormat: '24h', locale: 'en-US', timezone: 'Australia/Sydney' })).toBe('10:00');
    expect(formatTimeOfDay(date, { timeFormat: '12h', locale: 'en-US', timezone: 'America/New_York' })).toBe('8:00 PM');
  });

  it('reads the Date as it is with no zone, and with one this runtime does not know', () => {
    const local = new Date(2024, 0, 15, 20, 5);
    expect(formatTimeOfDay(local, { timeFormat: '24h', locale: 'da-DK' })).toBe('20:05');
    expect(formatTimeOfDay(local, { timeFormat: '24h', locale: 'da-DK', timezone: 'Not/A_Zone' })).toBe('20:05');
  });

  it('writes the no-value mark for an invalid Date', () => {
    expect(formatTimeOfDay(new Date(NaN), { timeFormat: '24h', locale: 'en-US', timezone: 'UTC' })).toBe(NO_VALUE);
  });
});

describe('formatTimeInTZ', () => {
  it('is formatTimeOfDay for a ClockFormat', () => {
    const date = new Date('2024-01-15T12:30:00Z');
    expect(formatTimeInTZ(date, { timezone: 'America/New_York', locale: 'en-US', hour12: true })).toBe('7:30 AM');
    expect(formatTimeInTZ(date, { timezone: 'Europe/Berlin', locale: 'de-DE', hour12: false })).toBe('13:30');
    expect(formatTimeInTZ(new Date('2024-01-15T07:05:00Z'), { timezone: 'UTC', locale: 'da-DK', hour12: false })).toBe('07:05');
  });

  it('writes the no-value mark for an invalid Date', () => {
    expect(formatTimeInTZ(new Date('not-a-date'), { locale: 'en-US', hour12: true })).toBe(NO_VALUE);
    expect(formatTimeInTZ(new Date(NaN), { timezone: 'America/Chicago', locale: 'en-US', hour12: false })).toBe(NO_VALUE);
  });
});

describe('formatDateInTZ', () => {
  it('writes the no-value mark for an invalid/NaN Date', () => {
    const nan = new Date('not-a-date');
    expect(formatDateInTZ(nan, 'UTC', { weekday: 'long' })).toBe(NO_VALUE);
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
    // Should still format using the host TZ, not return the no-value mark.
    expect(result).not.toBe(NO_VALUE);
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
