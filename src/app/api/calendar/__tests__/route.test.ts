import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { CalendarEvent, ScreenConfiguration } from '@/types/config';
import { silenceConsole } from '@/test-utils';

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

vi.mock('@/lib/caldav-calendar', () => ({
  fetchICloudEvents: vi.fn(),
}));

vi.mock('@/lib/icloud-accounts', () => ({
  listICloudAccounts: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  readConfig: vi.fn(),
}));

import { fetchCalendarEvents } from '@/lib/google-calendar';
import { fetchICalEvents } from '@/lib/ical-calendar';
import { fetchICloudEvents } from '@/lib/caldav-calendar';
import { listICloudAccounts } from '@/lib/icloud-accounts';
import { readConfig } from '@/lib/config';
import { CALENDAR_FETCH_MAX_EVENTS } from '@/lib/constants';

const mockFetchGoogle = vi.mocked(fetchCalendarEvents);
const mockFetchICal = vi.mocked(fetchICalEvents);
const mockFetchICloud = vi.mocked(fetchICloudEvents);
const mockListICloudAccounts = vi.mocked(listICloudAccounts);
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
silenceConsole();

beforeEach(() => {
  vi.restoreAllMocks();
  mockFetchGoogle.mockReset();
  mockFetchICal.mockReset();
  mockFetchICloud.mockReset();
  mockListICloudAccounts.mockReset();
  mockListICloudAccounts.mockResolvedValue([]);
  mockReadConfig.mockReset();
  cache.clear();
});

