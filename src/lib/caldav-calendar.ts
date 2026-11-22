import { createHash } from 'crypto';
import { createDAVClient, type DAVCalendar } from 'tsdav';
import type { CalendarEvent, ICloudSource } from '@/types/config';
import type { ICloudAccount } from '@/lib/icloud-accounts';
import { parseICSEvents } from '@/lib/ical-calendar';
import { compareEventStarts, parseEventInstant } from '@/lib/calendar-utils';
import { isoDateInTZ, localISODate } from '@/lib/timezone';
import { settleSourceFetches, type SourceFetchResult } from '@/lib/calendar-source-status';
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

// Signing in and finding the account's calendar home is several round trips
// before the first event query, and its answer only changes with the account,
// so the signed-in calendar client is kept for an hour per account. A new app
// password is a different key, and a calendar query that fails drops the
// client, so a revoked password or a moved calendar home is looked up afresh
// on the next fetch.
const CALDAV_CLIENT_TTL_MS = 60 * 60 * 1000;

type CalDAVClient = Awaited<ReturnType<typeof createClient>>;

const caldavClients = new Map<string, { credential: string; at: number; client: Promise<CalDAVClient> }>();

function credentialKey(account: ICloudAccount): string {
  return createHash('sha256').update(`${account.appleId}\n${account.appPassword}`).digest('hex');
}

function cachedCalDAVClient(account: ICloudAccount): Promise<CalDAVClient> {
  const credential = credentialKey(account);
  const cached = caldavClients.get(account.id);
  if (cached && cached.credential === credential && Date.now() - cached.at < CALDAV_CLIENT_TTL_MS) return cached.client;
  const entry = { credential, at: Date.now(), client: createClient(account, 'caldav') };
  caldavClients.set(account.id, entry);
  entry.client.catch(() => forgetCalDAVClient(account, entry.client));
  return entry.client;
}

function forgetCalDAVClient(account: ICloudAccount, client: Promise<CalDAVClient>): void {
  if (caldavClients.get(account.id)?.client === client) caldavClients.delete(account.id);
}

/** The signed-in calendar client the event fetch keeps, as the event writer sees it. */
export type ICloudCalDAVClient = CalDAVClient;

/**
 * Run one request on the account's signed-in calendar client, bounded like
 * every other iCloud call. The event writer goes through here so it shares
 * the client the event fetch keeps. A request that throws drops the client,
 * so the next one signs in afresh.
 */
export async function withICloudClient<T>(
  account: ICloudAccount,
  label: string,
  run: (client: ICloudCalDAVClient, fetchOptions: RequestInit) => Promise<T>,
): Promise<T> {
  const pending = cachedCalDAVClient(account);
  const client = await pending;
  try {
    return await withTimeout((fetchOptions) => run(client, fetchOptions), label);
  } catch (err) {
    forgetCalDAVClient(account, pending);
    throw err;
  }
}

/** Sign in afresh on the next request: iCloud turned the saved app password away. */
export function forgetICloudClient(account: ICloudAccount): void {
  caldavClients.delete(account.id);
}

// Whether this account may write events on a calendar changes only when the
// calendar is shared differently, so the answer is kept for an hour per
// calendar, like the signed-in client. A failed lookup is never kept: the
// calendar reads as view-only until the next fetch asks again.
const PRIVILEGE_TTL_MS = 60 * 60 * 1000;

const privilegeCache = new Map<string, { at: number; writable: Promise<boolean> }>();

/** The DAV privileges that let this account add, change and remove events. `all` holds every other one. */
const WRITE_PRIVILEGES = new Set(['write', 'writeContent', 'all']);

/**
 * Whether a PROPFIND answer's `current-user-privilege-set` (as tsdav parses
 * it, element names camel-cased without their namespace) holds a write
 * privilege. A read-only shared calendar holds only `read` and its kin.
 */
