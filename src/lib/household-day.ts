import { readConfigCached } from './config-cache';
import { localISODate, timestampInTZ, toTZWallTime } from './timezone';

/**
 * The household's time zone from Settings. Read through the 1.5 s config
 * cache: chore screens poll every 15 s and to-do screens every 5 s. Unset or
 * unreadable means the hub's own clock.
 */
export async function householdTimezone(): Promise<string | undefined> {
  try {
    return (await readConfigCached()).settings?.timezone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Today for the household, as `YYYY-MM-DD`: the calendar day in the Settings
 * time zone, not the machine's. A Pi flashed from the image keeps UTC unless
 * someone sets it, and its "today" then rolled over at 7 pm in Chicago.
 */
export async function householdToday(now: Date = new Date()): Promise<string> {
  return localISODate(toTZWallTime(now, await householdTimezone()));
}

/** Now as an ISO timestamp in the household's time zone (`timestampInTZ`). */
export async function householdTimestamp(now: Date = new Date()): Promise<string> {
  return timestampInTZ(now, await householdTimezone());
}
