import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { CalendarEvent, ScreenConfiguration } from '@/types/config';

// ---------------------------------------------------------------------------
// Mocks — set up before importing the route module
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/google-calendar', () => ({
  fetchCalendarEvents: vi.fn(),
}));

vi.mock('@/lib/ical-calendar', () => ({
  fetchICalEvents: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

import { fetchCalendarEvents } from '@/lib/google-calendar';
import { fetchICalEvents } from '@/lib/ical-calendar';
import { readConfig } from '@/lib/config';

const mockFetchGoogle = vi.mocked(fetchCalendarEvents);
const mockFetchICal = vi.mocked(fetchICalEvents);
const mockReadConfig = vi.mocked(readConfig);

// Lazily import GET so mocks are in place before module evaluation
const { GET, cache } = await import('@/app/api/calendar/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeConfig(overrides: Partial<ScreenConfiguration['settings']['calendar']> = {}): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'openweathermap', latitude: 0, longitude: 0, units: 'metric' },
      calendar: {
        googleCalendarId: '',
        googleCalendarIds: [],
        icalSources: [],
        maxEvents: 50,
        daysAhead: 7,
        ...overrides,
      },
    },
    screens: [],
  } as ScreenConfiguration;
}

function makeEvent(id: string, start: string, title = `Event ${id}`): CalendarEvent {
  return {
    id,
    title,
    start,
    end: start, // simplified for tests
    allDay: false,
  };
}

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/calendar');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.restoreAllMocks();
  mockFetchGoogle.mockReset();
  mockFetchICal.mockReset();
  mockReadConfig.mockReset();
  cache.clear();
  // Suppress console.error from the route's error handling
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Calendar ID resolution
// ---------------------------------------------------------------------------
describe('calendar ID resolution', () => {
  it('uses calendarIds query param when provided (comma-separated)', async () => {
    mockReadConfig.mockResolvedValue(makeConfig());
    mockFetchGoogle.mockResolvedValue([makeEvent('1', '2026-03-13T10:00:00Z')]);

    const req = makeRequest({ calendarIds: 'cal-a,cal-b' });
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['cal-a', 'cal-b'],
      expect.any(String),
      expect.any(String),
    );
    expect(json).toHaveLength(1);
  });

  it('falls back to googleCalendarIds from config', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary', 'work'] }),
    );
    mockFetchGoogle.mockResolvedValue([]);

    const req = makeRequest();
    await GET(req);

    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['primary', 'work'],
      expect.any(String),
      expect.any(String),
    );
  });

  it('falls back to googleCalendarId (singular) from config', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarId: 'my-single-cal', googleCalendarIds: [] }),
    );
    mockFetchGoogle.mockResolvedValue([]);

    const req = makeRequest();
    await GET(req);

    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['my-single-cal'],
      expect.any(String),
      expect.any(String),
    );
  });

  it('returns 400 when no calendars configured and no ical sources', async () => {
    mockReadConfig.mockResolvedValue(makeConfig());

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/No calendars configured/);
  });

  it('does not return 400 when no Google calendars but ical sources exist', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'Holidays', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
      }),
    );
    mockFetchICal.mockResolvedValue([makeEvent('ics-ev1', '2026-03-13T09:00:00Z')]);

    const req = makeRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
  });

  it('filters out empty strings from calendarIds query param', async () => {
    mockReadConfig.mockResolvedValue(makeConfig());
    mockFetchGoogle.mockResolvedValue([]);

    const req = makeRequest({ calendarIds: 'cal-a,,cal-b,' });
    await GET(req);

    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['cal-a', 'cal-b'],
      expect.any(String),
      expect.any(String),
    );
  });
});

