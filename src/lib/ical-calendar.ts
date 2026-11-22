import { createHash } from 'crypto';
import ical from 'node-ical';
import type { VEvent } from 'node-ical';
import type { ICalSource } from '@/types/config';
import type { CalendarEvent } from '@/types/config';
import { CALENDAR_MAX_WINDOW_MS } from '@/lib/constants';
import { compareEventStarts, householdDayStart, parseEventInstant } from '@/lib/calendar-utils';
import { eventOverlapsWindow, settleSourceFetches, type SourceFetchResult } from '@/lib/calendar-source-status';
import { normalizeIcsTimezones } from '@/lib/ics-timezones';
import { isoDateInTZ, localISODate } from '@/lib/timezone';
import { fetchWithAllowedRedirects } from '@/lib/guarded-fetch';
import { logger } from '@/lib/logger';

const log = logger('ical');

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
/** Tries after the first, per hop, on a timeout or a 5xx. */
const FETCH_RETRIES = 2;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Extract the string value from a node-ical ParameterValue (string | {val, params}). */
function paramValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'val' in v) return String((v as { val: unknown }).val);
  return '';
}

/** The slice of a source the ICS parser needs to label events (shared with the CalDAV path). */
export interface EventSourceMeta {
  id: string;
  name: string;
  color: string;
}

/**
 * Parse one ICS document into CalendarEvents within [from, to).
 * Handles recurring events (expanded locally with overrides/exdates)
 * and all-day events. Feeds that name timezones by abbreviation instead of
 * IANA zone are repaired first (see `normalizeIcsTimezones`). Throws on
 * malformed ICS — callers decide how a bad document degrades (skip the feed,
 * skip the object, …).
 *
 * `timezone` is the display's configured zone, used to anchor floating
 * date-times. Without it node-ical resolves those against whatever zone the hub
 * process runs in, which puts every event of such a feed at the wrong instant
 * whenever the two differ.
 */
export function parseICSEvents(
  icsText: string,
  source: EventSourceMeta,
  from: Date,
  to: Date,
  timezone?: string,
): CalendarEvent[] {
  const { text, replacements, anchored } = normalizeIcsTimezones(icsText, { floatingZone: timezone });
  if (replacements.size) {
    const summary = [...replacements].map(([tzid, zone]) => `${tzid} -> ${zone ?? 'local time'}`).join(', ');
    log.info(`Repaired non-standard time zones in "${source.name}" (${source.id}): ${summary}`);
  }
  if (anchored) {
    log.info(`Anchored ${anchored} floating time(s) in "${source.name}" (${source.id}) to ${timezone}`);
  }
  const components = ical.sync.parseICS(text);
  const events: CalendarEvent[] = [];

  for (const component of Object.values(components)) {
    if (!component || component.type !== 'VEVENT') continue;
    const vevent = component as VEvent;

    if (vevent.rrule) {
      // Expand recurring event within the time window
      const instances = ical.expandRecurringEvent(vevent, {
        from,
        to,
        includeOverrides: true,
        excludeExdates: true,
        expandOngoing: true,
      });
      const onlyMonth = yearlyRuleStartMonth(vevent);

      for (const instance of instances) {
        if (onlyMonth && !instance.isOverride && wallDate(instance.start, vevent).slice(5, 7) !== onlyMonth) continue;
        const ev = instanceToCalendarEvent(instance.event, instance.start, instance.end, instance.isFullDay, source);
        if (ev) events.push(ev);
      }
    } else {
      // Non-recurring event — check if it overlaps the time window
      if (!vevent.start) continue;

      const isAllDay = vevent.datetype === 'date';
      const evStart = vevent.start;
      const evEnd = vevent.end ?? computeFallbackEnd(evStart, isAllDay);

      // Overlap check: event.end > timeMin && event.start < timeMax. node-ical
      // builds all-day bounds at the hub's own midnight, so they are compared
      // as the household's days instead: on a Pi left at UTC, a Chicago
      // all-day event otherwise ends at 7 pm and drops out of an evening
      // fetch while it is still today at home.
      const [overlapStart, overlapEnd] = isAllDay
        ? [parseEventInstant(localISODate(evStart), timezone), parseEventInstant(localISODate(evEnd), timezone)]
        : [evStart, evEnd];
      if (overlapEnd > from && overlapStart < to) {
        const ev = instanceToCalendarEvent(vevent, evStart, evEnd, isAllDay, source);
        if (ev) events.push(ev);
      }
    }
  }

  return events;
}

type SourceOutcome = { events: CalendarEvent[]; results: SourceFetchResult[] };

