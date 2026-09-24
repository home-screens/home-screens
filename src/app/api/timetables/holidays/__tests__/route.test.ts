import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

// The library's own behaviour (windows, dedupe, the stale copy) is covered by
// its unit tests; here only what the route does with it matters.
vi.mock('@/lib/school-holidays', async () => {
  const actual = await vi.importActual<typeof import('@/lib/school-holidays')>('@/lib/school-holidays');
  return { ...actual, getSchoolHolidays: vi.fn(), getSubdivisions: vi.fn() };
});

let householdZone: string | undefined;
vi.mock('@/lib/config-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/config-cache')>()),
  readConfigCached: vi.fn(async () => ({ settings: { timezone: householdZone } })),
}));

import { GET } from '../route';
import {
  SchoolHolidaysError,
  getSchoolHolidays,
  getSubdivisions,
} from '@/lib/school-holidays';

const holidays = vi.mocked(getSchoolHolidays);
const subdivisions = vi.mocked(getSubdivisions);

const lists = {
  region: 'DE-NW',
  year: 2026,
  schoolHolidays: [{ id: 'h1', startDate: '2026-10-19', endDate: '2026-10-31', names: [{ language: 'DE', text: 'Herbstferien' }], halfDay: false }],
  publicHolidays: [{ id: 'p1', date: '2026-11-01', names: [{ language: 'DE', text: 'Allerheiligen' }] }],
  ok: true as const,
  fetchedAt: '2026-09-09T12:00:00.000Z',
};

const ask = (query: string) => GET(new NextRequest(`http://localhost/api/timetables/holidays${query}`), undefined);

beforeEach(() => {
  vi.clearAllMocks();
  // The library normalizes the code and answers about that region, which is
  // what the route keys its map by.
  holidays.mockImplementation(async (region: string) => ({ ...lists, region: region.trim().toUpperCase() }));
  subdivisions.mockResolvedValue({
    country: 'DE',
    subdivisions: [{ code: 'DE-NW', label: 'North Rhine-Westphalia', names: [{ language: 'EN', text: 'North Rhine-Westphalia' }], shortName: 'NW' }],
    regionCategory: [{ language: 'EN', text: 'federal state' }],
    hasSchoolHolidays: true,
    fetchedAt: '2026-09-09T12:00:00.000Z',
  });
});

describe('/api/timetables/holidays', () => {
  it('serves one school year for one region, keyed by that region', async () => {
    const response = await ask('?region=DE-NW&year=2026');
    expect(response.status).toBe(200);
    expect(holidays).toHaveBeenCalledWith('DE-NW', 2026);
    const body = await response.json();
    // A map even for one region: a shape that changed with the number asked
    // for would leave every reader counting before it could read.
    expect(Object.keys(body.regions)).toEqual(['DE-NW']);
    expect(body.regions['DE-NW'].schoolHolidays).toHaveLength(1);
    expect(body.regions['DE-NW'].publicHolidays).toHaveLength(1);
    expect(body.regions['DE-NW'].ok).toBe(true);
  });

  it('answers about several regions at once, for a wall with schools in two places', async () => {
    const response = await ask('?region=DE-NW,DE-BY&year=2026');
    expect(response.status).toBe(200);
    expect(holidays.mock.calls.map((call) => call[0])).toEqual(['DE-BY', 'DE-NW']);
    expect(Object.keys(await response.json().then((body) => body.regions)).sort()).toEqual(['DE-BY', 'DE-NW']);
  });

  it('reads a repeated parameter as well as a comma list', async () => {
    await ask('?region=DE-NW&region=DE-BY');
    expect(holidays.mock.calls.map((call) => call[0])).toEqual(['DE-BY', 'DE-NW']);
  });

  it('asks the library once for a region named twice', async () => {
    // Three brothers and sisters at one school are one question, not three.
    await ask('?region=DE-NW,de-nw,DE-NW');
    expect(holidays.mock.calls.map((call) => call[0])).toEqual(['DE-NW']);
  });

  it('turns down more regions than a household can have schools', async () => {
    const many = Array.from({ length: 17 }, (_, i) => `DE-${i}`).join(',');
    const response = await ask(`?region=${many}`);
    expect(response.status).toBe(400);
    expect(holidays).not.toHaveBeenCalled();
  });

  describe('with no year named', () => {
    afterEach(() => {
      vi.useRealTimers();
      householdZone = undefined;
    });

    it('asks about the school year running now', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
      await ask('?region=DE-NW');
      expect(holidays).toHaveBeenCalledWith('DE-NW', 2026);
    });

    it('starts the new school year at the household midnight, not the hub clock', async () => {
      // 00:30 on Sep 1 in Berlin is still Aug 31 in UTC.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T22:30:00Z'));
      householdZone = 'Europe/Berlin';
      await ask('?region=DE-NW');
      expect(holidays).toHaveBeenCalledWith('DE-NW', 2026);
    });
  });

  // The library serves a saved copy rather than failing, so the route must
  // pass ok, the message key and the age straight through.
  it('passes a saved copy through as it is', async () => {
    holidays.mockResolvedValue({ ...lists, ok: false, messageKey: 'schoolHolidaysStale' });
    const response = await ask('?region=DE-NW&year=2026');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.regions['DE-NW']).toMatchObject({
      ok: false,
      messageKey: 'schoolHolidaysStale',
      fetchedAt: lists.fetchedAt,
    });
  });

  // The editor tells three cases apart from this one answer: regions with
  // school dates behind them, regions with only public holidays behind them,
  // and a country with neither, which it must not ask for a code at all.
  it('serves a country its regions, what it calls one, and whether it has school holidays', async () => {
    const response = await ask('?country=DE');
    expect(response.status).toBe(200);
    expect(subdivisions).toHaveBeenCalledWith('DE');
    const body = await response.json();
    expect(body.subdivisions[0].code).toBe('DE-NW');
    expect(body.regionCategory).toEqual([{ language: 'EN', text: 'federal state' }]);
    expect(body.hasSchoolHolidays).toBe(true);
  });

  it('answers the region when both a region and a country are asked for', async () => {
    await ask('?region=DE-NW&country=FR');
    expect(holidays).toHaveBeenCalledWith('DE-NW', expect.any(Number));
    expect(subdivisions).not.toHaveBeenCalled();
  });

  it('asks for a region or a country when neither is given', async () => {
    const response = await ask('');
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('region or country');
    expect(holidays).not.toHaveBeenCalled();
  });

  it('answers a code it will not look up with its own reason', async () => {
    holidays.mockRejectedValue(new SchoolHolidaysError(400, 'That is not a region we know'));
    const response = await ask('?region=nonsense');
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('That is not a region we know');
  });

  it('reports anything else as a service failure', async () => {
    holidays.mockRejectedValue(new Error('socket hang up'));
    const response = await ask('?region=DE-NW');
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('School holidays could not be loaded');
  });
});
