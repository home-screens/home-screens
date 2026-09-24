import { createResolverCache, fetchWithTimeout, isValidISODate } from '@/lib/api-utils';
import { createJsonStore } from '@/lib/json-store';
import { householdToday } from '@/lib/household-day';

/**
 * School and public holidays from openholidaysapi.org, per region.
 *
 * Nager.Date (`holidays.ts`) only knows public holidays by country, so a German
 * household sees every other state's regional days and nothing at all about
 * Ferien. OpenHolidays answers both, filtered to one state, which is what a
 * timetable needs to say "no school today" and "back on Monday".
 *
 * Two things shape this file:
 *
 * 1. Requests deliberately omit `languageIsoCode`. Without it every row carries
 *    all of its localized names, so one cached payload serves every display
 *    language and the name is picked at render time (`pickLocalizedName`).
 * 2. The API answers 200 with an empty list for an unsupported country, an
 *    unknown region and outright nonsense alike. It never rejects a bad code,
 *    so every check has to happen here before a URL is built.
 *
 * Responses carry no cache headers of any kind, so the caches below are the
 * whole freshness story.
 */

const API_BASE = 'https://openholidaysapi.org';

/** A school year's dates are published long in advance and never move. */
const HOLIDAY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Regions change about as often as a country redraws its map. */
const REGION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** "Nothing here" is worth remembering briefly so a display stops asking. */
const EMPTY_TTL_MS = 10 * 60 * 1000;
/** Last-good copies kept on disk, oldest dropped first. */
const MAX_STORED_ENTRIES = 16;
/** Guard against a malformed range turning one row into thousands of days. */
const MAX_PUBLIC_HOLIDAY_DAYS = 31;
/** How far ahead "back to school" will look before giving up. */
const MAX_LOOKAHEAD_DAYS = 366;
/** Used for the region labels and as the second choice for every name. */
const FALLBACK_LANGUAGE = 'EN';

const COUNTRY_CODE = /^[A-Z]{2}$/;
const SUBDIVISION_CODE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

/** Served the saved copy because the fetch failed. */
export const STALE_MESSAGE_KEY = 'schoolHolidaysStale';
/** The fetch failed and there is no saved copy to fall back on. */
export const UNAVAILABLE_MESSAGE_KEY = 'schoolHolidaysUnavailable';

/** Thrown for input this library will not turn into a request. Routes map `status` to their reply. */
export class SchoolHolidaysError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'SchoolHolidaysError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One name in one language. The API uppercases the code ("DE", "EN"). */
export interface LocalizedText {
  language: string;
  text: string;
}

/** A stretch of days off school. Both ends are inclusive. */
export interface SchoolHolidayPeriod {
  id: string;
  /** YYYY-MM-DD, the first day off. */
  startDate: string;
  /** YYYY-MM-DD, the last day off. */
  endDate: string;
  /** Every name the row carries; resolve with `pickLocalizedName`. */
  names: LocalizedText[];
  /** Lessons stop partway through the day, so it still counts as a school day. */
  halfDay: boolean;
  /** Free text the row came with, for example which islands it covers. */
  notes?: LocalizedText[];
}

/** One public holiday, on one day. */
export interface PublicHolidayDay {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Every name the row carries; resolve with `pickLocalizedName`. */
  names: LocalizedText[];
}

/** The two lists every reader of this library works with. */
export interface HolidayLists {
  schoolHolidays: SchoolHolidayPeriod[];
  publicHolidays: PublicHolidayDay[];
}

export interface SchoolHolidaysResult extends HolidayLists {
  /** The region asked for, normalized, for example "DE-NW". */
  region: string;
  /** School year: 2026 means September 2026 to August 2027. */
  year: number;
  /** False when this is a saved copy after a failed fetch, or nothing at all. */
  ok: boolean;
  /** Names why `ok` is false, for the surface to phrase. */
  messageKey?: string;
  /** When this data was fetched, or null when it never has been. */
  fetchedAt: string | null;
}

/**
 * What the holidays route answers when it is asked about regions: one result
 * per region, keyed by the code it was asked about, normalized.
 *
 * Always a map, even for one region. A wall showing children at schools in two
 * states asks about both in one request, and a shape that changed with the
 * number of regions would leave every reader branching over how many it
 * happened to ask for.
 */
export interface SchoolHolidaysResponse {
  regions: Record<string, SchoolHolidaysResult>;
}