/** Validators from the last good download, sent so the host can answer 304. */
interface FeedValidators {
  etag: string | null;
  lastModified: string | null;
}

type FeedDownload =
  | ({ kind: 'body'; text: string } & FeedValidators)
  | { kind: 'not-modified' }
  | { kind: 'failed'; outcome: SourceOutcome };

/**
 * Download one ICS feed. Never rejects on a bad feed: an unusable link, an
 * HTTP error, or a document that is not a calendar becomes a failing outcome
 * with plain-language wording (and an i18n `messageKey`), and so does a host
 * that cannot be reached. With `validators`, a host that still has the same
 * document answers 304 and nothing is downloaded.
 *
 * Links that point into the home network are refused unless the source has
 * `homeNetwork: true`, and every redirect hop is checked the same way.
 */
async function downloadFeed(source: ICalSource, validators?: FeedValidators): Promise<FeedDownload> {
  const fail = (error: string, messageKey: string, messageParams?: Record<string, string | number>): FeedDownload =>
    ({ kind: 'failed', outcome: failedOutcome(source, error, messageKey, messageParams) });

  // Validate the URL, normalizing webcal:// to https://
  let fetchUrl = source.url;
  let parsed: URL;
  try {
    parsed = new URL(fetchUrl);
  } catch {
    log.warn(`Invalid URL for source "${source.name}" (${source.id})`);
    return fail("The link isn't a valid web address", 'linkInvalid');
  }
  if (parsed.protocol === 'webcal:') {
    fetchUrl = fetchUrl.replace(/^webcal:/i, 'https:');
    parsed = new URL(fetchUrl);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    log.warn(`Rejected non-HTTP URL for source "${source.name}" (${source.id})`);
    return fail("The link isn't a valid web address", 'linkInvalid');
  }

  // A calendar link is typed by a person, so it can point anywhere, including
  // at the router, the hub itself, or a cloud metadata address. Public links
  // go through the strict check; a household that runs its own calendar server
  // turns on "Home network" for that one feed to reach a private address.
  // The shared fetch follows redirects by hand so every hop is checked the
  // same way, and stops reading at the cap so a link to something huge
  // cannot fill the hub's memory.
  const headers: Record<string, string> = {};
  if (validators?.etag) headers['If-None-Match'] = validators.etag;
  if (validators?.lastModified) headers['If-Modified-Since'] = validators.lastModified;

  const result = await fetchWithAllowedRedirects(fetchUrl, {
    allowHosts: ['*'],
    allowPrivateNetwork: source.homeNetwork === true,
    maxHops: MAX_REDIRECTS,
    maxBytes: MAX_BODY_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
    retries: FETCH_RETRIES,
    headers,
  });

  const httpError = (status: number) => {
    log.warn(`Fetch failed for source "${source.name}" (${source.id}): HTTP ${status}`);
    return fail(`Could not reach the link (HTTP ${status})`, 'linkHttpError', { status });
  };

  if (!result.ok) {
    // An error page that is also too big is still an error page.
    if (result.status !== undefined && (result.status < 200 || result.status >= 300)) return httpError(result.status);
    switch (result.reason) {
      case 'too-large':
        log.warn(`Source "${source.name}" (${source.id}) returned too much data`);
        return fail("The link didn't return a readable calendar", 'linkUnreadable');
      case 'too-many-redirects':
        log.warn(`Too many redirects for source "${source.name}" (${source.id})`);
        return fail('Could not reach the link', 'linkUnreachable');
      case 'timeout':
      case 'unreachable':
        log.warn(`Could not reach the link for source "${source.name}" (${source.id}): ${result.reason}`);
        return fail('Could not reach the link', 'linkUnreachable');
      default:
        log.warn(`Refused to fetch the link for source "${source.name}" (${source.id})`);
        return fail("That link can't be used. Check it and try again.", 'linkBlocked');
    }
  }

  if (result.status === 304 && validators) return { kind: 'not-modified' };
  if (result.status < 200 || result.status >= 300) return httpError(result.status);

  const icsText = new TextDecoder('utf-8').decode(result.body);

  // A login page or an HTML 200 from a portal is the usual wrong paste; the
  // parser would quietly find no components in it, so require the calendar
  // envelope before parsing.
  if (!/^\s*BEGIN:VCALENDAR/im.test(icsText)) {
    log.warn(`Source "${source.name}" (${source.id}) did not return a calendar document`);
    return fail("The link didn't return a readable calendar", 'linkUnreadable');
  }

  return { kind: 'body', text: icsText, etag: result.responseHeaders.get('etag'), lastModified: result.responseHeaders.get('last-modified') };
}

