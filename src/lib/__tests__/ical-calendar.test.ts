import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ICalSource } from '@/types/config';
import { silenceConsole } from '@/test-utils';

// Mock fetchWithTimeout
vi.mock('@/lib/api-utils', () => ({
  fetchWithTimeout: vi.fn(),
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
});
