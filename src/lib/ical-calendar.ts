import ical from 'node-ical';
import type { VEvent } from 'node-ical';
import type { ICalSource } from '@/types/config';
import type { CalendarEvent } from '@/types/config';
import { fetchWithTimeout } from '@/lib/api-utils';
import { compareEventStarts } from '@/lib/calendar-utils';
import type { SourceFetchResult } from '@/lib/calendar-source-status';
import { logger } from '@/lib/logger';

const log = logger('ical');

/** Extract the string value from a node-ical ParameterValue (string | {val, params}). */
function paramValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'val' in v) return String((v as { val: unknown }).val);
  return '';
}

/** Format a Date as YYYY-MM-DD (local, not UTC — avoids timezone shift for all-day events). */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
 * and all-day events. Throws on malformed ICS — callers decide how a
 * bad document degrades (skip the feed, skip the object, …).
 */
export function parseICSEvents(
  icsText: string,
  source: EventSourceMeta,
  from: Date,
  to: Date,
): CalendarEvent[] {
  const components = ical.sync.parseICS(icsText);
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

      for (const instance of instances) {
        const ev = instanceToCalendarEvent(instance.event, instance.start, instance.end, instance.isFullDay, source);
        if (ev) events.push(ev);
      }
    } else {
      // Non-recurring event — check if it overlaps the time window
      if (!vevent.start) continue;

      const isAllDay = vevent.datetype === 'date';
      const evStart = vevent.start;
      const evEnd = vevent.end ?? computeFallbackEnd(evStart, isAllDay);

      // Overlap check: event.end > timeMin && event.start < timeMax
      if (evEnd > from && evStart < to) {
        const ev = instanceToCalendarEvent(vevent, evStart, evEnd, isAllDay, source);
        if (ev) events.push(ev);
      }
    }
  }

  return events;
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
): Promise<{ events: CalendarEvent[]; results: SourceFetchResult[] }> {
  const from = new Date(timeMin);
  const to = new Date(timeMax);
  const allEvents: CalendarEvent[] = [];
  const sourceResults: SourceFetchResult[] = [];

  const results = await Promise.allSettled(
    sources.map(async (source): Promise<{ events: CalendarEvent[]; result: SourceFetchResult }> => {
      const fail = (error: string): { events: CalendarEvent[]; result: SourceFetchResult } =>
        ({ events: [], result: { id: source.id, name: source.name, ok: false, error } });

      // Validate URL scheme — normalize webcal:// to https://
      let fetchUrl = source.url;
      let parsed: URL;
      try {
        parsed = new URL(fetchUrl);
      } catch {
        log.warn(`Invalid URL for source "${source.name}" (${source.id})`);
        return fail("The link isn't a valid web address");
      }
      if (parsed.protocol === 'webcal:') {
        fetchUrl = fetchUrl.replace(/^webcal:/i, 'https:');
        parsed = new URL(fetchUrl);
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        log.warn(`Rejected non-HTTP URL for source "${source.name}" (${source.id})`);
        return fail("The link isn't a valid web address");
      }

      // Fetch the ICS data
      const res = await fetchWithTimeout(fetchUrl, { timeout: 15_000 });
      if (!res.ok) {
        log.warn(`Fetch failed for source "${source.name}" (${source.id}): HTTP ${res.status}`);
        return fail(`Could not reach the link (HTTP ${res.status})`);
      }
      const icsText = await res.text();

      // Parse and process ICS — wrapped in try/catch so a malformed feed
      // is logged and treated as a failing source
      try {
        const events = parseICSEvents(icsText, source, from, to);
        return { events, result: { id: source.id, name: source.name, ok: true } };
      } catch (err) {
        log.warn(`Parse failed for source "${source.name}" (${source.id})`, err);
        return fail("The link didn't return a readable calendar");
      }
    }),
  );

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allEvents.push(...result.value.events);
      sourceResults.push(result.value.result);
    } else {
      // Unexpected rejections (e.g. fetchWithTimeout network errors)
      log.warn('Source fetch rejected', result.reason);
      const source = sources[i];
      sourceResults.push({ id: source.id, name: source.name, ok: false, error: 'Could not reach the link' });
    }
  });

  // Sort by start time
  allEvents.sort((a, b) => compareEventStarts(a.start, b.start));
  return { events: allEvents, results: sourceResults };
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

/** Convert a VEvent (or instance) into our CalendarEvent format. */
function instanceToCalendarEvent(
  vevent: VEvent,
  start: Date,
  end: Date,
  isAllDay: boolean,
  source: EventSourceMeta,
): CalendarEvent | null {
  const uid = vevent.uid ?? '';
  const occurrenceKey = isAllDay ? toDateString(start) : start.toISOString();

  return {
    id: `${source.id}:${uid}:${occurrenceKey}`,
    title: paramValue(vevent.summary) || '(No title)',
    start: isAllDay ? toDateString(start) : start.toISOString(),
    end: isAllDay ? toDateString(end) : end.toISOString(),
    location: paramValue(vevent.location) || undefined,
    description: paramValue(vevent.description) || undefined,
    allDay: isAllDay,
    calendarColor: source.color,
    sourceId: source.id,
    sourceName: source.name,
  };
}