function failedOutcome(
  source: ICalSource,
  error: string,
  messageKey: string,
  messageParams?: Record<string, string | number>,
): SourceOutcome {
  return { events: [], results: [{ id: source.id, name: source.name, ok: false, error, messageKey, messageParams }] };
}

function okOutcome(source: ICalSource, events: CalendarEvent[]): SourceOutcome {
  return { events, results: [{ id: source.id, name: source.name, ok: true }] };
}

/**
 * Parse a downloaded feed, turning a malformed one into a failing outcome
 * (logged) rather than a rejection.
 */
function parseFeed(text: string, source: ICalSource, from: Date, to: Date, timezone?: string): SourceOutcome {
  try {
    return okOutcome(source, parseICSEvents(text, source, from, to, timezone));
  } catch (err) {
    log.warn(`Parse failed for source "${source.name}" (${source.id})`, err);
    return failedOutcome(source, "The link didn't return a readable calendar", 'linkUnreadable');
  }
}

/**
 * Fetch and parse one ICS feed into events within [from, to), uncached: the
 * link check uses this so it always reports what the host says right now.
 */
export async function fetchICalSource(
  source: ICalSource,
  from: Date,
  to: Date,
  timezone?: string,
): Promise<SourceOutcome> {
  const download = await downloadFeed(source);
  if (download.kind === 'failed') return download.outcome;
  // Asked without validators, so a host cannot have answered 304.
  if (download.kind !== 'body') throw new Error('Unexpected 304 from a feed');
  return parseFeed(download.text, source, from, to, timezone);
}

// ── Feed cache ───────────────────────────────────────────────────────
// Walls, the editor preview and the settings page ask for different windows,
// and a wall asks again every few minutes, while a family feed rarely
// changes. Parsing a 1.5 MB feed blocks a Pi's event loop for most of a
// second, so each feed is downloaded at most once a minute (short, because
// the route already caches for most of a poll and the two stack), the host
// is asked with its validators so an unchanged feed costs a 304, and a body
// identical to the last one is never parsed again. What is kept is the
// events expanded over a wide window around today, a few hundred KB at most,
// not the parsed document, which runs to 10 MB.

const FEED_FRESH_MS = 60_000;
/** The expanded window kept per feed, in days around the household's today.
 *  The usual views' windows are slices of it; an ask reaching past it is
 *  parsed again with the window widened to take it in, as long as the whole
 *  stays within CALENDAR_MAX_WINDOW_MS. */
const EXPANDED_DAYS_BEFORE = 35;
const EXPANDED_DAYS_AFTER = 100;
/** A feed nobody asked for in this long (removed, or its source edited) is dropped. */
const FEED_IDLE_MS = 24 * 60 * 60 * 1000;

interface FeedCacheEntry extends FeedValidators {
  /** When the host last confirmed this copy (a 200 or a 304). */
  checkedAt: number;
  lastUsedAt: number;
  bodyHash: string;
  /** Events expanded over [from, to) from that body, labelled for the source. */
  from: number;
  to: number;
  events: CalendarEvent[];
}

const feedCache = new Map<string, FeedCacheEntry>();
const feedInflight = new Map<string, Promise<SourceOutcome>>();

/** @internal exported for test isolation */
export function clearICalFeedCache(): void {
  feedCache.clear();
  feedInflight.clear();
}

/** Everything the cached events depend on: where they come from, how they are labelled, and the zone they were read in. */
function feedCacheKey(source: ICalSource, timezone: string | undefined): string {
  return [source.url, source.homeNetwork === true, source.id, source.name, source.color, timezone ?? ''].join('\n');
}

function coversWindow(entry: FeedCacheEntry, from: Date, to: Date): boolean {
  return entry.from <= from.getTime() && entry.to >= to.getTime();
}

function sliceWindow(entry: FeedCacheEntry, from: Date, to: Date, timezone: string | undefined): CalendarEvent[] {
  return entry.events.filter((ev) => eventOverlapsWindow(ev, from, to, timezone));
}

/**
 * `fetchICalSource` through the feed cache. Concurrent asks for one feed
 * share a single download; a failure is never cached, so a failing feed is
 * retried on the next ask and the route's last-good fallback still applies.
 */
