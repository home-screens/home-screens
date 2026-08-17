import { describe, it, expect } from 'vitest';
import {
  parseEventDate,
  compareEventStarts,
  isEventOnDay,
  isEventUpcoming,
  sanitizeEventDescription,
  clampWeeksToShow,
  weekNumberOptions,
  eventsForDay,
  formatEventTime,
  isAllDayEvent,
  pickPillTextColor,
} from '@/lib/calendar-utils';

describe('clampWeeksToShow', () => {
  it('defaults to 6 when unset', () => {
    expect(clampWeeksToShow(undefined)).toBe(6);
  });

  it('clamps to the 4-12 range', () => {
    expect(clampWeeksToShow(1)).toBe(4);
    expect(clampWeeksToShow(8)).toBe(8);
    expect(clampWeeksToShow(99)).toBe(12);
  });

  it('falls back to 6 for hand-edited non-numeric values', () => {
    // config.json is hand-editable and PUT /api/config doesn't type-check
    // module config fields; NaN must not leak into Array.from lengths.
    expect(clampWeeksToShow('six' as unknown as number)).toBe(6);
    expect(clampWeeksToShow(NaN)).toBe(6);
    expect(clampWeeksToShow(null as unknown as number)).toBe(6);
  });
});

describe('weekNumberOptions', () => {
  it('uses the ISO convention for Monday-start grids', () => {
    expect(weekNumberOptions('monday')).toEqual({ weekStartsOn: 1, firstWeekContainsDate: 4 });
  });

  it('uses the US convention for Sunday-start grids', () => {
    expect(weekNumberOptions('sunday')).toEqual({ weekStartsOn: 0, firstWeekContainsDate: 1 });
    expect(weekNumberOptions(undefined)).toEqual({ weekStartsOn: 0, firstWeekContainsDate: 1 });
  });
});

describe('parseEventDate', () => {
  it('parses date-only strings as local midnight (not UTC)', () => {
    const d = parseEventDate('2026-03-22');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March = 2
    expect(d.getDate()).toBe(22);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('parses datetime strings with timezone offset as-is', () => {
    const d = parseEventDate('2026-03-22T10:30:00-05:00');
    // Should be a valid date — exact hour depends on local TZ, but it should not be NaN
    expect(isNaN(d.getTime())).toBe(false);
  });

  it('parses datetime strings with Z suffix as-is', () => {
    const d = parseEventDate('2026-03-22T15:30:00.000Z');
    expect(isNaN(d.getTime())).toBe(false);
  });

  it('parses naive datetime strings (no offset) as local time', () => {
    const d = parseEventDate('2026-03-22T10:30:00');
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(30);
  });

  it('does not shift date-only strings to the previous day', () => {
    // This is the actual bug that was fixed — "2026-03-22" must stay on the 22nd
    for (const dateStr of ['2026-01-01', '2026-06-15', '2026-12-31', '2026-03-22']) {
      const d = parseEventDate(dateStr);
      const expectedDay = parseInt(dateStr.split('-')[2], 10);
      expect(d.getDate()).toBe(expectedDay);
    }
  });
});

describe('compareEventStarts', () => {
  it('sorts date-only strings chronologically', () => {
    expect(compareEventStarts('2026-03-21', '2026-03-22')).toBeLessThan(0);
    expect(compareEventStarts('2026-03-22', '2026-03-21')).toBeGreaterThan(0);
    expect(compareEventStarts('2026-03-22', '2026-03-22')).toBe(0);
  });

  it('sorts timed events chronologically', () => {
    expect(compareEventStarts('2026-03-22T09:00:00', '2026-03-22T10:00:00')).toBeLessThan(0);
  });

  it('sorts all-day events before same-day timed events', () => {
    // All-day "2026-03-22" = local midnight, timed "2026-03-22T09:00:00" = 9am local
    expect(compareEventStarts('2026-03-22', '2026-03-22T09:00:00')).toBeLessThan(0);
  });
});

describe('isEventOnDay', () => {
  // Helper: local midnight for a given date
  function localDay(y: number, m: number, d: number): Date {
    return new Date(y, m - 1, d);
  }

  describe('single-day all-day events', () => {
    const event = { start: '2026-03-22', end: '2026-03-23', allDay: true };

    it('matches on the correct day', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 22))).toBe(true);
    });

    it('does not match the previous day', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 21))).toBe(false);
    });

    it('does not match the next day (exclusive end)', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 23))).toBe(false);
    });
  });

  describe('multi-day all-day events', () => {
    // 3-day event: March 15-17 (end is exclusive March 18)
    const event = { start: '2026-03-15', end: '2026-03-18', allDay: true };

    it('matches each day of the event', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 15))).toBe(true);
      expect(isEventOnDay(event, localDay(2026, 3, 16))).toBe(true);
      expect(isEventOnDay(event, localDay(2026, 3, 17))).toBe(true);
    });

    it('does not match the day before', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 14))).toBe(false);
    });

    it('does not match the exclusive end day', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 18))).toBe(false);
    });
  });

  describe('timed events', () => {
    const event = {
      start: '2026-03-22T14:00:00',
      end: '2026-03-22T15:30:00',
      allDay: false,
    };

    it('matches on the correct day', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 22))).toBe(true);
    });

    it('does not match a different day', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 21))).toBe(false);
      expect(isEventOnDay(event, localDay(2026, 3, 23))).toBe(false);
    });

    it('shows overnight event only on its start day, not the end day', () => {
      const overnight = {
        start: '2026-03-22T23:00:00',
        end: '2026-03-23T01:00:00',
        allDay: false,
      };
      expect(isEventOnDay(overnight, localDay(2026, 3, 22))).toBe(true);
      expect(isEventOnDay(overnight, localDay(2026, 3, 23))).toBe(false);
    });

    it('matches a timed event starting at exactly midnight', () => {
      const midnight = {
        start: '2026-03-22T00:00:00',
        end: '2026-03-22T01:00:00',
        allDay: false,
      };
      expect(isEventOnDay(midnight, localDay(2026, 3, 22))).toBe(true);
      expect(isEventOnDay(midnight, localDay(2026, 3, 21))).toBe(false);
    });
  });

  describe('date-only strings without allDay flag', () => {
    // Google birthday events: date-only string, allDay may be true or implicitly detected
    const event = { start: '2026-03-22', end: '2026-03-23' };

    it('treats date-only strings as all-day even without explicit flag', () => {
      expect(isEventOnDay(event, localDay(2026, 3, 22))).toBe(true);
      expect(isEventOnDay(event, localDay(2026, 3, 21))).toBe(false);
    });
  });
});