export function privilegesAllowWrite(privilegeSet: unknown): boolean {
  const privileges = (privilegeSet as { privilege?: unknown } | null | undefined)?.privilege;
  const entries = Array.isArray(privileges) ? privileges : privileges ? [privileges] : [];
  return entries.some(
    (entry) => entry !== null && typeof entry === 'object' && Object.keys(entry).some((name) => WRITE_PRIVILEGES.has(name)),
  );
}

async function lookUpCalendarWritable(client: CalDAVClient, url: string): Promise<boolean> {
  const responses = await withTimeout(
    (fetchOptions) =>
      client.propfind({ url, props: { 'd:current-user-privilege-set': {} }, depth: '0', fetchOptions }),
    'iCloud calendar access',
  );
  const answer = responses.find((r) => r.ok && r.props?.currentUserPrivilegeSet);
  return privilegesAllowWrite(answer?.props?.currentUserPrivilegeSet);
}

/**
 * Whether this account may write events on the calendar at `url`, from a
 * PROPFIND of `current-user-privilege-set` (tsdav has no helper for it).
 * Never rejects: a failed lookup reads as view-only.
 */
function calendarWritable(client: CalDAVClient, account: ICloudAccount, url: string): Promise<boolean> {
  const key = `${credentialKey(account)}\n${url}`;
  const cached = privilegeCache.get(key);
  if (cached && Date.now() - cached.at < PRIVILEGE_TTL_MS) return cached.writable;
  const writable = lookUpCalendarWritable(client, url).catch((err) => {
    log.warn(`Could not tell whether an iCloud calendar can be changed (${url})`, err);
    if (privilegeCache.get(key)?.writable === writable) privilegeCache.delete(key);
    return false;
  });
  privilegeCache.set(key, { at: Date.now(), writable });
  return writable;
}

/**
 * Whether a calendar object is a repeating event: a VEVENT with an RRULE, or
 * a changed day of a series (RECURRENCE-ID). One object holds one event and
 * its changed days, so every event read from it shares the answer. The
 * VTIMEZONE rules (which carry RRULEs of their own) are not looked at.
 */
export function objectRepeats(icsText: string): boolean {
  let inEvent = false;
  for (const line of icsText.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    if (/^BEGIN:VEVENT\s*$/i.test(line)) inEvent = true;
    else if (/^END:VEVENT\s*$/i.test(line)) inEvent = false;
    else if (inEvent && /^(RRULE|RECURRENCE-ID)[;:]/i.test(line)) return true;
  }
  return false;
}

/**
 * The account's Basic-auth credential rides every CalDAV request, so never
 * query a calendar URL outside iCloud — a non-iCloud URL in config (hand
 * edit, restored backup) would hand the app password to an arbitrary host.
 */
export function isICloudUrl(value: string): boolean {
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
  timezone?: string,
): Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }> {
  const from = new Date(timeMin);
  const to = new Date(timeMax);
  const byAccount = new Map<string, ICloudSource[]>();
  for (const source of sources) {
    const list = byAccount.get(source.accountId) ?? [];
    list.push(source);
    byAccount.set(source.accountId, list);
  }

  const { events, results } = await settleSourceFetches(
    [...byAccount.entries()],
    async ([accountId, accountSources]) => {
      const account = accounts.find((a) => a.id === accountId);
      if (!account) {
        log.warn(`No iCloud account on file for sources ${accountSources.map((s) => s.name).join(', ')}`);
        return {
          events: [] as CalendarEvent[],
          results: accountSources.map((s): SourceFetchResult =>
            ({ id: s.id, name: s.name, ok: false, error: 'No iCloud account is connected for this calendar', messageKey: 'icloudNoAccount' })),
        };
      }
      return fetchAccountEvents(account, accountSources, from, to, timezone);
    },
    ([, accountSources], reason) => {
      // Account-level failure (auth or network): every source on it fails.
      log.warn('iCloud account fetch rejected', reason);
      return accountSources.map((s): SourceFetchResult =>
        ({ id: s.id, name: s.name, ok: false, error: "Couldn't reach iCloud", messageKey: 'icloudUnreachable' }));
    },
  );

  events.sort((a, b) => compareEventStarts(a.start, b.start, timezone));
  return { events, results };
}

