import type { CalendarSettings } from '@/types/config';
import type { CalendarFetchWindow } from '@/lib/calendar-window';

/**
 * Which calendar sources are configured, and the `/api/calendar` URL the
 * shared display fetch uses to ask for them. Split from the fetch-window
 * math (`calendar-window.ts`) so each file answers one question.
 */

/**
 * True when settings carry at least one non-Google calendar source the server
 * resolves on its own: an enabled iCal URL, an enabled iCloud calendar or
 * birthday feed, or a public-holiday country. Single source of truth for the
 * "is there anything to fetch?" question, so a new source type only needs to be
 * added here.
 */
export function hasCalendarFeedSources(
  calendar: Partial<Pick<CalendarSettings, 'icalSources' | 'icloudSources' | 'holidayCountry'>>,
): boolean {
  return Boolean(
    calendar.icalSources?.some(s => s.enabled)
    || calendar.icloudSources?.some(s => s.enabled)
    || calendar.holidayCountry,
  );
}

/**
 * The Google calendar ids the shared fetch asks for: the multi-calendar list
 * when it has entries, else the single legacy field. One reader so the fetch
 * hook and `hasAnyCalendarSource` can never disagree about whether a Google
 * calendar is configured.
 */
export function googleCalendarIdList(
  calendar: Partial<Pick<CalendarSettings, 'googleCalendarIds' | 'googleCalendarId'>>,
): string[] {
  if (calendar.googleCalendarIds?.length) return calendar.googleCalendarIds;
  return calendar.googleCalendarId ? [calendar.googleCalendarId] : [];
}

/**
 * True when anything at all would be fetched — a Google calendar id or any
 * server-resolved feed. Exactly the condition under which `buildCalendarUrl`
 * returns a non-empty URL, so it also answers "will this display ever publish
 * calendar shared state?" for the editor's key picker.
 */
export function hasAnyCalendarSource(calendar: CalendarSettings | undefined): boolean {
  if (!calendar) return false;
  return googleCalendarIdList(calendar).length > 0 || hasCalendarFeedSources(calendar);
}

/**
 * Build the `/api/calendar` URL for the shared display fetch. Kept pure and
 * separate from the hook so the URL-stability contract is unit-testable: the
 * URL must be byte-stable across renders within a day (a per-render or
 * per-minute change would make `useFetchData` refetch in a loop). `timeMin`
 * is emitted whenever a fetch window exists; `timeMax` only when the window
 * carries one (grids extending past the daysAhead default). Returns `''` when
 * no calendar source is configured, which `useFetchData` treats as "skip".
 * `hasFeedSources` covers every server-resolved source that is not a Google
 * calendar id (iCal URLs, iCloud calendars and birthdays, public holidays); the
 * route reads those from settings itself, so the URL only needs to know that
 * at least one exists.
 */
export function buildCalendarUrl(
  calendarIdList: string[],
  hasFeedSources: boolean,
  fetchWindow: CalendarFetchWindow | null,
  refreshEpoch: number,
): string {
  if (!calendarIdList.length && !hasFeedSources) return '';
  const params = [
    calendarIdList.length ? `calendarIds=${encodeURIComponent(calendarIdList.join(','))}` : '',
    fetchWindow ? `timeMin=${encodeURIComponent(fetchWindow.timeMin)}` : '',
    fetchWindow?.timeMax ? `timeMax=${encodeURIComponent(fetchWindow.timeMax)}` : '',
    refreshEpoch > 0 ? `_r=${refreshEpoch}` : '',
  ].filter(Boolean).join('&');
  return `/api/calendar${params ? `?${params}` : ''}`;
}