describe('sanitizeEventDescription', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(sanitizeEventDescription(undefined)).toBe('');
    expect(sanitizeEventDescription(null)).toBe('');
    expect(sanitizeEventDescription('')).toBe('');
    expect(sanitizeEventDescription('   \n  ')).toBe('');
  });

  it('strips simple <p> wrappers (the case from issue #6)', () => {
    expect(sanitizeEventDescription('<p>Math homework due.</p>')).toBe('Math homework due.');
  });

  it('converts <br> to newline', () => {
    expect(sanitizeEventDescription('Line one<br>Line two<br/>Line three')).toBe(
      'Line one\nLine two\nLine three',
    );
  });

  it('treats consecutive paragraphs as a blank-line separator', () => {
    expect(sanitizeEventDescription('<p>First.</p><p>Second.</p>')).toBe('First.\n\nSecond.');
  });

  it('decodes common HTML entities', () => {
    expect(sanitizeEventDescription('Tom &amp; Jerry &lt;3 &#39;quotes&#39; &#x263A;'))
      .toBe("Tom & Jerry <3 'quotes' ☺");
  });

  it('renders list items with bullet prefixes', () => {
    expect(sanitizeEventDescription('<ul><li>Pencils</li><li>Paper</li></ul>')).toBe(
      '• Pencils\n• Paper',
    );
  });

  it('collapses 3+ blank lines down to a single blank line', () => {
    expect(sanitizeEventDescription('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('normalizes CRLF line endings', () => {
    expect(sanitizeEventDescription('one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
  });

  it('preserves plain-text descriptions unchanged (aside from trimming)', () => {
    expect(sanitizeEventDescription('  Just plain text.  ')).toBe('Just plain text.');
  });

  it('leaves out-of-range numeric character references intact instead of throwing', () => {
    // Both values are finite but above 0x10FFFF, which would crash String.fromCodePoint.
    // A hostile or malformed ICS feed must never bring down the kiosk render.
    expect(sanitizeEventDescription('hi &#9999999999; bye')).toBe('hi &#9999999999; bye');
    expect(sanitizeEventDescription('hi &#x110000; bye')).toBe('hi &#x110000; bye');
    // Negative or unparseable values also fall through safely.
    expect(sanitizeEventDescription('hi &#xZZZ; bye')).toBe('hi &#xZZZ; bye');
  });
});

describe('isEventUpcoming', () => {
  // Local reference time: June 15, 2026, 14:00
  const now = new Date(2026, 5, 15, 14, 0, 0);

  it('excludes timed events that already ended', () => {
    expect(isEventUpcoming({ end: '2026-06-15T13:00:00' }, now)).toBe(false);
  });

  it('includes ongoing timed events (end in the future)', () => {
    expect(isEventUpcoming({ end: '2026-06-15T15:00:00' }, now)).toBe(true);
  });

  it('includes future events', () => {
    expect(isEventUpcoming({ end: '2026-06-20T10:00:00' }, now)).toBe(true);
  });

  it('excludes events ending exactly now (matches Google exclusive timeMin)', () => {
    expect(isEventUpcoming({ end: '2026-06-15T14:00:00' }, now)).toBe(false);
  });

  it('includes an all-day event for today (exclusive date-only end = tomorrow)', () => {
    expect(isEventUpcoming({ end: '2026-06-16' }, now)).toBe(true);
  });

  it('excludes a single-day all-day event from yesterday', () => {
    expect(isEventUpcoming({ end: '2026-06-15' }, now)).toBe(false);
  });
});

describe('isAllDayEvent', () => {
  // Bound to consts (not inline literals) so the extra `end` field satisfies
  // excess-property checking against the helper's { start, allDay? } param.
  it('flags allDay events and date-only starts', () => {
    const flagged = { start: '2026-08-16', end: '2026-08-17', allDay: true };
    const dateOnly = { start: '2026-08-16', end: '2026-08-17', allDay: false };
    expect(isAllDayEvent(flagged)).toBe(true);
    expect(isAllDayEvent(dateOnly)).toBe(true);
  });
  it('passes timed events through', () => {
    const timed = { start: '2026-08-16T08:00:00', end: '2026-08-16T09:00:00', allDay: false };
    expect(isAllDayEvent(timed)).toBe(false);
  });
});

describe('eventsForDay', () => {
  const events = [
    { id: 'a', title: 'Late', start: '2026-08-16T14:00:00', end: '2026-08-16T15:00:00', allDay: false },
    { id: 'b', title: 'Offsite', start: '2026-08-16', end: '2026-08-18', allDay: true },
    { id: 'c', title: 'Early', start: '2026-08-16T08:00:00', end: '2026-08-16T09:00:00', allDay: false },
    { id: 'd', title: 'OtherDay', start: '2026-08-17T08:00:00', end: '2026-08-17T09:00:00', allDay: false },
  ];
  it('places all-day events first, then timed by start', () => {
    const ids = eventsForDay(events, new Date(2026, 7, 16)).map((e) => e.id);
    expect(ids).toEqual(['b', 'c', 'a']);
  });
  it('returns an empty array for empty days and does not mutate the input', () => {
    expect(eventsForDay(events, new Date(2026, 7, 20))).toEqual([]);
    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('formatEventTime', () => {
  const d = new Date(2026, 7, 16, 8, 5);
  it('renders unpadded 12h with day period by default (list surfaces)', () => {
    expect(formatEventTime(d, '12h', 'en-US')).toBe('8:05 AM');
  });
  it('zero-pads 12h when pad is set (constant-width grid pills)', () => {
    expect(formatEventTime(d, '12h', 'en-US', true)).toBe('08:05 AM');
  });
  it('renders constant-width 24h regardless of pad', () => {
    expect(formatEventTime(d, '24h', 'en-US')).toBe('08:05');
    expect(formatEventTime(new Date(2026, 7, 16, 20, 5), '24h', 'en-US')).toBe('20:05');
  });
  it('never leaves a trailing space after the time prefix', () => {
    expect(formatEventTime(d, '12h', 'de-DE', true)).toMatch(/^08:05/);
    expect(formatEventTime(d, '12h', 'de-DE', true).endsWith(' ')).toBe(false);
    expect(formatEventTime(d, '12h', 'de-DE').endsWith(' ')).toBe(false);
  });
});

describe('pickPillTextColor', () => {
  it('returns dark text for light colors and white for dark ones', () => {
    expect(pickPillTextColor('#eab308')).toBe('#1b1b1f'); // yellow, YIQ ≈ 176
    expect(pickPillTextColor('#84cc16')).toBe('#1b1b1f'); // lime, YIQ ≈ 162
    expect(pickPillTextColor('#10b981')).toBe('#fff');    // emerald, YIQ ≈ 128
    expect(pickPillTextColor('#3b82f6')).toBe('#fff');    // blue, YIQ ≈ 122
  });
  it('treats the threshold as inclusive', () => {
    expect(pickPillTextColor('#a0a0a0')).toBe('#1b1b1f'); // YIQ exactly 160
    expect(pickPillTextColor('#9f9f9f')).toBe('#fff');    // YIQ 159
  });
  it('accepts 3-digit and 8-digit hex', () => {
    expect(pickPillTextColor('#ff0')).toBe('#1b1b1f');
    expect(pickPillTextColor('#3b82f6cc')).toBe('#fff');
  });
  it('falls back to white for unparseable or missing values', () => {
    expect(pickPillTextColor('red')).toBe('#fff');
    expect(pickPillTextColor(undefined)).toBe('#fff');
  });
});