async function fetchAccountEvents(
  account: ICloudAccount,
  sources: ICloudSource[],
  from: Date,
  to: Date,
  timezone?: string,
): Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }> {
  const results: SourceFetchResult[] = [];
  const calendarSources = sources.filter((s) => {
    if (s.kind !== 'calendar') return false;
    if (!isICloudUrl(s.url)) {
      log.warn(`Skipping "${s.name}": calendar URL is not an iCloud address (${s.url})`);
      results.push({ id: s.id, name: s.name, ok: false, error: "The calendar address isn't an iCloud link", messageKey: 'icloudNotICloudUrl' });
      return false;
    }
    return true;
  });
  const birthdaySources = sources.filter((s) => s.kind === 'birthdays');
  const events: CalendarEvent[] = [];

  // createClient failure (bad app password, iCloud outage) fails only the
  // calendar sources — the results collected above (invalid URLs) keep their
  // own wording, and birthdays still get their independent attempt below.
  const pendingClient = calendarSources.length ? cachedCalDAVClient(account) : null;
  let client: CalDAVClient | null = null;
  if (pendingClient) {
    try {
      client = await pendingClient;
    } catch (err) {
      log.warn(`iCloud sign-in failed for ${account.appleId}`, err);
      for (const s of calendarSources) {
        results.push({ id: s.id, name: s.name, ok: false, error: "Couldn't reach iCloud", messageKey: 'icloudUnreachable' });
      }
    }
  }
  if (client && pendingClient) {
    const caldavClient = client;
    const settled = await settleSourceFetches(
      calendarSources,
      async (source) => {
        const [objects, writable] = await Promise.all([
          withTimeout(
            (fetchOptions) =>
              caldavClient.fetchCalendarObjects({
                calendar: { url: source.url } as DAVCalendar,
                timeRange: { start: from.toISOString(), end: to.toISOString() },
                fetchOptions,
              }),
            `iCloud events for "${source.name}"`,
          ),
          calendarWritable(caldavClient, account, source.url),
        ]);
        const sourceEvents: CalendarEvent[] = [];
        for (const obj of objects) {
          if (!obj.data) continue;
          try {
            const parsed = parseICSEvents(obj.data, source, from, to, timezone);
            const repeats = objectRepeats(obj.data);
            // The object's address and version go back with a change, so
            // only an object that has both can be written.
            const editable = writable && obj.url && obj.etag ? { writable: true, etag: obj.etag, sourceRef: obj.url } : null;
            for (const event of parsed) {
              sourceEvents.push({ ...event, ...(repeats ? { repeats: true } : {}), ...editable });
            }
          } catch (err) {
            log.warn(`Unparseable event in "${source.name}" (${obj.url})`, err);
          }
        }
        return { events: sourceEvents, results: [{ id: source.id, name: source.name, ok: true }] };
      },
      (source, reason) => {
        log.warn(`iCloud calendar fetch failed for ${account.appleId}`, reason);
        forgetCalDAVClient(account, pendingClient);
        return [{ id: source.id, name: source.name, ok: false, error: "Couldn't load this calendar from iCloud", messageKey: 'icloudCalendarFailed' }];
      },
    );
    events.push(...settled.events);
    results.push(...settled.results);
  }

  for (const source of birthdaySources) {
    try {
      events.push(...await fetchBirthdayEvents(account, source, from, to, timezone));
      results.push({ id: source.id, name: source.name, ok: true });
    } catch (err) {
      log.warn(`iCloud birthdays fetch failed for ${account.appleId}`, err);
      results.push({ id: source.id, name: source.name, ok: false, error: "Couldn't load birthdays from iCloud", messageKey: 'icloudBirthdaysFailed' });
    }
  }

  return { events, results };
}

interface AccountBirthday {
  /** vCard URL — stable per contact, keys the generated event IDs */
  url: string;
  name: string;
  month: number;
  day: number;
  year?: number;
}

