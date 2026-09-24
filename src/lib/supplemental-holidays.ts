/**
 * Supplemental holidays that are culturally significant but not classified
 * as "Public" holidays by the Nager.Date API. These are computed locally
 * and merged into the holiday picker.
 */

interface SupplementalHoliday {
  name: string;
  /** Returns YYYY-MM-DD for the given year */
  getDate: (year: number) => string;
}

/**
 * Compute Easter Sunday using the Anonymous Gregorian algorithm (Computus).
 * Valid for any year in the Gregorian calendar.
 */
export function computeEaster(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Get the Nth occurrence of a weekday in a given month (1-indexed). weekday: 0=Sun */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(year, month - 1, 1).getDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return day;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Country-specific supplemental holidays.
 * These supplement the Nager.Date "Public" holidays with culturally
 * important dates that people commonly count down to.
 */
const SUPPLEMENTAL: Record<string, SupplementalHoliday[]> = {
  US: [
    {
      name: 'Easter Sunday',
      getDate: (year) => {
        const { month, day } = computeEaster(year);
        return formatDate(year, month, day);
      },
    },
    {
      name: "Valentine's Day",
      getDate: (year) => formatDate(year, 2, 14),
    },
    {
      name: "St. Patrick's Day",
      getDate: (year) => formatDate(year, 3, 17),
    },
    {
      name: "Mother's Day",
      getDate: (year) => formatDate(year, 5, nthWeekdayOfMonth(year, 5, 0, 2)), // 2nd Sunday of May
    },
    {
      name: "Father's Day",
      getDate: (year) => formatDate(year, 6, nthWeekdayOfMonth(year, 6, 0, 3)), // 3rd Sunday of June
    },
    {
      name: 'Halloween',
      getDate: (year) => formatDate(year, 10, 31),
    },
    {
      name: "New Year's Eve",
      getDate: (year) => formatDate(year, 12, 31),
    },
  ],
};

export interface SupplementalHolidayResult {
  id: string;
  title: string;
  start: string; // YYYY-MM-DD
}

/**
 * Get supplemental holidays for a country and year range, from `today` on.
 *
 * `today` is the household's calendar day (`YYYY-MM-DD`), passed in rather
 * than read here: the UTC day turns over in the American evening, and on the
 * evening of Halloween the picker offered next year's.
 */
export function getSupplementalHolidays(
  countryCode: string,
  years: number[],
  today: string,
): SupplementalHolidayResult[] {
  const defs = SUPPLEMENTAL[countryCode.toUpperCase()];
  if (!defs) return [];

  const results: SupplementalHolidayResult[] = [];

  for (const year of years) {
    for (const def of defs) {
      const start = def.getDate(year);
      if (start >= today) {
        results.push({
          id: `supplemental-${countryCode}-${start}-${def.name.toLowerCase().replace(/\s+/g, '-')}`,
          title: def.name,
          start,
        });
      }
    }
  }

  return results;
}
