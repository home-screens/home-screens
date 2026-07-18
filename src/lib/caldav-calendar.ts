import { createDAVClient, type DAVCalendar } from 'tsdav';
import type { CalendarEvent, ICloudSource } from '@/types/config';
import type { ICloudAccount } from '@/lib/icloud-accounts';
import { parseICSEvents } from '@/lib/ical-calendar';
import { compareEventStarts } from '@/lib/calendar-utils';
import { logger } from '@/lib/logger';

const log = logger('caldav');

const CALDAV_SERVER = 'https://caldav.icloud.com';
const CARDDAV_SERVER = 'https://contacts.icloud.com';

// One bound per network phase (login+discovery, per-calendar query). CalDAV
// against iCloud is normally sub-second; this only catches a wedged socket.
const TIMEOUT_MS = 20_000;

export interface ICloudCalendarListing {
  url: string;
  name: string;
  color: string | null;
}

/**
 * Bound a tsdav call to TIMEOUT_MS. The abort signal is handed to the call as
 * tsdav `fetchOptions` so a timeout tears down the underlying socket — racing
 * a bare timer would leave the request running and stack live sockets on the
 * Pi whenever an endpoint hangs.
 */
async function withTimeout<T>(run: (fetchOptions: RequestInit) => Promise<T>, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  (timer as { unref?: () => void }).unref?.();
  try {
    return await Promise.race([
      run({ signal: controller.signal }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error(`${label} timed out`)),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function createClient(account: ICloudAccount, type: 'caldav' | 'carddav') {
  return withTimeout(
    (fetchOptions) =>
      createDAVClient({
        serverUrl: type === 'caldav' ? CALDAV_SERVER : CARDDAV_SERVER,
        credentials: { username: account.appleId, password: account.appPassword },
        authMethod: 'Basic',
        defaultAccountType: type,
        fetchOptions,
      }),
    `iCloud ${type} login`,
  );
}

/**
 * The account's Basic-auth credential rides every CalDAV request, so never
 * query a calendar URL outside iCloud — a non-iCloud URL in config (hand
 * edit, restored backup) would hand the app password to an arbitrary host.
 */
function isICloudUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'icloud.com' || url.hostname.endsWith('.icloud.com'));
  } catch {
    return false;
  }
}

/** Apple reports calendar colors as #RRGGBBAA — strip the alpha for CSS use. */
export function normalizeAppleColor(color: unknown): string | null {
  if (typeof color !== 'string') return null;
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return trimmed.slice(0, 7);
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) return trimmed;
  return null;
}

function calendarName(cal: DAVCalendar): string {
  return typeof cal.displayName === 'string' && cal.displayName.trim()
    ? cal.displayName.trim()
    : 'Calendar';
}

/**
 * Verify credentials and list the account's event calendars.
 * Throws when login fails — callers map that to a friendly error.
 */
export async function listICloudCalendars(account: ICloudAccount): Promise<ICloudCalendarListing[]> {
  const client = await createClient(account, 'caldav');
  const calendars = await withTimeout((fetchOptions) => client.fetchCalendars({ fetchOptions }), 'iCloud calendar list');
  return calendars
    .filter((cal) => (cal.components ?? []).includes('VEVENT'))
    .map((cal) => ({
      url: cal.url,
      name: calendarName(cal),
      color: normalizeAppleColor(cal.calendarColor),
    }));
}

/** Whether the account exposes any contacts to build a birthdays calendar from. */
export async function checkICloudBirthdaysAvailable(account: ICloudAccount): Promise<boolean> {
  try {
    const client = await createClient(account, 'carddav');
    const books = await withTimeout((fetchOptions) => client.fetchAddressBooks({ fetchOptions }), 'iCloud contacts list');
    return books.length > 0;
  } catch (err) {
    log.warn(`Contacts check failed for ${account.appleId}`, err);
    return false;
  }
}

/**
 * Fetch events for the enabled iCloud sources, in the same CalendarEvent
 * shape as the Google/ICS paths. One CalDAV client per account; each
 * source degrades independently (a failed calendar never blanks the rest).
 */
export async function fetchICloudEvents(
  sources: ICloudSource[],
  accounts: ICloudAccount[],
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const from = new Date(timeMin);
  const to = new Date(timeMax);
  const byAccount = new Map<string, ICloudSource[]>();
  for (const source of sources) {
    const list = byAccount.get(source.accountId) ?? [];
    list.push(source);
    byAccount.set(source.accountId, list);
  }

  const allEvents: CalendarEvent[] = [];
  const results = await Promise.allSettled(
    [...byAccount.entries()].map(async ([accountId, accountSources]) => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) {
        log.warn(`No iCloud account on file for sources ${accountSources.map((s) => s.name).join(', ')}`);
        return [];
      }
      return fetchAccountEvents(account, accountSources, from, to);
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled') allEvents.push(...result.value);
    else log.warn('iCloud account fetch rejected', result.reason);
  }

  allEvents.sort((a, b) => compareEventStarts(a.start, b.start));
  return allEvents;
}

