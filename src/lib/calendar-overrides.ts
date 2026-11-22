import type { CalendarEvent, CalendarOverride, CalendarSourceStatus } from '@/types/config';
import { isFullHexColor } from '@/lib/hex-color';

/**
 * The household's own names and colours for calendars whose provider names
 * them: Google, which offers no way to change either for one household, and
 * iCloud, whose name and colour are Apple's. A work calendar otherwise
 * arrives as "work@example.com" in a blue that clashes with everything else,
 * permanently. Calendar links need none of this: the household typed their
 * name and picked their colour when it added them.
 *
 * Every place that shows a calendar's name or colour asks `calendarLook`, so
 * Settings, the card pickers, People, the add-event forms and the wall all
 * say the same thing. Events and source health get it once, in the
 * calendar route, through `applyCalendarOverrides` and `renameSourceStatus`.
 *
 * An absent entry, an absent field, or a name that is only whitespace keeps
 * the provider's own value, so a half-filled override never blanks a
 * calendar. An entry outlives its calendar being unticked or signed out of,
 * so ticking it again brings its look back; only Reset removes one.
 */

/** The longest name the editor takes, and the longest a saved config may hold. */
export const CALENDAR_NAME_MAX = 80;

/** A calendar's name and colour as the household sees it. */
export interface CalendarLook {
  name: string;
  color: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * One calendar's override with only the fields that are text. Reads go
 * through here because a config edited by hand can hold anything; saves are
 * checked by `calendarOverridesProblem`, and reads cleaned by
 * `cleanCalendarOverrides`.
 */
export function storedOverride(overrides: unknown, id: string): CalendarOverride | undefined {
  if (!isRecord(overrides) || !Object.prototype.hasOwnProperty.call(overrides, id)) return undefined;
  const entry = overrides[id];
  if (!isRecord(entry)) return undefined;
  return {
    ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
    ...(typeof entry.color === 'string' ? { color: entry.color } : {}),
  };
}

/** The household's look for one calendar, over the provider's `own`. */
export function calendarLook(
  id: string,
  own: CalendarLook,
  overrides: Record<string, CalendarOverride> | undefined,
): CalendarLook {
  const override = storedOverride(overrides, id);
  if (!override) return own;
  return {
    name: override.name?.trim() || own.name,
    color: override.color?.trim() || own.color,
  };
}

/**
 * Apply the household's names and colours over fetched events.
 *
 * An event with a colour of its own (it carries `sourceColor`: Google lets
 * one event be coloured apart from its calendar) keeps it, as it does in
 * Google's own app, and the household's colour goes to its `sourceColor`,
 * which legends and per-calendar rows read. Recolouring a calendar changes
 * the colour its events take by default, not the ones somebody picked on
 * purpose.
 */
export function applyCalendarOverrides(
  events: CalendarEvent[],
  overrides: Record<string, CalendarOverride> | undefined,
): CalendarEvent[] {
  if (!isRecord(overrides) || Object.keys(overrides).length === 0) return events;

  return events.map((event) => {
    if (event.sourceId === undefined) return event;
    const override = storedOverride(overrides, event.sourceId);
    if (!override) return event;

    const name = override.name?.trim();
    const color = override.color?.trim();
    if (!name && !color) return event;

    return {
      ...event,
      ...(name ? { sourceName: name } : {}),
      ...(color ? (event.sourceColor !== undefined ? { sourceColor: color } : { calendarColor: color }) : {}),
    };
  });
}

/**
 * Each source's health under the household's name for it, so the wall's
 * "Our house not updating" and Settings say what the rest of the wall says.
 */
export function renameSourceStatus(
  statuses: CalendarSourceStatus[],
  overrides: Record<string, CalendarOverride> | undefined,
): CalendarSourceStatus[] {
  if (!isRecord(overrides) || Object.keys(overrides).length === 0) return statuses;
  return statuses.map((status) => {
    const name = storedOverride(overrides, status.id)?.name?.trim();
    return name ? { ...status, name } : status;
  });
}

/**
 * One edit to one calendar's override. A blank name or colour is removed
 * rather than stored, an entry with nothing left goes entirely, and a map
 * with nothing left comes back `undefined`, so a household that clears what
 * it typed is back to the provider's look rather than carrying an override
 * that says "no override".
 */
export function withCalendarOverride(
  overrides: Record<string, CalendarOverride> | undefined,
  id: string,
  patch: CalendarOverride,
): Record<string, CalendarOverride> | undefined {
  const next = { ...(overrides ?? {}) };
  const merged: CalendarOverride = { ...(storedOverride(overrides, id) ?? {}), ...patch };
  if (!merged.name?.trim()) delete merged.name;
  if (!merged.color?.trim()) delete merged.color;
  if (Object.keys(merged).length === 0) delete next[id];
  else next[id] = merged;
  return Object.keys(next).length > 0 ? next : undefined;
}

const nameOk = (name: unknown) => name === undefined || (typeof name === 'string' && name.length <= CALENDAR_NAME_MAX);
const colorOk = (color: unknown) => color === undefined || isFullHexColor(color);

/** Why `calendarOverrides` may not be saved as it is, or `null`. */
export function calendarOverridesProblem(value: unknown): string | null {
  if (value === undefined) return null;
  const sound = isRecord(value) && Object.values(value).every((entry) => isRecord(entry) && nameOk(entry.name) && colorOk(entry.color));
  return sound
    ? null
    : `Each calendar's own name must be text of up to ${CALENDAR_NAME_MAX} letters, and its color a color like #10b981.`;
}

/**
 * The overrides as a save would accept them: a name that is not text, or a
 * colour that is not `#rrggbb`, left out, a name too long cut short, and an
 * entry with nothing left dropped. Hands back the same value when it is
 * already sound, and `undefined` when nothing is left.
 */
export function cleanCalendarOverrides(value: unknown): Record<string, CalendarOverride> | undefined {
  if (value === undefined || calendarOverridesProblem(value) === null) return value as Record<string, CalendarOverride> | undefined;
  if (!isRecord(value)) return undefined;
  const next: Record<string, CalendarOverride> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.slice(0, CALENDAR_NAME_MAX) : undefined;
    const color = isFullHexColor(entry.color) ? entry.color : undefined;
    if (name !== undefined || color !== undefined) next[id] = { ...(name !== undefined ? { name } : {}), ...(color !== undefined ? { color } : {}) };
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
