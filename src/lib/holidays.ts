import { fetchWithTimeout, createTTLCache } from '@/lib/api-utils';
import type { CalendarEvent } from '@/types/config';

const NAGER_BASE = 'https://date.nager.at/api/v3';

// 30-day caches — holiday data for a given year/country is effectively immutable
const countriesCache = createTTLCache<{ countryCode: string; name: string }[]>(30 * 24 * 60 * 60 * 1000);
const holidaysCache = createTTLCache<NagerHoliday[]>(30 * 24 * 60 * 60 * 1000);

interface NagerHoliday {
  date: string;       // YYYY-MM-DD
  localName: string;
  name: string;
  countryCode: string;
  types: string[];     // 'Public' | 'Observance' | 'Optional' | etc.
}

export async function fetchAvailableCountries(): Promise<{ countryCode: string; name: string }[]> {
  const cached = countriesCache.get('countries');
  if (cached) return cached;

  const res = await fetchWithTimeout(`${NAGER_BASE}/AvailableCountries`);
  if (!res.ok) throw new Error(`Failed to fetch countries: ${res.status}`);
  const data = await res.json();
  countriesCache.set('countries', data);
  return data;
}

async function fetchHolidays(countryCode: string, year: number): Promise<NagerHoliday[]> {
  const key = `${countryCode}:${year}`;
  const cached = holidaysCache.get(key);
  if (cached) return cached;

  const res = await fetchWithTimeout(`${NAGER_BASE}/PublicHolidays/${year}/${countryCode}`);
  if (!res.ok) throw new Error(`Failed to fetch holidays: ${res.status}`);
  const data: NagerHoliday[] = await res.json();
  holidaysCache.set(key, data);
  return data;
}

const HOLIDAY_COLOR = '#10b981'; // emerald green

/**
 * Nager.Date reports the *observed* date for US federal holidays (5 U.S.C. § 6103
 * shifts a Saturday holiday to Friday and a Sunday holiday to Monday), so e.g.
 * Independence Day 2026 comes back as 2026-07-03. A wall calendar wants the
 * actual date — fireworks are on the 4th regardless — so pin fixed-date
 * holidays back to their true calendar date. Keyed by Nager's English `name`.
 */
const FIXED_DATE_HOLIDAYS: Record<string, Record<string, { month: number; day: number }>> = {
  US: {
    "New Year's Day": { month: 1, day: 1 },
    'Juneteenth National Independence Day': { month: 6, day: 19 },
    'Independence Day': { month: 7, day: 4 },
    'Veterans Day': { month: 11, day: 11 },
    'Christmas Day': { month: 12, day: 25 },
  },
};

function pinFixedDate(h: NagerHoliday): string {
  const fixed = FIXED_DATE_HOLIDAYS[h.countryCode]?.[h.name];
  if (!fixed) return h.date;

  let year = parseInt(h.date.slice(0, 4), 10);
  const observedMonth = parseInt(h.date.slice(5, 7), 10);
  // Observance can cross a year boundary: Jan 1 on a Saturday is observed
  // Dec 31 of the prior year (Nager lists it under the requested year with
  // the prior-year date, e.g. New Year's Day 2022 → "2021-12-31").
  if (fixed.month === 1 && observedMonth === 12) year += 1;
  else if (fixed.month === 12 && observedMonth === 1) year -= 1;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad2(fixed.month)}-${pad2(fixed.day)}`;
}

/**
 * Fetches public holidays for a country and converts them to CalendarEvent format.
 * Only includes holidays typed as "Public" (skips observances, optional, etc.).
 */
export async function fetchHolidayEvents(
  countryCode: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const minDate = timeMin.slice(0, 10);  // YYYY-MM-DD
  const maxDate = timeMax.slice(0, 10);

  // Fetch holidays for all years in the range
  const minYear = parseInt(minDate.slice(0, 4), 10);
  const maxYear = parseInt(maxDate.slice(0, 4), 10);

  const allHolidays: NagerHoliday[] = [];
  for (let year = minYear; year <= maxYear; year++) {
    const holidays = await fetchHolidays(countryCode, year);
    allHolidays.push(...holidays);
  }

  // Pin fixed-date holidays before range filtering so an observance shifted
  // across the range boundary (e.g. New Year's observed Dec 31) lands on the
  // right side of the filter. All-day events use half-open interval
  // [start, end), so end = start + 1 day.
  return allHolidays
    .filter((h) => h.types.includes('Public'))
    .map((h) => ({ ...h, date: pinFixedDate(h) }))
    .filter((h) => h.date >= minDate && h.date <= maxDate)
    .map((h) => {
      const endDate = new Date(h.date + 'T00:00:00Z');
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      return {
        id: `holiday-${h.countryCode}-${h.date}`,
        title: h.localName,
        start: h.date,
        end: endDate.toISOString().slice(0, 10),
        allDay: true,
        sourceId: 'holidays',
        sourceName: 'Public Holidays',
        calendarColor: HOLIDAY_COLOR,
      };
    });
}