// ---------------------------------------------------------------------------
// Calendar ID resolution
// ---------------------------------------------------------------------------
describe('calendar ID resolution', () => {
  it('uses calendarIds query param when provided (comma-separated)', async () => {
    mockReadConfig.mockResolvedValue(makeConfig());
    mockFetchGoogle.mockResolvedValue({ events: [makeEvent('1', '2026-03-13T10:00:00Z')], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({ calendarIds: 'cal-a,cal-b' });
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

    expect(res.status).toBe(200);
    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['cal-a', 'cal-b'],
      expect.any(String),
      expect.any(String),
      false,
    );
    expect(json).toHaveLength(1);
  });

  it('falls back to googleCalendarIds from config', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary', 'work'] }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest();
    await GET(req);

    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['primary', 'work'],
      expect.any(String),
      expect.any(String),
      false,
    );
  });

  it('falls back to googleCalendarId (singular) from config', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarId: 'my-single-cal', googleCalendarIds: [] }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest();
    await GET(req);

    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['my-single-cal'],
      expect.any(String),
      expect.any(String),
      false,
    );
  });

  it('returns 400 when no calendars configured and no ical sources', async () => {
    mockReadConfig.mockResolvedValue(makeConfig());

    const req = makeRequest();
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

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
    mockFetchICal.mockResolvedValue({ events: [makeEvent('ics-ev1', '2026-03-13T09:00:00Z')], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
  });

  it('filters out empty strings from calendarIds query param', async () => {
    mockReadConfig.mockResolvedValue(makeConfig());
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({ calendarIds: 'cal-a,,cal-b,' });
    await GET(req);

    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['cal-a', 'cal-b'],
      expect.any(String),
      expect.any(String),
      false,
    );
  });

  it('threads settings.calendar.hideDeclined through to fetchCalendarEvents', async () => {
    mockReadConfig.mockResolvedValue(makeConfig({ googleCalendarIds: ['primary'], hideDeclined: true }));
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest();
    await GET(req);

    expect(mockFetchGoogle).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      expect.any(String),
      true,
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
    mockFetchGoogle.mockResolvedValue({ events: googleEvents, results: [{ id: 'mock-ok', ok: true }] });
    mockFetchICal.mockResolvedValue({ events: icalEvents, results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest();
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

    expect(res.status).toBe(200);
    expect(json).toHaveLength(4);
    // Verify sorted order
    expect(json[0].title).toBe('ICal Morning');
    expect(json[1].title).toBe('Google Noon');
    expect(json[2].title).toBe('ICal Early Afternoon');
    expect(json[3].title).toBe('Google Afternoon');
  });

  // Anchor all offsets to one base so window spans are exact to the
  // millisecond (a span computed from two Date.now() reads could drift and
  // flake).
  const atBase = Date.now();
  const at = (h: number) => new Date(atBase + h * 3600000).toISOString();

  it('returns every event inside a widened grid window; no user setting trims the fetch', async () => {
    // A month grid draws whatever its window holds. The old per-user "max
    // events" once scaled into this fetch and silently cut a busy family's
    // month grid to the nearest few days (issue #21 and the Cozi report).
    mockReadConfig.mockResolvedValue(makeConfig({ googleCalendarIds: ['primary'], daysAhead: 7 }));

    const events = Array.from({ length: 300 }, (_, i) =>
      makeEvent(`e${i}`, at((i - 150) * 4), `Event ${i}`),
    );
    mockFetchGoogle.mockResolvedValue({ events, results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({ timeMin: at(-30 * 24), timeMax: at(30 * 24) });
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

    expect(json).toHaveLength(300);
  });

  it('applies the fixed safety cap upcoming-first, keeping rows that ended today alongside it', async () => {
    // Only a pathological feed trips the cap. When it does, the nearest
    // upcoming rows survive, today's finished rows ride alongside the budget
    // (the agenda's finished-today flag exists to show them), and earlier
    // days are the first to go; the far end of the future is cut before any
    // nearer row.
    mockReadConfig.mockResolvedValue(makeConfig({ googleCalendarIds: ['primary'], daysAhead: 7 }));
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const endedToday = new Date(todayStart.getTime() + 60_000).toISOString();

    const upcoming = Array.from({ length: CALENDAR_FETCH_MAX_EVENTS + 5 }, (_, i) =>
      makeEvent(`u${i}`, at(1 + i), `Upcoming ${i}`),
    );
    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('p1', at(-96), 'Past A'),
      makeEvent('p2', at(-72), 'Past B'),
      makeEvent('e1', endedToday, 'Ended today'),
      ...upcoming,
    ], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({ timeMin: at(-120), timeMax: at(CALENDAR_FETCH_MAX_EVENTS + 48) });
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

    const titles = json.map((e: CalendarEvent) => e.title);
    expect(json).toHaveLength(CALENDAR_FETCH_MAX_EVENTS + 1);
    expect(titles).toContain('Ended today');
    expect(titles).toContain('Upcoming 0');
    expect(titles).toContain(`Upcoming ${CALENDAR_FETCH_MAX_EVENTS - 1}`);
    expect(titles).not.toContain(`Upcoming ${CALENDAR_FETCH_MAX_EVENTS}`);
    expect(titles).not.toContain('Past A');
    expect(titles).not.toContain('Past B');
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
    mockFetchICal.mockResolvedValue({ events: [
      makeEvent('i1', '2026-03-13T09:00:00Z', 'ICS Only Event'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest();
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

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

    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Google Event'),
    ], results: [{ id: 'mock-ok', ok: true }] });
    // Simulate node-ical not installed — the dynamic import() itself throws
    mockFetchICal.mockImplementation(() => {
      throw new Error('Cannot find module node-ical');
    });

    const req = makeRequest();
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

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

    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Google Only Event'),
    ], results: [{ id: 'mock-ok', ok: true }] });
    mockFetchICal.mockRejectedValue(new Error('ICS feed down'));

    const req = makeRequest();
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

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
    const body = await res.json(); const json = body.events ?? body;

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
    mockFetchGoogle.mockResolvedValue({ events: [makeEvent('g1', '2026-03-13T10:00:00Z', 'Success')], results: [{ id: 'mock-ok', ok: true }] });
    mockFetchICal.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const res2 = await GET(req);
    const body2 = await res2.json(); const json2 = body2.events ?? body2;

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
    mockFetchICal.mockResolvedValue({ events: [makeEvent('i1', '2026-03-13T09:00:00Z')], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest();
    await GET(req);

    expect(mockFetchGoogle).not.toHaveBeenCalled();
  });

  it('skips ICS fetch when no ical sources are configured', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [makeEvent('g1', '2026-03-13T09:00:00Z')], results: [{ id: 'mock-ok', ok: true }] });

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
    mockFetchICal.mockResolvedValue({ events: [makeEvent('i1', '2026-03-13T09:00:00Z')], results: [{ id: 'mock-ok', ok: true }] });

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
// iCloud merging
// ---------------------------------------------------------------------------
describe('iCloud merging', () => {
  const icloudSource = (overrides: Partial<{ id: string; enabled: boolean }> = {}) => ({
    id: 'ic-1',
    accountId: 'acct-1',
    kind: 'calendar' as const,
    url: 'https://caldav.icloud.com/123/calendars/home/',
    name: 'Home',
    color: '#ef4444',
    enabled: true,
    ...overrides,
  });
  const account = { id: 'acct-1', appleId: 'a@icloud.com', appPassword: 'aaaa-bbbb-cccc-dddd' };

  it('merges iCloud events into the combined, sorted output', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'], icloudSources: [icloudSource()] }),
    );
    mockListICloudAccounts.mockResolvedValue([account]);
    mockFetchGoogle.mockResolvedValue({ events: [makeEvent('g1', '2026-03-13T12:00:00Z', 'Google Noon')], results: [{ id: 'mock-ok', ok: true }] });
    mockFetchICloud.mockResolvedValue({ events: [makeEvent('ic1', '2026-03-13T08:00:00Z', 'iCloud Morning')], results: [{ id: 'mock-ok', ok: true }] });

    const res = await GET(makeRequest());
    const body = await res.json(); const json = body.events ?? body;

    expect(res.status).toBe(200);
    expect(json.map((e: CalendarEvent) => e.title)).toEqual(['iCloud Morning', 'Google Noon']);
  });

  it('passes the stored accounts and only enabled sources to fetchICloudEvents', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({
        icloudSources: [icloudSource(), icloudSource({ id: 'ic-2', enabled: false })],
      }),
    );
    mockListICloudAccounts.mockResolvedValue([account]);
    mockFetchICloud.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(mockFetchICloud).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'ic-1' })],
      [account],
      expect.any(String),
      expect.any(String),
    );
  });

  it('counts iCloud sources toward the "no calendars configured" check', async () => {
    mockReadConfig.mockResolvedValue(makeConfig({ icloudSources: [icloudSource()] }));
    mockListICloudAccounts.mockResolvedValue([account]);
    mockFetchICloud.mockResolvedValue({ events: [makeEvent('ic1', '2026-03-13T08:00:00Z')], results: [{ id: 'mock-ok', ok: true }] });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200); // not the 400 an empty config produces
    expect(mockFetchGoogle).not.toHaveBeenCalled();
    expect(mockFetchICal).not.toHaveBeenCalled();
  });

  it('returns Google events when iCloud fails (partial success)', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'], icloudSources: [icloudSource()] }),
    );
    mockListICloudAccounts.mockResolvedValue([account]);
    mockFetchGoogle.mockResolvedValue({ events: [makeEvent('g1', '2026-03-13T10:00:00Z', 'Google Only')], results: [{ id: 'mock-ok', ok: true }] });
    mockFetchICloud.mockRejectedValue(new Error('iCloud down'));

    const res = await GET(makeRequest());
    const body = await res.json(); const json = body.events ?? body;

    expect(res.status).toBe(200);
    expect(json.map((e: CalendarEvent) => e.title)).toEqual(['Google Only']);
  });

  it('returns an error instead of an empty 200 when iCloud is the only source and it fails', async () => {
    mockReadConfig.mockResolvedValue(makeConfig({ icloudSources: [icloudSource()] }));
    mockListICloudAccounts.mockResolvedValue([account]);
    mockFetchICloud.mockRejectedValue(new Error('iCloud down'));

    const res = await GET(makeRequest());
    const body = await res.json(); const json = body.events ?? body;

    expect(res.status).toBe(500);
    expect(json.error).toBeTruthy();
  });

  it('cache key includes iCloud sources — a source change causes a miss', async () => {
    const params = { timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-20T00:00:00Z' };
    mockReadConfig.mockResolvedValue(makeConfig({ icloudSources: [icloudSource()] }));
    mockListICloudAccounts.mockResolvedValue([account]);
    mockFetchICloud.mockResolvedValue({ events: [makeEvent('ic1', '2026-03-13T08:00:00Z', 'Home Cal')], results: [{ id: 'mock-ok', ok: true }] });

    await GET(makeRequest(params));

    mockReadConfig.mockResolvedValue(makeConfig({ icloudSources: [icloudSource({ id: 'ic-9' })] }));
    mockFetchICloud.mockResolvedValue({ events: [makeEvent('ic2', '2026-03-13T09:00:00Z', 'Other Cal')], results: [{ id: 'mock-ok', ok: true }] });

    const res2 = await GET(makeRequest(params));
    const body2 = await res2.json(); const json2 = body2.events ?? body2;

    expect(json2[0].title).toBe('Other Cal');
    expect(mockFetchICloud).toHaveBeenCalledTimes(2);
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
    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g1', '2026-03-13T10:00:00Z', 'First Fetch'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-20T00:00:00Z' });
    const res1 = await GET(req);
    const body1 = await res1.json(); const json1 = body1.events ?? body1;
    expect(json1).toHaveLength(1);

    // Second request with same params — Google mock changed, but cache should be used
    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g2', '2026-03-13T11:00:00Z', 'Second Fetch'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const res2 = await GET(req);
    const body2 = await res2.json(); const json2 = body2.events ?? body2;

    expect(json2).toHaveLength(1);
    expect(json2[0].title).toBe('First Fetch');
    // fetchCalendarEvents should only be called once (for the first request)
    expect(mockFetchGoogle).toHaveBeenCalledTimes(1);
  });

  it('cache key includes calendar IDs — different IDs cause a miss', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Primary Cal'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const req1 = makeRequest({
      calendarIds: 'cal-a',
      timeMin: '2026-03-13T00:00:00Z',
      timeMax: '2026-03-20T00:00:00Z',
    });
    await GET(req1);

    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g2', '2026-03-13T11:00:00Z', 'Different Cal'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const req2 = makeRequest({
      calendarIds: 'cal-b',
      timeMin: '2026-03-13T00:00:00Z',
      timeMax: '2026-03-20T00:00:00Z',
    });
    const res2 = await GET(req2);
    const body2 = await res2.json(); const json2 = body2.events ?? body2;

    // Should be a fresh fetch, not cached
    expect(json2[0].title).toBe('Different Cal');
    expect(mockFetchGoogle).toHaveBeenCalledTimes(2);
  });

  it('cache key includes time range — different timeMin causes a miss', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Week 1'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const req1 = makeRequest({
      timeMin: '2026-03-13T00:00:00Z',
      timeMax: '2026-03-20T00:00:00Z',
    });
    await GET(req1);

    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g2', '2026-03-20T10:00:00Z', 'Week 2'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const req2 = makeRequest({
      timeMin: '2026-03-20T00:00:00Z',
      timeMax: '2026-03-27T00:00:00Z',
    });
    const res2 = await GET(req2);
    const body2 = await res2.json(); const json2 = body2.events ?? body2;

    expect(json2[0].title).toBe('Week 2');
    expect(mockFetchGoogle).toHaveBeenCalledTimes(2);
  });

  it('cache.clear() causes subsequent requests to fetch fresh data', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'] }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g1', '2026-03-13T10:00:00Z', 'Before Clear'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-20T00:00:00Z' });
    await GET(req);

    cache.clear();

    mockFetchGoogle.mockResolvedValue({ events: [
      makeEvent('g2', '2026-03-13T10:00:00Z', 'After Clear'),
    ], results: [{ id: 'mock-ok', ok: true }] });

    const res2 = await GET(req);
    const body2 = await res2.json(); const json2 = body2.events ?? body2;

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
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({
      timeMin: '2026-06-01T00:00:00Z',
      timeMax: '2026-06-08T00:00:00Z',
    });
    await GET(req);

    // Params are re-serialized to canonical ISO form for stable cache keys
    expect(mockFetchGoogle).toHaveBeenCalledWith(
      ['primary'],
      '2026-06-01T00:00:00.000Z',
      '2026-06-08T00:00:00.000Z',
      false,
    );
  });

  it('falls back to defaults when timeMin/timeMax are unparseable', async () => {
    const daysAhead = 7;
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'], daysAhead }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const before = Date.now();
    const req = makeRequest({ timeMin: 'not-a-date', timeMax: 'also-junk' });
    await GET(req);

    const [, timeMinArg, timeMaxArg] = mockFetchGoogle.mock.calls[0];
    const timeMinMs = new Date(timeMinArg).getTime();
    expect(timeMinMs).toBeGreaterThanOrEqual(Math.floor(before / 60000) * 60000);
    expect(new Date(timeMaxArg).getTime() - timeMinMs).toBe(daysAhead * 86400000);
  });

  it('recovers from an inverted range (timeMax before timeMin)', async () => {
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'], daysAhead: 7 }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({
      timeMin: '2026-06-08T00:00:00Z',
      timeMax: '2026-06-01T00:00:00Z',
    });
    await GET(req);

    const [, timeMinArg, timeMaxArg] = mockFetchGoogle.mock.calls[0];
    expect(timeMinArg).toBe('2026-06-08T00:00:00.000Z');
    expect(new Date(timeMaxArg).getTime() - new Date(timeMinArg).getTime()).toBe(7 * 86400000);
  });

  it('defaults to now + daysAhead when timeMin/timeMax not provided', async () => {
    const daysAhead = 14;
    mockReadConfig.mockResolvedValue(
      makeConfig({ googleCalendarIds: ['primary'], daysAhead }),
    );
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

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
    mockFetchGoogle.mockResolvedValue({ events: [], results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest();
    await GET(req);

    const [, timeMinArg, timeMaxArg] = mockFetchGoogle.mock.calls[0];
    const diff = new Date(timeMaxArg).getTime() - new Date(timeMinArg).getTime();
    expect(diff).toBe(7 * 86400000);
  });

  it('a default-window fetch is never trimmed below the safety cap', async () => {
    mockReadConfig.mockResolvedValue(makeConfig({
      googleCalendarIds: ['primary'],
      icalSources: [
        { id: 'ics-1', type: 'ical', name: 'ICS', url: 'https://example.com/cal.ics', color: '#ff0000', enabled: true },
      ],
    }));

    const googleEvents = Array.from({ length: 60 }, (_, i) =>
      makeEvent(`g${i}`, `2026-03-13T${String(i).padStart(2, '0')}:00:00Z`),
    );
    const icalEvents = Array.from({ length: 60 }, (_, i) =>
      makeEvent(`i${i}`, `2026-03-14T${String(i).padStart(2, '0')}:00:00Z`),
    );
    mockFetchGoogle.mockResolvedValue({ events: googleEvents, results: [{ id: 'mock-ok', ok: true }] });
    mockFetchICal.mockResolvedValue({ events: icalEvents, results: [{ id: 'mock-ok', ok: true }] });

    const req = makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-20T00:00:00Z' });
    const res = await GET(req);
    const body = await res.json(); const json = body.events ?? body;

    expect(json).toHaveLength(120);
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
    const body = await res.json(); const json = body.events ?? body;

    expect(res.status).toBe(500);
    expect(json.error).toBeTruthy();
  });
});