/** One entry in the editor's region picker. */
export interface HolidayRegion {
  /** Pass this back as the region, for example "DE-NW". */
  code: string;
  /** English name, the safe label when the display language has none. */
  label: string;
  /** Every name the region carries; resolve with `pickLocalizedName`. */
  names: LocalizedText[];
  /** Short form, for example "NW". */
  shortName: string;
}

export interface HolidayRegionsResult {
  /** The country asked for, normalized, for example "DE". */
  country: string;
  subdivisions: HolidayRegion[];
  /**
   * What this country calls one of those regions, in every language the rows
   * carry it in: "Bundesland" for Germany, "comunidad autónoma" for Spain.
   * Every row of a country says the same thing, so it is answered once here
   * rather than repeated on all sixteen. Empty when the rows carry no word.
   *
   * Resolve with `pickLocalizedName`. The casing upstream is inconsistent
   * ("federal state" but "Autonomous community"), so a surface printing it
   * mid-sentence has to settle that itself.
   */
  regionCategory: LocalizedText[];
  /**
   * False when the country has no school holidays at all, so a surface can say
   * so instead of showing an empty picker. Only some countries are covered.
   */
  hasSchoolHolidays: boolean;
  fetchedAt: string;
}

/** What one date looks like to a school timetable. */
export interface SchoolDayInfo {
  /** The school holiday this date falls in, or null. */
  holiday: SchoolHolidayPeriod | null;
  /** The public holiday on this date, or null. */
  publicHoliday: PublicHolidayDay | null;
  /** False at the weekend, on a public holiday and on a full day of Ferien. */
  schoolDay: boolean;
  /** The next day school is back, or null when this date is already one. */
  backToSchool: string | null;
}

type OpenHolidaysType = 'Public' | 'Bank' | 'Optional' | 'School' | 'BackToSchool' | 'EndOfLessons';

interface OpenHolidaysHoliday {
  id: string;
  startDate: string;
  /** Inclusive. */
  endDate: string;
  type: OpenHolidaysType;
  name?: LocalizedText[] | null;
  temporalScope?: 'FullDay' | 'HalfDay';
  comment?: LocalizedText[] | null;
  /** Seen as ["Exception"] on rows that carve a few islands out of a state. */
  tags?: string[] | null;
}

interface OpenHolidaysSubdivision {
  code: string;
  shortName?: string;
  /** What the country calls this kind of region, localized like `name`. */
  category?: LocalizedText[] | null;
  name?: LocalizedText[] | null;
  children?: OpenHolidaysSubdivision[] | null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 is Sunday, matching the rest of the codebase's day numbering. */
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The school year a `YYYY-MM-DD` day falls in: 2026 means September 2026 to August 2027. */
export function schoolYearOf(date: string): number {
  const [year, month] = date.split('-').map(Number);
  return month >= 9 ? year : year - 1;
}

/**
 * The school year running now for the household, counted from its own day in
 * the Settings time zone. The hub's clock is UTC on the shipped image, and
 * for a school in Europe that still read August 31 for the first hours of
 * September 1, which asked for last year's holidays.
 */
export async function currentSchoolYear(): Promise<number> {
  return schoolYearOf(await householdToday());
}

/**
 * One request covers a whole school year. The API refuses a window longer than
 * 1095 days; this one is 364, and it holds a Christmas break whole instead of
 * splitting it across two calendar-year requests.
 */
function schoolYearWindow(year: number): { from: string; to: string } {
  return { from: `${year}-09-01`, to: `${year + 1}-08-31` };
}

// ---------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------

interface RegionQuery {
  region: string;
  countryIsoCode: string;
  subdivisionCode?: string;
}

/**
 * Normalizes and checks a region. A plain country code is allowed: several
 * countries publish one set of school holidays with no regions at all.
 * Nested codes like "DE-BY-AU" are refused, because those are municipalities
 * rather than a school-holiday region.
 */
function parseRegion(raw: string): RegionQuery {
  const region = String(raw ?? '').trim().toUpperCase();
  if (COUNTRY_CODE.test(region)) return { region, countryIsoCode: region };
  if (SUBDIVISION_CODE.test(region)) {
    return { region, countryIsoCode: region.slice(0, 2), subdivisionCode: region };
  }
  throw new SchoolHolidaysError(400, 'That is not a region we know');
}

function parseCountry(raw: string): string {
  const country = String(raw ?? '').trim().toUpperCase();
  if (!COUNTRY_CODE.test(country)) throw new SchoolHolidaysError(400, 'That is not a country we know');
  return country;
}

function parseSchoolYear(raw: number): number {
  const year = Math.trunc(Number(raw));
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new SchoolHolidaysError(400, 'That is not a school year we can look up');
  }
  return year;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * The name to show. Requests ask for every language at once, so the pick
 * happens here: the display language first, then English, then whatever the
 * row has.
 */
export function pickLocalizedName(names: LocalizedText[] | undefined | null, locale: string): string {
  if (!names || names.length === 0) return '';
  const language = String(locale ?? '').split('-')[0].toUpperCase();
  const match = names.find((n) => n.language?.toUpperCase() === language)
    ?? names.find((n) => n.language?.toUpperCase() === FALLBACK_LANGUAGE)
    ?? names[0];
  return match.text ?? '';
}

/** Language-independent identity for "is this the same holiday?". */
function nameKey(names: LocalizedText[]): string {
  return pickLocalizedName(names, FALLBACK_LANGUAGE).trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Fetching and shaping
// ---------------------------------------------------------------------------

async function fetchRows<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const data: unknown = await res.json();
  return Array.isArray(data) ? (data as T[]) : [];
}

/**
 * Some states split one holiday into a row per school type (Mecklenburg-
 * Vorpommern runs separate dates for general and vocational schools), which
 * would draw the same Ferien twice with different edges. Until a timetable
 * knows about school types, overlapping rows of the same name become their
 * union, so everyone sees the longest break either school gets.
 */
function mergeOverlapping(periods: SchoolHolidayPeriod[]): SchoolHolidayPeriod[] {
  const sorted = [...periods].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate),
  );
  const merged: SchoolHolidayPeriod[] = [];
  for (const period of sorted) {
    const key = nameKey(period.names);
    const overlapping = merged.find(
      (m) => nameKey(m.names) === key && m.startDate <= period.endDate && period.startDate <= m.endDate,
    );
    if (!overlapping) {
      merged.push(period);
      continue;
    }
    if (period.endDate > overlapping.endDate) overlapping.endDate = period.endDate;
    // A full day off beats a half day: the union is what everyone gets.
    overlapping.halfDay = overlapping.halfDay && period.halfDay;
    if (!overlapping.notes && period.notes) overlapping.notes = period.notes;
  }
  return merged;
}