// ---------------------------------------------------------------------------
// ICS + Google Calendar merging
// ---------------------------------------------------------------------------
describe('ICS + Google Calendar merging', () => {
  it('merges events from both sources sorted by start time', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        googleCalendarIds: ['primary'],
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
      }),
    );

    const googleEvents = [
      makeEvent('g1', '2026-03-13T12:00:00Z', 'Google Noon'),
      makeEvent('g2', '2026-03-13T16:00:00Z', 'Google Afternoon'),
    ];
    const icalEvents = [
      makeEvent('i1', '2026-03-13T08:00:00Z', 'ICal Morning'),
      makeEvent('i2', '2026-03-13T14:00:00Z', 'ICal Early Afternoon'),
    ];
    mockFetchGoogle.mockResolvedValue(googleEvents);
    mockFetchICal.mockResolvedValue(icalEvents);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(4);
    // Verify sorted order
    expect(json[0].title).toBe('ICal Morning');
    expect(json[1].title).toBe('Google Noon');
    expect(json[2].title).toBe('ICal Early Afternoon');
    expect(json[3].title).toBe('Google Afternoon');
  });

  it('respects maxEvents limit (slices after sort)', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        googleCalendarIds: ['primary'],
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
        maxEvents: 2,
      }),
    );

    const googleEvents = [
      makeEvent('g1', '2026-03-13T12:00:00Z', 'Google Noon'),
      makeEvent('g2', '2026-03-13T16:00:00Z', 'Google Afternoon'),
    ];
    const icalEvents = [
      makeEvent('i1', '2026-03-13T08:00:00Z', 'ICal Morning'),
    ];
    mockFetchGoogle.mockResolvedValue(googleEvents);
    mockFetchICal.mockResolvedValue(icalEvents);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(json).toHaveLength(2);
    expect(json[0].title).toBe('ICal Morning');
    expect(json[1].title).toBe('Google Noon');
  });

  it('returns ICS events when Google fails (partial success)', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        googleCalendarIds: ['primary'],
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
      }),
    );

    mockFetchGoogle.mockRejectedValue(new Error('Google auth expired'));
    mockFetchICal.mockResolvedValue([
      makeEvent('i1', '2026-03-13T09:00:00Z', 'ICS Only Event'),
    ]);

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].title).toBe('ICS Only Event');
  });

  it('returns Google events when ical-calendar module fails to load (partial success)', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        googleCalendarIds: ['primary'],
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
      }),
    );

    mockFetchGoogle.mockResolvedValue([
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Google Event'),
    ]);
    // Simulate node-ical not installed — the dynamic import() itself throws
    mockFetchICal.mockImplementation(() => {
      throw new Error('Cannot find module node-ical');
    });

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].title).toBe('Google Event');
  });

  it('returns Google events when ICS fails (partial success)', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        googleCalendarIds: ['primary'],
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
      }),
    );

    mockFetchGoogle.mockResolvedValue([
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Google Only Event'),
    ]);
    mockFetchICal.mockRejectedValue(new Error('ICS feed down'));

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].title).toBe('Google Only Event');
  });

  it('returns error when both Google and ICS fail', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        googleCalendarIds: ['primary'],
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
      }),
    );

    mockFetchGoogle.mockRejectedValue(new Error('Google auth expired'));
    mockFetchICal.mockRejectedValue(new Error('ICS feed down'));

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBeTruthy();
  });

  it('does not cache result when both sources fail', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        googleCalendarIds: ['primary'],
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
      }),
    );

    mockFetchGoogle.mockRejectedValue(new Error('Google auth expired'));
    mockFetchICal.mockRejectedValue(new Error('ICS feed down'));

    const req = makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-20T00:00:00Z' });
    await GET(req);

    // Second call — sources now succeed. If the error was cached, we'd get the error response.
    mockFetchGoogle.mockResolvedValue([makeEvent('g1', '2026-03-13T10:00:00Z', 'Success')]);
    mockFetchICal.mockResolvedValue([]);

    const res2 = await GET(req);
    const json2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(json2).toHaveLength(1);
    expect(json2[0].title).toBe('Success');
  });

  it('skips Google fetch when no Google calendar IDs are configured', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
        ],
      }),
    );
    mockFetchICal.mockResolvedValue([makeEvent('i1', '2026-03-13T09:00:00Z')]);

    const req = makeRequest();
    await GET(req);

    expect(mockFetchGoogle).not.toHaveBeenCalled();
  });

  it('skips ICS fetch when no ical sources are configured', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue([makeEvent('g1', '2026-03-13T09:00:00Z')]);

    const req = makeRequest();
    await GET(req);

    expect(mockFetchICal).not.toHaveBeenCalled();
  });

  it('filters out disabled ical sources', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        icalSources: [
          { id: 'ics-1', type: 'ical', name: 'Active', url: 'https://example.com/active.ics', color: '#ff0000', enabled: true },
          { id: 'ics-2', type: 'ical', name: 'Disabled', url: 'https://example.com/disabled.ics', color: '#00ff00', enabled: false },
        ],
      }),
    );
    mockFetchICal.mockResolvedValue([makeEvent('i1', '2026-03-13T09:00:00Z')]);

    const req = makeRequest();
    await GET(req);

    // fetchICalEvents should only receive the enabled source
    expect(mockFetchICal).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'ics-1', name: 'Active' })],
      expect.any(String),
      expect.any(String),
    );
  });
});