async function fetchCachedICalSource(
  source: ICalSource,
  from: Date,
  to: Date,
  timezone?: string,
): Promise<SourceOutcome> {
  const key = feedCacheKey(source, timezone);
  for (;;) {
    const entry = feedCache.get(key);
    if (entry && Date.now() - entry.checkedAt < FEED_FRESH_MS && coversWindow(entry, from, to)) {
      entry.lastUsedAt = Date.now();
      return okOutcome(source, sliceWindow(entry, from, to, timezone));
    }
    // A download is already running: wait for it, then look again, since
    // its window may not cover this one.
    const pending = feedInflight.get(key);
    if (!pending) break;
    const outcome = await pending;
    if (!outcome.results.some((r) => r.ok)) return { events: [], results: outcome.results };
  }
  const run = refreshFeed(key, source, from, to, timezone).finally(() => feedInflight.delete(key));
  feedInflight.set(key, run);
  return run;
}

async function refreshFeed(
  key: string,
  source: ICalSource,
  from: Date,
  to: Date,
  timezone: string | undefined,
): Promise<SourceOutcome> {
  const previous = feedCache.get(key);
  // A 304 only helps when the kept events cover this window; otherwise the
  // body has to be parsed again, so ask for it outright.
  const reusable = previous && coversWindow(previous, from, to) ? previous : undefined;
  const download = await downloadFeed(source, reusable);
  const now = Date.now();
  // The host confirmed the kept copy: answer from it.
  const keep = (entry: FeedCacheEntry, validators?: FeedValidators) => {
    Object.assign(entry, { checkedAt: now, lastUsedAt: now }, validators);
    return okOutcome(source, sliceWindow(entry, from, to, timezone));
  };
  if (download.kind === 'failed') return download.outcome;
  // Validators, and so a 304, only go with a `reusable` copy.
  if (download.kind === 'not-modified') return keep(reusable!);

  const bodyHash = createHash('sha1').update(download.text).digest('hex');
  if (reusable && reusable.bodyHash === bodyHash) {
    return keep(reusable, { etag: download.etag, lastModified: download.lastModified });
  }

  // Widen to the window kept around today, unless that would parse a wider
  // span than the route ever asks for: an ask far from today (only ever a
  // hand-made one) is parsed for exactly its own window.
  const today = new Date(now);
  const widenedFrom = Math.min(from.getTime(), householdDayStart(today, -EXPANDED_DAYS_BEFORE, timezone).getTime());
  const widenedTo = Math.max(to.getTime(), householdDayStart(today, EXPANDED_DAYS_AFTER, timezone).getTime());
  const widen = widenedTo - widenedFrom <= CALENDAR_MAX_WINDOW_MS;
  const expandFrom = widen ? new Date(widenedFrom) : from;
  const expandTo = widen ? new Date(widenedTo) : to;
  const parsed = parseFeed(download.text, source, expandFrom, expandTo, timezone);
  if (!parsed.results[0]?.ok) return parsed;
  const entry: FeedCacheEntry = {
    checkedAt: now,
    lastUsedAt: now,
    etag: download.etag,
    lastModified: download.lastModified,
    bodyHash,
    from: expandFrom.getTime(),
    to: expandTo.getTime(),
    events: parsed.events,
  };
  feedCache.set(key, entry);
  return okOutcome(source, sliceWindow(entry, from, to, timezone));
}

function dropIdleFeeds(now: number): void {
  for (const [key, entry] of feedCache) {
    if (now - entry.lastUsedAt > FEED_IDLE_MS) feedCache.delete(key);
  }
}

/**
 * Fetch and parse ICS/iCal feeds, returning events in the same CalendarEvent
 * format as Google Calendar plus a per-source outcome. Handles recurring
 * events, all-day events, and partial failures across multiple sources —
 * a broken feed becomes a `results` entry with plain-language wording, never
 * a rejection that takes the other feeds down.
 */
export async function fetchICalEvents(
  sources: ICalSource[],
  timeMin: string,
  timeMax: string,
  timezone?: string,
): Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }> {
  const from = new Date(timeMin);
  const to = new Date(timeMax);

  dropIdleFeeds(Date.now());
  const { events, results } = await settleSourceFetches(
    sources,
    (source) => fetchCachedICalSource(source, from, to, timezone),
    (source, reason) => {
      // Unexpected rejections (e.g. fetchWithTimeout network errors)
      log.warn('Source fetch rejected', reason);
      return [{ id: source.id, name: source.name, ok: false, error: 'Could not reach the link', messageKey: 'linkUnreachable' }];
    },
  );

  events.sort((a, b) => compareEventStarts(a.start, b.start, timezone));
  return { events, results };
}

/** Outcome of probing a feed link before it is saved. */
export type ICalCheckResult =
  | { ok: true; eventCount: number }
  | { ok: false; error: string; messageKey: string; messageParams?: Record<string, string | number> };