describe('per-source status', () => {
  it('reports a failing source next to a healthy one, with last-good fetchedAt', async () => {
    mockReadConfig.mockResolvedValue(makeConfig({
      icalSources: [
        { id: 'good', type: 'ical', name: 'Family', url: 'https://a.example/f.ics', color: '#3B82F6', enabled: true },
        { id: 'bad', type: 'ical', name: 'School', url: 'https://a.example/s.ics', color: '#6366F1', enabled: true },
      ],
    }));
    mockFetchICal.mockResolvedValue({
      events: [makeEvent('e1', '2026-03-13T10:00:00Z')],
      results: [
        { id: 'good', name: 'Family', ok: true },
        { id: 'bad', name: 'School', ok: false, error: 'Could not reach the link (HTTP 404)' },
      ],
    });

    const res = await GET(makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-14T00:00:00Z' }));
    const body = await res.json();

    expect(body.events).toHaveLength(1);
    const byId = Object.fromEntries(body.sourceStatus.map((s: { id: string }) => [s.id, s]));
    expect(byId.good).toMatchObject({ ok: true, name: 'Family' });
    expect(byId.good.fetchedAt).toBeGreaterThan(0);
    expect(byId.bad).toMatchObject({ ok: false, name: 'School', error: 'Could not reach the link (HTTP 404)' });
    // 'bad' has never succeeded this process, so no since-time yet.
    expect(byId.bad.fetchedAt).toBeNull();
  });

  it("keeps serving a failing source's last-good events", async () => {
    mockReadConfig.mockResolvedValue(makeConfig({
      icalSources: [
        { id: 'school', type: 'ical', name: 'School', url: 'https://a.example/s.ics', color: '#6366F1', enabled: true },
      ],
    }));
    const schoolEvent = { ...makeEvent('s1', '2026-03-13T10:00:00Z', 'School Play'), sourceId: 'school', sourceName: 'School' };
    mockFetchICal.mockResolvedValue({
      events: [schoolEvent],
      results: [{ id: 'school', name: 'School', ok: true }],
    });
    const req = makeRequest({ timeMin: '2026-03-13T00:00:00Z', timeMax: '2026-03-14T00:00:00Z' });
    const first = await (await GET(req)).json();
    expect(first.events).toHaveLength(1);

    // The feed dies; the route substitutes the saved events and reports !ok.
    cache.clear();
    mockFetchICal.mockResolvedValue({
      events: [],
      results: [{ id: 'school', name: 'School', ok: false, error: 'Could not reach the link (HTTP 404)' }],
    });
    const second = await (await GET(req)).json();
    expect(second.events.map((e: CalendarEvent) => e.title)).toEqual(['School Play']);
    expect(second.sourceStatus[0]).toMatchObject({ id: 'school', ok: false });
    expect(second.sourceStatus[0].fetchedAt).toBeGreaterThan(0);
  });
});