// Parsed birthdays only change when contacts are edited, so refetching and
// parsing the whole address book on every calendar cache miss is wasted work
// on the Pi. Cache the derived list per account for the local calendar day;
// failures are never cached.
const birthdayCache = new Map<string, { day: string; birthdays: AccountBirthday[] }>();

/** @internal exported for test isolation */
export function clearICloudCaches(): void {
  birthdayCache.clear();
  caldavClients.clear();
  privilegeCache.clear();
}

async function loadAccountBirthdays(account: ICloudAccount): Promise<AccountBirthday[]> {
  const today = localISODate(new Date());
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
  timezone?: string,
): Promise<CalendarEvent[]> {
  const birthdays = await loadAccountBirthdays(account);
  const events: CalendarEvent[] = [];

  for (const birthday of birthdays) {
    for (const { year, start, end } of birthdayOccurrences(birthday.month, birthday.day, from, to, timezone)) {
      events.push({
        id: `${source.id}:${birthday.url}:${year}`,
        title: birthday.name,
        start,
        end,
        allDay: true,
        calendarColor: source.color,
        sourceId: source.id,
        sourceName: source.name,
        kind: 'birthday',
        birthYear: birthday.year,
      });
    }
  }

  return events;
}

interface VCardBirthday {
  name: string;
  month: number; // 1-12
  day: number;   // 1-31
  /** Absent for Apple's X-APPLE-OMIT-YEAR contacts (no real year on file). */
  year?: number;
}

/**
 * Minimal vCard scan for FN + BDAY. Handles folded lines, property params,
 * and the BDAY shapes Apple emits: 1985-04-01, 19850401, --04-01, --0401,
 * and 1604-04-01 with X-APPLE-OMIT-YEAR (Apple's "no year" convention — the
 * dummy 1604 year is discarded, not treated as a real birth year).
 */
export function parseVCardBirthday(vcard: string): VCardBirthday | null {
  const unfolded = vcard.replace(/\r?\n[ \t]/g, '');
  const fnMatch = unfolded.match(/^FN(?:;[^:\r\n]*)?:(.+)$/m);
  const bdayMatch = unfolded.match(/^BDAY(?:;([^:\r\n]*))?:(.+)$/m);
  if (!fnMatch || !bdayMatch) return null;

  const name = fnMatch[1].trim();
  const value = bdayMatch[2].trim();
  if (!name) return null;

  const omitYear = /X-APPLE-OMIT-YEAR/i.test(bdayMatch[1] ?? '');
  const dashed = value.match(/^(\d{4}|--)-?(\d{2})-(\d{2})/);
  const compact = value.match(/^(\d{4}|--)(\d{2})(\d{2})$/);
  const match = dashed ?? compact;
  if (!match) return null;

  const [, yearToken, monthStr, dayStr] = match;
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = omitYear || yearToken === '--' ? undefined : parseInt(yearToken, 10);
  return { name, month, day, year };
}

/**
 * Yearly occurrences of month/day that overlap [from, to), as all-day
 * `YYYY-MM-DD` bounds. A birthday is a whole day at home, so its bounds are
 * the household's midnights (`timezone`), not the hub's: on a Pi left at UTC
 * a Chicago birthday otherwise ended at 7 pm and vanished from an evening
 * fetch. The half-open comparison includes a birthday exactly when any part
 * of that day falls inside the window.
 */
function birthdayOccurrences(
  month: number,
  day: number,
  from: Date,
  to: Date,
  timezone?: string,
): { year: number; start: string; end: string }[] {
  const occurrences: { year: number; start: string; end: string }[] = [];
  const firstYear = Number(isoDateInTZ(from, timezone).slice(0, 4));
  const lastYear = Number(isoDateInTZ(to, timezone).slice(0, 4));
  for (let year = firstYear; year <= lastYear; year++) {
    // Calendar arithmetic only, so UTC fields: Feb 29 rolls forward to Mar 1
    // on non-leap years via Date normalization.
    const start = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    if (parseEventInstant(end, timezone) > from && parseEventInstant(start, timezone) < to) {
      occurrences.push({ year, start, end });
    }
  }
  return occurrences;
}

