import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock api-utils before importing the module under test.
// TTL cache is a no-op so each test exercises fetchWithTimeout independently.
vi.mock('@/lib/api-utils', () => ({
  fetchWithTimeout: vi.fn(),
  createTTLCache: () => ({
    get: () => null,
    set: () => {},
  }),
}));

import { fetchAvailableCountries, fetchHolidayEvents } from '../holidays';
import { fetchWithTimeout } from '@/lib/api-utils';

const mockFetch = vi.mocked(fetchWithTimeout);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleHolidays = [
  { date: '2026-01-01', localName: "New Year's Day", name: "New Year's Day", countryCode: 'US', types: ['Public'] },
  { date: '2026-01-19', localName: 'Martin Luther King Jr. Day', name: 'Martin Luther King Jr. Day', countryCode: 'US', types: ['Public'] },
  { date: '2026-02-14', localName: "Valentine's Day", name: "Valentine's Day", countryCode: 'US', types: ['Observance'] },
  // Jul 4, 2026 is a Saturday — Nager reports the federally observed Friday
  { date: '2026-07-03', localName: 'Independence Day', name: 'Independence Day', countryCode: 'US', types: ['Public'] },
  { date: '2026-12-25', localName: 'Christmas Day', name: 'Christmas Day', countryCode: 'US', types: ['Public'] },
];

function mockJsonResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) } as Response;
}

function mockErrorResponse(status: number) {
  return { ok: false, status, json: () => Promise.reject() } as unknown as Response;
}

// ---------------------------------------------------------------------------
// fetchAvailableCountries
// ---------------------------------------------------------------------------
describe('fetchAvailableCountries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and returns country list', async () => {
    const countries = [
      { countryCode: 'US', name: 'United States' },
      { countryCode: 'CA', name: 'Canada' },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(countries));

    const result = await fetchAvailableCountries();
    expect(result).toEqual(countries);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('AvailableCountries'));
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(500));
    await expect(fetchAvailableCountries()).rejects.toThrow('Failed to fetch countries: 500');
  });
});

