import { describe, it, expect } from 'vitest';
import { formatDuration, type UnitValue } from '@/lib/duration-format';

/**
 * `renderWords` memoizes `Intl.DurationFormat` instances because both callers
 * tick at 1Hz forever on a kiosk that never reloads. The cache key must encode
 * WHICH units are displayed, not just how many.
 *
 * The regression: the key concatenated the four `*Display` slots with no
 * delimiter, and each slot is either `'always'` or `''`. So every unit set of
 * the same size collided — `['hours','minutes']`, `['minutes','seconds']` and
 * `['days','hours']` all keyed to `en-US|alwaysalways`. The first formatter
 * constructed then served all of them, marking units the caller never asked for
 * as `always` and leaving the caller's real units on the default `auto`, which
 * zero-suppresses. A Clock crossing the 1h boundary rendered 45s as
 * "0 hours, 0 minutes, 45 seconds".
 *
 * These are order-dependent by design: the bug only shows when a colliding set
 * is formatted FIRST, so each pair is asserted in both orders.
 */

const hasDurationFormat = typeof Intl.DurationFormat === 'function';

const units = (spec: Record<string, number>): UnitValue[] =>
  Object.entries(spec).map(([unit, value]) => ({ unit, value })) as UnitValue[];

const HOURS_MINUTES = units({ hours: 1, minutes: 30 });
const MINUTES_SECONDS = units({ minutes: 0, seconds: 45 });
const DAYS_HOURS = units({ days: 2, hours: 3 });
const HMS = units({ hours: 1, minutes: 0, seconds: 0 });
const DHM = units({ days: 1, hours: 0, minutes: 0 });

describe.skipIf(!hasDurationFormat)('formatDuration words-format cache keying', () => {
  it('keeps two-unit sets distinct regardless of which renders first', () => {
    // Both are two units, so both hit the same key under the old scheme.
    expect(formatDuration(HOURS_MINUTES, 'words', 'en-US')).toBe('1 hour, 30 minutes');
    expect(formatDuration(MINUTES_SECONDS, 'words', 'en-US')).toBe('0 minutes, 45 seconds');
  });

  it('keeps two-unit sets distinct in the reverse order too', () => {
    expect(formatDuration(MINUTES_SECONDS, 'words', 'en-US')).toBe('0 minutes, 45 seconds');
    expect(formatDuration(HOURS_MINUTES, 'words', 'en-US')).toBe('1 hour, 30 minutes');
  });

  it('does not let a third same-size set inherit either of them', () => {
    expect(formatDuration(HOURS_MINUTES, 'words', 'en-US')).toBe('1 hour, 30 minutes');
    expect(formatDuration(DAYS_HOURS, 'words', 'en-US')).toBe('2 days, 3 hours');
    expect(formatDuration(MINUTES_SECONDS, 'words', 'en-US')).toBe('0 minutes, 45 seconds');
  });

  it('keeps three-unit sets distinct, in a locale with its own connectors', () => {
    // de-DE uses "und" before the final unit, so a wrong unit set is visible in
    // the connector placement as well as the unit count.
    expect(formatDuration(HMS, 'words', 'de-DE')).toBe('1 Stunde, 0 Minuten und 0 Sekunden');
    expect(formatDuration(DHM, 'words', 'de-DE')).toBe('1 Tag, 0 Stunden und 0 Minuten');
  });

  it('does not leak a unit set across locales', () => {
    // Locale is part of the key, so the same unit set must not be served from
    // another locale's formatter. Asserted on the unit WORDS rather than the
    // connector punctuation, which varies by ICU version.
    expect(formatDuration(HOURS_MINUTES, 'words', 'en-US')).toBe('1 hour, 30 minutes');
    const de = formatDuration(HOURS_MINUTES, 'words', 'de-DE');
    expect(de).toContain('Stunde');
    expect(de).toContain('Minuten');
    expect(de).not.toContain('hour');
  });

  it('renders every zero unit it was asked for, never suppressing one', () => {
    // The property the cache bug broke: `Display: 'always'` must be set for
    // exactly the requested units, so a zero-valued unit still appears.
    expect(formatDuration(units({ hours: 0, minutes: 0 }), 'words', 'en-US')).toBe('0 hours, 0 minutes');
    expect(formatDuration(units({ minutes: 0, seconds: 0 }), 'words', 'en-US')).toBe('0 minutes, 0 seconds');
  });

  it('title-cases unit words without disturbing the cached formatter', () => {
    expect(formatDuration(MINUTES_SECONDS, 'wordsTitle', 'en-US')).toBe('0 Minutes, 45 Seconds');
    expect(formatDuration(MINUTES_SECONDS, 'words', 'en-US')).toBe('0 minutes, 45 seconds');
  });
});

describe('formatDuration non-words formats are unaffected by the cache', () => {
  it('renders colon, units, and short styles from pure string ops', () => {
    expect(formatDuration(HOURS_MINUTES, 'colon', 'en-US')).toBe('1:30');
    expect(formatDuration(MINUTES_SECONDS, 'colon', 'en-US')).toBe('0:45');
    expect(formatDuration(HOURS_MINUTES, 'units', 'en-US')).toBe('1h 30m');
    expect(formatDuration(MINUTES_SECONDS, 'units', 'en-US')).toBe('0m 45s');
  });
});
