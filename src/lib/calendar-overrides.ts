import type { CalendarEvent, CalendarOverride } from '@/types/config';

/**
 * Apply the household's own names and colours over fetched events.
 *
 * Google decides what its calendars are called and what colour they are,
 * and offers no way to change either for one household — so a work calendar
 * arrives as "work@example.com" in a blue that clashes with everything
 * else, permanently. iCal and iCloud sources carry editable name/colour of
 * their own, but an entry here still wins so one screen governs all of them.
 *
 * Applied once over the merged list in the calendar route rather than inside
 * each provider's fetch: one place covers every source, and the provider
 * clients stay free of settings they have no other reason to know about.
 * Because it runs before the payload is cached, an override reaches events,
 * legends and per-person colouring together — nothing downstream has to know
 * the real name.
 *
 * COLOUR PRECEDENCE. An override replaces the event's colour outright,
 * including where Google had given that single event its own colour. The
 * alternative — overriding only the calendar's default and letting
 * per-event colours through — means setting "this calendar is green" and
 * watching a third of its events stay blue, with a legend dot that matches
 * neither. A household that wants per-event colours simply leaves the
 * override unset.
 *
 * An absent entry, an absent field, or a name that is only whitespace keeps
 * the source's own value, so a half-filled override never blanks a calendar.
 */
export function applyCalendarOverrides(
  events: CalendarEvent[],
  overrides: Record<string, CalendarOverride> | undefined,
): CalendarEvent[] {
  if (!overrides || Object.keys(overrides).length === 0) return events;

  return events.map((event) => {
    if (event.sourceId === undefined) return event;
    const override = overrides[event.sourceId];
    if (!override) return event;

    const name = override.name?.trim();
    const color = override.color?.trim();
    if (!name && !color) return event;

    return {
      ...event,
      ...(name ? { sourceName: name } : {}),
      ...(color ? { calendarColor: color } : {}),
    };
  });
}
