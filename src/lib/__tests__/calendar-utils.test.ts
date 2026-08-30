import { describe, it, expect } from 'vitest';
import type { TranslateFn } from '@/i18n';
import {
  parseEventDate,
  compareEventStarts,
  isEventOnDay,
  isEventUpcoming,
  applyTitleFilter,
  clampWeeksToShow,
  clampGridMaxEventsPerCell,
  defaultGridMaxEventsPerCell,
  isThemedGridView,
  isWeekendDay,
  weekNumberOptions,
  eventsForDay,
  formatEventTime,
  isAllDayEvent,
  classifyEventOnDay,
  resolveScheduleStart,
  formatCountdown,
  eventProgress,
  isPastInDailyColumn,
  eventKindGlyph,
  birthdayAge,
  eventKindLabel,
  eventStatusSlot,
  boundaryBetween,
  formatEventTimeCompact,
  allDaySpanSegment,
  formatMonthRangeLabel,
} from '@/lib/calendar-utils';
import { legendSources, eventsInWindow } from '@/lib/calendar-legend';
import { sanitizeEventDescription } from '@/lib/event-description';
import { pickGridTimeColor, pickPillTextColor, pickTintedTextColor, DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';
import { resolveWeatherPlacement, effectiveWeatherPlacement } from '@/components/modules/fullscreen-calendar/view-traits';

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

    it('shows a midnight-crossing event on both its start and end days', () => {
      const overnight = {
        start: '2026-03-22T23:00:00',
        end: '2026-03-23T01:00:00',
        allDay: false,
      };
      expect(isEventOnDay(overnight, localDay(2026, 3, 21))).toBe(false);
      expect(isEventOnDay(overnight, localDay(2026, 3, 22))).toBe(true);
      expect(isEventOnDay(overnight, localDay(2026, 3, 23))).toBe(true);
      expect(isEventOnDay(overnight, localDay(2026, 3, 24))).toBe(false);
    });

    it('shows a multi-day timed event on every covered day', () => {
      const long = {
        start: '2026-03-22T19:00:00',
        end: '2026-03-25T06:00:00',
        allDay: false,
      };
      expect(isEventOnDay(long, localDay(2026, 3, 22))).toBe(true);
      expect(isEventOnDay(long, localDay(2026, 3, 23))).toBe(true);
      expect(isEventOnDay(long, localDay(2026, 3, 24))).toBe(true);
      expect(isEventOnDay(long, localDay(2026, 3, 25))).toBe(true);
      expect(isEventOnDay(long, localDay(2026, 3, 26))).toBe(false);
    });

    it('does not carry an event ending exactly at midnight into the next day', () => {
      const untilMidnight = {
        start: '2026-03-22T20:00:00',
        end: '2026-03-23T00:00:00',
        allDay: false,
      };
      expect(isEventOnDay(untilMidnight, localDay(2026, 3, 22))).toBe(true);
      expect(isEventOnDay(untilMidnight, localDay(2026, 3, 23))).toBe(false);
    });

    it('keeps an end-before-start event on its start day only', () => {
      const glitched = {
        start: '2026-03-22T14:00:00',
        end: '2026-03-22T13:00:00',
        allDay: false,
      };
      expect(isEventOnDay(glitched, localDay(2026, 3, 22))).toBe(true);
      expect(isEventOnDay(glitched, localDay(2026, 3, 23))).toBe(false);
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

  it('reads a zoned end on the display wall clock, matching a shifted now', () => {
    // Auckland wall clock 14:00 on June 15 is 02:00Z. An event ending 01:00Z
    // (Auckland 13:00) is over; one ending 03:00Z (Auckland 15:00) is not.
    // Without the timezone, a UTC-or-west OS reads both as June 15 mornings
    // ahead of `now` — i.e. both would wrongly count as upcoming... or
    // neither, depending on the OS offset.
    expect(isEventUpcoming({ end: '2026-06-15T01:00:00Z' }, now, 'Pacific/Auckland')).toBe(false);
    expect(isEventUpcoming({ end: '2026-06-15T03:00:00Z' }, now, 'Pacific/Auckland')).toBe(true);
  });
});

describe('legendSources', () => {
  const evs = [
    { sourceId: 'family', sourceName: 'Family', calendarColor: '#3B82F6' },
    { sourceId: 'ava', sourceName: 'Ava', calendarColor: '#EC4899' },
    { sourceId: 'family', sourceName: 'Family', calendarColor: '#3B82F6' },
    { sourceId: 'school', sourceName: 'School' },
    { sourceName: 'Orphan color, no id' },
  ];

  it('dedupes by sourceId in first-seen order and defaults the color', () => {
    expect(legendSources(evs)).toEqual([
      { sourceId: 'family', sourceName: 'Family', calendarColor: '#3B82F6' },
      { sourceId: 'ava', sourceName: 'Ava', calendarColor: '#EC4899' },
      { sourceId: 'school', sourceName: 'School', calendarColor: DEFAULT_EVENT_COLOR },
    ]);
  });

  it('uses the majority event color, so a lone colorId override cannot repaint the dot', () => {
    const overridden = [
      { sourceId: 'family', sourceName: 'Family', calendarColor: '#D50000' }, // per-event override, first seen
      { sourceId: 'family', sourceName: 'Family', calendarColor: '#3B82F6' },
      { sourceId: 'family', sourceName: 'Family', calendarColor: '#3B82F6' },
    ];
    expect(legendSources(overridden)).toEqual([
      { sourceId: 'family', sourceName: 'Family', calendarColor: '#3B82F6' },
    ]);
  });

  it('omits a configured source with no rendered events (input is the rendered set)', () => {
    expect(legendSources([])).toEqual([]);
  });
});

describe('eventsInWindow', () => {
  const win = { start: new Date(2026, 7, 20), end: new Date(2026, 7, 23) };

  it('keeps overlapping events and drops ones outside the window', () => {
    const inside = { start: '2026-08-21T10:00:00', end: '2026-08-21T11:00:00' };
    const spanning = { start: '2026-08-19T22:00:00', end: '2026-08-20T02:00:00' };
    const after = { start: '2026-08-25T10:00:00', end: '2026-08-25T11:00:00' };
    const before = { start: '2026-08-19T08:00:00', end: '2026-08-19T09:00:00' };
    expect(eventsInWindow([inside, spanning, after, before], win.start, win.end)).toEqual([inside, spanning]);
  });

  it('reads zoned events on the display wall clock', () => {
    // 14:00Z Aug 19 is 02:00 Aug 20 in Auckland — inside an Aug 20 window
    // there, outside it for a UTC-or-west OS clock.
    const ev = { start: '2026-08-19T14:00:00Z', end: '2026-08-19T15:00:00Z' };
    expect(eventsInWindow([ev], win.start, win.end, 'Pacific/Auckland')).toEqual([ev]);
    expect(eventsInWindow([ev], win.start, win.end)).toEqual([]);
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
  it('accepts rgb()/rgba() notation, which the color pickers also accept', () => {
    expect(pickPillTextColor('rgb(234, 179, 8)')).toBe('#1b1b1f');   // same yellow as #eab308
    expect(pickPillTextColor('rgba(59, 130, 246, 0.9)')).toBe('#fff'); // same blue as #3b82f6
  });
  it('falls back to white for unparseable or missing values', () => {
    expect(pickPillTextColor('red')).toBe('#fff');
    expect(pickPillTextColor(undefined)).toBe('#fff');
  });
});

describe('pickTintedTextColor', () => {
  it('keeps the preferred color when it clears 3:1 on the estimated tint surface', () => {
    // Default-ish config: white text, blue accent tinted over a dark module.
    expect(pickTintedTextColor('#ffffff', '#3b82f6', 'rgba(0, 0, 0, 0.4)')).toBe('#ffffff');
    // Accent-colored month text stays accented on a light module: navy on
    // a periwinkle tint still reads.
    expect(pickTintedTextColor('#1e3a8a', '#1e3a8a', '#f9fafb')).toBe('#1e3a8a');
  });

  it('falls back to the YIQ pick when the pairing fails contrast', () => {
    // Gray text + dark accent tint over a light module drops under 3:1;
    // the light estimated surface flips the text dark.
    expect(pickTintedTextColor('#6b7280', '#1e3a8a', '#f9fafb')).toBe('#1b1b1f');
    // Dark gray text + light accent over a dark module: dark surface, white text.
    expect(pickTintedTextColor('#374151', '#facc15', 'rgba(17, 24, 39, 1)')).toBe('#fff');
  });

  it('keeps the preferred color when any input is unparseable', () => {
    expect(pickTintedTextColor('white', '#1e3a8a', '#f9fafb')).toBe('white');
    expect(pickTintedTextColor('#6b7280', 'blue', '#f9fafb')).toBe('#6b7280');
    expect(pickTintedTextColor('#6b7280', '#1e3a8a', undefined)).toBe('#6b7280');
    expect(pickTintedTextColor('#6b7280', '#1e3a8a', 'color-mix(in srgb, red 10%, transparent)')).toBe('#6b7280');
  });
});

describe('classifyEventOnDay', () => {
  // Tue Aug 25 10:00 AM -> Fri Aug 28 3:00 PM
  const multiDay = { start: '2026-08-25T10:00:00', end: '2026-08-28T15:00:00' };

  it('classifies each covered day of a timed multi-day event', () => {
    expect(classifyEventOnDay(multiDay, new Date(2026, 7, 25))).toBe('first');
    expect(classifyEventOnDay(multiDay, new Date(2026, 7, 26))).toBe('middle');
    expect(classifyEventOnDay(multiDay, new Date(2026, 7, 27))).toBe('middle');
    expect(classifyEventOnDay(multiDay, new Date(2026, 7, 28))).toBe('last');
  });

  it('classifies single-day timed events as single', () => {
    const ev = { start: '2026-08-25T10:00:00', end: '2026-08-25T15:00:00' };
    expect(classifyEventOnDay(ev, new Date(2026, 7, 25))).toBe('single');
  });

  it('treats an exact-midnight end as not reaching the next day', () => {
    // Mirrors isEventOnDay's exclusive end: 7 PM - midnight is one day.
    const ev = { start: '2026-08-25T19:00:00', end: '2026-08-26T00:00:00' };
    expect(classifyEventOnDay(ev, new Date(2026, 7, 25))).toBe('single');
  });

  it('classifies an overnight event as first then last', () => {
    const ev = { start: '2026-08-25T19:00:00', end: '2026-08-26T06:00:00' };
    expect(classifyEventOnDay(ev, new Date(2026, 7, 25))).toBe('first');
    expect(classifyEventOnDay(ev, new Date(2026, 7, 26))).toBe('last');
  });

  it('classifies all-day events as single (they keep all-day rendering)', () => {
    const ev = { start: '2026-08-25', end: '2026-08-28', allDay: true };
    expect(classifyEventOnDay(ev, new Date(2026, 7, 26))).toBe('single');
  });
});

describe('resolveScheduleStart', () => {
  // Wed Aug 19 2026
  const wed = new Date(2026, 7, 19);

  it('defaults to today', () => {
    expect(resolveScheduleStart(wed, undefined, 0).getDate()).toBe(19);
    expect(resolveScheduleStart(wed, 'today', 0).getDate()).toBe(19);
  });

  it('anchors to the configured week start', () => {
    expect(resolveScheduleStart(wed, 'start-of-week', 0).getDate()).toBe(16); // Sunday
    expect(resolveScheduleStart(wed, 'start-of-week', 1).getDate()).toBe(17); // Monday
    // Already on the week start day
    expect(resolveScheduleStart(new Date(2026, 7, 16), 'start-of-week', 0).getDate()).toBe(16);
  });

  it('anchors next-weekend to the coming Saturday', () => {
    expect(resolveScheduleStart(wed, 'next-weekend', 0).getDate()).toBe(22);
    // Saturday anchors to itself
    expect(resolveScheduleStart(new Date(2026, 7, 22), 'next-weekend', 0).getDate()).toBe(22);
  });

  it('keeps the running weekend on screen through Sunday', () => {
    // Sun Aug 23 -> Sat Aug 22, not six days ahead
    expect(resolveScheduleStart(new Date(2026, 7, 23), 'next-weekend', 0).getDate()).toBe(22);
  });
});

describe('formatCountdown', () => {
  const now = new Date(2026, 7, 19, 15, 55); // Wed 3:55 PM

  it('uses minutes inside an hour', () => {
    expect(formatCountdown(new Date(2026, 7, 19, 16, 25), now, 'en-US')).toBe('in 30 minutes');
  });

  it('uses hours inside a day', () => {
    expect(formatCountdown(new Date(2026, 7, 19, 17, 55), now, 'en-US')).toBe('in 2 hours');
  });

  it('uses whole calendar days beyond 24 hours', () => {
    expect(formatCountdown(new Date(2026, 7, 23, 9, 0), now, 'en-US')).toBe('in 4 days');
  });

  it('returns empty for started events', () => {
    expect(formatCountdown(new Date(2026, 7, 19, 15, 0), now, 'en-US')).toBe('');
  });

  it('counts whole days for all-day rows and suppresses day-zero noise', () => {
    // "in 0 days" on an all-day event happening today was Card Pro's
    // most-reported annoyance; wholeDays returns '' for the current day.
    expect(formatCountdown(new Date(2026, 7, 19, 23, 0), now, 'en-US', true)).toBe('');
    expect(formatCountdown(new Date(2026, 7, 21, 0, 0), now, 'en-US', true)).toBe('in 2 days');
  });

  it('localizes via Intl.RelativeTimeFormat', () => {
    expect(formatCountdown(new Date(2026, 7, 19, 17, 55), now, 'de-DE')).toBe('in 2 Stunden');
  });
});

describe('eventProgress', () => {
  const start = new Date(2026, 7, 19, 15, 30);
  const end = new Date(2026, 7, 19, 16, 15);

  it('returns the elapsed fraction while running', () => {
    const p = eventProgress(start, end, new Date(2026, 7, 19, 15, 55));
    expect(p).toBeCloseTo(25 / 45, 5);
  });

  it('returns null before start, after end, and for degenerate ranges', () => {
    expect(eventProgress(start, end, new Date(2026, 7, 19, 15, 0))).toBeNull();
    expect(eventProgress(start, end, new Date(2026, 7, 19, 16, 15))).toBeNull();
    expect(eventProgress(end, start, new Date(2026, 7, 19, 15, 55))).toBeNull();
  });
});

describe('isPastInDailyColumn', () => {
  const now = new Date(2026, 7, 19, 15, 55);

  it('is true once an ended today event is behind now', () => {
    expect(isPastInDailyColumn(new Date(2026, 7, 19, 15, 0), now, true, false, 'single')).toBe(true);
  });

  it('is true at the exact boundary (end === now), matching eventProgress exclusivity', () => {
    expect(isPastInDailyColumn(now, now, true, false, 'single')).toBe(true);
  });

  it('is false while the event is still running', () => {
    expect(isPastInDailyColumn(new Date(2026, 7, 19, 16, 15), now, true, false, 'single')).toBe(false);
  });

  it('is false for a future event', () => {
    expect(isPastInDailyColumn(new Date(2026, 7, 19, 18, 0), now, true, false, 'single')).toBe(false);
  });

  it('is false for all-day events regardless of time', () => {
    expect(isPastInDailyColumn(new Date(2026, 7, 19, 0, 0), now, true, true, 'single')).toBe(false);
  });

  it('is false for the middle segment of a multi-day event', () => {
    expect(isPastInDailyColumn(new Date(2026, 7, 20, 0, 0), now, true, false, 'middle')).toBe(false);
  });

  it('is false outside today\'s column even if the instant is behind now', () => {
    expect(isPastInDailyColumn(new Date(2026, 7, 19, 15, 0), now, false, false, 'single')).toBe(false);
  });
});

describe('eventKindGlyph', () => {
  it('returns the cake glyph for a birthday', () => {
    expect(eventKindGlyph('birthday')).toBe('🎂');
  });

  it('returns the celebration glyph for a holiday', () => {
    expect(eventKindGlyph('holiday')).toBe('🎉');
  });

  it('returns null for a plain event or an undefined kind', () => {
    expect(eventKindGlyph('event')).toBeNull();
    expect(eventKindGlyph(undefined)).toBeNull();
  });
});

describe('birthdayAge', () => {
  it('computes the age from a known birth year', () => {
    expect(birthdayAge(2017, 2026)).toBe(9);
  });

  it('returns 0 for a birthday occurrence in the birth year itself', () => {
    expect(birthdayAge(2026, 2026)).toBe(0);
  });

  it('returns null when there is no birth year on file', () => {
    expect(birthdayAge(undefined, 2026)).toBeNull();
  });
});

describe('eventKindLabel', () => {
  // Echo translator: key plus interpolations, so assertions see both without
  // depending on any real translation dictionary.
  const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${Object.values(params).join(',')})` : key) as TranslateFn;

  it('returns the namespaced holiday key for a holiday', () => {
    expect(eventKindLabel({ kind: 'holiday' }, 2026, t, 'calendar')).toBe('calendar.holiday');
  });

  it('returns the namespaced age key for a birthday with a known year', () => {
    expect(eventKindLabel({ kind: 'birthday', birthYear: 2017 }, 2026, t, 'fullscreen-calendar'))
      .toBe('fullscreen-calendar.birthdayWithAge(9)');
  });

  it('returns the namespaced plain-birthday key when there is no birth year', () => {
    expect(eventKindLabel({ kind: 'birthday' }, 2026, t, 'event-detail')).toBe('event-detail.birthday');
  });

  it('returns null for a plain event or an undefined kind', () => {
    expect(eventKindLabel({ kind: 'event' }, 2026, t, 'calendar')).toBeNull();
    expect(eventKindLabel({}, 2026, t, 'calendar')).toBeNull();
  });
});

describe('eventStatusSlot', () => {
  const now = new Date(2026, 7, 19, 15, 55);
  const base = {
    now, locale: 'en-US',
    showCountdown: true, showProgressBar: true, countdownAllDay: false,
  };

  it('shows progress, not a countdown, while the event runs', () => {
    const slot = eventStatusSlot({
      ...base, isAllDayRow: false, rowDate: new Date(2026, 7, 19),
      start: new Date(2026, 7, 19, 15, 30), end: new Date(2026, 7, 19, 16, 15),
    });
    expect(slot.progress).toBeCloseTo(25 / 45, 5);
    expect(slot.countdown).toBeNull();
  });

  it('shows a countdown, not progress, before the event starts', () => {
    const slot = eventStatusSlot({
      ...base, isAllDayRow: false, rowDate: new Date(2026, 7, 19),
      start: new Date(2026, 7, 19, 17, 55), end: new Date(2026, 7, 19, 19, 0),
    });
    expect(slot.countdown).toBe('in 2 hours');
    expect(slot.progress).toBeNull();
  });

  it('suppresses all-day countdowns unless countdownAllDay opts in', () => {
    const allDay = {
      ...base, isAllDayRow: true, rowDate: new Date(2026, 7, 22),
      start: new Date(2026, 7, 22), end: new Date(2026, 7, 23),
    };
    expect(eventStatusSlot(allDay)).toEqual({ countdown: null, progress: null });
    expect(eventStatusSlot({ ...allDay, countdownAllDay: true }).countdown).toBe('in 3 days');
  });

  it('respects the individual feature toggles', () => {
    const running = {
      ...base, isAllDayRow: false, rowDate: new Date(2026, 7, 19),
      start: new Date(2026, 7, 19, 15, 30), end: new Date(2026, 7, 19, 16, 15),
    };
    expect(eventStatusSlot({ ...running, showProgressBar: false })).toEqual({ countdown: null, progress: null });
    const upcoming = { ...running, start: new Date(2026, 7, 19, 17, 0), end: new Date(2026, 7, 19, 18, 0) };
    expect(eventStatusSlot({ ...upcoming, showCountdown: false })).toEqual({ countdown: null, progress: null });
  });

  it('counts whole days to the row date on last-day rows of split events', () => {
    // Fri row of a Wed->Fri event that starts in 2 days: the row's own date
    // (4 days out) drives the countdown, so consecutive split rows read
    // "in 2 days" ... "in 4 days" instead of repeating the start countdown.
    const slot = eventStatusSlot({
      ...base, isAllDayRow: false, segment: 'last', rowDate: new Date(2026, 7, 23),
      start: new Date(2026, 7, 21, 10, 0), end: new Date(2026, 7, 23, 15, 0),
    });
    expect(slot.countdown).toBe('in 4 days');
  });
});

describe('boundaryBetween', () => {
  const sun = 0 as const;

  it('returns null when separators are off or days share a week', () => {
    expect(boundaryBetween(new Date(2026, 7, 17), new Date(2026, 7, 25), 'none', sun)).toBeNull();
    expect(boundaryBetween(new Date(2026, 7, 17), new Date(2026, 7, 25), undefined, sun)).toBeNull();
    // Mon Aug 17 -> Wed Aug 19: same Sunday-start week
    expect(boundaryBetween(new Date(2026, 7, 17), new Date(2026, 7, 19), 'weeks-and-months', sun)).toBeNull();
  });

  it('detects week boundaries, honoring the week start day', () => {
    // Sat Aug 22 -> Sun Aug 23 is a Sunday-start boundary but not a Monday-start one
    expect(boundaryBetween(new Date(2026, 7, 22), new Date(2026, 7, 23), 'weeks', 0)).toBe('week');
    expect(boundaryBetween(new Date(2026, 7, 22), new Date(2026, 7, 23), 'weeks', 1)).toBeNull();
  });

  it('lets the month divider beat the week rule when both coincide', () => {
    // Sat Oct 31 -> Sun Nov 1 2026: simultaneously a Sunday week start and a month start
    expect(boundaryBetween(new Date(2026, 9, 31), new Date(2026, 10, 1), 'weeks-and-months', sun)).toBe('month');
  });

  it('reports a mid-week month change as month only in weeks-and-months mode', () => {
    // Mon Aug 31 -> Tue Sep 1 2026: month changes inside one week
    expect(boundaryBetween(new Date(2026, 7, 31), new Date(2026, 8, 1), 'weeks-and-months', sun)).toBe('month');
    expect(boundaryBetween(new Date(2026, 7, 31), new Date(2026, 8, 1), 'weeks', sun)).toBeNull();
  });

  it('treats a year rollover as a month boundary', () => {
    expect(boundaryBetween(new Date(2026, 11, 31), new Date(2027, 0, 1), 'weeks-and-months', sun)).toBe('month');
  });
});

describe('resolveWeatherPlacement', () => {
  it('prefers the explicit placement over the legacy boolean', () => {
    expect(resolveWeatherPlacement({ weatherPlacement: 'days', showWeather: false })).toBe('days');
    expect(resolveWeatherPlacement({ weatherPlacement: 'off', showWeather: true })).toBe('off');
  });

  it('maps the legacy boolean when no placement is saved', () => {
    expect(resolveWeatherPlacement({ showWeather: false })).toBe('off');
    expect(resolveWeatherPlacement({ showWeather: true })).toBe('header');
    expect(resolveWeatherPlacement({})).toBe('header');
  });
});

describe('classifyEventOnDay with a display timezone', () => {
  it('classifies against the display-timezone day, not the OS day', () => {
    // 02:00 UTC on Aug 25 is 21:00 Aug 24 in Chicago: with the timezone set,
    // the event belongs to the 24th and is an overnight 'first' there.
    const ev = { start: '2026-08-25T02:00:00Z', end: '2026-08-25T09:00:00Z' };
    const tz = 'America/Chicago';
    expect(classifyEventOnDay(ev, new Date(2026, 7, 24), tz)).toBe('first');
    expect(classifyEventOnDay(ev, new Date(2026, 7, 25), tz)).toBe('last');
  });
});

describe('effectiveWeatherPlacement', () => {
  it('passes off and header through on every view', () => {
    for (const view of ['schedule', 'week-list', 'month-grid', 'day-timeline', 'agenda'] as const) {
      expect(effectiveWeatherPlacement(view, { weatherPlacement: 'off' })).toBe('off');
      expect(effectiveWeatherPlacement(view, { weatherPlacement: 'header' })).toBe('header');
    }
  });

  it('keeps rich placements on the views that render them', () => {
    expect(effectiveWeatherPlacement('agenda', { weatherPlacement: 'days-and-events' })).toBe('days-and-events');
    expect(effectiveWeatherPlacement('week-list', { weatherPlacement: 'events' })).toBe('events');
    expect(effectiveWeatherPlacement('schedule', { weatherPlacement: 'days' })).toBe('days');
  });

  it('degrades a carried placement to the header pill, never to nothing', () => {
    // A placement chosen in the agenda view must keep SHOWING weather after
    // switching the module to a view without that surface.
    expect(effectiveWeatherPlacement('month-grid', { weatherPlacement: 'days' })).toBe('header');
    expect(effectiveWeatherPlacement('day-timeline', { weatherPlacement: 'days-and-events' })).toBe('header');
    expect(effectiveWeatherPlacement('schedule', { weatherPlacement: 'events' })).toBe('header');
  });

  it('narrows days-and-events to the part the view supports', () => {
    expect(effectiveWeatherPlacement('schedule', { weatherPlacement: 'days-and-events' })).toBe('days');
  });

  it('applies the legacy showWeather fallback before degrading', () => {
    expect(effectiveWeatherPlacement('month-grid', { showWeather: false })).toBe('off');
    expect(effectiveWeatherPlacement('month-grid', { showWeather: true })).toBe('header');
  });
});

describe('formatEventTimeCompact', () => {
  it('drops minutes on the hour and uses the narrow day period (12h)', () => {
    expect(formatEventTimeCompact(new Date(2026, 6, 15, 16, 0), '12h', 'en-US')).toBe('4p');
    expect(formatEventTimeCompact(new Date(2026, 6, 15, 8, 0), '12h', 'en-US')).toBe('8a');
  });

  it('keeps minutes off the hour with no leading zero (12h)', () => {
    expect(formatEventTimeCompact(new Date(2026, 6, 15, 17, 30), '12h', 'en-US')).toBe('5:30p');
    expect(formatEventTimeCompact(new Date(2026, 6, 15, 8, 5), '12h', 'en-US')).toBe('8:05a');
  });

  it('renders 24h times as HH:mm', () => {
    expect(formatEventTimeCompact(new Date(2026, 6, 15, 17, 30), '24h', 'en-US')).toBe('17:30');
    expect(formatEventTimeCompact(new Date(2026, 6, 15, 8, 0), '24h', 'en-US')).toBe('08:00');
  });
});

describe('allDaySpanSegment', () => {
  const day = (d: number) => new Date(2026, 8, d); // Sep 2026, local midnight
  // Fri Sep 4 – Sun Sep 6; all-day ends are exclusive so end = Sep 7
  const trip = { start: '2026-09-04', end: '2026-09-07', allDay: true };

  it('classifies first / middle / last days of a multi-day all-day span', () => {
    expect(allDaySpanSegment(trip, day(4))).toBe('first');
    expect(allDaySpanSegment(trip, day(5))).toBe('middle');
    expect(allDaySpanSegment(trip, day(6))).toBe('last');
  });

  it('classifies single-day all-day events as single', () => {
    expect(allDaySpanSegment({ start: '2026-09-07', end: '2026-09-08', allDay: true }, day(7))).toBe('single');
  });

  it('classifies timed events as single, midnight-crossers included', () => {
    expect(allDaySpanSegment({ start: '2026-09-04T19:00:00', end: '2026-09-05T06:00:00' }, day(4))).toBe('single');
  });
});

describe('formatMonthRangeLabel', () => {
  it('renders a single month', () => {
    expect(formatMonthRangeLabel(new Date(2026, 6, 1), new Date(2026, 6, 28), 'en-US')).toBe('July 2026');
  });

  it('renders a same-year range with one year', () => {
    expect(formatMonthRangeLabel(new Date(2026, 6, 12), new Date(2026, 7, 8), 'en-US')).toBe('July – August 2026');
  });

  it('renders a year-crossing range with both years', () => {
    expect(formatMonthRangeLabel(new Date(2026, 11, 20), new Date(2027, 0, 16), 'en-US')).toBe('December 2026 – January 2027');
  });
});

describe('pickGridTimeColor', () => {
  it('keeps a color that already clears 3:1 on the estimated pill surface', () => {
    expect(pickGridTimeColor('#eab308', 'rgba(0, 0, 0, 0.4)')).toBe('rgb(234, 179, 8)');
  });

  it('lightens a dark color toward white until it clears 3:1', () => {
    const out = pickGridTimeColor('#1d4ed8', 'rgba(0, 0, 0, 0.4)');
    expect(out).not.toBe('rgb(29, 78, 216)');
    const [, , b] = out.match(/\d+/g)!.map(Number);
    expect(b).toBeGreaterThan(216); // moved toward white
  });

  it('falls back to white for unparseable calendar colors', () => {
    expect(pickGridTimeColor('tomato', undefined)).toBe('#fff');
  });

  it('falls back to the YIQ pick when lightening cannot reach 3:1 (light background)', () => {
    // On a white module background the estimated pill surface is white;
    // mixing toward white can never clear 3:1, so the YIQ pick must win.
    expect(pickGridTimeColor('#eab308', '#ffffff')).toBe('#1b1b1f');
  });
});

describe('applyTitleFilter', () => {
  const events = [{ title: 'Lunch with Sam' }, { title: 'Soccer practice' }, { title: 'Focus time' }];

  it('passes everything through when the filter is undefined', () => {
    expect(applyTitleFilter(events, undefined)).toEqual(events);
  });

  it('passes everything through when terms is empty', () => {
    expect(applyTitleFilter(events, { mode: 'include', terms: [] })).toEqual(events);
  });

  it('passes everything through when terms are only whitespace', () => {
    expect(applyTitleFilter(events, { mode: 'include', terms: ['   ', ''] })).toEqual(events);
  });

  it('include mode keeps only events matching a term', () => {
    expect(applyTitleFilter(events, { mode: 'include', terms: ['soccer'] })).toEqual([
      { title: 'Soccer practice' },
    ]);
  });

  it('exclude mode drops events matching a term', () => {
    expect(applyTitleFilter(events, { mode: 'exclude', terms: ['lunch'] })).toEqual([
      { title: 'Soccer practice' },
      { title: 'Focus time' },
    ]);
  });

  it('matches case-insensitively', () => {
    expect(applyTitleFilter(events, { mode: 'include', terms: ['SOCCER'] })).toEqual([
      { title: 'Soccer practice' },
    ]);
  });

  it('trims whitespace around terms', () => {
    expect(applyTitleFilter(events, { mode: 'include', terms: ['  soccer  '] })).toEqual([
      { title: 'Soccer practice' },
    ]);
  });

  it('matches any of multiple terms', () => {
    expect(applyTitleFilter(events, { mode: 'include', terms: ['soccer', 'focus'] })).toEqual([
      { title: 'Soccer practice' },
      { title: 'Focus time' },
    ]);
  });
});

describe('clampGridMaxEventsPerCell', () => {
  it('defaults per grid: 5 on the week grid, 4 on month and multi-week', () => {
    expect(clampGridMaxEventsPerCell(undefined, 'week')).toBe(5);
    expect(clampGridMaxEventsPerCell(undefined, 'month')).toBe(4);
    expect(clampGridMaxEventsPerCell(undefined, 'multi-week')).toBe(4);
    expect(defaultGridMaxEventsPerCell('week')).toBe(5);
    expect(defaultGridMaxEventsPerCell('month')).toBe(4);
  });

  it('clamps to the 2-10 range', () => {
    expect(clampGridMaxEventsPerCell(1, 'month')).toBe(2);
    expect(clampGridMaxEventsPerCell(7, 'week')).toBe(7);
    expect(clampGridMaxEventsPerCell(99, 'multi-week')).toBe(10);
  });

  it('falls back to the view default for hand-edited non-numeric values', () => {
    // NaN would otherwise reach events.slice(0, NaN) and blank every cell.
    expect(clampGridMaxEventsPerCell(Number.NaN, 'month')).toBe(4);
    expect(clampGridMaxEventsPerCell('abc' as unknown as number, 'week')).toBe(5);
  });
});

describe('isThemedGridView', () => {
  it('covers exactly the two views that share the themed grid renderer', () => {
    expect(isThemedGridView('month')).toBe(true);
    expect(isThemedGridView('multi-week')).toBe(true);
    expect(isThemedGridView('week')).toBe(false);
    expect(isThemedGridView('daily')).toBe(false);
    expect(isThemedGridView(undefined)).toBe(false);
  });
});

describe('isWeekendDay', () => {
  it('is true for Saturday and Sunday', () => {
    expect(isWeekendDay(new Date('2026-08-22T12:00:00'))).toBe(true); // Sat
    expect(isWeekendDay(new Date('2026-08-23T12:00:00'))).toBe(true); // Sun
  });

  it('is false for weekdays', () => {
    for (const d of ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']) {
      expect(isWeekendDay(new Date(`${d}T12:00:00`))).toBe(false);
    }
  });
});
