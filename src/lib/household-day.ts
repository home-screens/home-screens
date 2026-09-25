import { readConfigCached } from './config-cache';
import { isoDateInTZ, resolveHouseholdTimezone, timestampInTZ } from './timezone';

/**
 * The hub's own clock zone: the zone this server process runs in. It is the
 * household's zone while none is saved, on every surface (see
 * `resolveHouseholdTimezone`). Read per call rather than once, because the
 * Location page can move the hub's clock at runtime (`/api/system/timezone`
 * resets `process.env.TZ`).
 */
export function hubTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * The household's time zone: the one saved in Settings, or the hub's own while
 * none is saved or the config is unreadable. Read through the config cache:
 * chore screens poll every 15 s and to-do screens every 5 s.
 */
export async function householdTimezone(): Promise<string> {
  try {
    return resolveHouseholdTimezone((await readConfigCached()).settings?.timezone, hubTimezone());
  } catch {
    return hubTimezone();
  }
}

/**
 * Today for the household, as `YYYY-MM-DD`: the calendar day in the Settings
 * time zone, not the machine's. A Pi flashed from the image keeps UTC unless
 * someone sets it, and its "today" then rolled over at 7 pm in Chicago.
 */
export async function householdToday(now: Date = new Date()): Promise<string> {
  return isoDateInTZ(now, await householdTimezone());
}

/** Now as an ISO timestamp in the household's time zone (`timestampInTZ`). */
export async function householdTimestamp(now: Date = new Date()): Promise<string> {
  return timestampInTZ(now, await householdTimezone());
}