// ---------------------------------------------------------------------------
// Cache behavior
// ---------------------------------------------------------------------------
describe('cache behavior', () => {
  it('returns cached response on cache hit', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue([
      makeEvent('g1', '2026-03-13T10:00:00Z', 'First Fetch'),
    ]);

    const req = makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-20T00:00:00Z' });
    const res1 = await GET(req);
    const json1 = await res1.json();
    expect(json1).toHaveLength(1);

    // Second request with same params — Google mock changed, but cache should be used
    mockFetchGoogle.mockResolvedValue([
      makeEvent('g2', '2026-03-13T11:00:00Z', 'Second Fetch'),
    ]);

    const res2 = await GET(req);
    const json2 = await res2.json();

    expect(json2).toHaveLength(1);
    expect(json2[0].title).toBe('First Fetch');
    // fetchCalendarEvents should only be called once (for the first request)
    expect(mockFetchGoogle).toHaveBeenCalledTimes(1);
  });

  it('cache key includes calendar IDs — different IDs cause a miss', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue([
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Primary Cal'),
    ]);

    const req1 = makeRequest({
      calendarIds: 'cal-a',
      timeMin: '2026-03-13T00:00:00Z',
      timeMax: '2026-03-20T00:00:00Z',
    });
    await GET(req1);

    mockFetchGoogle.mockResolvedValue([
      makeEvent('g2', '2026-03-13T11:00:00Z', 'Different Cal'),
    ]);

    const req2 = makeRequest({
      calendarIds: 'cal-b',
      timeMin: '2026-03-13T00:00:00Z',
      timeMax: '2026-03-20T00:00:00Z',
    });
    const res2 = await GET(req2);
    const json2 = await res2.json();

    // Should be a fresh fetch, not cached
    expect(json2[0].title).toBe('Different Cal');
    expect(mockFetchGoogle).toHaveBeenCalledTimes(2);
  });

  it('cache key includes time range — different timeMin causes a miss', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue([
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Week 1'),
    ]);

    const req1 = makeRequest({
      timeMin: '2026-03-13T00:00:00Z',
      timeMax: '2026-03-20T00:00:00Z',
    });
    await GET(req1);

    mockFetchGoogle.mockResolvedValue([
      makeEvent('g2', '2026-03-20T10:00:00Z', 'Week 2'),
    ]);

    const req2 = makeRequest({
      timeMin: '2026-03-20T00:00:00Z',
      timeMax: '2026-03-27T00:00:00Z',
    });
    const res2 = await GET(req2);
    const json2 = await res2.json();

    expect(json2[0].title).toBe('Week 2');
    expect(mockFetchGoogle).toHaveBeenCalledTimes(2);
  });

  it('cache.clear() causes subsequent requests to fetch fresh data', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue([
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Before Clear'),
    ]);

    const req = makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-20T00:00:00Z' });
    await GET(req);

    cache.clear();

    mockFetchGoogle.mockResolvedValue([
      makeEvent('g2', '2026-03-13T10:00:00Z', 'After Clear'),
    ]);

    const res2 = await GET(req);
    const json2 = await res2.json();

    expect(json2[0].title).toBe('After Clear');
    expect(mockFetchGoogle).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Time parameters
// ---------------------------------------------------------------------------
describe('time parameters', () => {
  it('uses timeMin/timeMax from query params when provided', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue([]);

    const req = makeRequest({
      timeMin: '2026-06-01T00:00:00Z',
      timeMax: '2026-06-08T00:00:00Z',
    });
    await GET(req);

    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['primary'],
      '2026-06-01T00:00:00Z',
      '2026-06-08T00:00:00Z',
    );
  });

  it('defaults to now + daysAhead when timeMin/timeMax not provided', async () => {
    const daysAhead = 14;
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'], daysAhead }),
    );
    mockFetchGoogle.mockResolvedValue([]);

    const before = Date.now();
    const req = makeRequest();
    await GET(req);
    const after = Date.now();

    const [, timeMinArg, timeMaxArg] = mockFetchGoogle.mock.calls[0];
    const timeMinMs = new Date(timeMinArg).getTime();
    const timeMaxMs = new Date(timeMaxArg).getTime();

    // timeMin should be close to "now" (rounded to nearest minute)
    const roundedBefore = Math.floor(before / 60000) * 60000;
    const roundedAfter = Math.floor(after / 60000) * 60000;
    expect(timeMinMs).toBeGreaterThanOrEqual(roundedBefore);
    expect(timeMinMs).toBeLessThanOrEqual(roundedAfter + 60000);

    // timeMax should be daysAhead days after timeMin
    expect(timeMaxMs - timeMinMs).toBe(daysAhead * 86400000);
  });

  it('defaults daysAhead to 7 when not configured', async () => {
    const config = makeConfig({ googleCalendarIds: ['primary'] });
    // Remove daysAhead to trigger the ?? 7 fallback
    delete (config.settings.calendar as unknown as Record<string, unknown>).daysAhead;
    mockReadConfig.mockResolvedValue(config);
    mockFetchGoogle.mockResolvedValue([]);

    const req = makeRequest();
    await GET(req);

    const [, timeMinArg, timeMaxArg] = mockFetchGoogle.mock.calls[0];
    const diff = new Date(timeMaxArg).getTime() - new Date(timeMinArg).getTime();
    expect(diff).toBe(7 * 86400000);
  });

  it('defaults maxEvents to 100 when not configured', async () => {
    const config = makeConfig({
      googleCalendarIds: ['primary'],
      icalSources: [
        { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
      ],
    });
    delete (config.settings.calendar as unknown as Record<string, unknown>).maxEvents;
    mockReadConfig.mockResolvedValue(config);

    // Create 120 events to verify the 100-event cap
    const googleEvents = Array.from({ length: 60 }, (_, i) =>
      makeEvent(`g${i}`, `2026-03-13T${String(i).padStart(2, '0')}:00:00Z`),
    );
    const icalEvents = Array.from({ length: 60 }, (_, i) =>
      makeEvent(`i${i}`, `2026-03-14T${String(i).padStart(2, '0')}:00:00Z`),
    );
    mockFetchGoogle.mockResolvedValue(googleEvents);
    mockFetchICal.mockResolvedValue(icalEvents);

    const req = makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-20T00:00:00Z' });
    const res = await GET(req);
    const json = await res.json();

    expect(json).toHaveLength(100);
  });
});

// ---------------------------------------------------------------------------
// Config read failure
// ---------------------------------------------------------------------------
describe('config read failure', () => {
  it('returns 500 when readConfig throws', async () => {
    mockReadConfig.mockRejectedValue(new Error('ENOENT: file not found'));

    const req = makeRequest();
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBeTruthy();
  });
});
