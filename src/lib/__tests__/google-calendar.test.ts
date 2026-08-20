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
    expect(events[0].calendarColor).toBe('#3b82f6');
  });

  it('returns empty array when no events exist', async () => {
    setupAuth();
    setupCalendarList([{ id: 'cal1' }]);
    setupColors({});
    setupEvents('cal1', []);

    const { events } = await fetchCalendarEvents(['cal1'], '2026-01-01', '2026-01-31');
    expect(events).toEqual([]);
  });
});
