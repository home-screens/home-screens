import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ICalSource } from '@/types/config';
import { silenceConsole } from '@/test-utils';

// Mock fetchWithTimeout
vi.mock('@/lib/api-utils', () => ({
  fetchWithTimeout: vi.fn(),
}));

// Stub the SSRF guards so tests don't depend on real DNS resolution.
// `isSafeExternalUrl` calls `dns.lookup` for every non-literal-IP host,
// which would either flake or fail outright in network-isolated CI
// sandboxes. The stub keeps the same shape (URL parse + protocol check
// + literal loopback / private / metadata block) so the fetcher's behavior
// matches what callers see in production for the cases tested here.
vi.mock('@/lib/url-safety', () => ({
  isSafeExternalUrl: vi.fn(async (url: string) => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const blocked = new Set(['localhost', '127.0.0.1', '169.254.169.254', '::1']);
      if (blocked.has(u.hostname)) return false;
      return !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname);
    } catch {
      return false;
    }
  }),
  isSafeLocalOrExternalUrl: vi.fn(async (url: string) => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      return u.hostname !== '169.254.169.254';
    } catch {
      return false;
    }
  }),
}));

import { fetchWithTimeout } from '@/lib/api-utils';
import { fetchICalEvents } from '@/lib/ical-calendar';

const mockFetch = vi.mocked(fetchWithTimeout);

function makeSource(overrides?: Partial<ICalSource>): ICalSource {
  return {
    id: 'src-1',
    type: 'ical',
    name: 'Test Calendar',
    url: 'https://example.com/calendar.ics',
    color: '#f97316',
    enabled: true,
    ...overrides,
  };
}

const SIMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:evt-1
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
SUMMARY:Morning Meeting
LOCATION:Room 101
DESCRIPTION:Weekly sync
END:VEVENT
BEGIN:VEVENT
UID:evt-2
DTSTART:20250316T140000Z
DTEND:20250316T150000Z
SUMMARY:Afternoon Review
END:VEVENT
END:VCALENDAR`;

const ALL_DAY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-allday
DTSTART;VALUE=DATE:20250315
DTEND;VALUE=DATE:20250316
SUMMARY:Conference Day
END:VEVENT
END:VCALENDAR`;

const NO_DTEND_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-nodtend
DTSTART;VALUE=DATE:20250315
SUMMARY:All Day (No DTEND)
END:VEVENT
END:VCALENDAR`;

const RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-recurring
DTSTART:20250310T090000Z
DTEND:20250310T100000Z
SUMMARY:Daily Standup
RRULE:FREQ=DAILY;COUNT=10
END:VEVENT
END:VCALENDAR`;

const RECURRING_WITH_EXDATE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-exdate
DTSTART:20250310T090000Z
DTEND:20250310T100000Z
SUMMARY:Recurring with EXDATE
RRULE:FREQ=DAILY;COUNT=5
EXDATE:20250312T090000Z
END:VEVENT
END:VCALENDAR`;

const PARAMETERIZED_SUMMARY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-param
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
SUMMARY;LANGUAGE=de:Besprechung
END:VEVENT
END:VCALENDAR`;

const EMPTY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

silenceConsole(['error', 'warn']);

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchResponse(body: string, ok = true, status = 200) {
  mockFetch.mockResolvedValueOnce(new Response(body, { status, headers: { 'Content-Type': 'text/calendar' } }));
  if (!ok) {
    mockFetch.mockResolvedValueOnce(new Response(body, { status, headers: {} }));
  }
}