async function fetchAccountEvents(
  account: ICloudAccount,
  sources: ICloudSource[],
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const calendarSources = sources.filter((s) => {
    if (s.kind !== 'calendar') return false;
    if (!isICloudUrl(s.url)) {
      log.warn(`Skipping "${s.name}": calendar URL is not an iCloud address (${s.url})`);
      return false;
    }
    return true;
  });
  const birthdaySources = sources.filter((s) => s.kind === 'birthdays');
  const events: CalendarEvent[] = [];

  if (calendarSources.length) {
    const client = await createClient(account, 'caldav');
    const results = await Promise.allSettled(
      calendarSources.map(async (source) => {
        const objects = await withTimeout(
          (fetchOptions) =>
            client.fetchCalendarObjects({
              calendar: { url: source.url } as DAVCalendar,
              timeRange: { start: from.toISOString(), end: to.toISOString() },
              fetchOptions,
            }),
          `iCloud events for "${source.name}"`,
        );
        const sourceEvents: CalendarEvent[] = [];
        for (const obj of objects) {
          if (!obj.data) continue;
          try {
            sourceEvents.push(...parseICSEvents(obj.data, source, from, to));
          } catch (err) {
            log.warn(`Unparseable event in "${source.name}" (${obj.url})`, err);
          }
        }
        return sourceEvents;
      }),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') events.push(...result.value);
      else log.warn(`iCloud calendar fetch failed for ${account.appleId}`, result.reason);
    }
  }

  for (const source of birthdaySources) {
    try {
      events.push(...await fetchBirthdayEvents(account, source, from, to));
    } catch (err) {
      log.warn(`iCloud birthdays fetch failed for ${account.appleId}`, err);
    }
  }

  return events;
}

interface AccountBirthday {
  /** vCard URL — stable per contact, keys the generated event IDs */
  url: string;
  name: string;
  month: number;
  day: number;
}

// Parsed birthdays only change when contacts are edited, so refetching and
// parsing the whole address book on every 2-minute calendar cache miss is
// wasted work on the Pi. Cache the derived list per account for the local
// calendar day; failures are never cached.
const birthdayCache = new Map<string, { day: string; birthdays: AccountBirthday[] }>();

/** @internal exported for test isolation */
export function clearBirthdayCache(): void {
  birthdayCache.clear();
}

async function loadAccountBirthdays(account: ICloudAccount): Promise<AccountBirthday[]> {
  const today = toDateOnly(new Date());
  const cached = birthdayCache.get(account.id);
  if (cached?.day === today) return cached.birthdays;

  const client = await createClient(account, 'carddav');
  const books = await withTimeout((fetchOptions) => client.fetchAddressBooks({ fetchOptions }), 'iCloud contacts list');
  const birthdays: AccountBirthday[] = [];

  for (const book of books) {
    const cards = await withTimeout(
      (fetchOptions) => client.fetchVCards({ addressBook: book, fetchOptions }),
      'iCloud contacts',
    );
    for (const card of cards) {
      if (!card.data) continue;
      const parsed = parseVCardBirthday(card.data);
      if (parsed) birthdays.push({ url: card.url, ...parsed });
    }
  }

  birthdayCache.set(account.id, { day: today, birthdays });
  return birthdays;
}

async function fetchBirthdayEvents(
  account: ICloudAccount,
  source: ICloudSource,
  from: Date,
  to: Date,
): Promise<CalendarEvent[]> {
  const birthdays = await loadAccountBirthdays(account);
  const events: CalendarEvent[] = [];

  for (const birthday of birthdays) {
    for (const start of birthdayOccurrences(birthday.month, birthday.day, from, to)) {
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      events.push({
        id: `${source.id}:${birthday.url}:${start.getFullYear()}`,
        title: `🎂 ${birthday.name}`,
        start: toDateOnly(start),
        end: toDateOnly(end),
        allDay: true,
        calendarColor: source.color,
        sourceId: source.id,
        sourceName: source.name,
      });
    }
  }

  return events;
}

interface VCardBirthday {
  name: string;
  month: number; // 1-12
  day: number;   // 1-31
}

/**
 * Minimal vCard scan for FN + BDAY. Handles folded lines, property params,
 * and the BDAY shapes Apple emits: 1985-04-01, 19850401, --04-01, --0401,
 * and 1604-04-01 with X-APPLE-OMIT-YEAR (Apple's "no year" convention).
 */
export function parseVCardBirthday(vcard: string): VCardBirthday | null {
  const unfolded = vcard.replace(/\r?\n[ \t]/g, '');
  const fnMatch = unfolded.match(/^FN(?:;[^:\r\n]*)?:(.+)$/m);
  const bdayMatch = unfolded.match(/^BDAY(?:;[^:\r\n]*)?:(.+)$/m);
  if (!fnMatch || !bdayMatch) return null;

  const name = fnMatch[1].trim();
  const value = bdayMatch[1].trim();
  if (!name) return null;

  const dashed = value.match(/^(?:\d{4}|-{2})-?(\d{2})-(\d{2})/);
  const compact = value.match(/^(?:\d{4}|-{2})(\d{2})(\d{2})$/);
  const match = dashed ?? compact;
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { name, month, day };
}

/**
 * Yearly occurrences of month/day that overlap [from, to). Occurrences are
 * local-midnight instants while from/to are UTC-parsed instants; both sides
 * are absolute instants, so the half-open comparison includes a birthday
 * exactly when any part of its local calendar day falls inside the window —
 * even in timezones far from UTC.
 */
function birthdayOccurrences(month: number, day: number, from: Date, to: Date): Date[] {
  const occurrences: Date[] = [];
  for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
    // Feb 29 rolls forward to Mar 1 on non-leap years via Date normalization
    const date = new Date(year, month - 1, day);
    const dayAfter = new Date(year, month - 1, day + 1);
    if (dayAfter > from && date < to) occurrences.push(date);
  }
  return occurrences;
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
