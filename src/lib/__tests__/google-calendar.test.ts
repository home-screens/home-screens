import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auth module
vi.mock('@/lib/google-auth', () => ({
  getAuthenticatedClient: vi.fn(),
}));

// Build a mock Google Calendar API
const mockEventsList = vi.fn();
const mockCalendarListList = vi.fn();
const mockColorsGet = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    calendar: () => ({
      events: { list: mockEventsList },
      calendarList: { list: mockCalendarListList },
      colors: { get: mockColorsGet },
    }),
  },
}));

import { fetchCalendarEvents } from '../google-calendar';
import { getAuthenticatedClient } from '@/lib/google-auth';
import { DEFAULT_EVENT_COLOR } from '@/lib/calendar-color';

const mockGetAuth = vi.mocked(getAuthenticatedClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupAuth() {
  mockGetAuth.mockResolvedValue({} as never);
}

function setupCalendarList(calendars: { id: string; summary?: string; backgroundColor?: string }[]) {
  mockCalendarListList.mockResolvedValue({
    data: { items: calendars },
  });
}

function setupColors(eventColors: Record<string, { background: string }> = {}) {
  mockColorsGet.mockResolvedValue({
    data: { event: eventColors },
  });
}

function setupEvents(calendarId: string, events: Record<string, unknown>[]) {
  mockEventsList.mockImplementation(async (params: { calendarId: string }) => {
    if (params.calendarId === calendarId) {
      return { data: { items: events } };
    }
    return { data: { items: [] } };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchCalendarEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when not authenticated', async () => {
    mockGetAuth.mockResolvedValue(null);
    await expect(fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31'))
      .rejects.toThrow('Not authenticated');
  });

  it('fetches events and returns CalendarEvent objects', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1', summary: 'Work', backgroundColor: '#4285f4' }]);
    setupColors({});
    setupEvents('cal1', [
      {
        id: 'evt1',
        summary: 'Meeting',
        start: { dateTime: '2026-01-15T10:00:00-05:00' },
        end: { dateTime: '2026-01-15T11:00:00-05:00' },
        location: 'Room 101',
      },
    ]);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');

    expect(events).toHaveLength(1);
    // Calendar-id prefix keeps ids unique when the same event appears on two
    // selected calendars.
    expect(events[0].id).toBe('cal1:evt1');
    expect(events[0].title).toBe('Meeting');
    expect(events[0].start).toBe('2026-01-15T10:00:00-05:00');
    expect(events[0].location).toBe('Room 101');
    expect(events[0].allDay).toBe(false);
    expect(events[0].sourceId).toBe('cal1');
    expect(events[0].sourceName).toBe('Work');
    expect(events[0].calendarColor).toBe('#4285f4');
  });

  it('handles all-day events (date without dateTime)', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1', summary: 'Personal' }]);
    setupColors({});
    setupEvents('cal1', [
      {
        id: 'evt2',
        summary: 'Vacation',
        start: { date: '2026-03-10' },
        end: { date: '2026-03-15' },
      },
    ]);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-03-01', '2026-03-31');

    expect(events[0].allDay).toBe(true);
    expect(events[0].start).toBe('2026-03-10');
    expect(events[0].end).toBe('2026-03-15');
  });

  it('uses event colorId to override calendar color', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1', backgroundColor: '#4285f4' }]);
    setupColors({ '11': { background: '#dc2626' } });
    setupEvents('cal1', [
      {
        id: 'evt3',
        summary: 'Important',
        start: { dateTime: '2026-01-20T09:00:00Z' },
        end: { dateTime: '2026-01-20T10:00:00Z' },
        colorId: '11',
      },
    ]);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');
    expect(events[0].calendarColor).toBe('#dc2626');
  });

  it('falls back to calendar color when event colorId is not in color map', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1', backgroundColor: '#4285f4' }]);
    setupColors({}); // no event color '99'
    setupEvents('cal1', [
      {
        id: 'evt4',
        summary: 'Orphan color',
        start: { dateTime: '2026-01-20T09:00:00Z' },
        end: { dateTime: '2026-01-20T10:00:00Z' },
        colorId: '99',
      },
    ]);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');
    expect(events[0].calendarColor).toBe('#4285f4');
  });

  it("tags events from Google's built-in Birthdays calendar with kind: 'birthday'", async () => {
    const birthdaysId = 'addressbook#contacts@group.v.calendar.google.com';
    setupAuth();
    setupCalendarList([
      { id: 'cal1', summary: 'Work' },
      { id: birthdaysId, summary: 'Birthdays' },
    ]);
    setupColors({});
    mockEventsList.mockImplementation(async (params: { calendarId: string }) => {
      if (params.calendarId === birthdaysId) {
        return { data: { items: [{ id: 'ava', summary: "Ava's Birthday", start: { date: '2026-09-07' }, end: { date: '2026-09-08' } }] } };
      }
      return { data: { items: [{ id: 'evt1', summary: 'Meeting', start: { dateTime: '2026-01-15T10:00:00-05:00' }, end: { dateTime: '2026-01-15T11:00:00-05:00' } }] } };
    });

    const { events } = await fetchCalendarEvents(['cal1', birthdaysId], '2026-01-01', '2026-12-31');

    const birthday = events.find((e) => e.sourceId === birthdaysId);
    const meeting = events.find((e) => e.sourceId === 'cal1');
    expect(birthday?.kind).toBe('birthday');
    expect(meeting?.kind).toBeUndefined();
  });

  it('fetches from multiple calendars in parallel', async () => {
    setupAuth();
    setupCalendarList([
      { id: 'work', summary: 'Work', backgroundColor: '#4285f4' },
      { id: 'personal', summary: 'Personal', backgroundColor: '#0b8043' },
    ]);
    setupColors({});

    mockEventsList.mockImplementation(async (params: { calendarId: string }) => {
      if (params.calendarId === 'work') {
        return { data: { items: [
          { id: 'w1', summary: 'Standup', start: { dateTime: '2026-01-15T09:00:00Z' }, end: { dateTime: '2026-01-15T09:15:00Z' } },
        ] } };
      }
      if (params.calendarId === 'personal') {
        return { data: { items: [
          { id: 'p1', summary: 'Dentist', start: { dateTime: '2026-01-15T14:00:00Z' }, end: { dateTime: '2026-01-15T15:00:00Z' } },
        ] } };
      }
      return { data: { items: [] } };
    });

    const { events } = await fetchCalendarEvents(['work', 'personal'], '2026-01-01', '2026-01-31');

    expect(events).toHaveLength(2);
    // Sorted by start time — Standup (9am) before Dentist (2pm)
    expect(events[0].title).toBe('Standup');
    expect(events[0].sourceName).toBe('Work');
    expect(events[1].title).toBe('Dentist');
    expect(events[1].sourceName).toBe('Personal');
  });

  it('defaults title to (No title) when summary is missing', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1' }]);
    setupColors({});
    setupEvents('cal1', [
      {
        id: 'evt5',
        // no summary
        start: { dateTime: '2026-01-20T12:00:00Z' },
        end: { dateTime: '2026-01-20T13:00:00Z' },
      },
    ]);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');
    expect(events[0].title).toBe('(No title)');
  });

  it('defaults calendar color to blue when backgroundColor is missing', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1' }]); // no backgroundColor
    setupColors({});
    setupEvents('cal1', [
      { id: 'evt6', summary: 'Test', start: { dateTime: '2026-01-20T12:00:00Z' }, end: { dateTime: '2026-01-20T13:00:00Z' } },
    ]);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');
    expect(events[0].calendarColor).toBe(DEFAULT_EVENT_COLOR);
  });

  it('returns empty array when no events exist', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1' }]);
    setupColors({});
    setupEvents('cal1', []);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');
    expect(events).toEqual([]);
  });

  it('keeps declined events when hideDeclined is not set', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1' }]);
    setupColors({});
    setupEvents('cal1', [
      {
        id: 'evt7',
        summary: 'Skippable',
        start: { dateTime: '2026-01-20T12:00:00Z' },
        end: { dateTime: '2026-01-20T13:00:00Z' },
        attendees: [{ self: true, responseStatus: 'declined' }],
      },
    ]);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');
    expect(events).toHaveLength(1);
  });

  it('drops events the self attendee declined when hideDeclined is true', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1' }]);
    setupColors({});
    setupEvents('cal1', [
      {
        id: 'evt8',
        summary: 'Declined',
        start: { dateTime: '2026-01-20T12:00:00Z' },
        end: { dateTime: '2026-01-20T13:00:00Z' },
        attendees: [{ self: true, responseStatus: 'declined' }],
      },
      {
        id: 'evt9',
        summary: 'Accepted',
        start: { dateTime: '2026-01-20T14:00:00Z' },
        end: { dateTime: '2026-01-20T15:00:00Z' },
        attendees: [{ self: true, responseStatus: 'accepted' }],
      },
      {
        id: 'evt10',
        summary: 'No attendees',
        start: { dateTime: '2026-01-20T16:00:00Z' },
        end: { dateTime: '2026-01-20T17:00:00Z' },
      },
    ]);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31', true);
    expect(events.map((e) => e.title)).toEqual(['Accepted', 'No attendees']);
  });

  // Google caps a response at one page (250 by default, 2500 max) and signals
  // more with nextPageToken. Unpaged, the tail of a wide grid window is lost:
  // orderBy startTime is ascending, so the last weeks render empty.
  describe('paging', () => {
    /** Serve `pages` in order, each page's token pointing at the next. */
    function setupPagedEvents(pages: Record<string, unknown>[][]) {
      mockEventsList.mockImplementation(async (params: { pageToken?: string }) => {
        const index = params.pageToken ? Number(params.pageToken) : 0;
        const items = pages[index] ?? [];
        const nextPageToken = index + 1 < pages.length ? String(index + 1) : undefined;
        return { data: { items, nextPageToken } };
      });
    }

    const evt = (id: string) => ({
      id,
      summary: id,
      start: { dateTime: '2026-01-15T10:00:00Z' },
      end: { dateTime: '2026-01-15T11:00:00Z' },
    });

    it('follows nextPageToken until the calendar is exhausted', async () => {
      setupAuth();
      setupCalendarList([{ id: 'cal1', summary: 'Work' }]);
      setupColors({});
      setupPagedEvents([[evt('a'), evt('b')], [evt('c')], [evt('d')]]);

      const { events, results } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-03-31');

      expect(events.map((e) => e.title)).toEqual(['a', 'b', 'c', 'd']);
      expect(results).toEqual([{ id: 'cal1', name: 'Work', ok: true }]);
      expect(mockEventsList).toHaveBeenCalledTimes(3);
      // The token from each page must be carried into the next request.
      expect(mockEventsList.mock.calls[1][0]).toMatchObject({ pageToken: '1', calendarId: 'cal1' });
      expect(mockEventsList.mock.calls[2][0]).toMatchObject({ pageToken: '2' });
    });

    it('sends no pageToken on the first request and asks for full pages', async () => {
      setupAuth();
      setupCalendarList([{ id: 'cal1' }]);
      setupColors({});
      setupPagedEvents([[evt('a')]]);

      await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');

      expect(mockEventsList).toHaveBeenCalledTimes(1);
      expect(mockEventsList.mock.calls[0][0]).toMatchObject({ pageToken: undefined, maxResults: 2500 });
    });

    it('stops paging a runaway calendar at the safety cap', async () => {
      setupAuth();
      setupCalendarList([{ id: 'cal1' }]);
      setupColors({});
      // Every page is full and every page claims another one follows.
      const page = Array.from({ length: 1200 }, (_, i) => evt(`e${i}`));
      mockEventsList.mockImplementation(async () => ({ data: { items: page, nextPageToken: 'more' } }));

      const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2027-01-01');

      // Two pages clear the 2000-event cap, so it stops rather than looping.
      expect(mockEventsList).toHaveBeenCalledTimes(2);
      expect(events).toHaveLength(2400);
    });

    it('pages each calendar independently', async () => {
      setupAuth();
      setupCalendarList([{ id: 'cal1' }, { id: 'cal2' }]);
      setupColors({});
      mockEventsList.mockImplementation(async (params: { calendarId: string; pageToken?: string }) => {
        if (params.calendarId === 'cal1') {
          return params.pageToken
            ? { data: { items: [evt('cal1-b')] } }
            : { data: { items: [evt('cal1-a')], nextPageToken: 'next' } };
        }
        return { data: { items: [evt('cal2-a')] } };
      });

      const { events } = await fetchCalendarEvents(['cal1', 'cal2'], '2026-01-01', '2026-01-31');

      expect(events.map((e) => e.title).sort()).toEqual(['cal1-a', 'cal1-b', 'cal2-a']);
    });

    it('drops declined events from every page, not just the first', async () => {
      setupAuth();
      setupCalendarList([{ id: 'cal1' }]);
      setupColors({});
      const declined = {
        ...evt('declined'),
        attendees: [{ self: true, responseStatus: 'declined' }],
      };
      setupPagedEvents([[evt('kept-a')], [declined, evt('kept-b')]]);

      const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31', true);

      expect(events.map((e) => e.title)).toEqual(['kept-a', 'kept-b']);
    });
  });
});