function toSchoolPeriods(rows: OpenHolidaysHoliday[], from: string, to: string): SchoolHolidayPeriod[] {
  const seen = new Set<string>();
  const periods: SchoolHolidayPeriod[] = [];
  for (const row of rows) {
    // BackToSchool and EndOfLessons mark a school day, they are not time off.
    if (row.type !== 'School') continue;
    if (!isUsableRow(row, from, to, seen)) continue;
    periods.push({
      id: row.id,
      startDate: row.startDate,
      endDate: row.endDate,
      names: row.name ?? [],
      halfDay: row.temporalScope === 'HalfDay',
      ...(row.comment && row.comment.length > 0 ? { notes: row.comment } : {}),
    });
  }
  return mergeOverlapping(periods);
}

function toPublicDays(rows: OpenHolidaysHoliday[], from: string, to: string): PublicHolidayDay[] {
  const seen = new Set<string>();
  const days: PublicHolidayDay[] = [];
  for (const row of rows) {
    // Bank and Optional days do not close a school.
    if (row.type !== 'Public') continue;
    if (!isUsableRow(row, from, to, seen)) continue;
    // These arrive as single days; a rare longer row becomes one entry per day
    // so a caller can ask about any one date.
    let date = row.startDate < from ? from : row.startDate;
    const last = row.endDate > to ? to : row.endDate;
    for (let i = 0; date <= last && i < MAX_PUBLIC_HOLIDAY_DAYS; i++) {
      days.push({ id: i === 0 ? row.id : `${row.id}-${date}`, date, names: row.name ?? [] });
      date = addDays(date, 1);
    }
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Rows worth keeping: a real date range that touches the window, seen once.
 * Rows tagged "Exception" carve a few islands out of a state and overlap the
 * state's own dates, so they would render a second, longer Herbstferien on
 * every wall in Schleswig-Holstein.
 */
function isUsableRow(row: OpenHolidaysHoliday, from: string, to: string, seen: Set<string>): boolean {
  if (row.tags?.includes('Exception')) return false;
  if (!row.id || !isValidISODate(row.startDate ?? '') || !isValidISODate(row.endDate ?? '')) return false;
  if (row.endDate < from || row.startDate > to) return false;
  if (seen.has(row.id)) return false;
  seen.add(row.id);
  return true;
}

// ---------------------------------------------------------------------------
// The saved copy on disk
// ---------------------------------------------------------------------------

interface StoredHolidays extends HolidayLists {
  fetchedAt: string;
}

interface HolidayStoreFile {
  entries: Record<string, StoredHolidays>;
}

/**
 * Last-good copy per region and school year, so a display that reboots without
 * a network still knows it is Ferien. Transient: losing the file only costs one
 * fetch, and it must never join a backup or a family transaction.
 */
const store = createJsonStore<HolidayStoreFile>({
  path: 'data/school-holidays.json',
  defaultValue: { entries: {} },
  transient: true,
});

async function rememberEntry(key: string, entry: StoredHolidays): Promise<void> {
  try {
    await store.updateAtomic((current) => {
      const entries: Record<string, StoredHolidays> = { ...current.entries, [key]: entry };
      const keys = Object.keys(entries);
      if (keys.length > MAX_STORED_ENTRIES) {
        keys.sort((a, b) => entries[a].fetchedAt.localeCompare(entries[b].fetchedAt));
        for (const stale of keys.slice(0, keys.length - MAX_STORED_ENTRIES)) delete entries[stale];
      }
      return { entries };
    });
  } catch {
    // A full or read-only disk costs the offline copy, never the answer.
  }
}

async function readStoredEntry(key: string): Promise<StoredHolidays | null> {
  try {
    const data = await store.read();
    return data.entries?.[key] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

async function resolveHolidays(key: string): Promise<StoredHolidays | null> {
  const separator = key.lastIndexOf(':');
  const { countryIsoCode, subdivisionCode } = parseRegion(key.slice(0, separator));
  const { from, to } = schoolYearWindow(Number(key.slice(separator + 1)));
  const params: Record<string, string> = { countryIsoCode, validFrom: from, validTo: to };
  if (subdivisionCode) params.subdivisionCode = subdivisionCode;

  // The subdivision filter has already done the regional work, so nothing here
  // re-checks which state a row belongs to. Under that filter `regionalScope`
  // reads "Regional" even for nationwide days, so it cannot be trusted anyway.
  const [schoolRows, publicRows] = await Promise.all([
    fetchRows<OpenHolidaysHoliday>('/SchoolHolidays', params),
    fetchRows<OpenHolidaysHoliday>('/PublicHolidays', params),
  ]);

  const schoolHolidays = toSchoolPeriods(schoolRows, from, to);
  const publicHolidays = toPublicDays(publicRows, from, to);
  // Nothing at all: an unsupported country, or a region with no data yet.
  if (schoolHolidays.length === 0 && publicHolidays.length === 0) return null;

  const entry: StoredHolidays = { fetchedAt: new Date().toISOString(), schoolHolidays, publicHolidays };
  await rememberEntry(key, entry);
  return entry;
}

async function resolveRegions(country: string): Promise<HolidayRegionsResult | null> {
  const { from, to } = schoolYearWindow(await currentSchoolYear());
  const [rows, schoolRows] = await Promise.all([
    fetchRows<OpenHolidaysSubdivision>('/Subdivisions', { countryIsoCode: country }),
    // The cheapest probe for "does this country have school holidays at all?".
    // The statistics endpoint answers for countries with no rows, so it cannot
    // stand in for this one.
    fetchRows<OpenHolidaysHoliday>('/SchoolHolidays', { countryIsoCode: country, validFrom: from, validTo: to }),
  ]);

  // Children are municipalities and departments, whose longer codes are not
  // a school-holiday region, so only the top level is offered.
  const regionRows = rows.filter((row) => SUBDIVISION_CODE.test(row.code ?? ''));

  const subdivisions: HolidayRegion[] = regionRows
    .map((row) => ({
      code: row.code,
      label: pickLocalizedName(row.name, FALLBACK_LANGUAGE) || row.shortName || row.code,
      names: row.name ?? [],
      shortName: row.shortName ?? '',
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    country,
    subdivisions,
    // One country, one word for its regions, so the first row settles it. A
    // town nested under a region calls itself something else and never gets
    // a say, having already been filtered out above.
    regionCategory: regionRows[0]?.category ?? [],
    hasSchoolHolidays: schoolRows.some((row) => row.type === 'School'),
    fetchedAt: new Date().toISOString(),
  };
}

const holidayCache = createResolverCache<StoredHolidays>(HOLIDAY_TTL_MS, EMPTY_TTL_MS, resolveHolidays);
const regionCache = createResolverCache<HolidayRegionsResult>(REGION_TTL_MS, EMPTY_TTL_MS, resolveRegions);

/** Drops both in-memory caches, so the next read goes upstream. */
export function clearSchoolHolidayCaches(): void {
  holidayCache.clear();
  regionCache.clear();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * School and public holidays for one region and one school year (2026 means
 * September 2026 to August 2027). Both lists come from one pair of requests
 * and are cached together.
 *
 * A failed fetch is never an error here: the saved copy is served with
 * `ok: false` so the wall keeps showing the right thing while it is offline.
 */
export async function getSchoolHolidays(region: string, schoolYear: number): Promise<SchoolHolidaysResult> {
  const { region: normalized } = parseRegion(region);
  const year = parseSchoolYear(schoolYear);
  const key = `${normalized}:${year}`;

  try {
    const fresh = await holidayCache.fetch(key);
    if (fresh) {
      return {
        region: normalized,
        year,
        schoolHolidays: fresh.schoolHolidays,
        publicHolidays: fresh.publicHolidays,
        ok: true,
        fetchedAt: fresh.fetchedAt,
      };
    }
    // A real answer that happens to be empty, so nothing was saved to disk.
    return {
      region: normalized,
      year,
      schoolHolidays: [],
      publicHolidays: [],
      ok: true,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    const stored = await readStoredEntry(key);
    if (stored) {
      return {
        region: normalized,
        year,
        schoolHolidays: stored.schoolHolidays,
        publicHolidays: stored.publicHolidays,
        ok: false,
        messageKey: STALE_MESSAGE_KEY,
        fetchedAt: stored.fetchedAt,
      };
    }
    return {
      region: normalized,
      year,
      schoolHolidays: [],
      publicHolidays: [],
      ok: false,
      messageKey: UNAVAILABLE_MESSAGE_KEY,
      fetchedAt: null,
    };
  }
}

/**
 * Just the public holidays for a region and school year, from the same cached
 * pair of requests as `getSchoolHolidays`.
 */
export async function getPublicHolidays(region: string, schoolYear: number): Promise<PublicHolidayDay[]> {
  const result = await getSchoolHolidays(region, schoolYear);
  return result.publicHolidays;
}

/**
 * The regions a country can be asked about, for the settings picker, what that
 * country calls one of them, and whether it has school holidays at all. All of
 * it comes from live data: of the languages this app ships, only Germany,
 * France and the Netherlands have school holidays, so a hard-coded list would
 * go stale in both directions.
 *
 * The three answers are independent, and a surface needs all three to tell the
 * cases apart: regions with school dates behind them, regions with only public
 * holidays behind them (Spain), and a country with neither, where there is no
 * code anybody could type that would ever answer (the United States, Denmark).
 */
export async function getSubdivisions(country: string): Promise<HolidayRegionsResult> {
  const code = parseCountry(country);
  const result = await regionCache.fetch(code);
  return result ?? {
    country: code,
    subdivisions: [],
    regionCategory: [],
    hasSchoolHolidays: false,
    fetchedAt: new Date().toISOString(),
  };
}

function findHoliday(date: string, periods: SchoolHolidayPeriod[]): SchoolHolidayPeriod | null {
  return periods.find((p) => p.startDate <= date && date <= p.endDate) ?? null;
}

function findPublicHoliday(date: string, days: PublicHolidayDay[]): PublicHolidayDay | null {
  return days.find((d) => d.date === date) ?? null;
}

function isSchoolDay(date: string, data: HolidayLists): boolean {
  const weekday = weekdayOf(date);
  if (weekday === 0 || weekday === 6) return false;
  if (findPublicHoliday(date, data.publicHolidays)) return false;
  const holiday = findHoliday(date, data.schoolHolidays);
  // A half day is still a school day, just a short one.
  return !holiday || holiday.halfDay;
}

/**
 * What one date looks like to a timetable: the holiday it falls in, if any, and
 * the next day school is back.
 *
 * "Back" skips weekends, public holidays and any further Ferien, which is why
 * Herbstferien ending on Saturday 31 October 2026 reads as back on Monday 2
 * November: the Sunday in between is Allerheiligen.
 */
export function getSchoolDayInfo(date: string, data: HolidayLists): SchoolDayInfo {
  if (!isValidISODate(date)) throw new SchoolHolidaysError(400, 'That is not a day we know');
  const schoolDay = isSchoolDay(date, data);
  let backToSchool: string | null = null;
  if (!schoolDay) {
    let next = addDays(date, 1);
    for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i++) {
      if (isSchoolDay(next, data)) {
        backToSchool = next;
        break;
      }
      next = addDays(next, 1);
    }
  }
  return {
    holiday: findHoliday(date, data.schoolHolidays),
    publicHoliday: findPublicHoliday(date, data.publicHolidays),
    schoolDay,
    backToSchool,
  };
}
