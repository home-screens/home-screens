import { googleCalendarIdList } from '@/lib/calendar-sources';
import { withCalendarOverride } from '@/lib/calendar-overrides';
import type { CalendarSettings } from '@/types/config';

/**
 * Recolouring calendars from the wall: which calendars may be recoloured,
 * and where each one's colour is kept.
 *
 * A calendar link carries its own colour (the household picked it when it
 * added the link), so that is what changes, and Settings shows the new colour
 * on the link's row. A Google or iCloud calendar's colour is the provider's,
 * so the household's choice is an override, the same one the pencil in
 * Settings writes. Anything else (public holidays, an id nothing is set up
 * for) is refused: a wall may only touch calendars the household has on.
 */

/** Only the form the wall's swatches hold, and the one every colour reader takes. */
const FULL_HEX = /^#[0-9a-f]{6}$/i;

/** One key row can stand for several calendars, so one pick may recolour more than one. */
export const RECOLOR_MAX_CALENDARS = 32;

export type RecolorProblem = 'badColor' | 'badCalendars' | 'unknownCalendar';

/** The ids a wall may recolour: every calendar that is set up, whichever kind. */
export function recolorableCalendarIds(calendar: CalendarSettings): Set<string> {
  return new Set([
    ...googleCalendarIdList(calendar),
    ...(calendar.icalSources ?? []).map((source) => source.id),
    ...(calendar.icloudSources ?? []).map((source) => source.id),
  ]);
}

/** Why this request cannot be carried out at all, before the settings are read. */
export function recolorRequestProblem(sourceIds: unknown, color: unknown): RecolorProblem | null {
  if (typeof color !== 'string' || !FULL_HEX.test(color)) return 'badColor';
  if (!Array.isArray(sourceIds) || sourceIds.length === 0 || sourceIds.length > RECOLOR_MAX_CALENDARS
      || !sourceIds.every((id) => typeof id === 'string' && id.length > 0)) return 'badCalendars';
  return null;
}

/**
 * The calendar settings with these calendars recoloured, or the reason they
 * cannot be. All or nothing: one id that is not set up refuses the whole
 * request, so a key row never ends up half recoloured.
 */
export function recolorCalendars(
  calendar: CalendarSettings,
  sourceIds: readonly string[],
  color: string,
): { calendar: CalendarSettings } | { problem: RecolorProblem } {
  const known = recolorableCalendarIds(calendar);
  if (!sourceIds.every((id) => known.has(id))) return { problem: 'unknownCalendar' };

  const value = color.toLowerCase();
  const wanted = new Set(sourceIds);
  const linkIds = new Set((calendar.icalSources ?? []).filter((source) => wanted.has(source.id)).map((source) => source.id));

  let overrides = calendar.calendarOverrides;
  for (const id of sourceIds) {
    if (!linkIds.has(id)) overrides = withCalendarOverride(overrides, id, { color: value });
  }

  const next: CalendarSettings = {
    ...calendar,
    ...(linkIds.size > 0
      ? { icalSources: (calendar.icalSources ?? []).map((source) => (linkIds.has(source.id) ? { ...source, color: value } : source)) }
      : {}),
  };
  if (overrides) next.calendarOverrides = overrides;
  return { calendar: next };
}