describe('fetchICalEvents', () => {
  it('parses a simple ICS with 2 events', async () => {
    mockFetchResponse(SIMPLE_ICS);

    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toHaveLength(2);
    expect(events[0].title).toBe('Morning Meeting');
    expect(events[0].location).toBe('Room 101');
    expect(events[0].description).toBe('Weekly sync');
    expect(events[0].allDay).toBe(false);
    expect(events[0].calendarColor).toBe('#f97316');
    expect(events[0].id).toContain('src-1:evt-1:');
    expect(events[1].title).toBe('Afternoon Review');
  });

  it('detects all-day events with date-only format (no T)', async () => {
    mockFetchResponse(ALL_DAY_ICS);

    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    expect(events[0].start).toBe('2025-03-15');
    expect(events[0].start).not.toContain('T');
  });

  it('handles missing DTEND — all-day defaults to +1 day', async () => {
    mockFetchResponse(NO_DTEND_ICS);

    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    expect(events[0].start).toBe('2025-03-15');
    expect(events[0].end).toBe('2025-03-16');
  });

  it('expands recurring events within the time window', async () => {
    mockFetchResponse(RECURRING_ICS);

    // Only look at a 5-day window starting March 10
    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-10T00:00:00Z',
      '2025-03-15T00:00:00Z',
    );

    // Should get 5 instances (Mar 10-14)
    expect(events.length).toBe(5);
    expect(events.every(e => e.title === 'Daily Standup')).toBe(true);
  });

  it('excludes EXDATE instances from recurring events', async () => {
    mockFetchResponse(RECURRING_WITH_EXDATE_ICS);

    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-10T00:00:00Z',
      '2025-03-15T00:00:00Z',
    );

    // 5 occurrences minus 1 EXDATE = 4
    expect(events.length).toBe(4);
    // None should be on March 12
    const mar12Events = events.filter(e => e.start.includes('2025-03-12'));
    expect(mar12Events).toHaveLength(0);
  });

  it('applies color from source config', async () => {
    mockFetchResponse(SIMPLE_ICS);

    const { events } = await fetchICalEvents(
      [makeSource({ color: '#a855f7' })],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events.every(e => e.calendarColor === '#a855f7')).toBe(true);
  });

  it('prefixes event IDs with source ID', async () => {
    mockFetchResponse(SIMPLE_ICS);

    const { events } = await fetchICalEvents(
      [makeSource({ id: 'my-source' })],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events.every(e => e.id.startsWith('my-source:'))).toBe(true);
  });

  it('filters events by time window overlap', async () => {
    mockFetchResponse(SIMPLE_ICS);

    // Window that only includes March 15 (evt-1) but not March 16 (evt-2)
    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-15T00:00:00Z',
      '2025-03-16T00:00:00Z',
    );

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Morning Meeting');
  });

  it('handles empty ICS data gracefully', async () => {
    mockFetchResponse(EMPTY_ICS);

    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toEqual([]);
  });

  it('handles invalid ICS data gracefully', async () => {
    mockFetchResponse('not valid ics data');

    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toEqual([]);
  });

  it('normalizes webcal:// URLs to https://', async () => {
    mockFetch.mockClear();
    mockFetchResponse(SIMPLE_ICS);

    const { events } = await fetchICalEvents(
      [makeSource({ url: 'webcal://example.com/calendar.ics' })],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/calendar.ics',
      expect.objectContaining({ timeout: 15_000 }),
    );
  });

  it('rejects non-HTTP URL schemes', async () => {
    mockFetch.mockClear();
    const { events } = await fetchICalEvents(
      [makeSource({ url: 'file:///etc/passwd' })],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects invalid URLs', async () => {
    mockFetch.mockClear();
    const { events } = await fetchICalEvents(
      [makeSource({ url: 'not-a-url' })],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  describe('links that point into the home network', () => {
    it('refuses a private address and never fetches it', async () => {
      mockFetch.mockClear();
      const { events, results } = await fetchICalEvents(
        [makeSource({ url: 'http://192.168.1.10/calendar.ics' })],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(events).toEqual([]);
      expect(results[0].ok).toBe(false);
      expect(results[0].messageKey).toBe('linkBlocked');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('refuses a public link that redirects to a private address', async () => {
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(
        new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
      );

      const { events, results } = await fetchICalEvents(
        [makeSource()],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(events).toEqual([]);
      expect(results[0].messageKey).toBe('linkBlocked');
      // The first hop was fetched; the redirect target never was.
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('follows a redirect that stays on a public address', async () => {
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(
        new Response('', { status: 302, headers: { location: 'https://cdn.example.com/calendar.ics' } }),
      );
      mockFetchResponse(SIMPLE_ICS);

      const { events, results } = await fetchICalEvents(
        [makeSource()],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(results[0].ok).toBe(true);
      expect(events).toHaveLength(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://cdn.example.com/calendar.ics',
        expect.objectContaining({ redirect: 'manual' }),
      );
    });

    it('allows a private address when the feed opted in', async () => {
      mockFetch.mockClear();
      mockFetchResponse(SIMPLE_ICS);

      const { events, results } = await fetchICalEvents(
        [makeSource({ url: 'http://192.168.1.10/calendar.ics', homeNetwork: true })],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(results[0].ok).toBe(true);
      expect(events).toHaveLength(2);
    });
  });

  describe('oversized responses', () => {
    it('rejects a body past the size cap', async () => {
      mockFetch.mockClear();
      const huge = 'x'.repeat(4 * 1024 * 1024 + 1);
      mockFetch.mockResolvedValueOnce(new Response(huge, { status: 200 }));

      const { events, results } = await fetchICalEvents(
        [makeSource()],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(events).toEqual([]);
      expect(results[0].ok).toBe(false);
      expect(results[0].messageKey).toBe('linkUnreadable');
    });

    it('rejects a response that declares a size past the cap without reading it', async () => {
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce(
        new Response(SIMPLE_ICS, { status: 200, headers: { 'content-length': String(50 * 1024 * 1024) } }),
      );

      const { events, results } = await fetchICalEvents(
        [makeSource()],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(events).toEqual([]);
      expect(results[0].messageKey).toBe('linkUnreadable');
    });
  });

  it('continues when one source fails — partial failure', async () => {
    // First source fails
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    // Second source succeeds
    mockFetchResponse(SIMPLE_ICS);

    const { events } = await fetchICalEvents(
      [
        makeSource({ id: 'failing', url: 'https://fail.example.com/cal.ics' }),
        makeSource({ id: 'working', url: 'https://ok.example.com/cal.ics' }),
      ],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    // Should get events from the working source only
    expect(events.length).toBe(2);
    expect(events.every(e => e.id.startsWith('working:'))).toBe(true);
  });

  it('handles HTTP error responses gracefully', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toEqual([]);
  });

  it('does not log raw URLs in error messages', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    mockFetch.mockResolvedValueOnce(new Response('Error', { status: 500 }));

    await fetchICalEvents(
      [makeSource({ id: 'src-secret', name: 'Secret Cal', url: 'https://secret-token.example.com/cal.ics' })],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    // Should log source name and ID but not the URL
    const loggedArgs = warnSpy.mock.calls.flat().join(' ');
    expect(loggedArgs).toContain('Secret Cal');
    expect(loggedArgs).toContain('src-secret');
    expect(loggedArgs).not.toContain('secret-token');
  });

  it('sorts results by start time', async () => {
    // Second source has earlier events
    const EARLY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-early
DTSTART:20250301T080000Z
DTEND:20250301T090000Z
SUMMARY:Early Event
END:VEVENT
END:VCALENDAR`;

    mockFetchResponse(SIMPLE_ICS);
    mockFetchResponse(EARLY_ICS);

    const { events } = await fetchICalEvents(
      [
        makeSource({ id: 'src-a' }),
        makeSource({ id: 'src-b', url: 'https://other.example.com/cal.ics' }),
      ],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    // Early Event should be first
    expect(events[0].title).toBe('Early Event');
  });

  it('handles parameterized summary values', async () => {
    mockFetchResponse(PARAMETERIZED_SUMMARY_ICS);

    const { events } = await fetchICalEvents(
      [makeSource()],
      '2025-03-01T00:00:00Z',
      '2025-03-31T00:00:00Z',
    );

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Besprechung');
  });
  describe('feeds that name time zones by abbreviation', () => {
    // The shape reported in issue #42: a feed that switched from IANA zone names to
    // bare MDT/CST abbreviations. node-ical throws `Forbidden ICU TimeZone` on CST,
    // which used to discard the whole calendar.
    const ABBREVIATION_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VTIMEZONE
TZID:MDT
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:-0600
TZOFFSETTO:-0600
TZNAME:MDT
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:evt-mdt
DTSTAMP:20250301T120000Z
DTSTART;TZID=MDT:20250315T090000
DTEND;TZID=MDT:20250315T100000
SUMMARY:Mountain Event
END:VEVENT
BEGIN:VEVENT
UID:evt-cst
DTSTAMP:20250301T120000Z
DTSTART;TZID=CST:20250316T090000
DTEND;TZID=CST:20250316T100000
SUMMARY:Central Event
END:VEVENT
END:VCALENDAR`;

    it('loads the calendar instead of failing the whole feed', async () => {
      mockFetchResponse(ABBREVIATION_ICS);

      const { events, results } = await fetchICalEvents(
        [makeSource()],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(results[0].ok).toBe(true);
      expect(events).toHaveLength(2);
    });

    it('puts the events at the instant the abbreviation means', async () => {
      mockFetchResponse(ABBREVIATION_ICS);

      const { events } = await fetchICalEvents(
        [makeSource()],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      // MDT and CST are both UTC-6, so 09:00 local is 15:00 UTC.
      expect(events[0].title).toBe('Mountain Event');
      expect(events[0].start).toBe('2025-03-15T15:00:00.000Z');
      expect(events[0].end).toBe('2025-03-15T16:00:00.000Z');
      expect(events[1].title).toBe('Central Event');
      expect(events[1].start).toBe('2025-03-16T15:00:00.000Z');
    });

    it('expands a recurring event in a half-hour zone', async () => {
      mockFetchResponse(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-nst
DTSTAMP:20250301T120000Z
DTSTART;TZID=NST:20250303T080000
DTEND;TZID=NST:20250303T090000
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Newfoundland Standup
END:VEVENT
END:VCALENDAR`);

      const { events, results } = await fetchICalEvents(
        [makeSource()],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(results[0].ok).toBe(true);
      expect(events.map((e) => e.start)).toEqual([
        '2025-03-03T11:30:00.000Z',
        '2025-03-10T11:30:00.000Z',
        '2025-03-17T11:30:00.000Z',
      ]);
    });

    it('still loads a calendar whose zone cannot be resolved', async () => {
      mockFetchResponse(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-bst
DTSTAMP:20250301T120000Z
DTSTART;TZID=BST:20250315T090000
DTEND;TZID=BST:20250315T100000
SUMMARY:Ambiguous Zone
END:VEVENT
END:VCALENDAR`);

      const { events, results } = await fetchICalEvents(
        [makeSource()],
        '2025-03-01T00:00:00Z',
        '2025-03-31T00:00:00Z',
      );

      expect(results[0].ok).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Ambiguous Zone');
    });
  });
  describe('feeds whose VTIMEZONE declares daylight saving under an abbreviation', () => {
    // A feed that labels the zone "CST" but supplies real DST rules. Resolving that to
    // a fixed -06:00 would put every daylight-season event an hour late.
    const DST_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:CST
BEGIN:STANDARD
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0600
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0600
TZOFFSETTO:-0500
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:winter
DTSTAMP:20260101T120000Z
DTSTART;TZID=CST:20260115T090000
DTEND;TZID=CST:20260115T100000
SUMMARY:Winter
END:VEVENT
BEGIN:VEVENT
UID:summer
DTSTAMP:20260101T120000Z
DTSTART;TZID=CST:20260715T090000
DTEND;TZID=CST:20260715T100000
SUMMARY:Summer
END:VEVENT
END:VCALENDAR`;

    it('places events on both sides of the transition correctly', async () => {
      mockFetchResponse(DST_ICS);

      const { events, results } = await fetchICalEvents(
        [makeSource()],
        '2026-01-01T00:00:00Z',
        '2026-12-31T00:00:00Z',
      );

      expect(results[0].ok).toBe(true);
      expect(events).toHaveLength(2);
      // 09:00 standard time is 15:00Z; 09:00 daylight time is 14:00Z.
      expect(events[0].title).toBe('Winter');
      expect(events[0].start).toBe('2026-01-15T15:00:00.000Z');
      expect(events[1].title).toBe('Summer');
      expect(events[1].start).toBe('2026-07-15T14:00:00.000Z');
    });

    it('shifts a weekly recurrence as it crosses the spring transition', async () => {
      mockFetchResponse(DST_ICS.replace(
        'UID:winter',
        'UID:weekly\r\nRRULE:FREQ=WEEKLY;COUNT=3',
      ).replace('DTSTART;TZID=CST:20260115T090000', 'DTSTART;TZID=CST:20260226T090000')
        .replace('DTEND;TZID=CST:20260115T100000', 'DTEND;TZID=CST:20260226T100000'));

      const { events } = await fetchICalEvents(
        [makeSource()],
        '2026-02-01T00:00:00Z',
        '2026-04-01T00:00:00Z',
      );

      // US daylight time starts 2026-03-08, so the third occurrence moves an hour.
      expect(events.map((e) => e.start)).toEqual([
        '2026-02-26T15:00:00.000Z',
        '2026-03-05T15:00:00.000Z',
        '2026-03-12T14:00:00.000Z',
      ]);
    });
  });
});