// ---------------------------------------------------------------------------
// fetchHolidayEvents
// ---------------------------------------------------------------------------
describe('fetchHolidayEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches holidays and converts to CalendarEvent format', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(sampleHolidays));

    const events = await fetchHolidayEvents('US', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');

    // Should only include Public holidays (4 total, Valentine's is Observance)
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.title)).toEqual([
      "New Year's Day",
      'Martin Luther King Jr. Day',
      'Independence Day',
      'Christmas Day',
    ]);
  });

  it('filters out non-Public holidays (Observances)', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(sampleHolidays));

    const events = await fetchHolidayEvents('US', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
    const titles = events.map((e) => e.title);
    expect(titles).not.toContain("Valentine's Day");
  });

  it('respects date range filtering', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(sampleHolidays));

    // Only January holidays
    const events = await fetchHolidayEvents('US', '2026-01-01T00:00:00Z', '2026-01-31T00:00:00Z');
    expect(events).toHaveLength(2);
    expect(events[0].title).toBe("New Year's Day");
    expect(events[1].title).toBe('Martin Luther King Jr. Day');
  });

  it('generates correct all-day event fields', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(sampleHolidays));

    const events = await fetchHolidayEvents('US', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');
    const newYear = events[0];

    expect(newYear.allDay).toBe(true);
    expect(newYear.start).toBe('2026-01-01');
    expect(newYear.end).toBe('2026-01-02'); // half-open: start + 1 day
    expect(newYear.sourceId).toBe('holidays');
    expect(newYear.sourceName).toBe('Public Holidays');
    expect(newYear.calendarColor).toBe('#10b981');
    // Name slug is part of the id — country+date alone collides when Nager
    // returns two Public holidays on the same date.
    expect(newYear.id).toBe('holiday-US-2026-01-01-new-year-s-day');
  });

  it('fetches from multiple years when range spans year boundary', async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse([
        { date: '2025-12-25', localName: 'Christmas', name: 'Christmas', countryCode: 'US', types: ['Public'] },
      ]))
      .mockResolvedValueOnce(mockJsonResponse([
        { date: '2026-01-01', localName: "New Year's", name: "New Year's", countryCode: 'US', types: ['Public'] },
      ]));

    const events = await fetchHolidayEvents('US', '2025-12-01T00:00:00Z', '2026-01-31T00:00:00Z');

    // Should have called fetch twice (once per year)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/2025/US'));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/2026/US'));
    expect(events).toHaveLength(2);
  });

  it('throws when API returns error', async () => {
    mockFetch.mockResolvedValueOnce(mockErrorResponse(404));
    await expect(fetchHolidayEvents('XX', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z')).rejects.toThrow('Failed to fetch holidays: 404');
  });

  it('pins fixed-date holidays back to their true calendar date', async () => {
    // Jul 4, 2026 is a Saturday — Nager reports the observed Friday Jul 3
    const observed = [
      { date: '2026-07-03', localName: 'Independence Day', name: 'Independence Day', countryCode: 'US', types: ['Public'] },
      { date: '2026-01-19', localName: 'Martin Luther King Jr. Day', name: 'Martin Luther King Jr. Day', countryCode: 'US', types: ['Public'] },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(observed));

    const events = await fetchHolidayEvents('US', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z');

    const july4 = events.find((e) => e.title === 'Independence Day')!;
    expect(july4.start).toBe('2026-07-04');
    expect(july4.end).toBe('2026-07-05');
    expect(july4.id).toBe('holiday-US-2026-07-04-independence-day');

    // Floating holidays (defined by weekday rule, not fixed date) pass through
    const mlk = events.find((e) => e.title === 'Martin Luther King Jr. Day')!;
    expect(mlk.start).toBe('2026-01-19');
  });

  it('pins Sunday-shifted holidays back from their observed Monday', async () => {
    // Jul 4, 2021 was a Sunday — observed Monday Jul 5; Dec 25, 2021 a Saturday — observed Dec 24
    const observed = [
      { date: '2021-07-05', localName: 'Independence Day', name: 'Independence Day', countryCode: 'US', types: ['Public'] },
      { date: '2021-12-24', localName: 'Christmas Day', name: 'Christmas Day', countryCode: 'US', types: ['Public'] },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(observed));

    const events = await fetchHolidayEvents('US', '2021-01-01T00:00:00Z', '2021-12-31T00:00:00Z');
    expect(events.map((e) => e.start)).toEqual(['2021-07-04', '2021-12-25']);
  });

  it('pins New Year\'s Day observed in the prior December across the year boundary', async () => {
    // Jan 1, 2022 was a Saturday — Nager's 2022 list reports "2021-12-31".
    // Without pinning, this falls outside a 2022 range and disappears entirely.
    mockFetch.mockResolvedValueOnce(mockJsonResponse([
      { date: '2021-12-31', localName: "New Year's Day", name: "New Year's Day", countryCode: 'US', types: ['Public'] },
    ]));

    const events = await fetchHolidayEvents('US', '2022-01-01T00:00:00Z', '2022-12-31T00:00:00Z');
    expect(events).toHaveLength(1);
    expect(events[0].start).toBe('2022-01-01');
    expect(events[0].id).toBe('holiday-US-2022-01-01-new-year-s-day');
  });

  it('does not pin same-named holidays from other countries', async () => {
    // GB substitute-day for Christmas — no US-style pinning should apply
    mockFetch.mockResolvedValueOnce(mockJsonResponse([
      { date: '2021-12-27', localName: 'Christmas Day', name: 'Christmas Day', countryCode: 'GB', types: ['Public'] },
    ]));

    const events = await fetchHolidayEvents('GB', '2021-01-01T00:00:00Z', '2021-12-31T00:00:00Z');
    expect(events[0].start).toBe('2021-12-27');
  });

  it('returns empty array when no Public holidays in range', async () => {
    const observanceOnly = [
      { date: '2026-02-14', localName: "Valentine's Day", name: "Valentine's Day", countryCode: 'US', types: ['Observance'] },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse(observanceOnly));

    const events = await fetchHolidayEvents('US', '2026-02-01T00:00:00Z', '2026-02-28T00:00:00Z');
    expect(events).toHaveLength(0);
  });
});