/**
 * Probe a feed link the way the display will fetch it, before the editor
 * saves it: same URL rules, same HTTP fetch, same parser. Counts the events
 * in the coming year so the editor can tell an empty calendar from a broken
 * link. Never rejects.
 *
 * `homeNetwork` is the same opt-in the saved source carries, so the form can
 * check a home-network calendar before it is saved. Without it the check is
 * held to the strict rule and cannot be used to poke around the network.
 */
export async function checkICalUrl(
  url: string,
  options: { homeNetwork?: boolean; timezone?: string } = {},
): Promise<ICalCheckResult> {
  // From the start of the household's today, as the display fetches, so an
  // all-day event today still counts after the hub's own midnight.
  const from = parseEventInstant(isoDateInTZ(new Date(), options.timezone), options.timezone);
  const to = new Date(from);
  to.setFullYear(to.getFullYear() + 1);
  const probe: ICalSource = {
    id: 'check',
    type: 'ical',
    name: 'check',
    url,
    color: '',
    enabled: true,
    homeNetwork: options.homeNetwork === true,
  };
  try {
    const { events, results } = await fetchICalSource(probe, from, to, options.timezone);
    const result = results[0];
    if (result?.ok) return { ok: true, eventCount: events.length };
    return {
      ok: false,
      error: result?.error ?? 'Could not reach the link',
      messageKey: result?.messageKey ?? 'linkUnreachable',
      ...(result?.messageParams ? { messageParams: result.messageParams } : {}),
    };
  } catch (err) {
    log.warn('Feed check failed', err);
    return { ok: false, error: 'Could not reach the link', messageKey: 'linkUnreachable' };
  }
}

/** Compute a fallback end date when DTEND is missing. */
function computeFallbackEnd(start: Date, isAllDay: boolean): Date {
  if (isAllDay) {
    // RFC 5545: all-day event with no DTEND defaults to 1 day
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return end;
  }
  // Timed event with no DTEND — treat as instant (end = start)
  return start;
}

/**
 * The day a start falls on where the event lives, as `YYYY-MM-DD`: an all-day
 * date as written, a timed one in its own zone (the hub's zone is not the
 * event's, and a Pi left at UTC would put an evening start on the next day).
 */
function wallDate(date: Date, vevent: VEvent): string {
  return vevent.datetype === 'date' ? localISODate(date) : isoDateInTZ(date, vevent.start?.tz);
}

const YEARLY_SHAPING_PARTS = ['byMonth', 'byDay', 'byweekday', 'byYearDay', 'byWeekNo', 'bySetPos'] as const;

/**
 * The month (`MM`) a yearly rule really means, for a rule that restates its
 * own start day in BYMONTHDAY but leaves out BYMONTH, or null for any other
 * rule. Some older phone calendar apps write a birthday as
 * `FREQ=YEARLY;BYMONTHDAY=2` starting on 2 October. The standard reads that as
 * the 2nd of every month and node-ical expands it so, while the app that wrote
 * it, and Google's own calendar, show it once a year. Only that exact shape
 * counts: a single BYMONTHDAY equal to the start's day and no other part that
 * picks months or weekdays, so a rule that really does repeat through the
 * year (`BYMONTHDAY=1,3`, or every Friday the 13th) is left alone. node-ical's
 * `options` carry only the parts the feed wrote, so a missing BYMONTH is
 * certain.
 */
function yearlyRuleStartMonth(vevent: VEvent): string | null {
  const options = vevent.rrule?.options;
  if (!options || !vevent.start || options.freq !== 'YEARLY') return null;
  const monthDays = options.byMonthDay;
  if (!Array.isArray(monthDays) || monthDays.length !== 1) return null;
  if (YEARLY_SHAPING_PARTS.some((part) => options[part] != null)) return null;
  const start = wallDate(vevent.start, vevent);
  return Number(start.slice(8, 10)) === Number(monthDays[0]) ? start.slice(5, 7) : null;
}

/** Convert a VEvent (or instance) into our CalendarEvent format. */
function instanceToCalendarEvent(
  vevent: VEvent,
  start: Date,
  end: Date,
  isAllDay: boolean,
  source: EventSourceMeta,
): CalendarEvent | null {
  const uid = vevent.uid ?? '';
  const occurrenceKey = isAllDay ? localISODate(start) : start.toISOString();

  return {
    id: `${source.id}:${uid}:${occurrenceKey}`,
    title: paramValue(vevent.summary) || '(No title)',
    start: isAllDay ? localISODate(start) : start.toISOString(),
    end: isAllDay ? localISODate(end) : end.toISOString(),
    location: paramValue(vevent.location) || undefined,
    description: paramValue(vevent.description) || undefined,
    allDay: isAllDay,
    calendarColor: source.color,
    sourceId: source.id,
    sourceName: source.name,
  };
}
