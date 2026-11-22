'use client';

import { createContext, useContext } from 'react';

/**
 * Whether this wall may add, change and remove calendar events
 * (`settings.calendarWallEntry`, which a display's own switch overrides).
 * ScreenRotator provides it for a real display and never for its preview;
 * the editor canvas provides nothing, so modules there never offer adding.
 * The household's "adding events" switch and which calendars take events
 * come from the hub (`/api/calendar/entry`) on top of this.
 */
const WallCalendarEntryContext = createContext<boolean>(false);

export const WallCalendarEntryProvider = WallCalendarEntryContext.Provider;

export function useWallCalendarEntry(): boolean {
  return useContext(WallCalendarEntryContext);
}
